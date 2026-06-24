# Project Logic & Architecture Notes
# AI Case Law Summarizer and Comparator

> This file is the **developer's manual** for the project.
> It explains the "why" behind every major decision — not just the "what".
> Written to be understood by a 2nd-year IT student with no prior AI experience.

---

## Table of Contents

1. [Overall Architecture](#1-overall-architecture)
2. [Phase 1 — Baseline Setup](#2-phase-1--baseline-setup)
3. [Phase 2 — Multi-PDF Upload System](#3-phase-2--multi-pdf-upload-system)
4. [Phase 3 — PDF Text Extraction](#4-phase-3--pdf-text-extraction)
5. [Phase 4 — AI Summary Generation](#5-phase-4--ai-summary-generation)
6. [Phase 5 — Key Legal Feature Extraction](#6-phase-5--key-legal-feature-extraction)
7. [Phase 6 — Semantic Similarity Engine](#7-phase-6--semantic-similarity-engine)
8. [Phase 7 — Comparative Intelligence Engine](#8-phase-7--comparative-intelligence-engine)
9. [Phase 8 — Comparison Dashboard UI](#9-phase-8--comparison-dashboard-ui)

---

## 1. Overall Architecture

### How the Three Services Talk to Each Other

```
[User's Browser — Port 5173]
         |
         | User uploads PDFs, sees results
         v
[Frontend — React + Vite]
         |
         | axios HTTP calls to port 5000 (file uploads, analysis requests)
         | axios HTTP calls to port 8000 directly (similarity, comparison)
         v
[Backend — Node.js + Express — Port 5000]
         |
         | Forwards files + text to AI service
         v
[AI Service — Python + FastAPI — Port 8000]
         |
         | Calls Ollama on port 11434 for LLM tasks
         v
[Ollama — Local LLM Server — Port 11434]
         |
         | Returns generated text
         v
[AI Service returns structured JSON]
         |
         v
[Backend returns JSON to Frontend]
         |
         v
[React renders results in the UI]
```

### Why Three Separate Services?

| Reason | Explanation |
|--------|-------------|
| **Technology fit** | Python has the best AI/NLP libraries. Node.js handles web file uploads and APIs best. React handles UI best. |
| **Separation of concerns** | Each service has one job. If the AI breaks, the upload still works. |
| **Scalability** | In production, we could run 10 copies of the AI service independently without touching the frontend or backend. |
| **Security** | The backend acts as a security gateway. Files are validated on the server before being passed to Python. |

---

## 2. Phase 1 — Baseline Setup

**Goal:** Create the monorepo folder structure and confirm all three services can start.

### Files Created

| File | What it Does |
|------|-------------|
| `frontend/package.json` | Declares React, Vite, and Tailwind as dependencies |
| `frontend/src/App.jsx` | Simple "Hello World" welcome screen |
| `backend/package.json` | Declares Express, Multer, Cors, dotenv as dependencies |
| `backend/server.js` | Express server on port 5000 with a GET /api/health route |
| `ai-service/requirements.txt` | Lists FastAPI, Uvicorn, PyMuPDF, requests |
| `ai-service/main.py` | FastAPI server on port 8000 with GET /health route |
| `.env.example` files | Templates showing developers what credentials to fill in |

### Why We Use Environment Variables

Hardcoding secrets in code is dangerous:
```python
# ❌ BAD — if this file goes to GitHub, your database is exposed
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Instead we use `.env` files:
```python
# ✅ GOOD — the key lives only on your machine, never in Git
import os
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
```

The `.env` file is always listed in `.gitignore` so it can never be accidentally uploaded.

---

## 3. Phase 2 — Multi-PDF Upload System

**Goal:** Build a full file upload pipeline from a browser drag-and-drop UI to server disk storage.

### Files Created

| File | What it Does |
|------|-------------|
| `frontend/src/components/FileUploader.jsx` | Drag-and-drop UI with client-side validation |
| `frontend/src/services/api.js` | Axios API call functions with upload progress |
| `backend/src/routes/upload.js` | Express route for POST /api/upload |
| `backend/src/controllers/uploadController.js` | Multer configuration + file handling logic |
| `backend/uploads/` | Temporary folder where PDFs are saved on disk |

### How the Upload Pipeline Works (Step by Step)

```
Step 1: User drags PDFs onto the FileUploader component
         ↓
Step 2: Client-side validation runs instantly (no server needed):
        - Is it a PDF? (file.type === 'application/pdf')
        - Is it under 20MB? (file.size <= 20 * 1024 * 1024)
        - Are there fewer than 10 files?
        - Is it a duplicate already in the list?
         ↓
Step 3: User clicks "Upload" button
         ↓
Step 4: api.js creates a FormData object and appends all files.
        Axios fires POST to http://localhost:5000/api/upload.
        onUploadProgress callback fires repeatedly → updates progress bar.
         ↓
Step 5: Express receives the request. upload.js route matches.
         ↓
Step 6: Multer middleware runs:
        - Checks MIME type again on the SERVER (security layer)
        - Checks file size again on the SERVER
        - Saves valid files to /backend/uploads/ with a timestamp prefix
          e.g. "1718167200000-judgment.pdf"
         ↓
Step 7: handleFileUpload controller builds a JSON summary and responds:
        { success: true, files: [{ originalName, savedPath, sizeMB }] }
         ↓
Step 8: Frontend shows the uploaded file list + "Open Dashboard" button
```

### Why We Validate on BOTH Frontend and Backend

- **Frontend validation** gives instant feedback without a network round-trip. Better user experience.
- **Backend validation** is the real security gate. A malicious user could bypass the browser entirely and send raw HTTP requests directly to your API.

> **Rule of thumb:** Never trust the client. Always re-validate on the server.

### Key Concepts

**FormData** — A browser object for constructing multipart/form-data HTTP requests. This is the standard way browsers send files over HTTP.

**Multer** — A Node.js middleware that reads the multipart stream and writes file bytes to disk. Without it, Express cannot process file uploads at all.

**diskStorage vs memoryStorage** — We use `diskStorage` which saves files to disk. The alternative `memoryStorage` keeps files in RAM — much faster but dangerous for large files or many simultaneous users.

**onUploadProgress** — An Axios callback that fires repeatedly as bytes are sent. We use it to calculate `(bytesLoaded / totalBytes) * 100` and update the progress bar width.

---

## 4. Phase 3 — PDF Text Extraction

**Goal:** Extract clean, structured text from PDF files using PyMuPDF, ready for AI processing.

### Files Created / Modified

| File | Status | What it Does |
|------|--------|-------------|
| `ai-service/routes/__init__.py` | New | Makes routes/ a Python package (required for imports) |
| `ai-service/routes/extraction.py` | New | POST /extract-text — full PDF parsing + cleaning |
| `ai-service/main.py` | Modified | Registers extraction_router |

### Strict JSON Response Contract

Every call to `POST /extract-text` returns exactly this shape:

```json
{
  "filename": "case_judgment.pdf",
  "total_pages": 12,
  "full_text": "Complete cleaned text from all pages...",
  "pages": [
    { "page_number": 1, "text": "Text from page 1..." },
    { "page_number": 2, "text": "Text from page 2..." }
  ]
}
```

This strict structure means the summary endpoint (Phase 4) can always rely on finding `full_text` — no guessing.

### How `clean_page_text()` Works

Raw PDF text extracted by PyMuPDF looks messy. We clean it in 3 steps:

```
RAW: "   Section 1.   \n   \n   \n   \n   The court held...   \n"

Step 1 — splitlines(): Split into list of individual lines
→ ["   Section 1.   ", "   ", "   ", "   ", "   The court held...   ", ""]

Step 2 — .strip() each line: Remove leading/trailing whitespace from every line
→ ["Section 1.", "", "", "", "The court held...", ""]

Step 3 — re.sub(r'\n{3,}', '\n\n'): Collapse 3+ consecutive blank lines into 1
→ "Section 1.\n\nThe court held..."

RESULT: One clean blank line between paragraphs. No trailing spaces.
```

### Error Handling by HTTP Status Code

| What Happened | HTTP Status | Why That Code |
|--------------|-------------|---------------|
| User sent a .docx file | 400 Bad Request | Wrong file extension — client's fault |
| Wrong Content-Type header | 400 Bad Request | Client formatted the request incorrectly |
| Empty file (0 bytes) | 400 Bad Request | Nothing to process |
| File is corrupted / not a real PDF | 422 Unprocessable Entity | The request was valid, but the content could not be read |
| Unexpected server crash | 500 Internal Server Error | Something we didn't anticipate went wrong |

**Why 422 for corrupted PDFs?** — HTTP 422 means "Unprocessable Entity". The server understood the request format perfectly — it was a PDF by name and content-type. But the content itself could not be decoded. This is more accurate than 400 (bad request format) or 500 (our code broke).

### APIRouter Pattern (Why We Split into Separate Files)

Phase 1 put all routes in one file:
```python
# main.py — everything jammed in one place
@app.post("/extract-text")
def extract():
    ...
```

From Phase 3 onwards, we use FastAPI's `APIRouter`:
```python
# routes/extraction.py — each feature in its own file
router = APIRouter()

@router.post("")
def extract():
    ...

# main.py — stays clean, just wires things together
from routes.extraction import router as extraction_router
app.include_router(extraction_router, prefix="/extract-text")
```

This mirrors how Express.js uses separate route files in the Node backend.

---

## 5. Phase 4 — AI Summary Generation

**Goal:** Generate a structured 3-section plain-English summary of a legal judgment using a local AI model via Ollama.

### Files Created / Modified

| File | Status | What it Does |
|------|--------|-------------|
| `ai-service/services/ollama_service.py` | New | Handles all Ollama API communication |
| `ai-service/routes/summary.py` | New | POST /generate-summary endpoint |
| `ai-service/main.py` | Modified | Registers summary_router |
| `ai-service/.env` | Created | Sets `OLLAMA_MODEL=qwen2.5:0.5b` |

### How Ollama Works

Ollama is a local AI model server. Instead of sending text to OpenAI's cloud (which costs money and sends your legal data to a third party), we run the model on your own machine.

```
Our Python code
    |
    | POST http://localhost:11434/api/generate
    | { "model": "qwen2.5:0.5b", "prompt": "...", "stream": false }
    v
Ollama server (running locally)
    |
    | Loads the model into GPU/CPU memory
    | Generates the response token by token
    v
Returns: { "response": "Core Facts: ...\nMain Dispute: ...\nFinal Ruling: ..." }
```

### The 3-Section Prompt Design

We specifically instruct the model to use exactly these three headings:

```
Core Facts        → What happened? (who, what, when, where)
Main Dispute      → What legal question did the court have to decide?
Final Ruling      → What did the court decide and why?
```

The prompt explicitly says: "Do not include any introductory text. Do not say 'Sure, here is your summary'."

### The Fallback System (Why It's Important)

Small models like `qwen2.5:0.5b` often ignore formatting instructions. Our code handles this:

```
Call Ollama
    |
    | Did the model include all 3 required headings?
    |
    ├── YES → Return the structured summary as "status: success"
    |
    └── NO  → Return the raw AI text with a warning label
              "status: fallback"
              "fallback_reason: AI did not follow required structure"
```

This means the user always gets something useful — even if the model misbehaves. The server never crashes.

### Model Temperature Explained

Temperature controls how "creative" vs "factual" the model is:

| Temperature | Behaviour | Used For |
|-------------|-----------|----------|
| 0.0 | Always picks the most likely word — deterministic | Copying text exactly |
| 0.1 | Very consistent and factual | Feature extraction |
| 0.2–0.3 | Slightly creative but still grounded | Summaries |
| 0.7–1.0 | Creative and varied | Creative writing |

We use `0.3` for summaries — enough creativity to write readable prose, but factual enough for legal documents.

---

## 6. Phase 5 — Key Legal Feature Extraction

**Goal:** Extract exactly two structured arrays from legal text — the legal issues (questions the judge answered) and the legal principles (laws/doctrines applied).

### Files Created / Modified

| File | Status | What it Does |
|------|--------|-------------|
| `ai-service/routes/features.py` | New | POST /extract-features endpoint |
| `ai-service/main.py` | Modified | Registers features_router, version 4.0.0 |

### Strict Output Schema

```json
{
  "issues": ["Whether the defendant breached the contract", "Whether damages were proven"],
  "principles": ["Doctrine of promissory estoppel", "Section 73 Contract Act"]
}
```

### Two-Layer JSON Enforcement

Getting small models to return clean JSON requires TWO enforcement layers working together:

**Layer 1 — Ollama `format: "json"` parameter:**
When you add `"format": "json"` to the Ollama API request, Ollama constrains the model's token generation to only produce valid JSON characters. This is enforced at the mathematical sampling level — the model cannot physically output the letter `S` as the first character because the JSON grammar requires `{`.

**Layer 2 — Prompt engineering:**
The prompt shows the exact schema, a worked example, and says "output ONLY the JSON object — nothing before it, nothing after it."

Both layers together give us dramatically more reliable output than either alone.

### 3-Layer JSON Parsing (Safety Net)

Even with two enforcement layers, small models can still produce imperfect output. Our parser tries three strategies before giving up:

```
Ollama response text
        |
Layer 1: json.loads(raw_text)
        | — direct parse, works for clean output
        | FAIL (JSONDecodeError)
        ↓
Layer 2: regex search for r'\{.*\}' in the text
        | — finds JSON even if model added text before/after it
        | FAIL (still not valid JSON)
        ↓
Layer 3: Return {"issues": [], "principles": []}
        | — always returns the correct schema shape
        | — never returns an HTTP 500
```

### Why Temperature = 0.1 for Extraction?

Summary generation uses `0.3` — creative enough to write readable prose.
Feature extraction uses `0.1` — we want the model to identify EXACT text from the document, not invent creative interpretations. Lower temperature = more literal and consistent = better for extraction tasks.

### Input Truncation (Why 3000 Words?)

`qwen2.5:0.5b` is a tiny model with a limited context window. If we feed it a 50-page judgment:
- It forgets what was at the beginning by the time it reaches the end
- Output near the end becomes garbled or repetitive
- It may silently stop generating before finishing

We truncate to 3000 words (~12 pages). For longer documents, a future improvement would be to split into overlapping chunks, process each, and merge the results.

---

## 7. Phase 6 — Semantic Similarity Engine

**Goal:** Calculate how semantically similar two legal case texts are, returning a clean 0–100 score. This uses no Ollama — pure local Python math.

### Files Created / Modified

| File | Status | What it Does |
|------|--------|-------------|
| `ai-service/routes/similarity.py` | New | POST /similarity endpoint |
| `ai-service/requirements.txt` | Modified | Added sentence-transformers==5.5.1, numpy==2.4.6 |
| `ai-service/main.py` | Modified | Registers similarity_router, version 5.0.0 |

### What is an Embedding? (Plain English)

An "embedding" is a way to represent the **meaning** of a sentence as a list of numbers (a "vector").

```
"The court ruled in favour of the plaintiff."
→ SentenceTransformer model
→ [0.23, -0.71, 0.45, 0.12, -0.33, ...] (384 numbers)
```

Sentences with **similar meaning** produce vectors that point in similar directions in this 384-dimensional mathematical space. This is what makes the comparison meaningful — it compares the meaning of the text, not just the words.

### What is Cosine Similarity? (Plain English)

Imagine two arrows pointing outward from a single point. Cosine similarity measures the angle between them:

```
Same direction    → angle = 0°   → cosine = 1.0 → 100% similar
Perpendicular     → angle = 90°  → cosine = 0.0 → 0% similar  
Opposite          → angle = 180° → cosine = -1.0 → completely different
```

The formula: `cosine(A, B) = (A · B) / (|A| × |B|)`

Where `A · B` is the dot product (sum of element-wise multiplication) and `|A|`, `|B|` are the vector magnitudes (lengths). We compute this manually with NumPy so the logic is transparent and teachable.

### The Lazy Singleton Pattern (Why We Load the Model Once)

Loading a machine learning model from disk takes 2–5 seconds. If we loaded it on every request:
- First user: waits 5 seconds
- Second user: waits 5 seconds
- Every user: waits 5 seconds

Instead, we use a **lazy singleton** — the model is loaded once when the first request arrives, then stored in a module-level variable and reused for all subsequent requests:

```python
_embedding_model = None   # None at startup

def get_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")  # load once
    return _embedding_model  # reuse always
```

### Why `all-MiniLM-L6-v2`?

| Property | Value |
|----------|-------|
| Model size | ~90MB |
| Embedding dimensions | 384 |
| Speed | Very fast (CPU-friendly) |
| Quality | High — specifically trained for sentence similarity |
| Alternative | `all-mpnet-base-v2` — better quality but 420MB and 768 dimensions |

For development, MiniLM gives a great accuracy-to-speed tradeoff.

### Interpretation Labels

| Score Range | Label |
|-------------|-------|
| 85–100 | Very high similarity — cases are closely related |
| 65–84 | High similarity — likely same area of law |
| 40–64 | Moderate similarity — some shared concepts |
| 20–39 | Low similarity — different legal issues |
| 0–19 | Very low similarity — different legal domains |

---

## 8. Phase 7 — Comparative Intelligence Engine

**Goal:** Perform a deep AI-powered comparative analysis of two cases — identifying shared elements, conflicts, and adversarial strategy.

### Files Created / Modified

| File | Status | What it Does |
|------|--------|-------------|
| `ai-service/routes/comparison.py` | New | POST /compare-cases endpoint |
| `ai-service/main.py` | Modified | Registers comparison_router, version 6.0.0 |

### The Input Structure

The endpoint accepts both cases with their already-extracted data:

```json
{
  "case_a": {
    "summary": "Plain-English summary from /generate-summary",
    "issues": ["Legal question 1", "Legal question 2"],
    "principles": ["Doctrine or statute 1", "Doctrine or statute 2"]
  },
  "case_b": {
    "summary": "...",
    "issues": ["..."],
    "principles": ["..."]
  }
}
```

### The Output Structure

```json
{
  "common_issues": ["Legal questions both cases shared"],
  "common_principles": ["Laws both cases applied"],
  "structural_differences": ["How the cases differ in facts or outcome"],
  "adversarial_strategy": {
    "if_you_rely_on_case_a": "How the opposing lawyer would use Case B against you",
    "how_to_distinguish_them": "The exact argument to neutralise their attack"
  }
}
```

### Why Adversarial Strategy?

In real legal practice, you don't just research precedents that support your case. You must also **anticipate what the other side will argue**. If you cite Case A as your precedent, your opponent will immediately ask: "But doesn't Case B prove the opposite?"

This engine answers that question automatically — it tells you:
1. What attack is coming (using Case B against you)
2. How to defend against it (the factual difference that makes your case different)

### Prompt Engineering for Comparative Analysis

The comparison prompt specifically instructs the model:

> *"Do not only find similarities. Actively look for where Case A and Case B reach different outcomes on the same question, apply the same legal principle differently, or have different facts that change the legal result. These conflicts are the most valuable part of the analysis."*

This is important because AI models naturally tend toward finding agreement. We must explicitly push it to look for disagreement.

### Temperature = 0.2 for Comparison

- Feature extraction: `0.1` — very literal, extract what's there
- Summary generation: `0.3` — some creativity for readable prose  
- Comparative analysis: `0.2` — needs reasoning across two documents, slightly more creative than pure extraction but still factual

### Safe Field Normalisation

The `_safe_list()` function handles every possible way a small model might return a list:

```python
_safe_list(None)           → []
_safe_list("one string")   → ["one string"]
_safe_list(["a", "", "b"]) → ["a", "b"]    # removes empty strings
_safe_list([1, 2.5])       → ["1", "2.5"]  # converts numbers to strings
```

And if the model returns `adversarial_strategy` as a plain string instead of a dict (a common small-model mistake), we wrap it into the correct shape automatically.

---

## 9. Phase 8 — Comparison Dashboard UI

**Goal:** Build a responsive 3-column React page that displays all analysis results side by side.

### Files Created / Modified

| File | Status | What it Does |
|------|--------|-------------|
| `frontend/src/pages/ComparisonDashboard.jsx` | New | Full 3-column comparison dashboard page |
| `frontend/src/services/api.js` | Modified | Added `generateSummary`, `extractFeatures`, `getSimilarityScore`, `compareCases` functions |
| `frontend/src/App.jsx` | Modified | Added 2-tab navigation (Upload / Compare) |

### Page Layout

```
Desktop (3 columns):
┌──────────────────┬──────────────────────┬──────────────────┐
│   CASE A CARD    │   CENTER ANALYSIS    │   CASE B CARD    │
│                  │                      │                  │
│ ⚖️ Case A        │  Similarity Score    │ ⚖️ Case B        │
│                  │   ╭──────────╮       │                  │
│ Summary          │   │   78%    │       │ Summary          │
│ text here...     │   ╰──────────╯       │ text here...     │
│                  │  "High similarity"   │                  │
│ Key Issues       │  ─────────────────   │ Key Issues       │
│ • Issue 1        │  Conflict Matrix     │ • Issue 1        │
│ • Issue 2        │  ✅ Common Issues    │ • Issue 2        │
│                  │  📘 Common Princ.    │                  │
│ Legal Principles │  ⚡ Differences      │ Legal Principles │
│ • Principle 1    │  ⚔️ Strategy         │ • Principle 1    │
└──────────────────┴──────────────────────┴──────────────────┘

Mobile: All columns stack vertically (1 column)
```

### Loading States — Animated Skeleton Loaders

While the API calls are in progress, we show "skeleton" placeholders — gray flashing boxes in the shape of the real content. This is better than a spinner because the user can see the layout they are about to receive.

```jsx
// Tailwind's animate-pulse makes the element fade in and out repeatedly
<div className="w-full h-4 bg-slate-700/60 rounded-lg animate-pulse" />
```

### The `useEffect` and `Promise.all` Pattern

```javascript
useEffect(() => {
  async function runAnalysis() {
    setLoading(true)

    // Promise.all fires BOTH requests simultaneously.
    // Without it, we'd wait for similarity (3s) then wait for comparison (5s) = 8s total.
    // With Promise.all, both run at the same time = max(3s, 5s) = 5s total.
    const [similarityResult, comparisonResult] = await Promise.all([
      getSimilarityScore(caseA.summary, caseB.summary),
      compareCases(caseA, caseB),
    ])

    setSimilarity(similarityResult)
    setComparison(comparisonResult)
    setLoading(false)
  }

  runAnalysis()
}, [])  // Empty array = run only on first mount
```

### The SVG Similarity Score Ring

The circular score indicator is built using SVG (Scalable Vector Graphics) with the `stroke-dasharray` technique:

```
The circle has a total circumference C = 2 × π × radius

We want to show (score / 100)% of the circle filled.
Filled amount  = (score / 100) × C
Unfilled amount = C - filled (transparent)

stroke-dasharray="filled unfilled"
means: draw filled px of solid line, then unfilled px of invisible line
```

As the score changes, the `transition: stroke-dasharray 0.8s ease` CSS property animates the fill smoothly.

### Demo Mode

If no real case data is passed in (i.e. the user opens the dashboard without going through the upload flow), the component automatically shows realistic fake legal case data. This lets you demonstrate and test the UI without running the full pipeline every time.

---

## Summary — What Every File Does

### AI Service (`/ai-service`)

| File | Purpose |
|------|---------|
| `main.py` | Entry point — creates FastAPI app, registers all routers, starts server |
| `services/ollama_service.py` | Handles all Ollama API calls, prompt engineering, fallback logic |
| `routes/extraction.py` | Extracts text from PDFs page by page using PyMuPDF |
| `routes/summary.py` | Generates 3-section summary using Ollama |
| `routes/features.py` | Extracts issues/principles arrays using Ollama JSON mode |
| `routes/similarity.py` | Computes cosine similarity using sentence-transformers |
| `routes/comparison.py` | Generates full comparative analysis using Ollama |

### Backend (`/backend`)

| File | Purpose |
|------|---------|
| `server.js` | Creates Express app, sets up CORS and middleware, mounts routes |
| `src/routes/upload.js` | Maps POST /api/upload to the upload controller |
| `src/routes/analyse.js` | Maps POST /api/analyse to the analyse controller |
| `src/controllers/uploadController.js` | Multer config — validates files, saves to disk |
| `src/controllers/analyseController.js` | Calls AI service extract + summarise pipeline per file |

### Frontend (`/frontend`)

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root component — manages page navigation (Upload / Compare tabs) |
| `src/components/FileUploader.jsx` | Drag-and-drop PDF upload with client-side validation + progress bar |
| `src/pages/ComparisonDashboard.jsx` | 3-column comparison dashboard with skeleton loaders |
| `src/services/api.js` | All axios API call functions — single source of truth for URLs |
