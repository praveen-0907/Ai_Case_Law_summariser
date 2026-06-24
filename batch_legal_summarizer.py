#!/usr/bin/env python3
"""
Staged Legal Document Summarizer for 6GB VRAM Constraint
==========================================================

This script processes Indian legal documents (judgments, orders, notices) using
local Ollama models in three sequential stages to manage VRAM efficiently.

HARDWARE CONSTRAINT:
- Only 6GB VRAM available
- mistral:7b and llama3.1:8b each require ~5GB at Q4 quantization
- Cannot load more than one mid/large model at a time

PIPELINE STAGES:
1. Triage (qwen2.5:0.5b) - Fast classification of all documents
2. Short docs (mistral:7b) - Process simple/short documents
3. Long docs (llama3.1:8b) - Process complex/long documents

Each stage explicitly unloads previous models before loading the next.
"""

import asyncio
import aiohttp
import json
import csv
import os
import time
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Tuple
import logging
from dataclasses import dataclass, asdict
import sys

# ============================================================================
# CONFIGURATION - Adjust these settings for your needs
# ============================================================================

# Model Configuration
TRIAGE_MODEL = "llama3"      # Changed to llama3 per user request
SHORT_MODEL = "llama3"       # Changed to llama3 per user request
LONG_MODEL = "llama3"        # Changed to llama3 per user request

# Concurrency Limits (VRAM management is critical here)
# Stage 1: High concurrency OK because qwen is tiny (~1GB)
TRIAGE_CONCURRENCY = 4              

# Stages 2 & 3: LOW concurrency to avoid KV-cache overflow on 6GB card
# With mistral/llama at ~5GB base, we have ~1GB for KV cache
# OLLAMA_NUM_PARALLEL=1 is safest; 2 may work for very short prompts
SHORT_DOC_CONCURRENCY = 1           
LONG_DOC_CONCURRENCY = 1            

# Document Processing
CHUNK_SIZE = 3000                   # Characters per chunk for long documents
CONTEXT_WINDOW = 4096               # Reduced context to save VRAM (default 8192)
WORD_COUNT_THRESHOLD = 2000         # Words - documents above this are "long"

# Retry Configuration
MAX_RETRIES = 3
RETRY_DELAY = 2                     # seconds, will backoff exponentially

# Paths
INPUT_DIR = Path("legal_documents")       # Put your PDFs/text files here
OUTPUT_DIR = Path("summarized_output")
MANIFEST_FILE = OUTPUT_DIR / "triage_manifest.jsonl"
RESULTS_FILE = OUTPUT_DIR / "summary_results.jsonl"
ERRORS_FILE = OUTPUT_DIR / "errors.log"

# Ollama Configuration
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_TIMEOUT = 300                # 5 minutes timeout per request

