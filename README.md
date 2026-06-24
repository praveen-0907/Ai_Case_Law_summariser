# ⚖️ AI Case Law Summarizer and Comparator

> A web platform where lawyers and legal researchers can upload multiple legal judgments and receive AI-generated plain-English summaries, key issue extraction, legal principle identification, semantic similarity scoring, and a full side-by-side comparative analysis — powered by local AI via Ollama.

---

## 📁 Project Structure

```
Ai_Case_Law_sumcom/
│
├── frontend/                          ← React (Vite) + Tailwind CSS — User Interface
│   ├── src/
│   │   ├── App.jsx                    ← Root component with tab navigation
│   │   ├── main.jsx                   ← React entry point
│   │   ├── index.css                  ← Tailwind CSS imports
│   │   ├── components/
│   │   │   └── FileUploader.jsx       ← Drag-and-drop PDF upload with validation
│   │   ├── pages/
│   │   │   └── ComparisonDashboard.jsx ← 3-column comparison UI page
│   │   └── services/
│   │       └── api.js                 ← All Axios API call functions
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── .env.example
│
├── backend/                           ← Node.js + Express — Main API Server
│   ├── server.js                      ← Express server (Port 5000)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── upload.js              ← POST /api/upload route
│   │   │   └── analyse.js             ← POST /api/analyse route (bridge to AI)
│   │   └── controllers/
│   │       ├── uploadController.js    ← Multer file handling logic
│   │       └── analyseController.js   ← Orchestrates extract + summarise pipeline
│   ├── uploads/                       ← Temporary storage for uploaded PDFs
│   ├── package.json
│   └── .env.example
│
├── ai-service/                        ← Python + FastAPI — AI Processing Engine
│   ├── main.py                        ← FastAPI server (Port 8000) — registers all routes
│   ├── requirements.txt               ← Python dependencies
│   ├── .env                           ← Your local environment variables (not in Git)
│   ├── .env.example                   ← Template for environment variables
│   ├── routes/
│   │   ├── extraction.py              ← POST /extract-text (PDF parsing via PyMuPDF)
│   │   ├── summary.py                 ← POST /generate-summary (Ollama AI)
│   │   ├── features.py                ← POST /extract-features (issues + principles JSON)
│   │   ├── similarity.py              ← POST /similarity (cosine similarity score)
│   │   └── comparison.py              ← POST /compare-cases (full AI comparative analysis)
│   └── services/
│       └── ollama_service.py          ← Shared Ollama connection & prompt logic
│
└── docs/
    ├── project_logic.md               ← Developer documentation (this file's companion)
    └── README.md                      ← This file
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + Vite | User interface and page rendering |
| Styling | Tailwind CSS | Responsive utility-first CSS |
| Backend | Node.js + Express | File uploads and API bridge |
| AI Engine | Python + FastAPI | All AI/NLP processing |
| PDF Parsing | PyMuPDF (fitz) | Extract text from legal PDFs |
| AI Model | Ollama (`qwen2.5:0.5b`) | Local LLM for summaries, features, comparison |
| Similarity | sentence-transformers | Semantic cosine similarity scoring |
| Database | Supabase (PostgreSQL) | Future: store documents and results |

---

## ✅ What Has Been Built

### Core Features

**Two Analysis Modes:**

1. **Single Case Analysis** 📄
   - Upload and analyze one legal judgment at a time
   - AI-generated plain-English summary (Core Facts / Main Dispute / Final Ruling)
   - Automatic extraction of key legal issues
   - Identification of legal principles applied
   - "Urimai Kural" AI chatbot for Q&A about the case

2. **Case Comparison Mode** ⚖️
   - Upload and compare two legal judgments side-by-side
   - Semantic similarity scoring (0–100%)
   - Common issues and principles identification
   - Structural differences analysis
   - Adversarial strategy recommendations
   - "Urimai Kural" AI chatbot for comparison Q&A
   - Export full comparison report as PDF

3. **Batch Processing Pipeline** 🚀
   - Process 100+ documents efficiently with staged model loading
   - Optimized for 6GB VRAM GPUs (RTX 2060, GTX 1660 Ti, etc.)
   - 3-stage sequential processing (triage → short docs → long docs)
   - Automatic document classification and routing
   - Smart model selection (qwen/mistral/llama based on complexity)
   - Resume capability for interrupted batches
   - See [`BATCH_SUMMARIZER_README.md`](./BATCH_SUMMARIZER_README.md) for details

### Development Timeline

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 1 | Monorepo baseline — all 3 services running | ✅ Complete |
| Phase 2 | Multi-PDF drag-and-drop upload with validation | ✅ Complete |
| Phase 3 | PDF text extraction via PyMuPDF | ✅ Complete |
| Phase 4 | AI summary generation (Core Facts / Main Dispute / Final Ruling) | ✅ Complete |
| Phase 5 | Key legal feature extraction (issues + principles) | ✅ Complete |
| Phase 6 | Semantic similarity scoring (cosine similarity, 0–100%) | ✅ Complete |
| Phase 7 | Comparative intelligence engine (conflict + adversarial strategy) | ✅ Complete |
| Phase 8 | Comparison Dashboard UI (3-column layout with skeleton loaders) | ✅ Complete |
| Phase 9 | Urimai Kural AI Chatbot (Q&A about comparison results) | ✅ Complete |
| Phase 10 | Export comparison report (PDF) | ✅ Complete |
| Phase 11 | Single Case Summarization (individual case analysis with chatbot) | ✅ Complete |
| Phase 12 | Batch Processing Pipeline (staged multi-model processing for 100+ docs) | ✅ Complete |

---

## 🚀 Getting Started — Complete Setup Guide

Follow these steps to get the platform running on your local machine.

### ⚡ Quick Start (Windows Only)
If you are on Windows, we have provided an automated startup script!
1. Complete **Step 1** to **Step 5** below to install all requirements.
2. Double-click the `start_all.bat` file in the project root.
3. It will automatically open 4 terminal windows and start all services (Ollama, Backend, Frontend, AI Service) for you!

---

### Prerequisites

Make sure you have these installed before starting:

| Tool | Version | Check command |
|------|---------|---------------|
| Node.js | v18 or higher | `node --version` |
| Python | v3.9 or higher | `python --version` |
| Git | Any | `git --version` |
| Ollama | Latest | [Download here](https://ollama.ai) |

---

### Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd Ai_Case_Law_sumcom
```

