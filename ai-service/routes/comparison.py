# ai-service/routes/comparison.py
# -------------------------------------------------------
# This file implements the POST /compare-cases endpoint.
# It is the "Comparative Intelligence Engine" of the project.
#
# What it does:
#   Takes the extracted data of TWO legal cases (summaries, issues, principles)
#   and asks Ollama to perform a deep comparative analysis, producing:
#
#   1. common_issues         → What legal questions both cases share
#   2. common_principles     → What rules of law both cases applied
#   3. structural_differences → How the facts, reasoning, or outcomes differ
#   4. adversarial_strategy  → How a lawyer would use these cases against each other
#
# Why is adversarial_strategy important?
#   In real legal practice, you don't just research your own precedents —
#   you must ANTICIPATE what the other side will argue.
#   If you cite Case A, your opponent will immediately cite Case B.
#   This engine tells you EXACTLY how they'll attack and how to defend.
#
# Technical approach:
#   - Uses Ollama JSON mode (format="json") for structured output
#   - Strong prompt engineering to force the exact schema
#   - 3-layer JSON parsing with fallback (same pattern as features.py)
#   - Pydantic models for both input AND output validation
# -------------------------------------------------------

import json
import re
import logging

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

# Import shared Ollama config from our service module
# This ensures we always use the same model, URL, and timeout
from services.ollama_service import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    OLLAMA_TIMEOUT_SECONDS,
    OLLAMA_GENERATE_URL,
)

# Set up logging
logger = logging.getLogger(__name__)

# Create the router — registered in main.py with prefix /compare-cases
router = APIRouter()


# -------------------------------------------------------
# INPUT MODELS
# -------------------------------------------------------

class CaseData(BaseModel):
    """
    Represents one legal case with its AI-extracted data.
    This is used as a sub-model inside CompareRequest.
    """
    summary: str = Field(
        ...,
        description="The plain-English summary of the case (from /generate-summary).",
        min_length=20,
    )
    issues: list[str] = Field(
        default=[],
        description="List of legal issues/questions from the case (from /extract-features).",
    )
    principles: list[str] = Field(
        default=[],
        description="List of legal principles/doctrines applied (from /extract-features).",
    )

    @field_validator("summary")
    @classmethod
    def summary_not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("Case summary is required and cannot be blank.")
        stripped = v.strip()
        if not stripped or len(stripped) < 10:
            raise ValueError("Case summary must be at least 10 characters long.")
        return stripped


class CompareRequest(BaseModel):
    """
    Expected request body for POST /compare-cases.

    Example:
    {
        "case_a": {
            "summary": "The court held the employer liable for wrongful termination...",
            "issues": ["Whether the termination violated the employment contract"],
            "principles": ["Doctrine of wrongful dismissal", "Section 25F Industrial Disputes Act"]
        },
        "case_b": {
            "summary": "The tribunal dismissed the claim, finding valid cause for termination...",
            "issues": ["Whether misconduct justifies termination without notice"],
            "principles": ["Principle of natural justice", "Section 25G Industrial Disputes Act"]
        }
    }
    """
    case_a: CaseData = Field(..., description="First legal case data.")
    case_b: CaseData = Field(..., description="Second legal case data.")


# -------------------------------------------------------
# OUTPUT MODELS
# -------------------------------------------------------

class AdversarialStrategy(BaseModel):
    """
    The adversarial analysis — how a lawyer might weaponise one case against the other.
    """
    if_you_rely_on_case_a: str = Field(
        ...,
        description="How your opponent will use Case B to counter your reliance on Case A."
    )
    how_to_distinguish_them: str = Field(
        ...,
        description="The specific factual or legal difference to argue in order to neutralise that attack."
    )


class CompareResponse(BaseModel):
    """
    Full response returned by POST /compare-cases.

    Example:
    {
        "status": "success",
        "model_used": "qwen2.5:0.5b",
        "common_issues": ["Whether termination was valid under labour law"],
        "common_principles": ["Principle of natural justice"],
        "structural_differences": ["Case A involved contract employment; Case B involved permanent employment"],
        "adversarial_strategy": {
            "if_you_rely_on_case_a": "Opponent will cite Case B to show that misconduct can justify dismissal without notice.",
            "how_to_distinguish_them": "Case A had no documented misconduct, unlike Case B where misconduct was proven on record."
        },
        "is_fallback": false,
        "fallback_reason": null
    }
    """
    status: str
    model_used: str
    common_issues: list[str]
    common_principles: list[str]
    structural_differences: list[str]
    adversarial_strategy: AdversarialStrategy
    short_summary: str
    is_fallback: bool
    fallback_reason: str | None


