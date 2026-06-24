# ai-service/routes/features.py
# -------------------------------------------------------
# This file implements the POST /extract-features endpoint.
#
# What it does:
#   Receives raw legal text → sends to Ollama with a JSON-mode prompt →
#   parses the response → returns exactly:
#     { "issues": [...], "principles": [...] }
#
# KEY TECHNIQUE — Ollama JSON Mode:
#   We pass "format": "json" in the Ollama request payload.
#   This forces Ollama to output ONLY valid JSON — no conversational prose.
#   We ALSO engineer the prompt to specify the exact schema, as a backup.
#   Two layers of enforcement = much more reliable output.
#
# Why a separate file from summary.py?
#   Features extraction is a different task with a different prompt,
#   different output schema, and different validation logic.
#   Keeping it separate makes each file focused and easy to edit.
# -------------------------------------------------------

import json
import re
import logging

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

# -------------------------------------------------------
# Import shared Ollama configuration from our service module
# This ensures we always use the same model name, URL, and timeout
# as defined in the .env file — no duplication
# -------------------------------------------------------
from services.ollama_service import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    OLLAMA_TIMEOUT_SECONDS,
    OLLAMA_GENERATE_URL,
)

# Set up logging for this module
logger = logging.getLogger(__name__)

# Create the FastAPI router — registered in main.py with prefix /extract-features
router = APIRouter()


# -------------------------------------------------------
# INPUT MODEL
# -------------------------------------------------------
class FeaturesRequest(BaseModel):
    """
    Expected request body for POST /extract-features.

    Example:
        { "text": "The court was asked to determine whether..." }
    """
    text: str = Field(
        ...,
        description="Raw extracted text of the legal judgment.",
        min_length=30,  # Minimum 30 characters — rejects obviously empty requests
    )

    @field_validator("text")
    @classmethod
    def strip_and_check_blank(cls, value: str) -> str:
        """Strips whitespace and rejects blank strings."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("The 'text' field cannot be blank or only whitespace.")
        return stripped


# -------------------------------------------------------
# OUTPUT MODEL
# -------------------------------------------------------
class FeaturesResponse(BaseModel):
    """
    JSON response returned by POST /extract-features.

    Example:
    {
        "status": "success",
        "model_used": "qwen2.5:0.5b",
        "issues": ["Whether the contract was valid...", "Whether damages were proven..."],
        "principles": ["Doctrine of privity of contract", "Section 73 Contract Act"],
        "is_fallback": false,
        "fallback_reason": null
    }
    """
    status: str
    model_used: str
    issues: list[str]
    principles: list[str]
    is_fallback: bool
    fallback_reason: str | None


# -------------------------------------------------------
# FUNCTION: build_features_prompt
# Purpose: Engineer a prompt that forces Ollama to return ONLY clean JSON.
#
# Prompt engineering strategy:
#   1. Give the model a clear role ("expert legal researcher")
#   2. Show the EXACT JSON schema it must return
#   3. Give a worked example so the model understands the expected format
#   4. Explicitly prohibit prose, explanations, and markdown code blocks
#   5. Truncate input text if too long (small models struggle with huge inputs)
# -------------------------------------------------------
def build_features_prompt(legal_text: str) -> str:
    """
    Builds the prompt for key legal feature extraction.
    Truncates input to 3000 words to stay within small model context limits.
    """
    # Truncate to 3000 words to stay well within qwen2.5:0.5b's context window
    # Small 0.5B models have limited context — feeding too much causes garbled output
    words = legal_text.split()
    if len(words) > 3000:
        legal_text = " ".join(words[:3000])
        logger.info(f"Input truncated from {len(words)} to 3000 words for features extraction")

    prompt = f"""You are an expert legal researcher. Your ONLY task is to extract structured information from the legal judgment below.

You MUST respond with ONLY a JSON object. No explanations. No markdown. No code blocks. No introductory text. Just raw JSON.

The JSON object must have EXACTLY these two keys:
- "issues": a JSON array of strings, where each string is a specific legal question the judge had to answer
- "principles": a JSON array of strings, where each string is a legal rule, law, doctrine, statute, or precedent that was applied

