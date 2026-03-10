@echo off
title DEMIURGOS Setup
color 0A

echo ============================================
echo   DEMIURGOS - One-Click Setup (No Docker!)
echo ============================================
echo.
echo   This sets up everything you need to run
echo   Demiurgos with FREE local AI. No API keys,
echo   no cloud costs, everything runs on your PC.
echo.
echo ============================================
echo.

:: --- Check Node.js ---
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Node.js is not installed!
    echo.
    echo     You need Node.js to run Demiurgos.
    echo     Opening the download page for you...
    echo.
    echo     1. Download the LTS version
    echo     2. Run the installer (click Next through everything)
    echo     3. Restart this script when done
    echo.
    start https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo [OK] Node.js found: %%v

:: --- Check Ollama ---
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Ollama is not installed!
    echo.
    echo     Ollama is the free local AI engine.
    echo     Opening the download page for you...
    echo.
    echo     1. Download and install Ollama
    echo     2. Restart this script when done
    echo.
    start https://ollama.com/
    pause
    exit /b 1
)
echo [OK] Ollama found

:: --- Check if Ollama is running ---
echo.
echo [*] Checking if Ollama is running...
curl -s http://localhost:11434/api/tags >nul 2>nul
if %errorlevel% neq 0 (
    echo [*] Starting Ollama...
    start /min ollama serve
    timeout /t 5 /nobreak >nul
    curl -s http://localhost:11434/api/tags >nul 2>nul
    if %errorlevel% neq 0 (
        echo [X] Could not start Ollama.
        echo     Try opening the Ollama app manually, then run this script again.
        pause
        exit /b 1
    )
)
echo [OK] Ollama is running

:: --- Pull Mistral model if needed ---
echo.
echo [*] Checking for Mistral AI model...
ollama list 2>nul | findstr /i "mistral" >nul 2>nul
if %errorlevel% neq 0 (
    echo [*] Downloading Mistral model (4.1 GB, one-time download)...
    echo     This will take a few minutes depending on your internet speed.
    echo.
    ollama pull mistral
    if %errorlevel% neq 0 (
        echo [X] Failed to download Mistral. Check your internet and try again.
        pause
        exit /b 1
    )
)
echo [OK] Mistral model ready

:: --- Install Node dependencies ---
echo.
if not exist node_modules (
    echo [*] Installing dependencies (first time only)...
    call npm install
    if %errorlevel% neq 0 (
        echo [X] npm install failed. Check the errors above.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies already installed
)

:: --- Create .env if needed ---
if not exist .env (
    if exist .env.example (
        echo [*] Creating config file...
        copy .env.example .env >nul
        echo [OK] Config created (using local AI, no API keys needed)
    )
)

:: --- Build TypeScript ---
echo.
echo [*] Building Demiurgos...
call npx tsc 2>nul
echo [OK] Build complete

:: --- Run status check ---
echo.
echo ============================================
echo   Checking system status...
echo ============================================
echo.
call npx tsx src/cli.ts status

:: --- Ready! ---
echo.
echo ============================================
echo   DEMIURGOS IS READY!
echo ============================================
echo.
echo   Try asking it something:
echo     npx tsx src/cli.ts ask "What feed is best for laying hens?"
echo.
echo   Start the dashboard:
echo     npx tsx src/cli.ts serve
echo.
echo   See all commands:
echo     npx tsx src/cli.ts --help
echo.
echo ============================================
echo.

:: --- Ask if user wants to try it now ---
set /p "TRY=Want to ask Demiurgos something now? (y/n): "
if /i "%TRY%"=="y" (
    set /p "QUESTION=What do you want to ask? "
    echo.
    call npx tsx src/cli.ts ask "%QUESTION%"
)

echo.
pause