---

### Step 2: Set Up the Frontend

```bash
# Navigate to the frontend folder
cd frontend

# Install all npm dependencies
npm install

# Create your .env file from the template
copy .env.example .env
# On Mac/Linux: cp .env.example .env

# The .env file contains:
# VITE_BACKEND_URL=http://localhost:5000
# VITE_AI_SERVICE_URL=http://localhost:8000
```

---

### Step 3: Set Up the Backend

```bash
# Navigate to the backend folder
cd backend

# Install all npm dependencies
npm install

# Create your .env file from the template
copy .env.example .env

# The .env file must contain your Supabase credentials to save analysis results!
# PORT=5000
# AI_SERVICE_URL=http://localhost:8000
# SUPABASE_URL=your-supabase-url
# SUPABASE_ANON_KEY=your-supabase-anon-key
```

---

### Step 4: Set Up the AI Service

```bash
# Navigate to the ai-service folder
cd ai-service

# Install all Python packages globally
pip install -r requirements.txt
# NOTE: This will download PyTorch + sentence-transformers (~500MB total)
# This only happens once — subsequent installs are instant

# The .env file for the AI service is already created.
# Open it and verify OLLAMA_MODEL matches your installed model:
# OLLAMA_MODEL=qwen2.5:0.5b
```

---

### Step 5: Download and Start Ollama

Ollama is the local AI model runner. It must be running **before** the AI service.

```bash
# Download Ollama from https://ollama.ai and install it, then:

# Pull the AI model we use (one-time download, ~400MB)
ollama pull qwen2.5:0.5b

# Verify the model is installed
ollama list
# You should see: qwen2.5:0.5b listed

# Start the Ollama server (keep this terminal open)
ollama serve
# Ollama will now run on http://localhost:11434
```

---

### Step 6: Start All Services

**Option A: Windows Auto-Start**  
Double-click `start_all.bat` in the project root. It will open all required terminals automatically.

**Option B: Manual Start (Mac/Linux/Windows)**  
You need **4 terminal windows** open at the same time.

#### 🖥️ Terminal 1 — Ollama (AI Model Server)
```bash
ollama serve
```
✅ Runs on: `http://localhost:11434`

---

#### 🖥️ Terminal 2 — Frontend (React UI)
```bash
cd Ai_Case_Law_sumcom/frontend
npm run dev
```
✅ Runs on: **http://localhost:3000**

---

#### 🖥️ Terminal 3 — Backend (Node.js API)
```bash
cd Ai_Case_Law_sumcom/backend
npm run dev
```
✅ Runs on: **http://localhost:5000**  
🔍 Health check: `http://localhost:5000/api/health`

---

#### 🖥️ Terminal 4 — AI Service (Python FastAPI)
```bash
cd Ai_Case_Law_sumcom/ai-service

# Start the server
python main.py
```
✅ Runs on: **http://localhost:8000**  
🔍 Health check: `http://localhost:8000/health`  
📖 Interactive API docs: **http://localhost:8000/docs**

---

## 🔗 Complete API Reference

