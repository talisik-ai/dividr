# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for dividr-tools unified binary
Combines transcription (faster-whisper) and noise reduction (noisereduce)

Build command:
    pyinstaller main.spec --distpath dividr-tools-bin/win32

Output: dividr-tools.exe (Windows) or dividr-tools (Unix)
"""

import os
import sys
from pathlib import Path

# ==============================================================================
# Ensure build directories exist
# ==============================================================================

# PyInstaller needs the workpath directory to exist before writing files
# Default workpath is 'build/main' (based on spec filename 'main.spec')
build_dir = Path('build')
workpath_dir = build_dir / 'main'
workpath_dir.mkdir(parents=True, exist_ok=True)
print(f"📁 Ensuring build directory exists: {workpath_dir}")

# ==============================================================================
# Collect data files from dependencies
# ==============================================================================

datas_list = []
hiddenimports_list = []

# -----------------------------------------------------------------------------
# Faster-Whisper assets (contains silero VAD model for voice activity detection)
# -----------------------------------------------------------------------------
try:
    import faster_whisper
    faster_whisper_path = Path(faster_whisper.__file__).parent
    faster_whisper_assets = faster_whisper_path / 'assets'

    if faster_whisper_assets.exists():
        datas_list.append((str(faster_whisper_assets), 'faster_whisper/assets'))
        print(f"✅ Including faster-whisper assets from: {faster_whisper_assets}")
    else:
        print(f"⚠️ Warning: faster-whisper assets not found at {faster_whisper_assets}")

    # Hidden imports for transcription
    hiddenimports_list.extend([
        'faster_whisper',
        'ctranslate2',
        'onnxruntime',
        'av',
        'huggingface_hub',
        'tokenizers',
    ])
except ImportError:
    print("⚠️ Warning: faster-whisper not installed, transcription may not work")

# -----------------------------------------------------------------------------
# Noise reduction dependencies (DeepFilterNet)
# -----------------------------------------------------------------------------
try:
    import df
    import torchaudio
    import soundfile

    # Hidden imports for noise reduction (DeepFilterNet)
    hiddenimports_list.extend([
        'df',
        'df.enhance',
        'df.io',
        'deepfilternet',
        'deepfilterlib',
        'torchaudio',
        'soundfile',
    ])
    print("✅ Noise reduction dependencies (DeepFilterNet) found")
except ImportError as e:
    print(f"⚠️ Warning: noise reduction dependency missing: {e}")

# -----------------------------------------------------------------------------
# Common dependencies
# -----------------------------------------------------------------------------
hiddenimports_list.extend([
    'numpy',
    'numpy.core._methods',
    'numpy.lib.format',
])

# Remove duplicates
hiddenimports_list = list(set(hiddenimports_list))

print(f"📦 Hidden imports: {hiddenimports_list}")
print(f"📁 Data files: {len(datas_list)} entries")

# ==============================================================================
# PyInstaller Analysis
# ==============================================================================

a = Analysis(
    ['src/backend/python/main.py'],
    pathex=['src/backend/python'],
    binaries=[],
    datas=datas_list,
    hiddenimports=hiddenimports_list,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

# ==============================================================================
# Executable
# ==============================================================================

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='dividr-tools',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