# -------------------------------------------------------
# HELPER: format_case_for_prompt
# Converts a CaseData object into a clean text block for the prompt.
# Using a helper keeps the main prompt function readable.
# -------------------------------------------------------
def format_case_for_prompt(case: CaseData, label: str) -> str:
    """
    Formats one case's data into a readable prompt block.

    Parameters:
        case (CaseData): The case data object
        label (str): "CASE A" or "CASE B"

    Returns:
        str: A formatted text block ready to insert into the prompt
    """
    # Format issues as a numbered list, or note if empty
    if case.issues:
        issues_text = "\n".join(f"  {i+1}. {issue}" for i, issue in enumerate(case.issues))
    else:
        issues_text = "  (No issues extracted)"

    # Format principles as a numbered list, or note if empty
    if case.principles:
        principles_text = "\n".join(f"  {i+1}. {p}" for i, p in enumerate(case.principles))
    else:
        principles_text = "  (No principles extracted)"

    return f"""--- {label} ---
SUMMARY:
  {case.summary.strip()}

LEGAL ISSUES (questions the judge answered):
{issues_text}

LEGAL PRINCIPLES APPLIED (laws, doctrines, precedents):
{principles_text}"""


# -------------------------------------------------------
# HELPER: build_comparison_prompt
# Engineers the prompt that tells Ollama exactly what analysis to perform.
#
# Key prompt design decisions:
#   1. Role: "expert comparative legal analyst" — sets the context
#   2. Show the EXACT JSON schema with key names and types
#   3. Give a worked mini-example so small models understand the format
#   4. Explicitly describe each field so the model knows what to put there
#   5. CRITICAL: Tell it to look for CONFLICTS, not just similarities
#   6. Strict "no prose before or after the JSON" rule
# -------------------------------------------------------
def build_comparison_prompt(case_a: CaseData, case_b: CaseData) -> str:
    """
    Builds the comparative analysis prompt for Ollama.
    Heavily engineered to produce the exact required JSON schema.
    """
    case_a_block = format_case_for_prompt(case_a, "CASE A")
    case_b_block = format_case_for_prompt(case_b, "CASE B")

    prompt = f"""You are an expert comparative legal analyst. Your task is to deeply compare two legal cases and produce a structured analysis in JSON format.

STRICT OUTPUT RULES:
1. Output ONLY a JSON object — no text before it, no text after it, no markdown code blocks
2. Your response must start with {{ and end with }}
3. Follow the EXACT schema shown below — do not add or rename any keys

REQUIRED JSON SCHEMA:
{{
  "short_summary": "string",
  "common_issues": ["string", "string"],
  "common_principles": ["string", "string"],
  "structural_differences": ["string", "string"],
  "adversarial_strategy": {{
    "if_you_rely_on_case_a": "string",
    "how_to_distinguish_them": "string"
  }}
}}

WHAT EACH KEY MEANS:
- "short_summary": A 1-2 sentence high-level executive summary of the primary similarities or differences between these two cases.
- "common_issues": Legal questions or disputes that BOTH cases had to answer. List as strings.
- "common_principles": Laws, doctrines, or precedents that BOTH cases applied or mentioned. List as strings.
- "structural_differences": Specific ways the two cases DIFFER — in their facts, reasoning, outcomes, or application of law. Look for CONFLICTS where Case A and Case B disagree or reach opposite conclusions. List as strings.
- "adversarial_strategy.if_you_rely_on_case_a": Write one clear sentence explaining how an opposing lawyer would use Case B to attack your argument if you cited Case A as your precedent.
- "adversarial_strategy.how_to_distinguish_them": Write one clear sentence explaining the specific factual or legal difference you would argue to neutralise your opponent's use of Case B.

IMPORTANT — FOCUS ON CONFLICTS:
Do not only find similarities. Actively look for where Case A and Case B:
- Reach different outcomes on the same question
- Apply the same legal principle differently
- Have different facts that change the legal result
These conflicts are the most valuable part of the analysis.

If a field has no relevant items, use an empty array [].
If adversarial strategy cannot be determined, use "Insufficient information to determine strategy."

NOW ANALYSE THESE TWO CASES:

{case_a_block}

{case_b_block}

JSON OUTPUT:"""

    return prompt