### Backend (Node.js — Port 5000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Check if backend is running |
| `POST` | `/api/upload` | Upload 1–10 PDFs (max 20MB each) |
| `POST` | `/api/analyse` | Run full AI analysis on uploaded files |

### AI Service (Python — Port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Check if AI service is running |
| `GET` | `/docs` | Interactive Swagger API documentation |
| `POST` | `/extract-text` | Extract raw text from a PDF file |
| `POST` | `/generate-summary` | Generate 3-section AI summary from text |
| `POST` | `/extract-features` | Extract legal issues + principles as JSON |
| `POST` | `/similarity` | Calculate semantic similarity score (0–100) |
| `POST` | `/compare-cases` | Full comparative analysis of two cases |
| `POST` | `/chat` | AI chatbot for answering questions about comparisons |

---

## ✅ Verification Checklist

Once all services are running, open these URLs and verify:

| Service | URL | Expected |
|---------|-----|----------|
| Frontend | http://localhost:3000 | Upload page with tab navigation |
| Backend Health | http://localhost:5000/api/health | `{"status": "OK"}` |
| AI Health | http://localhost:8000/health | `{"status": "OK"}` |
| AI Docs | http://localhost:8000/docs | Interactive API browser |

---

## 🎯 How to Use the Platform

Once everything is running:
1. Open your browser and go to `http://localhost:3000`.
2. **Upload Documents**: Drag and drop two legal judgment PDF files into the upload zone.
3. **Analyze**: Click the "Compare Selected Cases" button.
4. **Wait for AI**: The AI pipeline will extract the text, generate plain-English summaries, extract legal issues, and perform a deep comparative analysis. This may take 1-3 minutes depending on your computer's speed.
5. **Review & Chat**: Read the comparison dashboard. You can use the "Urimai Kural" chatbot on the right to ask specific questions about the comparison.
6. **Export**: Click "Export PDF Report" to download a beautifully formatted report of the analysis. The report is automatically saved to your Supabase database.

---

## 📖 Testing the AI Endpoints Manually

The easiest way to test without the full frontend is the built-in docs page.

**Go to:** `http://localhost:8000/docs`

### Test 1 — Extract Text
1. Click `POST /extract-text` → Try it out
2. Upload any PDF file
3. You should get back `filename`, `total_pages`, `full_text`, and `pages` array

### Test 2 — Generate Summary
1. Click `POST /generate-summary` → Try it out
2. Use this request body:
```json
{ "text": "The court held that the defendant was liable for breach of contract. The plaintiff had suffered damages of Rs. 50,000. The dispute arose from a failure to deliver goods as agreed." }
```
3. You should get back `Core Facts`, `Main Dispute`, `Final Ruling` sections

### Test 3 — Similarity Score
1. Click `POST /similarity` → Try it out
2. Use this request body:
```json
{
  "case_a_text": "The defendant was liable for breach of contract causing financial loss.",
  "case_b_text": "The employer violated the employment agreement resulting in damages."
}
```
3. You should get back a `similarity_score` between 0 and 100

---

## ⚠️ Common Issues and Fixes

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `"Cannot connect to Ollama"` in AI response | Ollama is not running | Run `ollama serve` in a terminal |
| `404` from AI service calling Ollama | Model not downloaded | Run `ollama pull qwen2.5:0.5b` |
| `"fallback mode"` in summary response | Model ignored formatting instructions | Normal for small models — try `ollama pull llama3` for better results |
| `422 Unprocessable Content` | Wrong request body field names | Check the `/docs` page for exact expected fields |
| `ECONNREFUSED` on port 8000 | AI service not running | Run `python main.py` in ai-service folder |
| `ModuleNotFoundError` in Python | Package not installed | Run `pip install -r requirements.txt` globally |
| Frontend shows blank page | Vite not running | Run `npm run dev` in the frontend folder |
| Results not saving to Supabase | Missing or incorrect `.env` variables | Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct in `backend/.env` and **restart the backend server**. |
| `timeout of 90000ms exceeded` | AI took too long to generate | We have increased the timeout to 10m. If this persists, try using a smaller/faster model. |

---

## 🤝 For Developers — Code Style Guide

This project is designed to be beginner-friendly. Every file follows these rules:

- ✅ **Every important function has a comment** explaining what it does, why, and what it returns
- ✅ **Simple variable names** — `uploadedFiles` not `uf`, `extractedText` not `et`
- ✅ **Each file explains itself** at the top with a comment block
- ✅ **Error handling at every layer** — frontend, backend, and AI service all handle failures gracefully
- ✅ **Fallback responses** — the AI service never crashes; it always returns something useful even when the model fails

For deep-dive explanations of design decisions, see [`docs/project_logic.md`](./docs/project_logic.md).

---

## 📄 License

This project is built for educational purposes as part of a final-year IT project.
