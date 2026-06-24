# ai-service/routes/similarity.py
# -------------------------------------------------------
# This file implements the POST /similarity endpoint.
#
# It calculates HOW SIMILAR two legal case texts are to each other,
# returning a score from 0 (completely different) to 100 (identical).
#
# CORE CONCEPTS (explained for IT students):
#
# 1. What is an EMBEDDING?
#    An embedding is a way to represent text as a list of numbers (called a "vector").
#    For example, the sentence "The court ruled against the defendant" might become:
#      [0.23, -0.71, 0.45, 0.08, ...]  (384 numbers for the MiniLM model)
#    Words/sentences with similar MEANING end up as vectors that point in similar
#    directions in this 384-dimensional mathematical space.
#    This is powerful because the MACHINE can now do MATH on meaning.
#
# 2. What is COSINE SIMILARITY?
#    Imagine two arrows (vectors) coming out from the same point.
#    - If they point in the SAME direction  → angle = 0°  → cosine = 1.0 → 100% similar
#    - If they are PERPENDICULAR           → angle = 90° → cosine = 0.0 → 0% similar
#    - If they point OPPOSITE directions   → angle = 180°→ cosine = -1.0→ completely different
#
#    The formula: cosine_similarity = (A · B) / (|A| × |B|)
#    where A · B is the "dot product" (sum of element-wise multiplication)
#    and |A|, |B| are the lengths (magnitudes) of the vectors.
#
#    For text similarity, we only care about 0 to 1 (0% to 100%).
#    The sentence-transformers library handles all this math for us!
#
# 3. Why 'all-MiniLM-L6-v2'?
#    - "MiniLM" = Mini Language Model (small = fast)
#    - "L6" = 6 layers deep (vs BERT's 12) — lighter weight
#    - "v2" = version 2
#    - It produces 384-dimensional embeddings (fast, good quality for sentences)
#    - Download size: ~90MB — much smaller than full BERT (~440MB)
#    - Specifically trained for semantic sentence similarity tasks
#
# Performance note:
#   The model is loaded ONCE when the server starts (module-level singleton).
#   If we loaded it on every request, the user would wait 3-5 seconds each time.
#   Loading it once means all subsequent requests complete in milliseconds.
# -------------------------------------------------------

import logging
import numpy as np   # NumPy: Python library for fast mathematical operations on arrays

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

# Set up logging for this module
logger = logging.getLogger(__name__)

# -------------------------------------------------------
# LOAD THE SENTENCE-TRANSFORMER MODEL (once, at startup)
# -------------------------------------------------------
# We put model loading at the MODULE level (outside any function).
# This means it runs ONCE when the Python file is first imported.
# All subsequent calls to the endpoint reuse the already-loaded model.
# -------------------------------------------------------

# Name of the model we want to use
MODEL_NAME = "all-MiniLM-L6-v2"

# This variable will hold the loaded model object
# We start as None and load below
_embedding_model = None

def get_model():
    """
    Returns the loaded SentenceTransformer model.
    Uses a "lazy singleton" pattern:
      - First call: downloads/loads the model from disk (slow, ~1-3 seconds)
      - Every call after that: returns the already-loaded model instantly
    
    This is safer than loading at import time because if sentence-transformers
    is not installed, the error only appears when the endpoint is first called,
    not when the server starts.
    """
    global _embedding_model  # 'global' lets us modify the module-level variable

    if _embedding_model is None:
        # Model not loaded yet — load it now
        logger.info(f"Loading sentence-transformer model: '{MODEL_NAME}'...")

        try:
            # Import here (not at top) so the server still starts even if
            # sentence-transformers is not installed — only THIS endpoint will fail
            from sentence_transformers import SentenceTransformer

            # SentenceTransformer downloads the model from HuggingFace on first run
            # After that it uses the cached copy on disk
            _embedding_model = SentenceTransformer(MODEL_NAME)
            logger.info(f"Model '{MODEL_NAME}' loaded successfully!")

        except ImportError:
            # sentence-transformers package not installed
            raise RuntimeError(
                "The 'sentence-transformers' package is not installed. "
                "Run: venv\\Scripts\\pip install sentence-transformers"
            )
        except Exception as load_error:
            raise RuntimeError(
                f"Failed to load model '{MODEL_NAME}': {load_error}"
            )

    return _embedding_model


