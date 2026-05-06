#!/bin/bash
# Setup script for Dividr Python dependencies
# Run this script to install faster-whisper and dependencies

set -e

echo "=================================================="
echo "🐍 Dividr Python Setup"
echo "=================================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed!"
    echo ""
    echo "Please install Python 3.12 (3.9+ works, 3.13 may build ctranslate2 from source):"
    echo "  - macOS: brew install python@3.12"
    echo "  - Ubuntu/Debian: sudo apt install python3 python3-pip"
    echo "  - Fedora/RHEL: sudo dnf install python3 python3-pip"
    echo "  - Windows: Download from https://www.python.org/downloads/"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)

echo "✅ Found Python $PYTHON_VERSION"

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]); then
    echo "❌ Python 3.9 or higher is required!"
    echo "   Current version: $PYTHON_VERSION"
    exit 1
fi

echo ""

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not installed!"
    echo "   Install with: python3 -m ensurepip --upgrade"
    exit 1
fi

echo "📦 Installing Python dependencies..."
echo ""

# Install requirements
pip3 install -r requirements.txt

echo ""
echo "🔧 Applying DeepFilterNet compatibility patch..."
echo ""

# Run patch script if it exists and DeepFilterNet is installed
# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_SCRIPT="${SCRIPT_DIR}/src/backend/python/scripts/patch_deepfilternet_io.py"

if [ -f "$PATCH_SCRIPT" ]; then
    # Run patch script (suppress stderr to avoid noise if DeepFilterNet not installed)
    if python3 "$PATCH_SCRIPT" 2>/dev/null; then
        echo "✅ DeepFilterNet patch applied successfully"
    else
        # Non-fatal: DeepFilterNet may not be installed or already patched
        echo "⚠️  DeepFilterNet patch skipped (package may not be installed or already patched)"
    fi
else
    echo "⚠️  Patch script not found at: $PATCH_SCRIPT"
    echo "   Continuing anyway..."
fi

echo ""
echo "=================================================="
echo "✅ Setup Complete!"
echo "=================================================="
echo ""
echo "🎤 Faster-Whisper and DeepFilterNet are now installed"
echo ""
echo "Next steps:"
echo "  1. Run 'yarn start' to start Dividr in dev mode"
echo "  2. Test transcription with an audio/video file"
echo ""
echo "💡 Tips:"
echo "  - First transcription will download the model (~150MB for base)"
echo "  - Models are cached in ~/.cache/huggingface/hub/"
echo "  - For GPU support, see PYTHON_SETUP.md"
echo ""