# -------------------------------------------------------
# HELPER: call_ollama_for_comparison
# Makes the actual Ollama API call with JSON mode enabled.
# Same pattern as call_ollama_json_mode in features.py but with a
# longer timeout because comparison analysis is more complex.
# -------------------------------------------------------
def call_ollama_for_comparison(prompt: str) -> dict:
    """
    Calls Ollama with JSON mode and returns the raw response.

    Returns:
        dict with keys: "success" (bool), "raw_text" (str), "error" (str|None)
    """
    request_payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",    # Force JSON-only output at the token level
        "options": {
            # Temperature 0.2: slightly higher than features (0.1) because
            # comparative analysis requires some reasoning, not just extraction.
            # But still low enough to stay factual and structured.
            "temperature": 0.2,

            # More tokens needed for comparison: 4 fields + nested object
            # 700 tokens ≈ 525 words — enough for thorough comparison arrays
            "num_predict": 700,
        }
    }

    logger.info(f"Calling Ollama for case comparison: model={OLLAMA_MODEL}, format=json")

    try:
        response = requests.post(
            OLLAMA_GENERATE_URL,
            json=request_payload,
            # Longer timeout than regular summary (90s vs 60s)
            # Comparison involves more reasoning steps for the model
            timeout=90,
        )
        response.raise_for_status()

        data = response.json()
        raw_text = data.get("response", "").strip()

        if not raw_text:
            return {
                "success": False,
                "raw_text": "",
                "error": "Ollama returned an empty response."
            }

        logger.info(f"Ollama comparison response received ({len(raw_text)} chars)")
        return {"success": True, "raw_text": raw_text, "error": None}

    except requests.exceptions.ConnectionError:
        error = (
            f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. "
            "Run 'ollama serve' in a terminal first."
        )
        logger.error(error)
        return {"success": False, "raw_text": "", "error": error}

    except requests.exceptions.Timeout:
        error = "Ollama timed out after 90 seconds. The model may be overloaded — try again."
        logger.error(error)
        return {"success": False, "raw_text": "", "error": error}

    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response else "unknown"
        error = (
            f"Model '{OLLAMA_MODEL}' not found. Run: ollama pull {OLLAMA_MODEL}"
            if status == 404
            else f"Ollama HTTP error {status}: {e}"
        )
        logger.error(error)
        return {"success": False, "raw_text": "", "error": error}

    except Exception as e:
        error = f"Unexpected Ollama error: {type(e).__name__}: {e}"
        logger.error(error, exc_info=True)
        return {"success": False, "raw_text": "", "error": error}


# -------------------------------------------------------
# HELPER: parse_comparison_json
# Parses Ollama's raw response into our required schema.
#
# Uses 3 parsing layers (same strategy as features.py):
#   Layer 1: Direct json.loads()
#   Layer 2: Regex to find JSON block in surrounding text
#   Layer 3: Return a safe empty fallback — never crash
#
# Then validates each required field exists and has the correct type.
# -------------------------------------------------------
def parse_comparison_json(raw_text: str) -> dict:
    """
    Safely parses Ollama's response into the comparison schema.
    Returns a dict with all required keys always present.
    """

    def safe_parse(text: str):
        """Attempts to parse a JSON string. Returns None on failure."""
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None

    # ---- Layer 1: Direct parse ----
    parsed = safe_parse(raw_text)

    # ---- Layer 2: Regex extraction if Layer 1 fails ----
    if parsed is None:
        logger.warning("Layer 1 (direct JSON parse) failed — trying regex extraction")
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if match:
            parsed = safe_parse(match.group())

    # ---- Layer 3: Total failure — return empty structure ----
    if parsed is None:
        logger.warning(f"All parse layers failed. Raw text: {raw_text[:300]}")
        return _empty_comparison_result()

    # ---- Normalise and validate each field ----
    # Each field is extracted safely with .get() defaults
    # We convert each item to string to handle cases where the model
    # accidentally puts dicts or numbers inside the arrays

    common_issues = _safe_list(parsed.get("common_issues", []))
    common_principles = _safe_list(parsed.get("common_principles", []))
    structural_differences = _safe_list(parsed.get("structural_differences", []))

    # Handle the nested adversarial_strategy object
    raw_strategy = parsed.get("adversarial_strategy", {})

    # Handle case where model returns adversarial_strategy as a string, not a dict
    if isinstance(raw_strategy, str):
        logger.warning("adversarial_strategy was a string, not a dict — wrapping it")
        raw_strategy = {
            "if_you_rely_on_case_a": raw_strategy,
            "how_to_distinguish_them": "Could not be determined from the model response."
        }
    elif not isinstance(raw_strategy, dict):
        raw_strategy = {}

    adversarial_strategy = {
        "if_you_rely_on_case_a": str(
            raw_strategy.get("if_you_rely_on_case_a", "")
        ).strip() or "Insufficient information to determine adversarial use.",

        "how_to_distinguish_them": str(
            raw_strategy.get("how_to_distinguish_them", "")
        ).strip() or "Insufficient information to determine distinction argument.",
    }

    logger.info(
        f"Comparison parsed: "
        f"{len(common_issues)} common issues, "
        f"{len(common_principles)} common principles, "
        f"{len(structural_differences)} differences"
    )

    short_summary = str(parsed.get("short_summary", "")).strip() or "No executive summary provided."

    return {
        "common_issues": common_issues,
        "common_principles": common_principles,
        "structural_differences": structural_differences,
        "adversarial_strategy": adversarial_strategy,
        "short_summary": short_summary,
    }


