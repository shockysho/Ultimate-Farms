@echo off
title DEMIURGOS Launcher
color 0A

echo ============================================
echo   DEMIURGOS - One-Click Launcher
echo ============================================
echo.

:: --- Check Docker ---
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Docker is not installed!
    echo.
    echo     Download it from: https://www.docker.com/products/docker-desktop/
    echo     Install it, restart your computer, then run this again.
    echo.
    pause
    exit /b 1
)
echo [OK] Docker found

:: --- Check if Docker is running ---
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Docker is installed but not running!
    echo.
    echo     Open Docker Desktop and wait for it to finish starting up.
    echo     Then run this script again.
    echo.
    pause
    exit /b 1
)
echo [OK] Docker is running

:: --- Check Node.js ---
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Node.js is not installed!
    echo.
    echo     Download it from: https://nodejs.org/
    echo     Install the LTS version, then run this again.
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js found

:: --- Create .env if it doesn't exist ---
if not exist .env (
    echo.
    echo [*] Creating .env config file from template...
    copy .env.example .env >nul
    echo [OK] .env file created
    echo.
    echo ============================================
    echo   ACTION REQUIRED: Add your API key
    echo ============================================
    echo.
    echo   Opening .env in Notepad...
    echo   Find the line:  ANTHROPIC_API_KEY=sk-ant-...
    echo   Replace it with your real key from:
    echo     https://console.anthropic.com/
    echo.
    echo   Save the file, close Notepad, then press any key here.
    echo.
    notepad .env
    pause
)

:: --- Install Node dependencies if needed ---
if not exist node_modules (
    echo.
    echo [*] Installing dependencies (first time only, takes a minute)...
    call npm install
    if %errorlevel% neq 0 (
        echo [X] npm install failed. Check the errors above.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
)

:: --- Start Docker services ---
echo.
echo [*] Starting Docker services (Ollama, ChromaDB, etc.)...
echo     First time takes 5-15 minutes to download everything.
echo.
docker compose up -d
if %errorlevel% neq 0 (
    echo [X] Docker services failed to start. Check the errors above.
    pause
    exit /b 1
)
echo [OK] Docker services started

:: --- Pull Ollama models if first run ---
docker exec demiurgos-ollama ollama list 2>nul | findstr /i "mistral" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [*] Downloading AI models (first time only, takes 5-10 minutes)...
    docker exec demiurgos-ollama ollama pull mistral
    docker exec demiurgos-ollama ollama pull llama3
    echo [OK] Models downloaded
)

:: --- Show IP for phone access ---
echo.
echo ============================================
echo   DEMIURGOS is starting up!
echo ============================================
echo.
echo   Dashboard:  http://localhost:3000
echo.
echo   To view on your phone, use one of these:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    echo     http://%%a:3000
)
echo.
echo   Opening dashboard in your browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000
echo.
echo ============================================
echo   Starting the server below...
echo   Press Ctrl+C to stop it when you're done.
echo ============================================
echo.

:: --- Start the main server ---
npx tsx src/cli.ts serve