# ============================================================================
# LOGGING SETUP
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(OUTPUT_DIR / 'pipeline.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class DocumentInfo:
    """Metadata for a document being processed"""
    filename: str
    filepath: str
    word_count: int
    category: str  # "short" or "long"
    doc_type: str  # "judgment", "order", "notice", "unknown"
    triage_timestamp: str
    processed: bool = False

@dataclass
class SummaryResult:
    """Final summary output"""
    filename: str
    category: str
    doc_type: str
    model_used: str
    summary: str
    chunk_count: int
    processing_time: float
    timestamp: str
    error: Optional[str] = None

# ============================================================================
# OLLAMA API HELPERS
# ============================================================================

async def unload_model(session: aiohttp.ClientSession, model_name: str) -> bool:
    """
    Explicitly unload a model from Ollama to free VRAM.
    
    This is CRITICAL for 6GB VRAM - we must unload the previous model
    before loading the next one.
    """
    try:
        logger.info(f"🔄 Unloading model: {model_name}")
        
        # Ollama doesn't have a direct "unload" endpoint, but we can:
        # 1. Set keep_alive=0 in generate request (unloads immediately after)
        # 2. Or just wait - Ollama will unload after timeout
        
        # Best approach: Make a dummy request with keep_alive=0
        url = f"{OLLAMA_BASE_URL}/api/generate"
        payload = {
            "model": model_name,
            "prompt": "unload",
            "stream": False,
            "keep_alive": 0  # Unload immediately
        }
        
        async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as response:
            if response.status == 200:
                logger.info(f"✓ Model {model_name} unloaded successfully")
                await asyncio.sleep(2)  # Give Ollama time to free VRAM
                return True
            else:
                logger.warning(f"⚠ Unload request returned status {response.status}")
                return False
                
    except Exception as e:
        logger.warning(f"⚠ Error unloading model {model_name}: {e}")
        return False

async def preload_model(session: aiohttp.ClientSession, model_name: str) -> bool:
    """
    Preload a model into VRAM by making a dummy request.
    
    This ensures the model is ready before we start the batch,
    avoiding cold-start delays on the first real request.
    """
    try:
        logger.info(f"⏳ Preloading model into VRAM: {model_name}")
        
        url = f"{OLLAMA_BASE_URL}/api/generate"
        payload = {
            "model": model_name,
            "prompt": "Hello",
            "stream": False,
            "options": {
                "num_ctx": CONTEXT_WINDOW  # Set reduced context window
            }
        }
        
        start = time.time()
        async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as response:
            if response.status == 200:
                elapsed = time.time() - start
                logger.info(f"✓ Model {model_name} preloaded in {elapsed:.1f}s")
                return True
            else:
                text = await response.text()
                logger.error(f"✗ Failed to preload {model_name}: {response.status} - {text}")
                return False
                
    except Exception as e:
        logger.error(f"✗ Error preloading model {model_name}: {e}")
        return False

async def generate_with_retry(
    session: aiohttp.ClientSession,
    model: str,
    prompt: str,
    max_retries: int = MAX_RETRIES
) -> Optional[str]:
    """
    Call Ollama generate API with exponential backoff retry logic.
    """
    url = f"{OLLAMA_BASE_URL}/api/generate"
    
    for attempt in range(max_retries):
        try:
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_ctx": CONTEXT_WINDOW,  # Reduced context to save VRAM
                    "temperature": 0.3,          # Lower = more deterministic
                    "top_p": 0.9
                }
            }
            
            async with session.post(
                url, 
                json=payload, 
                timeout=aiohttp.ClientTimeout(total=OLLAMA_TIMEOUT)
            ) as response:
                
                if response.status == 200:
                    result = await response.json()
                    return result.get("response", "").strip()
                else:
                    error_text = await response.text()
                    logger.warning(f"⚠ Attempt {attempt+1}/{max_retries} failed: {response.status} - {error_text}")
                    
        except asyncio.TimeoutError:
            logger.warning(f"⚠ Attempt {attempt+1}/{max_retries} timed out")
        except Exception as e:
            logger.warning(f"⚠ Attempt {attempt+1}/{max_retries} error: {e}")
        
        if attempt < max_retries - 1:
            delay = RETRY_DELAY * (2 ** attempt)  # Exponential backoff
            logger.info(f"⏳ Retrying in {delay}s...")
            await asyncio.sleep(delay)
    
    return None  # All retries failed

# ============================================================================
# DOCUMENT READING
# ============================================================================

def read_document(filepath: Path) -> Optional[str]:
    """Read text from a document file (txt, or extracted PDF text)"""
    try:
        # For this script, we assume .txt files or pre-extracted PDF text
        # In production, integrate PyMuPDF or similar for PDF extraction
        
        if filepath.suffix.lower() == '.txt':
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
        elif filepath.suffix.lower() == '.pdf':
            import fitz
            try:
                pdf_document = fitz.open(filepath)
                text = []
                for page in pdf_document:
                    text.append(page.get_text())
                return "\n".join(text)
            except Exception as pdf_e:
                logger.error(f"Failed to read PDF {filepath}: {pdf_e}")
                return None
        else:
            logger.warning(f"⚠ Unsupported file type: {filepath}")
            return None
            
    except Exception as e:
        logger.error(f"✗ Error reading {filepath}: {e}")
        return None

