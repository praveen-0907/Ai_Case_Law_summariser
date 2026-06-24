# ai-service/services/ollama_service.py
# -------------------------------------------------------
# This module handles ALL communication with Ollama.
# Ollama is a tool that runs large language models (like Llama 3) locally on your computer.
#
# Why a separate file?
#   - Keeps AI-specific logic away from API route logic
#   - If we ever swap Ollama for another AI (e.g. OpenAI, Gemini), we only change THIS file
#   - Easy to test this module independently
#
# How Ollama works:
#   Ollama runs as a local server on port 11434.
#   We send it a POST request with our prompt and it streams back a response.
#   We disable streaming (stream: false) so we get the full response at once.
#
# Ollama API docs: https://github.com/ollama/ollama/blob/main/docs/api.md
# -------------------------------------------------------

import os          # For reading environment variables (.env file)
import logging     # For printing structured log messages
import requests    # For making HTTP requests to the Ollama server

# Get a logger named after this module for clean log output
logger = logging.getLogger(__name__)

# -------------------------------------------------------
# CONFIGURATION — reads from environment variables (.env)
# -------------------------------------------------------

# The base URL where Ollama is running locally
# Default: http://localhost:11434 (Ollama's default port)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# The name of the AI model to use
# "llama3" is Meta's Llama 3 model — you must run 'ollama pull llama3' first
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

# How long (in seconds) to wait for Ollama to respond before giving up
# Llama 3 can be slow on first run (loading model into memory), so 60s is safe
OLLAMA_TIMEOUT_SECONDS = 600

# The full URL for the Ollama text generation API endpoint
OLLAMA_GENERATE_URL = f"{OLLAMA_BASE_URL}/api/generate"


# -------------------------------------------------------
# FUNCTION: build_legal_summary_prompt
# Purpose: Construct the carefully-worded prompt we send to Llama 3.
#
# This is called "prompt engineering" — how you phrase your instruction
# to the AI model dramatically affects the quality of the output.
#
# Design decisions:
#   - We explicitly forbid introductory text ("Sure, here is...")
#   - We enforce exactly 3 sections with their exact names
#   - We set a 300 word maximum to keep summaries concise and useful
#   - We use "legal judgment" context so the model stays on topic
# -------------------------------------------------------
def build_legal_summary_prompt(raw_text: str) -> str:
    """
    Builds the LLM prompt string for generating a legal case summary.

    Parameters:
        raw_text (str): The full extracted text of the legal judgment.

    Returns:
        str: A carefully crafted prompt string ready to send to Llama 3.
    """
    # We use a triple-quoted f-string for a clean multi-line prompt
    # The {raw_text} placeholder inserts the actual legal text
    prompt = f"""You are an expert legal analyst. Your task is to read the following legal judgment and produce a concise, objective, plain-English summary.

STRICT RULES YOU MUST FOLLOW:
1. Do NOT start with phrases like "Sure", "Here is", "Certainly", or any introductory text.
2. Write EXACTLY three sections with EXACTLY these headings (use the exact capitalization shown):
   - Core Facts
   - Main Dispute
   - Final Ruling
3. Keep the TOTAL summary under 300 words across all three sections.
4. Use plain English — avoid complex legal jargon. Write as if explaining to a non-lawyer.
5. Be objective — do not add personal opinions or commentary.
6. Start your response IMMEDIATELY with "Core Facts:" — nothing before it.

LEGAL JUDGMENT TEXT:
---
{raw_text}
---

BEGIN SUMMARY:"""

    return prompt


