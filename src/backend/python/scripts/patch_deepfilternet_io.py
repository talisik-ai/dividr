#!/usr/bin/env python3
"""
Post-install patch script for DeepFilterNet io.py

This script patches the installed DeepFilterNet io.py file to include
soundfile fallback in save_audio function, preventing audio distortion.

Run this after installing DeepFilterNet:
    python src/backend/python/scripts/patch_deepfilternet_io.py

Or integrate into setup scripts.
"""

import os
import sys
from pathlib import Path


def find_df_io_path():
    """Find the installed df/io.py file"""
    try:
        import df
        df_path = Path(df.__file__).parent
        io_path = df_path / "io.py"
        if io_path.exists():
            return io_path
    except ImportError:
        pass
    
    # Try common site-packages locations
    import site
    for site_packages in site.getsitepackages():
        io_path = Path(site_packages) / "df" / "io.py"
        if io_path.exists():
            return io_path
    
    return None


def patch_save_audio(io_path: Path):
    """Patch the save_audio function to include soundfile fallback"""
    content = io_path.read_text()
    
    # Check if already patched
    if "soundfile fallback" in content and "sf.write(outpath" in content:
        print(f"✅ {io_path} is already patched")
        return True
    
    # Find the save_audio function and add fallback
    lines = content.split('\n')
    patched_lines = []
    in_save_audio = False
    save_audio_indent = 0
    found_ta_save = False
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Detect start of save_audio function
        if line.strip().startswith("def save_audio("):
            in_save_audio = True
            save_audio_indent = len(line) - len(line.lstrip())
            patched_lines.append(line)
            i += 1
            continue
        
        # Detect end of save_audio function
        if in_save_audio:
            current_indent = len(line) - len(line.lstrip()) if line.strip() else save_audio_indent + 1
            if line.strip() and not line.startswith(' ') and not line.startswith('\t'):
                # Function ended
                in_save_audio = False
                found_ta_save = False
                patched_lines.append(line)
                i += 1
                continue
            
            # Look for ta.save() call
            if "ta.save(" in line or "torchaudio.save(" in line:
                found_ta_save = True
                patched_lines.append(line)
                i += 1
                continue
            
            # If we found ta.save, add fallback after it
            if found_ta_save and line.strip() == "":
                # Add fallback code
                indent = " " * (save_audio_indent + 4)
                patched_lines.append("")
                patched_lines.append(f"{indent}# Try torchaudio.save, fallback to soundfile if it fails")
                patched_lines.append(f"{indent}try:")
                patched_lines.append(f"{indent}    ta.save(outpath, audio, sr)")
                patched_lines.append(f"{indent}except (ImportError, RuntimeError) as e:")
                patched_lines.append(f"{indent}    # Fallback to soundfile for saving")
                patched_lines.append(f'{indent}    if "torchcodec" in str(e).lower() or "backend" in str(e).lower():')
                patched_lines.append(f'{indent}        import soundfile as sf')
                patched_lines.append(f'{indent}        logger.debug(f"torchaudio.save failed ({{e}}), using soundfile fallback")')
                patched_lines.append(f'{indent}        # Convert tensor to numpy: [C, T] -> [T, C]')
                patched_lines.append(f'{indent}        audio_np = audio.t().numpy()')
                patched_lines.append(f'{indent}        if audio_np.shape[1] == 1:')
                patched_lines.append(f'{indent}            audio_np = audio_np.squeeze(1)  # Remove channel dimension if mono')
                patched_lines.append(f'{indent}        sf.write(outpath, audio_np, sr)')
                patched_lines.append(f'{indent}    else:')
                patched_lines.append(f'{indent}        raise')
                found_ta_save = False
                patched_lines.append(line)
                i += 1
                continue
        
        patched_lines.append(line)
        i += 1
    
    # Write patched content
    patched_content = '\n'.join(patched_lines)
    io_path.write_text(patched_content)
    return True


def main():
    print("🔧 DeepFilterNet io.py Patcher")
    print("=" * 50)
    
    io_path = find_df_io_path()
    if not io_path:
        # Silent failure - DeepFilterNet may not be installed yet
        # This allows the setup script to continue
        return 0
    
    print(f"📁 Found: {io_path}")
    
    # Create backup
    backup_path = io_path.with_suffix('.py.backup')
    if not backup_path.exists():
        import shutil
        shutil.copy2(io_path, backup_path)
        print(f"💾 Backup created: {backup_path}")
    
    # Patch the file
    try:
        if patch_save_audio(io_path):
            print("✅ Successfully patched io.py")
            print("")
            print("The save_audio function now includes soundfile fallback.")
            print("This prevents audio distortion issues.")
            return 0
        else:
            print("⚠️  Patch may not have been applied correctly")
            print("   Check the file manually or restore from backup")
            return 1
    except Exception as e:
        print(f"❌ Error patching file: {e}")
        print(f"   Restore from backup: {backup_path}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