def count_words(text: str) -> int:
    """Simple word count"""
    return len(text.split())

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE) -> List[str]:
    """Split text into chunks of approximately chunk_size characters"""
    chunks = []
    words = text.split()
    current_chunk = []
    current_length = 0
    
    for word in words:
        current_chunk.append(word)
        current_length += len(word) + 1  # +1 for space
        
        if current_length >= chunk_size:
            chunks.append(' '.join(current_chunk))
            current_chunk = []
            current_length = 0
    
    # Don't forget the last chunk
    if current_chunk:
        chunks.append(' '.join(current_chunk))
    
    return chunks

# ============================================================================
# STAGE 1: TRIAGE PASS (qwen2.5:0.5b)
# ============================================================================

async def triage_document(
    session: aiohttp.ClientSession,
    filepath: Path,
    semaphore: asyncio.Semaphore
) -> Optional[DocumentInfo]:
    """
    Classify a single document as short/long and identify document type.
    Uses tiny qwen model for fast classification.
    """
    async with semaphore:
        filename = filepath.name
        logger.info(f"🔍 Triaging: {filename}")
        
        # Read document
        text = read_document(filepath)
        if not text:
            return None
        
        word_count = count_words(text)
        
        # Prepare triage prompt (use first 1000 words for classification)
        preview = ' '.join(text.split()[:1000])
        
        prompt = f"""Analyze this Indian legal document and classify it.

Document preview:
{preview}

Instructions:
1. Identify document type: judgment, order, notice, or other
2. Assess complexity: is this a simple/short document or complex/long?

Respond in this exact format:
TYPE: [judgment/order/notice/other]
COMPLEXITY: [simple/complex]
REASONING: [brief explanation]"""

        # Call triage model
        response = await generate_with_retry(session, TRIAGE_MODEL, prompt)
        
        if not response:
            logger.error(f"✗ Triage failed for {filename}")
            return None
        
        # Parse response
        doc_type = "unknown"
        category = "long"  # Default to conservative choice
        
        for line in response.split('\n'):
            line = line.strip()
            if line.startswith("TYPE:"):
                doc_type = line.split(":", 1)[1].strip().lower()
            elif line.startswith("COMPLEXITY:"):
                complexity = line.split(":", 1)[1].strip().lower()
                category = "short" if "simple" in complexity else "long"
        
        # Override with word count threshold
        if word_count < WORD_COUNT_THRESHOLD:
            category = "short"
        else:
            category = "long"
        
        doc_info = DocumentInfo(
            filename=filename,
            filepath=str(filepath),
            word_count=word_count,
            category=category,
            doc_type=doc_type,
            triage_timestamp=datetime.now().isoformat(),
            processed=False
        )
        
        logger.info(f"✓ Triaged {filename}: {category.upper()}, {doc_type}, {word_count} words")
        return doc_info

async def stage1_triage(input_files: List[Path]) -> List[DocumentInfo]:
    """
    Stage 1: Classify all documents using tiny qwen model.
    
    High concurrency (4) is safe here because qwen is tiny (~1GB VRAM).
    """
    logger.info("=" * 80)
    logger.info("STAGE 1: TRIAGE PASS")
    logger.info(f"Model: {TRIAGE_MODEL}")
    logger.info(f"Concurrency: {TRIAGE_CONCURRENCY}")
    logger.info(f"Documents: {len(input_files)}")
    logger.info("=" * 80)
    
    # Create semaphore for concurrency control
    semaphore = asyncio.Semaphore(TRIAGE_CONCURRENCY)
    
    async with aiohttp.ClientSession() as session:
        # Preload triage model
        await preload_model(session, TRIAGE_MODEL)
        
        # Process all documents concurrently (up to semaphore limit)
        tasks = [triage_document(session, filepath, semaphore) for filepath in input_files]
        results = await asyncio.gather(*tasks)
        
        # Filter out None results (failed triages)
        doc_infos = [r for r in results if r is not None]
        
        # Save manifest
        logger.info(f"💾 Saving manifest to {MANIFEST_FILE}")
        with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
            for doc_info in doc_infos:
                f.write(json.dumps(asdict(doc_info)) + '\n')
        
        # Statistics
        short_count = sum(1 for d in doc_infos if d.category == "short")
        long_count = sum(1 for d in doc_infos if d.category == "long")
        
        logger.info(f"✓ Triage complete: {short_count} short, {long_count} long")
        
        # Unload triage model before next stage
        await unload_model(session, TRIAGE_MODEL)
    
    return doc_infos

