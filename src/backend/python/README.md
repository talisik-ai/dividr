# DiviDr Tools - Python Binary Generation

This guide explains how to build the unified `dividr-tools` binary using PyInstaller.

## Prerequisites

1. **Install Python 3.9+** (3.12+ recommended)

   ```bash
   # Windows - use Python Launcher
   py -3.12 --version
   ```

2. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   pip install pyinstaller
   ```

   Or use a virtual environment:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   # source .venv/bin/activate  # macOS/Linux
   pip install -r requirements.txt
   pip install pyinstaller
   ```

## Building the Binary

The `main.spec` file builds `dividr-tools` - a unified binary supporting transcription and noise reduction.

1. **Navigate to the project root:**

   ```bash
   cd /path/to/dividr-ui
   ```

2. **Build for your platform:**

   ```bash
   # Windows
   pyinstaller main.spec --distpath dividr-tools-bin/win32

   # macOS
   pyinstaller main.spec --distpath dividr-tools-bin/darwin

   # Linux
   pyinstaller main.spec --distpath dividr-tools-bin/linux
   ```

3. **Output:**
   - Windows: `dividr-tools-bin/win32/dividr-tools.exe`
   - macOS: `dividr-tools-bin/darwin/dividr-tools`
   - Linux: `dividr-tools-bin/linux/dividr-tools`

## CLI Usage

The binary supports multiple commands via subcommands:

```bash
# Show help
dividr-tools --help
dividr-tools --version

# Transcription (uses Faster-Whisper)
dividr-tools transcribe --input audio.mp3 --output transcript.json
dividr-tools transcribe --input video.mp4 --output result.json --model large-v3 --language en

# Noise Reduction (uses noisereduce)
dividr-tools noise-reduce --input noisy.wav --output clean.wav
dividr-tools noise-reduce --input audio.wav --output output.wav --prop-decrease 0.9
```

### Transcribe Options

| Option | Default | Description |
|--------|---------|-------------|
| `--model` | large-v3 | Model size (tiny, base, small, medium, large, large-v2, large-v3) |
| `--language` | auto | Language code (en, es, fr, etc.) |
| `--translate` | false | Translate to English |
| `--device` | cpu | Device (cpu, cuda) |
| `--compute-type` | int8 | Compute type (int8, int16, float16, float32) |
| `--beam-size` | 5 | Beam size for decoding |
| `--no-vad` | false | Disable voice activity detection |

### Noise-Reduce Options

| Option | Default | Description |
|--------|---------|-------------|
| `--stationary` | true | Assume stationary noise |
| `--non-stationary` | - | Assume non-stationary noise |
| `--prop-decrease` | 0.8 | Noise reduction intensity (0.0-1.0) |
| `--n-fft` | 2048 | FFT window size |

## Output Protocol

The binary outputs progress and results in a parseable format:

```
PROGRESS|{"stage": "loading", "progress": 0, "message": "Loading model..."}
PROGRESS|{"stage": "processing", "progress": 50, "message": "Transcribing..."}
RESULT|{...json result...}
RESULT_SAVED|/path/to/output.json
```

## Platform Notes

- **Windows**: Binary is `dividr-tools.exe`
- **macOS**: May need code signing for distribution; run `chmod +x dividr-tools`
- **Linux**: Ensure execute permissions: `chmod +x dividr-tools`

## Migration from transcribe-bin

The old `transcribe-bin` directory is deprecated. To migrate:

1. Build the new unified binary using the instructions above
2. The desktop app will automatically detect `dividr-tools-bin` instead of `transcribe-bin`
3. Remove the old `transcribe-bin` directory after verifying everything works
