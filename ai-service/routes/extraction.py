# ai-service/routes/extraction.py
# -------------------------------------------------------
# This file contains the PDF text extraction API route.
# It is kept in its own file (separate from main.py) to keep the code organised.
# Think of routes/ as the "chapters" of our API — each file handles one topic.
#
# Route defined here:
#   POST /extract-text → accepts a PDF file → returns structured JSON with extracted text
#
# Libraries used:
#   - fitz (PyMuPDF): reads PDF files page by page and extracts text
#   - FastAPI: provides APIRouter, UploadFile, HTTPException
#   - re: Python's built-in regular expressions module (for cleaning text)
#   - logging: Python's built-in module for printing log messages to console
# -------------------------------------------------------

import re          # Regular expressions — used to clean up text (remove extra blank lines)
import logging     # Python's built-in logging — prints messages to the console with timestamps

from fastapi import APIRouter, File, UploadFile, HTTPException

# -------------------------------------------------------
# LOGGING SETUP
# -------------------------------------------------------
# logging.getLogger creates a logger named after this file (e.g. "routes.extraction")
# This helps us identify WHERE a log message came from when debugging
logger = logging.getLogger(__name__)

# Set the logging level to INFO — this means INFO, WARNING, and ERROR messages are shown
# DEBUG messages (very detailed) are hidden unless you change this to logging.DEBUG
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    # Output looks like: 2026-06-12 10:00:00 [INFO] routes.extraction: Processing file...
)

# -------------------------------------------------------
# CREATE AN APIRouter
# -------------------------------------------------------
# A Router is like a mini FastAPI app — it groups related routes together.
# We will "include" this router in main.py so it becomes part of the main app.
# The prefix "/extract-text" is added when we register it in main.py
router = APIRouter()


# -------------------------------------------------------
# HELPER FUNCTION: clean_page_text
# Purpose: Clean raw text extracted from a PDF page.
#
# What it does:
#   1. Strip leading and trailing whitespace from the whole block
#   2. Strip leading/trailing spaces from EACH individual line
#   3. Collapse multiple consecutive empty lines into a single empty line
#      (preserves ONE blank line between paragraphs, removes extras)
#
# Parameters:
#   raw_text (str): The raw text string extracted by PyMuPDF from one page
#
# Returns:
#   str: Cleaned text ready for AI processing
# -------------------------------------------------------
def clean_page_text(raw_text: str) -> str:
    """
    Cleans raw PDF page text by stripping extra whitespace
    and collapsing multiple blank lines into one.
    """
    # STEP 1: Split the text into individual lines
    # splitlines() handles all types of line endings (\n, \r\n, \r)
    lines = raw_text.splitlines()

    # STEP 2: Strip leading and trailing spaces from each line
    # For example: "   This is a sentence.   " → "This is a sentence."
    stripped_lines = [line.strip() for line in lines]

    # STEP 3: Collapse multiple consecutive blank lines into a single blank line
    # We use regex: \n{3,} means "3 or more newline characters in a row"
    # We replace them with exactly 2 newlines (which creates ONE blank line)
    joined_text = "\n".join(stripped_lines)

    # re.sub(pattern, replacement, string)
    # Pattern "\n{3,}" matches 3 or more consecutive newlines
    cleaned_text = re.sub(r'\n{3,}', '\n\n', joined_text)

    # STEP 4: Strip the final result (remove any leading/trailing whitespace from the whole page)
    return cleaned_text.strip()


