@echo off
REM Batch Legal Document Summarizer - Windows Launcher
REM This script sets the required Ollama environment variables and runs the pipeline

echo ========================================
echo Batch Legal Document Summarizer
echo ========================================
echo.

REM Set Ollama environment variables for 6GB VRAM constraint
echo Setting Ollama environment variables for 6GB VRAM...
set OLLAMA_MAX_LOADED_MODELS=1
set OLLAMA_NUM_CTX=4096
set OLLAMA_NUM_PARALLEL=1
set OLLAMA_KEEP_ALIVE=5m

echo   OLLAMA_MAX_LOADED_MODELS = 1
echo   OLLAMA_NUM_CTX = 4096
echo   OLLAMA_NUM_PARALLEL = 1
echo   OLLAMA_KEEP_ALIVE = 5m
echo.

REM Check if Ollama is running
echo Checking if Ollama is running...
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Ollama is not running!
    echo.
    echo Please start Ollama first:
    echo   1. Open a new terminal
    echo   2. Run: ollama serve
    echo.
    pause
    exit /b 1
)
echo   OK - Ollama is running
echo.

REM Check if required models are installed
echo Checking for required models...
ollama list | findstr /C:"qwen2.5:0.5b" >nul
if %errorlevel% neq 0 (
    echo   [MISSING] qwen2.5:0.5b - run: ollama pull qwen2.5:0.5b
) else (
    echo   OK - qwen2.5:0.5b found
)

ollama list | findstr /C:"mistral:7b" >nul
if %errorlevel% neq 0 (
    echo   [MISSING] mistral:7b - run: ollama pull mistral:7b
) else (
    echo   OK - mistral:7b found
)

ollama list | findstr /C:"llama3.1:8b" >nul
if %errorlevel% neq 0 (
    echo   [MISSING] llama3.1:8b - run: ollama pull llama3.1:8b
) else (
    echo   OK - llama3.1:8b found
)
echo.

REM Check if input directory exists
if not exist "legal_documents" (
    echo Creating input directory: legal_documents
    mkdir legal_documents
    echo.
    echo [INFO] Please add your legal documents (.txt or .pdf) to:
    echo        %cd%\legal_documents
    echo.
    echo Then run this script again.
    echo.
    pause
    exit /b 0
)

REM Check if there are any files to process
dir /b legal_documents\*.txt legal_documents\*.pdf >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] No .txt or .pdf files found in legal_documents/
    echo.
    echo Please add your documents to that folder first.
    echo.
    pause
    exit /b 0
)

REM Create output directory if it doesn't exist
if not exist "summarized_output" (
    echo Creating output directory: summarized_output
    mkdir summarized_output
)
echo.

REM Count input files
for /f %%A in ('dir /b legal_documents\*.txt legal_documents\*.pdf 2^>nul ^| find /c /v ""') do set FILE_COUNT=%%A
echo Found %FILE_COUNT% documents to process
echo.

REM Confirm before starting
set /p CONFIRM="Start batch processing? (y/n): "
if /i not "%CONFIRM%"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.
echo ========================================
echo Starting Pipeline...
echo ========================================
echo.

REM Run the Python script
python batch_legal_summarizer.py

echo.
echo ========================================
echo Pipeline Complete
echo ========================================
echo.
echo Results saved to: summarized_output\summary_results.jsonl
echo Manifest saved to: summarized_output\triage_manifest.jsonl
echo.
pause
