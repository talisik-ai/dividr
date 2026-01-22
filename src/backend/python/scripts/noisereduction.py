import argparse
import os
from typing import Union

import torch
import torchaudio as ta
import numpy as np
from numpy import ndarray
from torch import Tensor

from df.enhance import enhance, init_df, load_audio


def save_audio_with_fallback(
    file: str,
    audio: Union[Tensor, ndarray],
    sr: int,
    dtype=torch.float32,
):
    """
    Save audio with soundfile fallback for better compatibility.
    
    This function ensures audio is saved correctly even if torchaudio.save()
    fails, by falling back to soundfile.write(). This prevents distortion
    issues that can occur with different torchaudio versions.
    
    Args:
        file: Output file path
        audio: Audio tensor/array of shape [C, T]
        sr: Sample rate
        dtype: Output dtype (torch.float32 recommended to avoid conversion issues)
    """
    audio = torch.as_tensor(audio)
    if audio.ndim == 1:
        audio = audio.unsqueeze(0)
    
    # Ensure float32 format for saving (prevents int16 conversion distortion)
    if dtype == torch.float32 and audio.dtype != torch.float32:
        if audio.dtype == torch.int16:
            audio = audio.to(torch.float32) / (1 << 15)
        else:
            audio = audio.to(torch.float32)
    
    # Try torchaudio.save, fallback to soundfile if it fails
    try:
        ta.save(file, audio, sr)
    except (ImportError, RuntimeError, AttributeError) as e:
        # Fallback to soundfile for saving (more reliable for float32 audio)
        import soundfile as sf
        
        # Convert tensor to numpy: [C, T] -> [T, C]
        audio_np = audio.t().cpu().numpy()
        if audio_np.shape[1] == 1:
            audio_np = audio_np.squeeze(1)  # Remove channel dimension if mono
        
        # Ensure values are in valid range for soundfile
        audio_np = np.clip(audio_np, -1.0, 1.0)
        
        sf.write(file, audio_np, sr, subtype='PCM_32')  # Use 32-bit float


import sys
from pathlib import Path

def get_df_model_path() -> str:
    """
    Resolve DeepFilterNet model path.
    Prioritizes bundled assets in PyInstaller _MEIPASS, falls back to default.
    """
    # Check if running in PyInstaller bundle
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        base_path = Path(sys._MEIPASS)
        bundled_model_path = base_path / 'df_assets' / 'DeepFilterNet2'
        
        if bundled_model_path.exists():
            # print(f"[DEBUG] Using bundled DeepFilterNet model at: {bundled_model_path}", file=sys.stderr)
            return str(bundled_model_path)
        else:
            print(f"ERROR|Bundled DeepFilterNet assets not found at: {bundled_model_path}", file=sys.stderr)
            # Fail hard if we expect to be standalone but assets are missing
            raise FileNotFoundError(f"Bundled assets missing: {bundled_model_path}")
            
    return None  # Let init_df use default logic (system cache)

def run(input_path: str, output_path: str) -> None:
    """
    Apply noise reduction to an audio file using DeepFilterNet.
    
    Uses DeepFilterNet2 model with explicit path resolution for standalone support.
    """
    if not os.path.exists(input_path):
        print(f"ERROR|Input file not found: {input_path}", file=sys.stderr)
        return

    try:
        # Step 1: Model Initialization
        model_path = get_df_model_path()
        
        # init_df(model_base_dir=...) allows loading from a specific directory
        # If model_path is None, it defaults to looking in system cache/downloading
        model, df_state, _ = init_df(default_model='DeepFilterNet2', model_base_dir=model_path)
        
        # Step 2: Audio Loading
        audio, _ = load_audio(input_path, sr=df_state.sr())
        
        # Step 3: Process with DeepFilterNet
        enhanced = enhance(model, df_state, audio)
        
        # Step 4: Normalize audio to prevent clipping and distortion
        max_val = torch.abs(enhanced).max()
        if max_val > 1.0:
            # Normalize to [-1.0, 1.0] range if it exceeds
            enhanced = enhanced / max_val
        else:
            # Clip any values that might be slightly outside range
            enhanced = torch.clamp(enhanced, -1.0, 1.0)
        
        # Step 5: Save enhanced audio using custom function with soundfile fallback
        save_audio_with_fallback(output_path, enhanced, df_state.sr(), dtype=torch.float32)
        
        # Step 6: Notify completion
        print(f"RESULT_SAVED|{output_path}", flush=True)

    except Exception as e:
        # Catch and print explicit error for the runner to parse
        print(f"ERROR|Noise reduction failed: {str(e)}", file=sys.stderr)
        # Also print detailed traceback to stderr for debugging
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Apply noise reduction to audio file')
    parser.add_argument('input', help='Input audio file path')
    parser.add_argument('output', help='Output audio file path')
    args = parser.parse_args()
    
    run(args.input, args.output)