# -------------------------------------------------------
# CREATE THE ROUTER
# -------------------------------------------------------
router = APIRouter()


# -------------------------------------------------------
# INPUT MODEL
# -------------------------------------------------------
class SimilarityRequest(BaseModel):
    """
    Expected request body for POST /similarity.

    Example:
    {
        "case_a_text": "The defendant was found liable for breach of contract...",
        "case_b_text": "The court ruled that the agreement was not enforceable..."
    }
    """
    case_a_text: str = Field(
        ...,
        description="Full text or summary of the first legal case.",
        min_length=10,
    )
    case_b_text: str = Field(
        ...,
        description="Full text or summary of the second legal case.",
        min_length=10,
    )

    @field_validator("case_a_text", "case_b_text")
    @classmethod
    def must_not_be_blank(cls, value: str) -> str:
        """Strips whitespace and rejects blank-only strings."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("Text field cannot be blank or only whitespace.")
        return stripped


# -------------------------------------------------------
# OUTPUT MODEL
# -------------------------------------------------------
class SimilarityResponse(BaseModel):
    """
    Response returned by POST /similarity.

    Example:
    {
        "similarity_score": 78,
        "interpretation": "High similarity — cases likely share legal issues or context.",
        "model_used": "all-MiniLM-L6-v2",
        "case_a_word_count": 342,
        "case_b_word_count": 289
    }
    """
    similarity_score: int          # Integer 0–100
    interpretation: str            # Human-readable label
    model_used: str                # Which embedding model was used
    case_a_word_count: int         # Word count of Case A input
    case_b_word_count: int         # Word count of Case B input


# -------------------------------------------------------
# HELPER: interpret_score
# Converts a numeric score into a human-readable label.
# This helps the UI show a meaningful description, not just a number.
# -------------------------------------------------------
def interpret_score(score: int) -> str:
    """
    Maps a 0-100 similarity score to a plain-English interpretation.
    
    Thresholds chosen based on practical legal comparison needs:
      - 85+: Cases are nearly identical in topic and legal reasoning
      - 65-84: Strong overlap — likely same area of law or similar dispute
      - 40-64: Moderate overlap — some shared legal concepts
      - 20-39: Weak overlap — possibly same court type but different issues
      - 0-19: Very little in common — different legal domains
    """
    if score >= 85:
        return "Very high similarity — cases are closely related in legal topic and reasoning."
    elif score >= 65:
        return "High similarity — cases likely share legal issues or the same area of law."
    elif score >= 40:
        return "Moderate similarity — some shared legal concepts or context."
    elif score >= 20:
        return "Low similarity — cases share some language but cover different legal issues."
    else:
        return "Very low similarity — cases appear to cover entirely different legal domains."


# -------------------------------------------------------
# HELPER: compute_cosine_similarity
# Does the actual vector math.
#
# Parameters:
#   embedding_a: numpy array of shape (384,) — the vector for Case A
#   embedding_b: numpy array of shape (384,) — the vector for Case B
#
# Returns:
#   float between 0.0 and 1.0
# -------------------------------------------------------
def compute_cosine_similarity(embedding_a: np.ndarray, embedding_b: np.ndarray) -> float:
    """
    Calculates cosine similarity between two embedding vectors using NumPy.

    Formula: cos(θ) = (A · B) / (||A|| × ||B||)

    Step-by-step:
      1. np.dot(a, b)       = dot product = sum of (a[0]*b[0]) + (a[1]*b[1]) + ...
      2. np.linalg.norm(a)  = magnitude of vector A = sqrt(a[0]² + a[1]² + ...)
      3. Divide dot product by product of magnitudes = cosine of the angle between vectors
      4. Clamp to [0, 1] since text embeddings are trained to produce non-negative similarity
    """
    # Calculate the dot product (numerator of the formula)
    dot_product = np.dot(embedding_a, embedding_b)

    # Calculate the magnitude (length) of each vector
    magnitude_a = np.linalg.norm(embedding_a)  # linalg.norm = Euclidean length
    magnitude_b = np.linalg.norm(embedding_b)

    # Avoid division by zero (in case of a zero-vector, though this shouldn't happen)
    if magnitude_a == 0 or magnitude_b == 0:
        logger.warning("One of the embedding vectors has zero magnitude — returning 0 similarity")
        return 0.0

    # Compute the raw cosine similarity score
    raw_similarity = dot_product / (magnitude_a * magnitude_b)

    # Clamp the value between 0.0 and 1.0
    # (cosine can theoretically be slightly negative for very different texts,
    #  but for our use case we treat anything below 0 as "no similarity")
    clamped = float(max(0.0, min(1.0, raw_similarity)))

    return clamped


# -------------------------------------------------------
# ROUTE: POST /similarity
# -------------------------------------------------------
@router.post(
    "",
    summary="Calculate Semantic Similarity Between Two Cases",
    description=(
        "Send the text of two legal cases and receive a similarity score from 0 to 100. "
        "Uses the 'all-MiniLM-L6-v2' sentence embedding model and cosine similarity. "
        "Does NOT require Ollama — runs entirely with local Python math."
    ),
    response_model=SimilarityResponse,
    responses={
        200: {"description": "Similarity score calculated successfully"},
        400: {"description": "Invalid input — text too short or blank"},
        503: {"description": "Embedding model could not be loaded"},
        500: {"description": "Unexpected server error"},
    }
)
def calculate_similarity(request: SimilarityRequest):
    """
    POST /similarity

    Accepts two legal case texts and returns a semantic similarity score (0–100).

    Unlike the summary and features endpoints, this does NOT need Ollama.
    It uses a local Python model (sentence-transformers) to run entirely offline.
    """
    logger.info(
        f"Received /similarity request — "
        f"Case A: {len(request.case_a_text.split())} words, "
        f"Case B: {len(request.case_b_text.split())} words"
    )

    # ---- STEP 1: Load the embedding model ----
    try:
        model = get_model()
    except RuntimeError as model_error:
        # Model failed to load — return 503 Service Unavailable
        logger.error(f"Model load failed: {model_error}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "MODEL_UNAVAILABLE",
                "message": str(model_error),
            }
        )

    # ---- STEP 2: Generate embeddings for both texts ----
    try:
        logger.info("Encoding Case A text into embedding vector...")
        embedding_a = model.encode(request.case_a_text, convert_to_numpy=True)

        logger.info("Encoding Case B text into embedding vector...")
        embedding_b = model.encode(request.case_b_text, convert_to_numpy=True)

        logger.info(
            f"Embeddings generated — shape: {embedding_a.shape} "
            f"(each text = {embedding_a.shape[0]} numbers)"
        )

    except RuntimeError as model_error:
        logger.error(f"Model error during encoding: {model_error}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "MODEL_UNAVAILABLE",
                "message": str(model_error),
            }
        )
    except Exception as encode_error:
        logger.error(f"Failed to generate embeddings: {encode_error}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "EMBEDDING_FAILED",
                "message": f"Failed to convert text to embeddings: {encode_error}",
            }
        )

    # ---- STEP 3: Compute cosine similarity ----
    try:
        # Raw similarity is a float between 0.0 and 1.0
        raw_similarity = compute_cosine_similarity(embedding_a, embedding_b)

        # Convert to a clean percentage integer (0 to 100)
        # round() rounds to nearest integer, int() removes the decimal
        similarity_score = int(round(raw_similarity * 100))

        logger.info(
            f"Similarity calculated: raw={raw_similarity:.4f}, "
            f"score={similarity_score}%"
        )

    except Exception as calc_error:
        logger.error(f"Similarity calculation failed: {calc_error}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "CALCULATION_FAILED",
                "message": f"Failed to compute similarity: {calc_error}",
            }
        )

    # ---- STEP 4: Build and return the response ----
    interpretation = interpret_score(similarity_score)

    return SimilarityResponse(
        similarity_score=similarity_score,
        interpretation=interpretation,
        model_used=MODEL_NAME,
        case_a_word_count=len(request.case_a_text.split()),
        case_b_word_count=len(request.case_b_text.split()),
    )
