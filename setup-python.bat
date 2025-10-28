@echo off
REM Setup script for Dividr Python dependencies (Windows)
REM Run this script to install faster-whisper and dependencies

echo ==================================================
echo 🐍 Dividr Python Setup (Windows)
echo ==================================================
echo.

REM Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Python is not installed or not in PATH!
    echo.
    echo Please install Python 3.9 or higher from:
    echo   https://www.python.org/downloads/
    echo.
    echo ⚠️  Make sure to check "Add Python to PATH" during installation!
    pause
    exit /b 1
)

REM Check Python version
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo ✅ Found Python %PYTHON_VERSION%
echo.

REM Check if pip is available
python -m pip --version >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ pip is not installed!
    echo    Installing pip...
    python -m ensurepip --upgrade
)

echo 📦 Installing Python dependencies...
echo.

REM Install requirements
python -m pip install -r requirements.txt

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Installation failed!
    echo    Try running as Administrator or check your internet connection
    pause
    exit /b 1
)

echo.
echo ==================================================
echo ✅ Setup Complete!
echo ==================================================
echo.
echo 🎤 Faster-Whisper is now installed
echo.
echo Next steps:
echo   1. Run 'yarn start' to start Dividr in dev mode
echo   2. Test transcription with an audio/video file
echo.
echo 💡 Tips:
echo   - First transcription will download the model (~150MB for base)
echo   - Models are cached in %%USERPROFILE%%\.cache\huggingface\hub\
echo   - For GPU support, see PYTHON_SETUP.md
echo.
pause