# -------------------------------------------------------
# FUNCTION: call_ollama
# Purpose: Makes the actual HTTP POST request to Ollama's API.
# This is a low-level helper used by generate_summary().
#
# Parameters:
#   prompt (str): The full prompt string to send
#
# Returns:
#   dict with keys:
#     "success" (bool): Whether the call worked
#     "response_text" (str): The AI-generated text (if success)
#     "error" (str): Error description (if not success)
#     "model" (str): Which model was used
# -------------------------------------------------------
def call_ollama(prompt: str) -> dict:
    """
    Sends a prompt to the Ollama API and returns the response.

    Uses a 60-second timeout because Llama 3 can take time,
    especially when loading the model into memory for the first time.
    """
    # Build the request payload (body) that Ollama expects
    request_payload = {
        "model": OLLAMA_MODEL,       # e.g. "llama3"
        "prompt": prompt,            # Our carefully crafted prompt
        "stream": False,             # False = return full response at once (not word-by-word)
        "options": {
            # Temperature controls creativity vs accuracy
            # 0.3 = more focused/consistent (better for factual legal summaries)
            # 1.0 = more creative/varied
            "temperature": 0.3,

            # num_predict = maximum number of tokens (roughly words) to generate
            # 500 tokens ≈ 375 words, giving us headroom for our 300-word target
            "num_predict": 500,
        }
    }

    logger.info(f"Sending request to Ollama at {OLLAMA_GENERATE_URL}")
    logger.info(f"Model: {OLLAMA_MODEL} | Timeout: {OLLAMA_TIMEOUT_SECONDS}s")

    try:
        # Make the POST request to Ollama
        # timeout=OLLAMA_TIMEOUT_SECONDS means: if no response in 60s, raise an error
        response = requests.post(
            OLLAMA_GENERATE_URL,
            json=request_payload,          # json= automatically sets Content-Type: application/json
            timeout=OLLAMA_TIMEOUT_SECONDS
        )

        # Check if the HTTP status code indicates success (200-299)
        # raise_for_status() throws an exception if status is 4xx or 5xx
        response.raise_for_status()

        # Parse the JSON response body from Ollama
        response_data = response.json()

        # Ollama's response has a "response" field containing the generated text
        # We use .get() with a default of "" to avoid KeyError if field is missing
        generated_text = response_data.get("response", "").strip()

        # Check if the model actually returned something
        if not generated_text:
            logger.warning("Ollama returned an empty response string")
            return {
                "success": False,
                "response_text": "",
                "error": "Ollama returned an empty response. The model may need more time or the prompt may be too long.",
                "model": OLLAMA_MODEL
            }

        # Log how many words were generated
        word_count = len(generated_text.split())
        logger.info(f"Ollama responded successfully — {word_count} words generated")

        return {
            "success": True,
            "response_text": generated_text,
            "error": None,
            "model": OLLAMA_MODEL
        }

    except requests.exceptions.ConnectionError:
        # This happens when Ollama is NOT running on the expected port
        error_msg = (
            f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. "
            "Please make sure Ollama is installed and running. "
            "Run 'ollama serve' in a new terminal window."
        )
        logger.error(error_msg)
        return {"success": False, "response_text": "", "error": error_msg, "model": OLLAMA_MODEL}

    except requests.exceptions.Timeout:
        # This happens when Ollama takes longer than 60 seconds
        error_msg = (
            f"Ollama did not respond within {OLLAMA_TIMEOUT_SECONDS} seconds. "
            "The model may still be loading. Please try again in a moment."
        )
        logger.error(error_msg)
        return {"success": False, "response_text": "", "error": error_msg, "model": OLLAMA_MODEL}

    except requests.exceptions.HTTPError as http_err:
        # HTTP error (e.g., 404 model not found, 500 Ollama crash)
        status_code = http_err.response.status_code if http_err.response else "unknown"

        if status_code == 404:
            error_msg = (
                f"Model '{OLLAMA_MODEL}' not found in Ollama. "
                f"Run 'ollama pull {OLLAMA_MODEL}' in your terminal to download it."
            )
        else:
            error_msg = f"Ollama HTTP error {status_code}: {str(http_err)}"

        logger.error(error_msg)
        return {"success": False, "response_text": "", "error": error_msg, "model": OLLAMA_MODEL}

    except Exception as unexpected_error:
        # Catch-all for any other unexpected errors
        error_msg = f"Unexpected error communicating with Ollama: {type(unexpected_error).__name__}: {unexpected_error}"
        logger.error(error_msg, exc_info=True)
        return {"success": False, "response_text": "", "error": error_msg, "model": OLLAMA_MODEL}


