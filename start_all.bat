@echo off
echo Starting AI Case Law Summarizer Services...

echo Starting Ollama...
start "Ollama" cmd /k "ollama serve"

echo Waiting 3 seconds for Ollama to initialize...
timeout /t 3 /nobreak >nul

echo Starting Backend...
start "Backend" cmd /k "cd backend & npm run dev"

echo Starting AI Service...
start "AI Service" cmd /k "cd ai-service & python main.py"

echo Starting Frontend...
start "Frontend" cmd /k "cd frontend & npm run dev"

echo.
echo All services are starting in separate windows!
echo Frontend will be available at: http://localhost:3000
echo.
pause
