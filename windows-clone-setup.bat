@echo off
echo.
echo ============================================
echo   Ultimate Farms — Windows Clone Setup
echo ============================================
echo.

:: Check Git is installed
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed or not on PATH.
    echo.
    echo Finish installing Git first, then run this script again.
    echo Download Git: https://gitforwindows.org/
    echo.
    pause
    exit /b 1
)

echo Git found:
git --version
echo.

:: Set target directory
set "TARGET=C:\Users\shola\OneDrive\Desktop\Ultimate-Farms"

:: Check if already cloned
if exist "%TARGET%\.git" (
    echo Ultimate-Farms already exists at:
    echo   %TARGET%
    echo.
    echo Pulling latest changes...
    cd /d "%TARGET%"
    git pull origin main
    echo.
    echo Done! Your repo is up to date.
    pause
    exit /b 0
)

:: Clone the repo
echo Cloning Ultimate-Farms to your OneDrive Desktop...
echo   %TARGET%
echo.
git clone https://github.com/shockysho/Ultimate-Farms.git "%TARGET%"

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Clone failed. Check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Done! Ultimate-Farms is on your Desktop.
echo ============================================
echo.
echo Location: %TARGET%
echo.
echo Next steps:
echo   1. Install Node.js from https://nodejs.org/ (LTS version)
echo   2. Open a terminal in the Ultimate-Farms folder
echo   3. Run: npm install
echo   4. Run: npm run dev
echo.
pause