# -------------------------------------------------------
# FUNCTION: generate_summary  ← THE MAIN PUBLIC FUNCTION
# Purpose: Orchestrates prompt building + Ollama call + fallback handling.
# This is what the route file (summary.py) calls directly.
#
# Parameters:
#   raw_text (str): Extracted legal judgment text
#
# Returns:
#   dict: A structured result with the summary or a fallback message
# -------------------------------------------------------
def generate_summary(raw_text: str) -> dict:
    """
    Main entry point: takes raw legal text and returns an AI-generated summary.

    Includes a FALLBACK: if Ollama fails or returns empty content,
    the function returns a raw truncated excerpt of the text instead
    of crashing — so the user always gets SOMETHING useful.

    Returns a dict with these keys:
        "summary_text"   (str): The AI summary or fallback text
        "model_used"     (str): Which model generated it, or "fallback"
        "word_count"     (int): Number of words in the summary
        "is_fallback"    (bool): True if AI failed and we used fallback text
        "fallback_reason"(str | None): Why fallback was used (if applicable)
        "sections_found" (list): Which of the 3 required sections were found
    """

    # ---- STEP 1: Input validation ----
    # Trim whitespace and verify we actually have text to work with
    cleaned_input = raw_text.strip() if raw_text else ""

    if not cleaned_input:
        logger.warning("generate_summary called with empty text — returning fallback immediately")
        return _build_fallback_response(
            raw_text="",
            reason="No text was provided to summarize."
        )

    # Log the size of input for debugging (don't log the text itself — could be huge)
    word_count_input = len(cleaned_input.split())
    logger.info(f"Generating summary for {word_count_input} words of legal text")

    # ---- STEP 2: Build the prompt ----
    prompt = build_legal_summary_prompt(cleaned_input)

    # ---- STEP 3: Call Ollama ----
    ollama_result = call_ollama(prompt)

    # ---- STEP 4: Handle the result ----
    if not ollama_result["success"] or not ollama_result["response_text"]:
        # Ollama failed — use the fallback
        logger.warning(f"Ollama failed — using fallback. Reason: {ollama_result['error']}")
        return _build_fallback_response(
            raw_text=cleaned_input,
            reason=ollama_result["error"]
        )

    # Ollama succeeded — process the response
    summary_text = ollama_result["response_text"]

    # ---- STEP 5: Check which sections were found in the response ----
    # This tells us if the model followed our instructions properly
    required_sections = ["Core Facts", "Main Dispute", "Final Ruling"]
    sections_found = [
        section for section in required_sections
        if section.lower() in summary_text.lower()
    ]

    # If fewer than 2 sections were found, the model probably ignored our instructions
    # Use fallback in that case
    if len(sections_found) < 2:
        logger.warning(
            f"Model response missing required sections. "
            f"Found: {sections_found}. Raw response: {summary_text[:200]}..."
        )
        return _build_fallback_response(
            raw_text=cleaned_input,
            reason="AI model did not follow the required structure (Core Facts / Main Dispute / Final Ruling). Raw response was returned as fallback.",
            raw_ai_response=summary_text  # Include what the AI did say
        )

    # Everything looks good — return the successful summary
    return {
        "summary_text": summary_text,
        "model_used": ollama_result["model"],
        "word_count": len(summary_text.split()),
        "is_fallback": False,
        "fallback_reason": None,
        "sections_found": sections_found,
    }


# -------------------------------------------------------
# HELPER FUNCTION: _build_fallback_response
# Purpose: Constructs the fallback response when Ollama is unavailable or fails.
# The leading underscore _ in the name means "this is a private helper function"
# — it should only be called from within this file, not from other modules.
#
# Fallback strategy:
#   - If we have text: return a truncated excerpt (first 300 words)
#   - If no text: return a clear error message
#   - Always include the reason for the fallback so the UI can show it
# -------------------------------------------------------
def _build_fallback_response(raw_text: str, reason: str, raw_ai_response: str = None) -> dict:
    """
    Builds a safe fallback response when AI generation fails.
    Always returns a usable response — never crashes.
    """
    if raw_ai_response:
        # The AI responded but didn't follow structure — return its raw output
        fallback_text = f"[AI response did not follow required format. Raw output below:]\n\n{raw_ai_response}"
        logger.info("Using raw AI response as fallback (structure not followed)")

    elif raw_text:
        # No AI response at all — return a truncated excerpt of the original text
        # This gives the user SOMETHING to read rather than an error screen
        words = raw_text.split()
        max_words = 300
        truncated = " ".join(words[:max_words])

        if len(words) > max_words:
            truncated += f"\n\n[... Document truncated at {max_words} words. Full text has {len(words)} words. AI summarization was unavailable.]"

        fallback_text = (
            f"[AI Summary Unavailable — Showing raw document excerpt]\n\n"
            f"{truncated}"
        )
        logger.info(f"Using raw text excerpt as fallback ({min(len(words), max_words)} words)")

    else:
        # No text at all — return a clear error message
        fallback_text = "[No text was available to summarize. Please upload a valid PDF.]"
        logger.info("No text available — returning empty fallback message")

    return {
        "summary_text": fallback_text,
        "model_used": "fallback",
        "word_count": len(fallback_text.split()),
        "is_fallback": True,
        "fallback_reason": reason,
        "sections_found": [],   # No sections since AI didn't run
    }