def _safe_list(value) -> list[str]:
    """
    Converts any value to a list of clean, non-empty strings.
    Handles: list, string (split into one item), None, numbers, dicts.
    """
    if value is None:
        return []
    if isinstance(value, str):
        stripped = value.strip()
        return [stripped] if stripped else []
    if isinstance(value, list):
        result = []
        for item in value:
            if isinstance(item, str) and item.strip():
                result.append(item.strip())
            elif item is not None:
                # Convert non-string items (numbers, dicts) to strings
                converted = str(item).strip()
                if converted:
                    result.append(converted)
        return result
    return []


def _empty_comparison_result() -> dict:
    """Returns a fully-formed but empty comparison result (safe fallback)."""
    return {
        "common_issues": [],
        "common_principles": [],
        "structural_differences": [],
        "adversarial_strategy": {
            "if_you_rely_on_case_a": "Insufficient information to determine adversarial use.",
            "how_to_distinguish_them": "Insufficient information to determine distinction argument.",
        },
        "short_summary": "Insufficient information to generate summary.",
    }


# -------------------------------------------------------
# ROUTE: POST /compare-cases
# -------------------------------------------------------
@router.post(
    "",
    summary="Comparative Intelligence Analysis of Two Cases",
    description=(
        "Send the extracted data (summary, issues, principles) of two legal cases "
        "and receive a full comparative analysis including shared elements, structural "
        "conflicts, and adversarial strategy. Uses Ollama with JSON mode."
    ),
    response_model=CompareResponse,
    responses={
        200: {"description": "Analysis complete (may be AI result or empty fallback)"},
        400: {"description": "Invalid input — missing or blank required fields"},
        500: {"description": "Unexpected server error"},
    }
)
def compare_cases_endpoint(request: CompareRequest):
    """
    POST /compare-cases

    Performs a deep comparative analysis of two legal cases.
    Returns structured JSON with common elements, differences, and adversarial strategy.
    Always returns HTTP 200 — check 'is_fallback' to see if AI succeeded.
    """
    logger.info(
        f"Received /compare-cases request — "
        f"Case A: {len(request.case_a.issues)} issues, {len(request.case_a.principles)} principles | "
        f"Case B: {len(request.case_b.issues)} issues, {len(request.case_b.principles)} principles"
    )

    try:
        # ---- STEP 1: Build the comparison prompt ----
        prompt = build_comparison_prompt(request.case_a, request.case_b)

        # ---- STEP 2: Call Ollama ----
        ollama_result = call_ollama_for_comparison(prompt)

        # ---- STEP 3: Handle Ollama failure ----
        if not ollama_result["success"]:
            logger.warning(f"Ollama failed — using fallback. Reason: {ollama_result['error']}")
            empty = _empty_comparison_result()
            return CompareResponse(
                status="fallback",
                model_used="fallback",
                is_fallback=True,
                fallback_reason=ollama_result["error"],
                **empty,
                # Pydantic needs adversarial_strategy as the nested model
                adversarial_strategy=AdversarialStrategy(**empty["adversarial_strategy"]),
            )

        # ---- STEP 4: Parse the response ----
        result = parse_comparison_json(ollama_result["raw_text"])

        # ---- STEP 5: Check if we got any real content ----
        # Count total meaningful items across all list fields
        total_items = (
            len(result["common_issues"]) +
            len(result["common_principles"]) +
            len(result["structural_differences"])
        )

        is_fallback = total_items == 0
        status = "fallback" if is_fallback else "success"
        fallback_reason = (
            "Model returned empty arrays for all comparison fields. "
            "The case summaries may be too similar or too short for meaningful comparison."
        ) if is_fallback else None

        logger.info(
            f"Comparison complete — status: {status}, "
            f"common_issues: {len(result['common_issues'])}, "
            f"differences: {len(result['structural_differences'])}"
        )

        # ---- STEP 6: Build and return the response ----
        return CompareResponse(
            status=status,
            model_used=OLLAMA_MODEL,
            common_issues=result["common_issues"],
            common_principles=result["common_principles"],
            structural_differences=result["structural_differences"],
            # Wrap the nested dict in the Pydantic model
            adversarial_strategy=AdversarialStrategy(
                **result["adversarial_strategy"]
            ),
            short_summary=result["short_summary"],
            is_fallback=is_fallback,
            fallback_reason=fallback_reason,
        )

    except HTTPException:
        raise

    except Exception as unexpected:
        # Log the full error for debugging
        error_msg = f"{type(unexpected).__name__}: {unexpected}"
        logger.error(
            f"Unexpected error in /compare-cases: {error_msg}",
            exc_info=True
        )
        # Return a more informative error to the frontend
        raise HTTPException(
            status_code=400,
            detail={
                "error": "COMPARISON_VALIDATION_ERROR",
                "message": f"Invalid case data provided. {error_msg}"
            }
        )