RULES:
1. Output ONLY the JSON object — nothing before it, nothing after it
2. Every item in both arrays must be a plain string (not an object or nested array)
3. Each string should be one concise sentence
4. If you cannot find issues or principles, return empty arrays: {{"issues": [], "principles": []}}
5. Do NOT wrap in markdown code blocks like ```json

LEGAL JUDGMENT:
{legal_text}

JSON OUTPUT:"""

    return prompt


# -------------------------------------------------------
# FUNCTION: call_ollama_json_mode
# Purpose: Calls Ollama with format="json" enabled.
#
# Ollama's JSON mode (format: "json"):
#   When this flag is set, Ollama internally constrains the model's output
#   to only produce valid JSON tokens. This is much more reliable than
#   just asking the model nicely to return JSON in the prompt alone.
#
# We use BOTH json mode AND prompt engineering for maximum reliability.
#
# Returns:
#   dict: { "success": bool, "raw_text": str, "error": str|None }
# -------------------------------------------------------
def call_ollama_json_mode(prompt: str) -> dict:
    """
    Sends prompt to Ollama with JSON output mode enforced.
    Returns the raw response string (which should be valid JSON).
    """
    request_payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",       # <-- CRITICAL: This forces Ollama to output only valid JSON
        "options": {
            # Very low temperature = highly deterministic / consistent output
            # For structured extraction we want 0.1, not 0.3
            # The model should pick the most factually correct answer, not be creative
            "temperature": 0.1,

            # num_predict: max tokens to generate
            # For a JSON array of strings, 400 tokens is plenty
            "num_predict": 400,
        }
    }

    logger.info(f"Calling Ollama JSON mode: model={OLLAMA_MODEL}, format=json")

    try:
        response = requests.post(
            OLLAMA_GENERATE_URL,
            json=request_payload,
            timeout=OLLAMA_TIMEOUT_SECONDS
        )
        response.raise_for_status()

        response_data = response.json()
        raw_text = response_data.get("response", "").strip()

        if not raw_text:
            return {
                "success": False,
                "raw_text": "",
                "error": "Ollama returned an empty response in JSON mode."
            }

        logger.info(f"Ollama JSON mode response received ({len(raw_text)} chars)")
        return {"success": True, "raw_text": raw_text, "error": None}

    except requests.exceptions.ConnectionError:
        error = (
            f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. "
            "Is Ollama running? Try: ollama serve"
        )
        logger.error(error)
        return {"success": False, "raw_text": "", "error": error}

    except requests.exceptions.Timeout:
        error = f"Ollama timed out after {OLLAMA_TIMEOUT_SECONDS}s. Try again — the model may be loading."
        logger.error(error)
        return {"success": False, "raw_text": "", "error": error}

    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response else "unknown"
        if status == 404:
            error = f"Model '{OLLAMA_MODEL}' not found. Run: ollama pull {OLLAMA_MODEL}"
        else:
            error = f"Ollama HTTP error {status}: {e}"
        logger.error(error)
        return {"success": False, "raw_text": "", "error": error}

    except Exception as e:
        error = f"Unexpected error calling Ollama: {type(e).__name__}: {e}"
        logger.error(error, exc_info=True)
        return {"success": False, "raw_text": "", "error": error}


# -------------------------------------------------------
# FUNCTION: parse_features_json
# Purpose: Safely parse the model's response into our required schema.
#
# Why is this needed?
#   Even with format="json", small models like qwen2.5:0.5b sometimes:
#     - Add extra keys we don't need (we just ignore them)
#     - Return arrays with non-string items (we convert to strings)
#     - Wrap in an outer key like {"result": {"issues": [], "principles": []}}
#     - Occasionally prefix with a tiny bit of text before the JSON
#
#   This function handles ALL of those cases gracefully.
#
# Strategy (3-layer parsing):
#   Layer 1: Try json.loads() directly — works if output is clean
#   Layer 2: Regex to find the first {...} block — works if there's leading text
#   Layer 3: Return empty fallback arrays — never crashes
# -------------------------------------------------------
def parse_features_json(raw_text: str) -> dict:
    """
    Parses Ollama's raw response text into { "issues": [...], "principles": [...] }.
    Uses 3 layers of fallback to handle imperfect model outputs.
    Returns a dict with "issues" and "principles" keys always present.
    """

    # ---- LAYER 1: Direct JSON parse ----
    try:
        parsed = json.loads(raw_text)
        result = extract_arrays_from_parsed(parsed)
        if result:
            logger.info(f"Layer 1 parse succeeded: {len(result['issues'])} issues, {len(result['principles'])} principles")
            return result
    except json.JSONDecodeError:
        logger.warning("Layer 1 (direct JSON parse) failed — trying regex extraction")

    # ---- LAYER 2: Find JSON block using regex ----
    # This handles cases where the model added text before/after the JSON
    # re.DOTALL makes "." match newlines too (for multi-line JSON)
    json_pattern = re.search(r'\{.*\}', raw_text, re.DOTALL)
    if json_pattern:
        try:
            parsed = json.loads(json_pattern.group())
            result = extract_arrays_from_parsed(parsed)
            if result:
                logger.info(f"Layer 2 parse (regex) succeeded: {len(result['issues'])} issues, {len(result['principles'])} principles")
                return result
        except json.JSONDecodeError:
            logger.warning("Layer 2 (regex JSON extract) failed — returning empty fallback")

    # ---- LAYER 3: Return empty arrays ----
    # We always return the correct schema shape — never an error structure
    logger.warning(f"All parse layers failed. Raw text was: {raw_text[:300]}")
    return {"issues": [], "principles": []}


def extract_arrays_from_parsed(parsed: dict) -> dict | None:
    """
    Given a parsed JSON dict, finds the 'issues' and 'principles' arrays.
    Handles nested structures like {"result": {"issues": [], "principles": []}}.
    Converts all items to strings for safety.
    Returns None if the required keys are not found anywhere.
    """
    # Direct match — the most common case
    if "issues" in parsed or "principles" in parsed:
        issues = parsed.get("issues", [])
        principles = parsed.get("principles", [])

        # Ensure both are lists (model might return a string instead of a list)
        if not isinstance(issues, list):
            issues = [str(issues)] if issues else []
        if not isinstance(principles, list):
            principles = [str(principles)] if principles else []

        # Convert each item to a string (in case model returned numbers or nested objects)
        issues = [str(item).strip() for item in issues if item]
        principles = [str(item).strip() for item in principles if item]

        return {"issues": issues, "principles": principles}

    # Nested match — try one level deeper (e.g. {"result": {"issues": [...]}})
    for value in parsed.values():
        if isinstance(value, dict) and ("issues" in value or "principles" in value):
            return extract_arrays_from_parsed(value)

    return None  # Could not find the arrays


# -------------------------------------------------------
# FALLBACK RESPONSE BUILDER
# -------------------------------------------------------
def build_fallback_features(reason: str) -> dict:
    """Returns an empty-but-valid features result when AI fails."""
    return {
        "issues": [],
        "principles": [],
        "model_used": "fallback",
        "is_fallback": True,
        "fallback_reason": reason,
    }


# -------------------------------------------------------
# ROUTE: POST /extract-features
# -------------------------------------------------------
@router.post(
    "",
    summary="Extract Key Legal Features",
    description=(
        "Send raw legal judgment text and receive structured extraction of "
        "legal issues (questions the judge answered) and legal principles "
        "(laws, doctrines, statutes applied). Uses Ollama JSON mode for reliable output."
    ),
    response_model=FeaturesResponse,
    responses={
        200: {"description": "Features extracted (may be AI result or empty fallback)"},
        400: {"description": "Invalid input — text too short or blank"},
        500: {"description": "Unexpected server error"},
    }
)
def extract_features_endpoint(request: FeaturesRequest):
    """
    POST /extract-features

    Extracts key legal issues and principles from raw judgment text.
    Uses Ollama's JSON mode + prompt engineering for clean, parseable output.
    Always returns HTTP 200 — check 'is_fallback' for AI success status.
    """
    input_word_count = len(request.text.split())
    logger.info(f"Received /extract-features request — {input_word_count} words of input")

    try:
        # ---- STEP 1: Build the JSON-mode prompt ----
        prompt = build_features_prompt(request.text)

        # ---- STEP 2: Call Ollama with JSON mode enabled ----
        ollama_result = call_ollama_json_mode(prompt)

        # ---- STEP 3: Handle Ollama failure ----
        if not ollama_result["success"]:
            logger.warning(f"Ollama call failed — returning fallback. Reason: {ollama_result['error']}")
            fallback = build_fallback_features(ollama_result["error"])
            return FeaturesResponse(
                status="fallback",
                **fallback
            )

        # ---- STEP 4: Parse the JSON response ----
        features = parse_features_json(ollama_result["raw_text"])

        # ---- STEP 5: Determine if we got real results ----
        # If both arrays are empty, the model probably returned garbage
        total_items = len(features["issues"]) + len(features["principles"])
        is_fallback = total_items == 0
        status = "fallback" if is_fallback else "success"

        if is_fallback:
            fallback_reason = "Model returned no recognisable issues or principles. The text may be too short or unclear."
        else:
            fallback_reason = None

        logger.info(
            f"Feature extraction complete — "
            f"status: {status}, "
            f"issues: {len(features['issues'])}, "
            f"principles: {len(features['principles'])}"
        )

        return FeaturesResponse(
            status=status,
            model_used=OLLAMA_MODEL,
            issues=features["issues"],
            principles=features["principles"],
            is_fallback=is_fallback,
            fallback_reason=fallback_reason,
        )

    except HTTPException:
        raise

    except Exception as unexpected:
        logger.error(
            f"Unexpected error in /extract-features: {type(unexpected).__name__}: {unexpected}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "FEATURE_EXTRACTION_FAILED",
                "message": "An unexpected server error occurred. Check logs for details."
            }
        )
