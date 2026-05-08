@echo off
setlocal EnableExtensions
REM Setup script for Dividr Python dependencies (Windows)
REM Run this script to create the local project venv and install dependencies

echo ==================================================
echo 🐍 Dividr Python Setup (Windows)
echo ==================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "VENV_DIR=%SCRIPT_DIR%src\backend\python\venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "PYTHON_CMD="

REM Prefer stable Python versions supported by torch/deepfilternet
py -3.13 --version >nul 2>nul && set "PYTHON_CMD=py -3.13"
if not defined PYTHON_CMD py -3.12 --version >nul 2>nul && set "PYTHON_CMD=py -3.12"
if not defined PYTHON_CMD py -3.11 --version >nul 2>nul && set "PYTHON_CMD=py -3.11"
if not defined PYTHON_CMD where python >nul 2>nul && set "PYTHON_CMD=python"

if not defined PYTHON_CMD (
    echo ❌ No supported Python interpreter was found.
    echo.
    echo Install Python 3.11, 3.12, or 3.13 from:
    echo   https://www.python.org/downloads/
    echo.
    echo ⚠️  Avoid alpha or dev Python builds for this project.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('%PYTHON_CMD% --version 2^>^&1') do set PYTHON_VERSION=%%i
echo ✅ Found Python %PYTHON_VERSION%
echo.

echo 🏗️  Creating local virtual environment at:
echo    %VENV_DIR%
echo.

if not exist "%VENV_PYTHON%" (
    call %PYTHON_CMD% -m venv "%VENV_DIR%"
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ Failed to create the local virtual environment.
        pause
        exit /b 1
    )
)

echo 📦 Installing Python dependencies...
echo.

call "%VENV_PYTHON%" -m pip install --upgrade pip
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to upgrade pip inside the local virtual environment.
    pause
    exit /b 1
)

call "%VENV_PYTHON%" -m pip install -r "%SCRIPT_DIR%requirements.txt"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Installation failed!
    echo    Check your internet connection or retry with a different stable Python version.
    pause
    exit /b 1
)

echo.
echo 🔧 Applying DeepFilterNet compatibility patch...
echo.

set "PATCH_SCRIPT=%SCRIPT_DIR%src\backend\python\scripts\patch_deepfilternet_io.py"

if exist "%PATCH_SCRIPT%" (
    call "%VENV_PYTHON%" "%PATCH_SCRIPT%" 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo ✅ DeepFilterNet patch applied successfully
    ) else (
        echo ⚠️  DeepFilterNet patch skipped (package may not be installed or already patched)
    )
) else (
    echo ⚠️  Patch script not found at: %PATCH_SCRIPT%
    echo    Continuing anyway...
)

echo.
echo 🔍 Verifying Python package imports...
call "%VENV_PYTHON%" -c "import faster_whisper, df"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Package verification failed inside the local virtual environment.
    pause
    exit /b 1
)

echo.
echo ==================================================
echo ✅ Setup Complete!
echo ==================================================
echo.
echo 🎤 Faster-Whisper and DeepFilterNet are now installed
echo 📍 Python environment: %VENV_PYTHON%
echo.
echo Next steps:
echo   1. Run 'yarn start' to start Dividr in dev mode
echo   2. Test transcription with an audio/video file
echo.
echo 💡 Tips:
echo   - First transcription will download the model (~150MB for base)
echo   - Models are cached in %%USERPROFILE%%\.cache\huggingface\hub\
echo   - For GPU support, see the project Python README
echo.
pause
endlocal
