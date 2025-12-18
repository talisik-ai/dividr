# Python Binary Generation

This guide explains how to build standalone Python binaries using PyInstaller for use in Electron applications.

## Prerequisites

1. **Install Python 3.9+** (3.12+ recommended)

2. **Install PyInstaller:**
   ```bash
   pip install pyinstaller
   ```

3. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
   
   Or use a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   pip install pyinstaller
   ```

## Building the Python Binary

The `main.spec` file builds `main.py` as a standalone binary that includes all Python tools (transcribe, noisereduction, etc.).

1. **Navigate to the project root:**
   ```bash
   cd /path/to/dividr-ui
   ```

2. **Build using the spec file:**
   ```bash
   pyinstaller main.spec
   ```

3. **Output location:**
   - **Windows**: `dist/main.exe` (or name specified in spec)
   - **macOS/Linux**: `dist/main` (or name specified in spec)

## Testing the Binary

Test the built binary:
```bash
# Test transcription
./dist/main transcribe --input audio.mp3 --output transcript.json

# Test noise reduction
./dist/main noisereduction --input noisy.wav --output clean.wav
```

## Platform-Specific Notes

- **Windows**: Binary will be `main.exe`
- **macOS**: May need code signing for distribution
- **Linux**: Ensure execute permissions: `chmod +x dist/main`