# ============================================================================
# STAGE 2: SHORT DOCUMENTS (mistral:7b)
# ============================================================================

async def summarize_short_document(
    session: aiohttp.ClientSession,
    doc_info: DocumentInfo,
    semaphore: asyncio.Semaphore
) -> SummaryResult:
    """
    Summarize a short document using mistral:7b.
    Single-pass summary since document is manageable.
    """
    async with semaphore:
        logger.info(f"📝 Summarizing SHORT: {doc_info.filename}")
        
        start_time = time.time()
        
        # Read full document
        text = read_document(Path(doc_info.filepath))
        if not text:
            return SummaryResult(
                filename=doc_info.filename,
                category="short",
                doc_type=doc_info.doc_type,
                model_used=SHORT_MODEL,
                summary="",
                chunk_count=0,
                processing_time=0,
                timestamp=datetime.now().isoformat(),
                error="Failed to read document"
            )
        
        # Prepare summary prompt
        prompt = f"""You are summarizing an Indian legal document ({doc_info.doc_type}).

Document text:
{text}

Provide a concise summary covering:
1. Parties involved
2. Key facts
3. Legal issues
4. Decision/outcome
5. Important precedents cited (if any)

Format your response in clear sections."""

        # Generate summary
        summary = await generate_with_retry(session, SHORT_MODEL, prompt)
        
        processing_time = time.time() - start_time
        
        if summary:
            logger.info(f"✓ Summarized {doc_info.filename} in {processing_time:.1f}s")
        else:
            logger.error(f"✗ Failed to summarize {doc_info.filename}")
        
        return SummaryResult(
            filename=doc_info.filename,
            category="short",
            doc_type=doc_info.doc_type,
            model_used=SHORT_MODEL,
            summary=summary or "",
            chunk_count=1,
            processing_time=processing_time,
            timestamp=datetime.now().isoformat(),
            error=None if summary else "Summary generation failed"
        )

async def stage2_short_documents(doc_infos: List[DocumentInfo]) -> List[SummaryResult]:
    """
    Stage 2: Process short documents with mistral:7b.
    
    LOW concurrency (1-2) to avoid VRAM overflow with 5GB model + KV cache.
    """
    short_docs = [d for d in doc_infos if d.category == "short" and not d.processed]
    
    if not short_docs:
        logger.info("⏭ No short documents to process, skipping Stage 2")
        return []
    
    logger.info("=" * 80)
    logger.info("STAGE 2: SHORT DOCUMENTS")
    logger.info(f"Model: {SHORT_MODEL}")
    logger.info(f"Concurrency: {SHORT_DOC_CONCURRENCY}")
    logger.info(f"Documents: {len(short_docs)}")
    logger.info("=" * 80)
    
    semaphore = asyncio.Semaphore(SHORT_DOC_CONCURRENCY)
    
    async with aiohttp.ClientSession() as session:
        # Preload mistral model (this will take ~5GB VRAM)
        await preload_model(session, SHORT_MODEL)
        
        # Process documents
        tasks = [summarize_short_document(session, doc_info, semaphore) for doc_info in short_docs]
        results = await asyncio.gather(*tasks)
        
        # Save results incrementally
        logger.info(f"💾 Saving results to {RESULTS_FILE}")
        with open(RESULTS_FILE, 'a', encoding='utf-8') as f:
            for result in results:
                f.write(json.dumps(asdict(result)) + '\n')
        
        # Unload mistral before next stage
        await unload_model(session, SHORT_MODEL)
    
    logger.info(f"✓ Stage 2 complete: {len(results)} documents processed")
    return results

