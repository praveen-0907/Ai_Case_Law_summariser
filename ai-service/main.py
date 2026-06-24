# ai-service/main.py
# -------------------------------------------------------
# This is the main entry point for our Python AI microservice.
# It sets up the FastAPI app, middleware, and registers all route modules.
#
# Registered Routes:
#   GET  /health              → Service health check
#   GET  /                    → Welcome message
#   POST /extract-text        → PDF text extraction      (routes/extraction.py)
#   POST /generate-summary    → AI summary via Ollama   (routes/summary.py)
#   POST /extract-features    → Issues + principles JSON (routes/features.py)
#   POST /similarity          → Cosine similarity score  (routes/similarity.py)
#   POST /compare-cases       → Full comparative report  (routes/comparison.py)
# -------------------------------------------------------

# Import required libraries
import os                          # To read environment variables and file paths
from fastapi import FastAPI, File, UploadFile, HTTPException  # FastAPI tools
from fastapi.middleware.cors import CORSMiddleware             # Allows cross-origin requests
from dotenv import load_dotenv                                 # Load .env file
import uvicorn                                                 # Server to run FastAPI

# Import our route modules
# Each router lives in its own file inside the routes/ folder
from routes.extraction import router as extraction_router
from routes.summary import router as summary_router
from routes.features import router as features_router
from routes.similarity import router as similarity_router
from routes.comparison import router as comparison_router
from routes.chat import router as chat_router

# Load environment variables from .env file
load_dotenv()

# -------------------------------------------------------
# CREATE FASTAPI APPLICATION
# -------------------------------------------------------
# This creates our web server application
app = FastAPI(
    title="AI Case Law Service",
    description="Python microservice for PDF text extraction and AI summarization of legal judgments.",
    version="6.0.0"  # Updated: /compare-cases route added (routes/comparison.py)
)

# -------------------------------------------------------
# CORS CONFIGURATION
# Allow our frontend (React) and backend (Node.js) to talk to this service
# -------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React frontend
        "http://localhost:5000",  # Node.js backend
        "http://localhost:5173",  # Vite dev server
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------
# REGISTER ROUTE MODULES
# -------------------------------------------------------
# include_router attaches all routes from a router to our main app.
# prefix="/extract-text" means every route in extraction_router
# will be accessible at /extract-text/...
# tags=["Extraction"] groups these routes under "Extraction" in the /docs UI
app.include_router(
    extraction_router,
    prefix="/extract-text",
    tags=["PDF Extraction"]
)

# Mount the summary router at /generate-summary
# All routes in summary.py are prefixed with /generate-summary
# Example: POST /generate-summary → handled by routes/summary.py
app.include_router(
    summary_router,
    prefix="/generate-summary",
    tags=["AI Summarization"]
)

# Mount the features extraction router at /extract-features
# POST /extract-features → returns { "issues": [...], "principles": [...] } JSON
# Uses Ollama JSON mode for reliable structured output
app.include_router(
    features_router,
    prefix="/extract-features",
    tags=["Legal Feature Extraction"]
)

# Mount the similarity router at /similarity
# POST /similarity → accepts two case texts → returns cosine similarity score 0-100
# Uses sentence-transformers (no Ollama needed — pure local Python math)
app.include_router(
    similarity_router,
    prefix="/similarity",
    tags=["Semantic Similarity"]
)

# Mount the comparison router at /compare-cases
# POST /compare-cases → receives two full case objects → returns full comparative analysis
# Uses Ollama JSON mode with adversarial strategy analysis
app.include_router(
    comparison_router,
    prefix="/compare-cases",
    tags=["Comparative Analysis"]
)

# Mount the chat router at /chat
# POST /chat → chatbot endpoint for answering questions about case comparisons
# Uses Ollama to provide intelligent responses based on comparison context
app.include_router(
    chat_router,
    prefix="",
    tags=["Chatbot"]
)

# -------------------------------------------------------
# ROUTES (API Endpoints)
# -------------------------------------------------------

# GET /health
# Simple health check to confirm the AI service is running
# Usage: Open browser → http://localhost:8000/health
@app.get("/health")
def health_check():
    """
    Health check endpoint.
    Returns a simple status message to confirm the service is alive.
    """
    return {
        "status": "OK",
        "message": "AI Service is running!",
        "service": "Case Law AI Microservice",
        "port": int(os.getenv("PORT", 8000))
    }

# GET /
# Root route — welcome message
@app.get("/")
def read_root():
    """
    Root endpoint — shows basic info about this service.
    """
    return {
        "message": "Welcome to AI Case Law Service!",
        "docs": "Visit http://localhost:8000/docs to see all available endpoints"
    }

# NOTE: The POST /extract-text endpoint has been moved to routes/extraction.py
# It is registered above via app.include_router(extraction_router, prefix="/extract-text")
# The new endpoint returns a richer structured JSON with per-page text and cleaned output.

# NOTE: The POST /generate-summary endpoint lives in routes/summary.py
# It is registered above via app.include_router(summary_router, prefix="/generate-summary")
# It uses Ollama (Llama 3) for real AI summarization with a structured 3-section output.


# -------------------------------------------------------
# RUN THE SERVER
# This block runs only when you execute this file directly:
#   python main.py
# -------------------------------------------------------
if __name__ == "__main__":
    # Get port from environment variable or default to 8000
    port = int(os.getenv("PORT", 8000))

    # Start the Uvicorn server
    # reload=True means the server auto-restarts when you change the code
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