# -------------------------------------------------------
# ROUTE: POST /extract-text
# -------------------------------------------------------
# This is the main endpoint. It:
#   1. Receives an uploaded PDF file
#   2. Opens it with PyMuPDF (fitz)
#   3. Extracts + cleans text from each page
#   4. Returns a structured JSON response
#
# The @router.post decorator registers this function as a POST endpoint.
# FastAPI automatically reads the docstring as the endpoint description in /docs
# -------------------------------------------------------
@router.post(
    "",   # Empty string because the prefix "/extract-text" is added in main.py
    summary="Extract Text from PDF",
    description="Upload a PDF file and receive a structured JSON with the full extracted text, split by page.",
    response_description="Structured JSON with filename, total pages, full text, and per-page text.",
)
async def extract_text_from_pdf(
    file: UploadFile = File(
        ...,  # The "..." means this parameter is REQUIRED (not optional)
        description="The PDF file to extract text from. Must be a valid PDF."
    )
):
    """
    POST /extract-text

    Accepts a PDF file upload and returns structured extracted text.

    Returns JSON in this exact format:
    {
        "filename": "case_name.pdf",
        "total_pages": 12,
        "full_text": "Complete cleaned text here...",
        "pages": [
            { "page_number": 1, "text": "Text from page 1..." }
        ]
    }
    """
    # -------------------------------------------------------
    # STEP 1: Validate the uploaded file is a PDF
    # -------------------------------------------------------
    # We check BOTH the filename extension AND the MIME type for safety
    filename = file.filename or "unknown.pdf"

    # Check file extension (.pdf)
    if not filename.lower().endswith(".pdf"):
        logger.warning(f"Rejected file '{filename}' — not a PDF (wrong extension)")
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_FILE_TYPE",
                "message": f"File '{filename}' is not a PDF. Only .pdf files are accepted.",
            }
        )

    # Check MIME type (application/pdf)
    # file.content_type is set by the browser/client when uploading
    if file.content_type and file.content_type != "application/pdf":
        logger.warning(f"Rejected file '{filename}' — wrong MIME type: {file.content_type}")
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_MIME_TYPE",
                "message": f"File has invalid type '{file.content_type}'. Expected 'application/pdf'.",
            }
        )

    # Log that we are starting to process this file
    logger.info(f"Starting text extraction for: '{filename}'")

    # -------------------------------------------------------
    # STEP 2: Read the file bytes and open with PyMuPDF
    # -------------------------------------------------------
    try:
        # Read all the raw bytes from the uploaded file into memory
        # We use 'await' because file.read() is an async operation in FastAPI
        pdf_bytes = await file.read()

        # Check if the file is empty (0 bytes)
        if len(pdf_bytes) == 0:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "EMPTY_FILE",
                    "message": f"The uploaded file '{filename}' is empty (0 bytes).",
                }
            )

        logger.info(f"Read {len(pdf_bytes):,} bytes from '{filename}'")

    except HTTPException:
        # Re-raise HTTPExceptions as-is (don't wrap them in a generic error)
        raise

    except Exception as read_error:
        # Something went wrong reading the file stream
        logger.error(f"Failed to read uploaded file '{filename}': {read_error}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "FILE_READ_ERROR",
                "message": "Failed to read the uploaded file. Please try uploading again.",
            }
        )

    # -------------------------------------------------------
    # STEP 3: Parse PDF and extract text page by page
    # -------------------------------------------------------
    try:
        # Import PyMuPDF here (inside the function)
        # It's imported as 'fitz' — that's just its original internal package name
        import fitz

        # fitz.open() with stream= opens a PDF from bytes in memory
        # This avoids saving the file to disk before reading it
        # filetype="pdf" tells fitz what format to expect
        pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")

        # Get total number of pages upfront for logging
        total_pages = len(pdf_document)
        logger.info(f"Opened '{filename}' — {total_pages} page(s) found")

        # -------------------------------------------------------
        # STEP 4: Loop through each page and extract + clean text
        # -------------------------------------------------------

        # This list will hold one dict per page: { "page_number": N, "text": "..." }
        pages_data = []

        # This string will hold the combined text of ALL pages
        all_pages_text_parts = []

        for page_index in range(total_pages):
            # Get the Page object for this page
            # Pages are 0-indexed in fitz, so page 1 = index 0
            page = pdf_document[page_index]

            # Extract raw text from this page
            # get_text() returns a plain string with the text content
            # PyMuPDF also supports get_text("blocks"), get_text("words") for more detail
            raw_text = page.get_text()

            # Clean the raw text using our helper function
            cleaned_text = clean_page_text(raw_text)

            # Store this page's result as a dictionary
            page_result = {
                "page_number": page_index + 1,  # Convert 0-index to human 1-index
                "text": cleaned_text,
            }
            pages_data.append(page_result)

            # Also collect for the combined full_text
            all_pages_text_parts.append(cleaned_text)

            logger.info(
                f"  Page {page_index + 1}/{total_pages} extracted "
                f"({len(cleaned_text)} characters)"
            )

        # -------------------------------------------------------
        # STEP 5: Close the PDF document to free memory
        # -------------------------------------------------------
        pdf_document.close()
        logger.info(f"PDF '{filename}' closed after extraction")

        # Join all page texts with a clear separator between pages
        # "\n\n" between pages creates a clear visual break in the full text
        full_text = "\n\n".join(all_pages_text_parts)

        # -------------------------------------------------------
        # STEP 6: Build and return the strict JSON response
        # -------------------------------------------------------
        logger.info(
            f"Extraction complete for '{filename}': "
            f"{total_pages} pages, {len(full_text):,} total characters"
        )

        # This is the EXACT JSON structure required by the specification
        return {
            "filename": filename,
            "total_pages": total_pages,
            "full_text": full_text,
            "pages": pages_data,
        }

    except HTTPException:
        # Re-raise HTTPExceptions as-is (don't swallow them)
        raise

    except fitz.FileDataError as fitz_error:
        # This specific exception is raised by PyMuPDF when the PDF is corrupted
        # or the file bytes are not a valid PDF at all
        logger.error(f"Corrupted or invalid PDF '{filename}': {fitz_error}")
        raise HTTPException(
            status_code=422,  # 422 Unprocessable Entity — file received but can't be processed
            detail={
                "error": "CORRUPTED_PDF",
                "message": (
                    f"The file '{filename}' appears to be corrupted or is not a valid PDF. "
                    "Please check the file and try again."
                ),
            }
        )

    except Exception as unexpected_error:
        # Catch-all for any other unexpected errors during PDF processing
        # We log the full error details to the console for debugging
        logger.error(
            f"Unexpected error while processing '{filename}': "
            f"{type(unexpected_error).__name__}: {unexpected_error}",
            exc_info=True   # exc_info=True prints the full traceback to the log
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "EXTRACTION_FAILED",
                "message": (
                    f"Failed to extract text from '{filename}' due to an internal error. "
                    "Check server logs for details."
                ),
            }
        )