# ============================================================================
# STAGE 3: LONG DOCUMENTS (llama3.1:8b)
# ============================================================================

async def summarize_long_document(
    session: aiohttp.ClientSession,
    doc_info: DocumentInfo,
    semaphore: asyncio.Semaphore
) -> SummaryResult:
    """
    Summarize a long document using llama3.1:8b with chunking strategy.
    
    1. Split document into chunks
    2. Summarize each chunk
    3. Merge chunk summaries into final summary
    """
    async with semaphore:
        logger.info(f"📝 Summarizing LONG: {doc_info.filename}")
        
        start_time = time.time()
        
        # Read full document
        text = read_document(Path(doc_info.filepath))
        if not text:
            return SummaryResult(
                filename=doc_info.filename,
                category="long",
                doc_type=doc_info.doc_type,
                model_used=LONG_MODEL,
                summary="",
                chunk_count=0,
                processing_time=0,
                timestamp=datetime.now().isoformat(),
                error="Failed to read document"
            )
        
        # Split into chunks
        chunks = chunk_text(text, CHUNK_SIZE)
        logger.info(f"  └─ Split into {len(chunks)} chunks")
        
        # Summarize each chunk
        chunk_summaries = []
        for i, chunk in enumerate(chunks):
            logger.info(f"  └─ Processing chunk {i+1}/{len(chunks)}")
            
            prompt = f"""Summarize this section of an Indian legal document ({doc_info.doc_type}).
This is part {i+1} of {len(chunks)}.

Text:
{chunk}

Provide a concise summary of the key points, facts, and legal reasoning in this section."""

            summary = await generate_with_retry(session, LONG_MODEL, prompt)
            if summary:
                chunk_summaries.append(summary)
            else:
                logger.warning(f"  └─ ⚠ Chunk {i+1} summary failed")
        
        if not chunk_summaries:
            return SummaryResult(
                filename=doc_info.filename,
                category="long",
                doc_type=doc_info.doc_type,
                model_used=LONG_MODEL,
                summary="",
                chunk_count=len(chunks),
                processing_time=time.time() - start_time,
                timestamp=datetime.now().isoformat(),
                error="All chunk summaries failed"
            )
        
        # Merge chunk summaries into final summary
        logger.info(f"  └─ Merging {len(chunk_summaries)} chunk summaries")
        
        merge_prompt = f"""You are merging multiple chunk summaries of an Indian legal document ({doc_info.doc_type}) into one coherent final summary.

Chunk summaries:
{chr(10).join(f"[Chunk {i+1}] {s}" for i, s in enumerate(chunk_summaries))}

Create a comprehensive final summary that:
1. Identifies parties involved
2. Summarizes key facts chronologically
3. Outlines legal issues and arguments
4. States the decision/outcome
5. Notes important precedents or legal principles

Ensure the final summary flows naturally and eliminates redundancy."""

        final_summary = await generate_with_retry(session, LONG_MODEL, merge_prompt)
        
        processing_time = time.time() - start_time
        
        if final_summary:
            logger.info(f"✓ Summarized {doc_info.filename} in {processing_time:.1f}s")
        else:
            logger.error(f"✗ Failed to merge summaries for {doc_info.filename}")
        
        return SummaryResult(
            filename=doc_info.filename,
            category="long",
            doc_type=doc_info.doc_type,
            model_used=LONG_MODEL,
            summary=final_summary or '\n\n'.join(chunk_summaries),  # Fallback to unmerged
            chunk_count=len(chunks),
            processing_time=processing_time,
            timestamp=datetime.now().isoformat(),
            error=None if final_summary else "Merge failed, returning unmerged chunks"
        )

