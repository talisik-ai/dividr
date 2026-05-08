#!/bin/bash
# Setup script for Dividr Python dependencies
# Run this script to create the local project venv and install dependencies

set -e

echo "=================================================="
echo "🐍 Dividr Python Setup"
echo "=================================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/src/backend/python/venv"
VENV_PYTHON="${VENV_DIR}/bin/python"
PYTHON_BIN=""

for candidate in python3.13 python3.12 python3.11 python3; do
    if command -v "$candidate" &> /dev/null; then
        PYTHON_BIN="$candidate"
        break
    fi
done

if [ -z "$PYTHON_BIN" ]; then
    echo "❌ No supported Python interpreter was found!"
    echo ""
    echo "Install Python 3.11, 3.12, or 3.13:"
    echo "  - macOS: brew install python@3.11"
    echo "  - Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    echo "  - Fedora/RHEL: sudo dnf install python3 python3-pip"
    exit 1
fi

PYTHON_VERSION=$("$PYTHON_BIN" --version | cut -d' ' -f2)
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d'.' -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d'.' -f2)

echo "✅ Found Python $PYTHON_VERSION"

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]); then
    echo "❌ Python 3.9 or higher is required!"
    echo "   Current version: $PYTHON_VERSION"
    exit 1
fi

echo ""
echo "🏗️  Creating local virtual environment at:"
echo "   $VENV_DIR"
echo ""

if [ ! -x "$VENV_PYTHON" ]; then
    "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

echo "📦 Installing Python dependencies..."
echo ""

"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r "${SCRIPT_DIR}/requirements.txt"

echo ""
echo "🔧 Applying DeepFilterNet compatibility patch..."
echo ""

PATCH_SCRIPT="${SCRIPT_DIR}/src/backend/python/scripts/patch_deepfilternet_io.py"

if [ -f "$PATCH_SCRIPT" ]; then
    if "$VENV_PYTHON" "$PATCH_SCRIPT" 2>/dev/null; then
        echo "✅ DeepFilterNet patch applied successfully"
    else
        echo "⚠️  DeepFilterNet patch skipped (package may not be installed or already patched)"
    fi
else
    echo "⚠️  Patch script not found at: $PATCH_SCRIPT"
    echo "   Continuing anyway..."
fi

echo ""
echo "🔍 Verifying Python package imports..."
"$VENV_PYTHON" -c "import faster_whisper, df"

echo ""
echo "=================================================="
echo "✅ Setup Complete!"
echo "=================================================="
echo ""
echo "🎤 Faster-Whisper and DeepFilterNet are now installed"
echo "📍 Python environment: $VENV_PYTHON"
echo ""
echo "Next steps:"
echo "  1. Run 'yarn start' to start Dividr in dev mode"
echo "  2. Test transcription with an audio/video file"
echo ""
echo "💡 Tips:"
echo "  - First transcription will download the model (~150MB for base)"
echo "  - Models are cached in ~/.cache/huggingface/hub/"
echo "  - For GPU support, see the project Python README"
echo ""
