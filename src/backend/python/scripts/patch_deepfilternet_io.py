"""
Idempotent patch for deepfilternet's df/io.py.

Two fixes:
  1. `from torchaudio.backend.common import AudioMetaData` is deprecated in
     torchaudio 2.x and removed in >=2.9. Replaced with a try/except that
     prefers the new location.
  2. `save_audio` calls `ta.save(...)`, which is unreliable across torchaudio
     backends/platforms. Wrapped with a `soundfile.write` fallback.

The script writes a `# DIVIDR_PATCHED` sentinel and exits early on re-runs.
Exit codes: 0 patched (or already patched), 1 deepfilternet not installed,
2 unexpected file shape (refused to patch).
"""

from __future__ import annotations

import sys
from pathlib import Path

SENTINEL = "# DIVIDR_PATCHED"

NEW_IMPORT_BLOCK = """try:
    from torchaudio import AudioMetaData  # torchaudio >= 2.1
except ImportError:  # pragma: no cover
    from torchaudio.backend.common import AudioMetaData  # legacy fallback"""

OLD_IMPORT_LINE = "from torchaudio.backend.common import AudioMetaData"

NEW_SAVE_TAIL = """    try:
        ta.save(outpath, audio, sr)
    except Exception:
        # Fallback: torchaudio.save can fail depending on backend (sox/soundfile)
        # and platform. soundfile handles float32/int16 reliably on Win/macOS.
        import numpy as np
        import soundfile as sf
        arr = audio.detach().cpu().numpy()
        if arr.ndim == 2:
            arr = arr.T  # [C, T] -> [T, C]
            if arr.shape[1] == 1:
                arr = arr.squeeze(1)
        if arr.dtype.kind == "f":
            arr = np.clip(arr, -1.0, 1.0)
        sf.write(outpath, arr, sr)
"""

OLD_SAVE_TAIL = "    ta.save(outpath, audio, sr)\n"


def find_df_io() -> Path | None:
    try:
        import df  # type: ignore
    except ImportError:
        return None
    io_path = Path(df.__file__).parent / "io.py"
    return io_path if io_path.is_file() else None


def patch(text: str) -> tuple[str, bool]:
    if SENTINEL in text:
        return text, False

    if OLD_IMPORT_LINE not in text:
        raise RuntimeError("expected AudioMetaData import not found")
    if OLD_SAVE_TAIL not in text:
        raise RuntimeError("expected ta.save(outpath, audio, sr) line not found")

    text = text.replace(OLD_IMPORT_LINE, NEW_IMPORT_BLOCK, 1)
    text = text.replace(OLD_SAVE_TAIL, NEW_SAVE_TAIL, 1)
    text = f"{SENTINEL}\n{text}"
    return text, True


def main() -> int:
    io_path = find_df_io()
    if io_path is None:
        print("deepfilternet not installed; nothing to patch", file=sys.stderr)
        return 1

    original = io_path.read_text(encoding="utf-8")
    try:
        patched, changed = patch(original)
    except RuntimeError as e:
        print(f"refusing to patch {io_path}: {e}", file=sys.stderr)
        return 2

    if not changed:
        print(f"already patched: {io_path}")
        return 0

    backup = io_path.with_suffix(io_path.suffix + ".dividr.bak")
    if not backup.exists():
        backup.write_text(original, encoding="utf-8")
    io_path.write_text(patched, encoding="utf-8")
    print(f"patched {io_path} (backup at {backup.name})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
