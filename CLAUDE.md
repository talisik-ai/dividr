# Dividr — setup

Electron + React desktop app with a Python sidecar (`dividr-tools`) for transcription and noise reduction.

## First-time setup

```bash
# 1. JS deps
yarn install

# 2. Python deps (faster-whisper + deepfilternet + torch). Requires Python 3.12.
#    Windows:
setup-python.bat
#    macOS / Linux:
./setup-python.sh

# 3. Run dev
yarn start
```

The Python setup script installs `requirements.txt` and applies
`src/backend/python/scripts/patch_deepfilternet_io.py`, which rewrites the
installed `df/io.py` to (a) import `AudioMetaData` from the modern torchaudio
location and (b) add a `soundfile` fallback for `save_audio`. The patch is
idempotent — re-running the setup script is safe.

## Where the runtime looks for Python (dev mode)

`src/backend/media-tools/mediaToolsRunner.ts` checks, in order:

1. `<repo>/.venv/`
2. `<repo>/venv/`
3. `<repo>/src/backend/python/venv/`
4. `<repo>/src/backend/python/.venv/`
5. System `python3` / `py -3.x`

Any of those is fine. Create the venv at the repo root (`python -m venv .venv`)
unless you have a reason not to.

## Production binary

`dividr-tools-bin/<platform>/dividr-tools(.exe)` is the PyInstaller build of
`src/backend/python/main.py`. Only `win32` is committed — macOS users must
build their own:

```bash
pyinstaller main.spec --distpath dividr-tools-bin/darwin
```

## Common gotchas

- **Python 3.13** can force a source build for `ctranslate2` (faster-whisper's
  runtime). Use 3.12 unless you know wheels are available for your arch.
- **DeepFilterNet upgrade** past torchaudio 2.8 requires re-running the patch
  script; `df/io.py` ships with a deprecated import that breaks on
  torchaudio ≥ 2.9.
- **ffmpeg/ffprobe** come from the npm packages `ffmpeg-static` /
  `ffprobe-static`; no system install needed.
