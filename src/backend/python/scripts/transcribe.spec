# -*- mode: python ; coding: utf-8 -*-

import os
import sys
from pathlib import Path

# Find faster_whisper package location
import faster_whisper
faster_whisper_path = Path(faster_whisper.__file__).parent

# Include the assets directory (contains silero VAD model)
faster_whisper_assets = faster_whisper_path / 'assets'
datas_list = []

if faster_whisper_assets.exists():
    # Add all files from faster_whisper/assets to the bundle
    datas_list.append((str(faster_whisper_assets), 'faster_whisper/assets'))
    print(f"✅ Including faster-whisper assets from: {faster_whisper_assets}")
else:
    print(f"⚠️ Warning: faster-whisper assets not found at {faster_whisper_assets}")

a = Analysis(
    ['transcribe.py'],
    pathex=[],
    binaries=[],
    datas=datas_list,
    hiddenimports=['faster_whisper', 'ctranslate2', 'onnxruntime', 'av'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='transcribe',
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