async def stage3_long_documents(doc_infos: List[DocumentInfo]) -> List[SummaryResult]:
    """
    Stage 3: Process long documents with llama3.1:8b.
    
    LOW concurrency (1) to avoid VRAM overflow with 5GB model + KV cache.
    """
    long_docs = [d for d in doc_infos if d.category == "long" and not d.processed]
    
    if not long_docs:
        logger.info("⏭ No long documents to process, skipping Stage 3")
        return []
    
    logger.info("=" * 80)
    logger.info("STAGE 3: LONG DOCUMENTS")
    logger.info(f"Model: {LONG_MODEL}")
    logger.info(f"Concurrency: {LONG_DOC_CONCURRENCY}")
    logger.info(f"Documents: {len(long_docs)}")
    logger.info("=" * 80)
    
    semaphore = asyncio.Semaphore(LONG_DOC_CONCURRENCY)
    
    async with aiohttp.ClientSession() as session:
        # Preload llama model (this will take ~5GB VRAM)
        await preload_model(session, LONG_MODEL)
        
        # Process documents
        tasks = [summarize_long_document(session, doc_info, semaphore) for doc_info in long_docs]
        results = await asyncio.gather(*tasks)
        
        # Save results incrementally
        logger.info(f"💾 Appending results to {RESULTS_FILE}")
        with open(RESULTS_FILE, 'a', encoding='utf-8') as f:
            for result in results:
                f.write(json.dumps(asdict(result)) + '\n')
        
        # Unload llama
        await unload_model(session, LONG_MODEL)
    
    logger.info(f"✓ Stage 3 complete: {len(results)} documents processed")
    return results

# ============================================================================
# MAIN PIPELINE
# ============================================================================

async def run_pipeline():
    """
    Main orchestration function - runs all three stages sequentially.
    """
    logger.info("🚀 Starting Legal Document Summarization Pipeline")
    logger.info(f"Input directory: {INPUT_DIR}")
    logger.info(f"Output directory: {OUTPUT_DIR}")
    logger.info("")
    logger.info("VRAM CONSTRAINT: 6GB")
    logger.info("STRATEGY: Sequential staged processing with explicit model unloading")
    logger.info("")
    
    # Setup output directory
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Find input files
    input_files = list(INPUT_DIR.glob("*.txt")) + list(INPUT_DIR.glob("*.pdf"))
    
    if not input_files:
        logger.error(f"✗ No files found in {INPUT_DIR}")
        return
    
    logger.info(f"📂 Found {len(input_files)} documents to process")
    logger.info("")
    
    # Check for existing manifest (resume capability)
    doc_infos = []
    if MANIFEST_FILE.exists():
        logger.info("📋 Found existing manifest - loading...")
        with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                doc_infos.append(DocumentInfo(**json.loads(line)))
        logger.info(f"✓ Loaded {len(doc_infos)} documents from manifest")
        logger.info("⏭ Skipping Stage 1 (triage already complete)")
    else:
        # Stage 1: Triage
        doc_infos = await stage1_triage(input_files)
    
    logger.info("")
    
    # Stage 2: Short documents
    short_results = await stage2_short_documents(doc_infos)
    
    logger.info("")
    
    # Stage 3: Long documents
    long_results = await stage3_long_documents(doc_infos)
    
    # Final summary
    logger.info("")
    logger.info("=" * 80)
    logger.info("PIPELINE COMPLETE")
    logger.info("=" * 80)
    logger.info(f"Total documents processed: {len(short_results) + len(long_results)}")
    logger.info(f"Short documents: {len(short_results)}")
    logger.info(f"Long documents: {len(long_results)}")
    logger.info(f"Results saved to: {RESULTS_FILE}")
    logger.info(f"Manifest saved to: {MANIFEST_FILE}")
    logger.info("=" * 80)

def main():
    """Entry point"""
    # Check if input directory exists
    if not INPUT_DIR.exists():
        logger.error(f"✗ Input directory not found: {INPUT_DIR}")
        logger.info(f"Creating {INPUT_DIR} - please add your documents there")
        INPUT_DIR.mkdir(parents=True, exist_ok=True)
        return
    
    # Run the async pipeline
    asyncio.run(run_pipeline())

if __name__ == "__main__":
    main()
