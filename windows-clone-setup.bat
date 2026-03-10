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

:: Set target directory (works for any user, not just shola)
set "TARGET=%USERPROFILE%\OneDrive\Desktop\Ultimate-Farms"

:: Check if OneDrive Desktop exists, fall back to regular Desktop
if not exist "%USERPROFILE%\OneDrive\Desktop" (
    set "TARGET=%USERPROFILE%\Desktop\Ultimate-Farms"
)

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
    echo.
    echo Launching Demiurgos setup...
    cd /d "%TARGET%\packages\demiurgos"
    call setup-windows.bat
    exit /b 0
)

:: Clone the repo
echo Cloning Ultimate-Farms to your Desktop...
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
echo Now launching Demiurgos setup...
echo.
cd /d "%TARGET%\packages\demiurgos"
call setup-windows.bat
