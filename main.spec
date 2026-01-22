# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for dividr-tools unified binary
Combines transcription (faster-whisper) and noise reduction (DeepFilterNet)

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
print(f"[BUILD] Ensuring build directory exists: {workpath_dir}")

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
        print(f"[OK] Including faster-whisper assets from: {faster_whisper_assets}")
    else:
        print(f"[WARN] Warning: faster-whisper assets not found at {faster_whisper_assets}")

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
    print("[WARN] Warning: faster-whisper not installed, transcription may not work")

# -----------------------------------------------------------------------------
# Noise reduction dependencies (DeepFilterNet)
# -----------------------------------------------------------------------------
try:
    import df
    import torchaudio
    import soundfile

    # Hidden imports for noise reduction (DeepFilterNet)
    # Include ALL df submodules to prevent "No module named" errors
    hiddenimports_list.extend([
        # Main df package and all submodules
        'df',
        'df.checkpoint',
        'df.config',
        'df.deepfilternet',
        'df.deepfilternet2',
        'df.deepfilternet3',
        'df.deepfilternetmf',
        'df.enhance',
        'df.evaluation_utils',
        'df.io',
        'df.logger',
        'df.loss',
        'df.lr',
        'df.model',
        'df.modules',
        'df.multiframe',
        'df.sepm',
        'df.stoi',
        'df.train',
        'df.utils',
        'df.version',
        'df.visualization',
        # DeepFilterNet packages
        'deepfilternet',
        'deepfilterlib',
        # Audio processing
        'torchaudio',
        'torchaudio.functional',
        'torchaudio.transforms',
        'soundfile',
        # Torch dependencies that df uses
        'torch',
        'torch.nn',
        'torch.nn.functional',
    ])
    print("[OK] Noise reduction dependencies (DeepFilterNet) found")
except ImportError as e:
    print(f"[WARN] Warning: noise reduction dependency missing: {e}")

# -----------------------------------------------------------------------------
# Collect DeepFilterNet Model Assets (Local Cache)
# -----------------------------------------------------------------------------
# DeepFilterNet downloads models to %LOCALAPPDATA%\DeepFilterNet\DeepFilterNet\Cache
# We must bundle these for the standalone binary to work offline/clean
try:
    local_app_data = os.environ.get('LOCALAPPDATA')
    if local_app_data:
        df_cache_path = Path(local_app_data) / 'DeepFilterNet' / 'DeepFilterNet' / 'Cache' / 'DeepFilterNet2'
        
        if df_cache_path.exists():
            # Bundle into 'df_assets/DeepFilterNet2' inside the executable
            datas_list.append((str(df_cache_path), 'df_assets/DeepFilterNet2'))
            print(f"[OK] Including DeepFilterNet assets from: {df_cache_path}")
        else:
            print(f"[WARN] DeepFilterNet assets not found at {df_cache_path} - Run the tool once locally to download models")
except Exception as e:
    print(f"[WARN] Failed to resolve DeepFilterNet assets: {e}")

# -----------------------------------------------------------------------------
# Common dependencies
# -----------------------------------------------------------------------------
hiddenimports_list.extend([
    # NumPy - include ALL core modules for numpy 2.x compatibility
    'numpy',
    'numpy.core',
    'numpy.core._methods',
    'numpy.core.multiarray',
    'numpy.core._multiarray_umath',
    'numpy.core.umath',
    'numpy.core.numeric',
    'numpy.core.numerictypes',
    'numpy.core.fromnumeric',
    'numpy.core.shape_base',
    'numpy.core.function_base',
    'numpy.core.arrayprint',
    'numpy.core.defchararray',
    'numpy.core.records',
    'numpy.core.getlimits',
    'numpy.core.einsumfunc',
    'numpy.core.overrides',
    'numpy.core._internal',
    'numpy.core._dtype',
    'numpy.core._dtype_ctypes',
    'numpy.core._utils',
    'numpy.lib',
    'numpy.lib.format',
    'numpy.fft',
    'numpy.linalg',
    'numpy.random',
    'numpy._core',
    'numpy._core._multiarray_umath',
])

# Remove duplicates
hiddenimports_list = list(set(hiddenimports_list))

# -----------------------------------------------------------------------------
# Collect numpy binaries/data (required for numpy 2.x with PyInstaller)
# -----------------------------------------------------------------------------
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

try:
    numpy_datas = collect_data_files('numpy')
    numpy_binaries = collect_dynamic_libs('numpy')
    datas_list.extend(numpy_datas)
    print(f"[OK] Collected {len(numpy_datas)} numpy data files")
except Exception as e:
    print(f"[WARN] Failed to collect numpy data: {e}")
    numpy_binaries = []

print(f"[PKG] Hidden imports: {len(hiddenimports_list)} modules")
print(f"[DIR] Data files: {len(datas_list)} entries")

# ==============================================================================
# PyInstaller Analysis
# ==============================================================================

a = Analysis(
    ['src/backend/python/main.py'],
    pathex=['src/backend/python'],
    binaries=numpy_binaries,
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
