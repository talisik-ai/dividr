import argparse
import os
import json
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
    
    Uses DeepFilterNet2 model with automatic audio loading that handles:
    - Compatibility patches for torchaudio 2.x (uses soundfile fallback)
    - Explicit resampling to 48000 Hz
    - Proper PyTorch tensor conversion [C, T] format
    - Audio segmentation into 3-minute chunks to prevent memory issues
    
    Args:
        input_path: Path to input audio file
        output_path: Path to output audio file
    """
    # Step 1: Model Initialization
    print(f"PROGRESS|{json.dumps({'stage': 'loading', 'progress': 0, 'message': 'Initializing model...'})}", flush=True)
    model, df_state, _ = init_df(default_model='DeepFilterNet2')
    
    # Step 2: Audio Loading with explicit resampling to 48kHz
    print(f"PROGRESS|{json.dumps({'stage': 'loading', 'progress': 0, 'message': 'Loading audio...'})}", flush=True)
    target_sample_rate = 48000
    audio, _ = load_audio(input_path, sr=target_sample_rate)
    
    # Step 3: Calculate chunk size (3 minutes = 180 seconds)
    sample_rate = target_sample_rate
    chunk_duration_seconds = 10  # 10 seconds for granular progress
    chunk_size_samples = int(chunk_duration_seconds * sample_rate)
    
    # Get audio dimensions: [C, T]
    num_channels, total_samples = audio.shape
    
    # Step 4: Process audio in chunks if it exceeds chunk size
    # Calculate progress
    if total_samples <= chunk_size_samples:
        # Audio is short enough, process directly
        print(f"PROGRESS|{json.dumps({'stage': 'processing', 'progress': 0, 'message': 'Processing audio...'})}", flush=True)
        enhanced = enhance(model, df_state, audio)
        print(f"PROGRESS|{json.dumps({'stage': 'processing', 'progress': 100, 'message': 'Processing complete'})}", flush=True)
    else:
        # Process in chunks
        enhanced_chunks = []
        num_chunks = (total_samples + chunk_size_samples - 1) // chunk_size_samples
        
        for i in range(num_chunks):
            start_idx = i * chunk_size_samples
            end_idx = min(start_idx + chunk_size_samples, total_samples)
            
            # Calculate progress
            percent = int((i / num_chunks) * 100)
            print(f"PROGRESS|{json.dumps({'stage': 'processing', 'progress': percent, 'message': f'Processing chunk {i+1}/{num_chunks}'})}", flush=True)

            # Extract chunk: [C, T]
            # Slicing tensor references memory, cheap
            audio_chunk = audio[:, start_idx:end_idx]
            
            # Process chunk with DeepFilterNet
            # Clone to ensure contiguous memory if needed? enhance usually handles it
            enhanced_chunk = enhance(model, df_state, audio_chunk)
            
            enhanced_chunks.append(enhanced_chunk)
        
        # Concatenate all processed chunks along time dimension (dim=1)
        enhanced = torch.cat(enhanced_chunks, dim=1)
        print(f"PROGRESS|{json.dumps({'stage': 'processing', 'progress': 100, 'message': 'Merging chunks...'})}", flush=True)
    
    # Step 5: Normalize audio to prevent clipping and distortion
    max_val = torch.abs(enhanced).max()
    if max_val > 1.0:
        # Normalize to [-1.0, 1.0] range if it exceeds
        enhanced = enhanced / max_val
    else:
        # Clip any values that might be slightly outside range
        enhanced = torch.clamp(enhanced, -1.0, 1.0)
    
    # Step 6: Save enhanced audio using custom function with soundfile fallback
    # This ensures compatibility across different DeepFilterNet/torchaudio versions
    save_audio_with_fallback(output_path, enhanced, sample_rate, dtype=torch.float32)
    
    # Step 7: Notify completion (for IPC communication)
    print(f"RESULT_SAVED|{output_path}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Apply noise reduction to audio file')
    parser.add_argument('input', help='Input audio file path')
    parser.add_argument('output', help='Output audio file path')
    args = parser.parse_args()
    
    run(args.input, args.output)
