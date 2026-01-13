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


def run(input_path: str, output_path: str) -> None:
    """
    Apply noise reduction to an audio file using DeepFilterNet.
    
    Uses DeepFilterNet2 model with automatic audio loading that handles:
    - Compatibility patches for torchaudio 2.x (uses soundfile fallback)
    - Automatic resampling to model sample rate (48000 Hz)
    - Proper PyTorch tensor conversion [C, T] format
    
    Args:
        input_path: Path to input audio file
        output_path: Path to output audio file
    """
    # Step 1: Model Initialization
    # Loads DeepFilterNet2 model from ~/.cache/DeepFilterNet/DeepFilterNet2/
    # Initializes STFT/ISTFT processing state and ERB features
    model, df_state, _ = init_df(default_model='DeepFilterNet2')
    
    # Step 2: Audio Loading
    # Uses load_audio which handles soundfile fallback for torchaudio 2.x compatibility
    # Converts to PyTorch tensor format [C, T] and resamples to model's sample rate
    audio, _ = load_audio(input_path, sr=df_state.sr())
    
    # Step 3: Process with DeepFilterNet
    enhanced = enhance(model, df_state, audio)
    
    # Step 4: Normalize audio to prevent clipping and distortion
    # DeepFilterNet output may exceed [-1.0, 1.0] range, causing distortion when saved
    # We normalize by peak value to preserve relative levels while preventing clipping
    max_val = torch.abs(enhanced).max()
    if max_val > 1.0:
        # Normalize to [-1.0, 1.0] range if it exceeds
        enhanced = enhanced / max_val
    else:
        # Clip any values that might be slightly outside range
        enhanced = torch.clamp(enhanced, -1.0, 1.0)
    
    # Step 5: Save enhanced audio using custom function with soundfile fallback
    # This ensures compatibility across different DeepFilterNet/torchaudio versions
    save_audio_with_fallback(output_path, enhanced, df_state.sr(), dtype=torch.float32)
    
    # Step 6: Notify completion (for IPC communication)
    print(f"RESULT_SAVED|{output_path}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Apply noise reduction to audio file')
    parser.add_argument('input', help='Input audio file path')
    parser.add_argument('output', help='Output audio file path')
    args = parser.parse_args()
    
    run(args.input, args.output)
