# ai-service/routes/summary.py
# -------------------------------------------------------
# This file defines the POST /generate-summary API route.
# It is the "front door" of our AI summarization feature.
#
# Responsibility of this file:
#   1. Receive the incoming HTTP request
#   2. Validate the input JSON
#   3. Call the ollama_service to do the heavy lifting
#   4. Return a clean, structured JSON response
#
# Actual AI logic lives in services/ollama_service.py — not here.
# This separation keeps each file focused on ONE job.
# -------------------------------------------------------

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

# Import our Ollama service module
# This is the module that actually talks to the local Llama 3 model
from services.ollama_service import generate_summary

# Set up logging for this module
logger = logging.getLogger(__name__)

# Create the router — this will be registered in main.py
router = APIRouter()


# -------------------------------------------------------
# INPUT MODEL — What the request body must look like
# -------------------------------------------------------
# Pydantic BaseModel is FastAPI's way of defining and validating JSON input.
# If the request body does NOT match this model, FastAPI automatically
# returns a 422 error with a clear explanation — no extra code needed!
# -------------------------------------------------------
class SummaryRequest(BaseModel):
    """
    The expected JSON body for POST /generate-summary.

    Example request body:
    {
        "text": "IN THE HIGH COURT OF JUDICATURE... [full legal text]"
    }
    """
    text: str = Field(
        ...,  # "..." means this field is REQUIRED
        description="The raw extracted text of the legal judgment to summarize.",
        min_length=50,  # Reject requests with less than 50 characters (too short to be meaningful)
    )

    # Field validator: runs custom logic to validate the 'text' field
    # This runs AFTER Pydantic's built-in validation
    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        """
        Ensures the text is not just whitespace.
        Pydantic's min_length counts characters, not meaningful characters,
        so we add this extra check.
        """
        # Strip whitespace and check if anything remains
        stripped = value.strip()
        if not stripped:
            raise ValueError("The 'text' field cannot be blank or contain only whitespace.")

        # Return the STRIPPED version — this is what gets passed to our function
        # So we automatically clean input before processing
        return stripped


# -------------------------------------------------------
# OUTPUT MODEL — What the response body will look like
# -------------------------------------------------------
# This documents the response structure for the /docs page.
# FastAPI uses this to auto-generate API documentation.
# -------------------------------------------------------
class SummaryResponse(BaseModel):
    """
    The JSON response returned by POST /generate-summary.

    Example response:
    {
        "status": "success",
        "model_used": "llama3",
        "summary": {
            "text": "Core Facts:\\n...\\n\\nMain Dispute:\\n...\\n\\nFinal Ruling:\\n...",
            "word_count": 285,
            "sections_found": ["Core Facts", "Main Dispute", "Final Ruling"]
        },
        "is_fallback": false,
        "fallback_reason": null,
        "input_word_count": 1842
    }
    """
    status: str
    model_used: str
    summary: dict
    is_fallback: bool
    fallback_reason: str | None   # 'None' means it can be null in the JSON
    input_word_count: int


# -------------------------------------------------------
# ROUTE: POST /generate-summary
# -------------------------------------------------------
@router.post(
    "",    # Empty string — the "/generate-summary" prefix is added in main.py
    summary="Generate AI Legal Summary",
    description=(
        "Send the raw text of a legal judgment and receive an AI-generated plain-English summary. "
        "The summary is structured into exactly three sections: Core Facts, Main Dispute, and Final Ruling. "
        "Uses Llama 3 via Ollama running locally."
    ),
    response_model=SummaryResponse,
    responses={
        200: {"description": "Summary generated successfully (may be AI or fallback)"},
        400: {"description": "Invalid input (e.g. text too short, blank text)"},
        500: {"description": "Unexpected server error"},
    }
)
def generate_summary_endpoint(request: SummaryRequest):
    """
    POST /generate-summary

    Receives legal judgment text and returns a structured AI summary.

    The response ALWAYS succeeds (HTTP 200) as long as input is valid —
    even if Ollama is unavailable, a fallback response is returned.

    The 'is_fallback' field in the response tells you whether
    the summary came from the AI model or the fallback mechanism.
    """

    # Count words in the input for logging and response metadata
    input_word_count = len(request.text.split())
    logger.info(f"Received /generate-summary request — {input_word_count} words of input text")

    try:
        # ---- CALL THE OLLAMA SERVICE ----
        # generate_summary() handles all Ollama communication, prompt building,
        # and fallback logic internally — we just pass the text and get a result back
        result = generate_summary(request.text)

        # ---- DETERMINE STATUS ----
        # If the AI ran successfully → status is "success"
        # If we used the fallback → status is "fallback" (but still HTTP 200)
        status = "fallback" if result["is_fallback"] else "success"

        logger.info(
            f"Summary generation complete — "
            f"status: {status}, "
            f"model: {result['model_used']}, "
            f"output words: {result['word_count']}"
        )

        # ---- BUILD THE RESPONSE ----
        # We structure the summary into a nested 'summary' object
        # so the frontend can easily access summary.text, summary.word_count etc.
        return SummaryResponse(
            status=status,
            model_used=result["model_used"],
            summary={
                "text": result["summary_text"],
                "word_count": result["word_count"],
                "sections_found": result["sections_found"],
            },
            is_fallback=result["is_fallback"],
            fallback_reason=result["fallback_reason"],
            input_word_count=input_word_count,
        )

    except HTTPException:
        # Re-raise HTTP exceptions without wrapping them
        raise

    except Exception as unexpected_error:
        # Something went wrong that we didn't anticipate
        # Log full traceback to console for debugging
        logger.error(
            f"Unexpected error in /generate-summary: "
            f"{type(unexpected_error).__name__}: {unexpected_error}",
            exc_info=True  # Includes full stack trace in the log
        )

        # Return 500 error to the client
        raise HTTPException(
            status_code=500,
            detail={
                "error": "SUMMARY_GENERATION_FAILED",
                "message": "An unexpected error occurred while generating the summary. Check server logs for details.",
            }
        )
