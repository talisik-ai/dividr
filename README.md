# Dividr

A powerful video editing application built with Electron and FFmpeg.

## Prerequisites

Before setting up the project, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **Yarn** (classic `1.x`)
- **Python** (`3.11` to `3.13`, stable releases only)
- **Git**

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd dividr
```

### 2. Install Node.js Dependencies

```bash
yarn install
```

### 3. Set Up the Local Python Runtime

The application uses `faster-whisper` for transcription and `DeepFilterNet` for noise reduction. In development mode, it prioritizes a project-local virtual environment at `src/backend/python/venv`.

#### For Development Mode

1. **Create the local Python environment and install dependencies:**

   Windows:

   ```powershell
   .\setup-python.bat
   ```

   macOS / Linux:

   ```bash
   chmod +x setup-python.sh
   ./setup-python.sh
   ```

2. **Verify the local runtime:**

   Windows:

   ```powershell
   .\src\backend\python\venv\Scripts\python.exe src\backend\python\scripts\transcribe.py --help
   ```

   macOS / Linux:

   ```bash
   ./src/backend/python/venv/bin/python src/backend/python/scripts/transcribe.py --help
   ```

   You should see the help message for the transcription script.

#### For Build/Production Version

When building the application for distribution, ensure Python dependencies are installed on the target system:

1. **Include requirements.txt in your build** (already configured in the project)

2. **On the target system, install Python dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

3. **The application will look for the transcribe.py script at:**
   - Development: `src/backend/python/scripts/transcribe.py`
   - Production: `resources/backend/python/scripts/transcribe.py` (bundled in the build)

#### Python Dependencies

The transcription feature requires:

- `faster-whisper>=1.0.0` - Optimized Whisper implementation
- `torch==2.8.0` - PyTorch (CPU version, required for DeepFilterNet compatibility)

For GPU acceleration, install the CUDA-enabled version of PyTorch:

```bash
pip install torch==2.8.0

```

## Development

### Running the Application

```bash
yarn start
```

This will start the Electron application in development mode with hot-reloading.

### Building the Application

To package the application for distribution:

```bash
yarn run package
```

To create installers:

```bash
yarn run make
```

### Project Structure

```
dividr-ui/
├── src/
│   ├── backend/
│   │   ├── python/
│   │   │   ├── main.py          # Python multi-tool entry point
│   │   │   └── scripts/
│   │   │       ├── transcribe.py    # Python transcription script
│   │   │       └── noisereduction.py # Noise reduction script
│   │   └── whisper/              # Whisper transcription runners
│   ├── frontend/                # React frontend code
│   └── main.ts                  # Electron main process
├── requirements.txt             # Python dependencies
├── package.json                 # Node.js dependencies
└── README.md
```

## Features

- Video editing with FFmpeg
- AI-powered transcription using Faster-Whisper
- Real-time preview
- Timeline-based editing
- Export to various formats

## Troubleshooting

### Transcription Issues

If you encounter issues with transcription:

1. **Check Python installation:**

   ```bash
   py -0p
   ```

2. **Verify faster-whisper is installed:**

   Windows:

   ```powershell
   .\src\backend\python\venv\Scripts\python.exe -m pip show faster-whisper
   ```

   macOS / Linux:

   ```bash
   ./src/backend/python/venv/bin/python -m pip show faster-whisper
   ```

3. **Test the transcription script manually:**
   Windows:

   ```powershell
   .\src\backend\python\venv\Scripts\python.exe src\backend\python\scripts\transcribe.py --help
   ```

   macOS / Linux:

   ```bash
   ./src/backend/python/venv/bin/python src/backend/python/scripts/transcribe.py --help
   ```
