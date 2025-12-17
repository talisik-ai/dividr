"""
Noise Reduction Script for Dividr
Reduces background noise from audio files using noisereduce library
"""

import sys
from pathlib import Path
from typing import Optional

try:
    import noisereduce as nr
    import soundfile as sf
    import numpy as np
except ImportError as e:
    print(f"Error: Required dependencies not installed. Please install: pip install noisereduce soundfile numpy", file=sys.stderr)
    sys.exit(1)


class NoiseReductionError(Exception):
    """Base exception for noise reduction errors"""
    pass


class FileNotFoundError(NoiseReductionError):
    """Raised when input file is not found"""
    pass


def run(input_path: str, output_path: str, **kwargs) -> None:
    """
    Reduce background noise from an audio file.
    
    Args:
        input_path: Path to input audio file (.wav format)
        output_path: Path to output audio file (.wav format)
        **kwargs: Optional keyword arguments:
            - stationary: bool (default: True) - Whether noise is stationary
            - prop_decrease: float (default: 0.8) - Proportion of noise to reduce (0.0-1.0)
            - n_fft: int (default: 2048) - FFT window size
            - win_length: Optional[int] (default: None) - Window length
            - hop_length: Optional[int] (default: None) - Hop length
    
    Raises:
        FileNotFoundError: If input file doesn't exist
        NoiseReductionError: If noise reduction fails
        ImportError: If required dependencies are not installed
    
    Example:
        >>> from scripts.noisereduction import run
        >>> run("noisy_audio.wav", "clean_audio.wav")
        >>> run("noisy_audio.wav", "clean_audio.wav", prop_decrease=0.9)
    """
    # Validate input file
    input_file = Path(input_path)
    if not input_file.exists():
        raise FileNotFoundError(f"Input audio file not found: {input_path}")
    
    if not input_file.is_file():
        raise FileNotFoundError(f"Path is not a file: {input_path}")
    
    # Check file extension (noisereduce works best with .wav)
    if not input_file.suffix.lower() == '.wav':
        print(f"Warning: Input file is not .wav format ({input_file.suffix}). Results may vary.", file=sys.stderr)
    
    # Extract noise reduction parameters from kwargs, with defaults
    noise_reduction_kwargs = {
        "stationary": kwargs.get("stationary", True),
        "prop_decrease": kwargs.get("prop_decrease", 0.8),
        "n_fft": kwargs.get("n_fft", 2048),
        "win_length": kwargs.get("win_length", None),
        "hop_length": kwargs.get("hop_length", None),
    }
    
    try:
        # Load audio file
        print(f"Loading audio from: {input_path}", flush=True)
        audio, sample_rate = sf.read(str(input_file))
        
        # Handle stereo audio - convert to mono if needed
        if len(audio.shape) > 1 and audio.shape[1] > 1:
            print(f"Audio is stereo ({audio.shape[1]} channels), converting to mono...", flush=True)
            audio = audio.mean(axis=1)  # Average channels to mono
        
        print(f"Audio loaded: {len(audio)} samples at {sample_rate} Hz", flush=True)
        
        # Validate audio length
        if len(audio) < 100:
            raise NoiseReductionError(f"Audio file is too short ({len(audio)} samples). Minimum 100 samples required.")
        
        # Ensure n_fft is not larger than audio length
        audio_length = len(audio)
        if noise_reduction_kwargs["n_fft"] > audio_length:
            print(f"Warning: n_fft ({noise_reduction_kwargs['n_fft']}) is larger than audio length ({audio_length}). Adjusting...", flush=True)
            # Use a power of 2 that's smaller than audio length
            noise_reduction_kwargs["n_fft"] = 2 ** int(np.log2(audio_length))
            print(f"Using n_fft: {noise_reduction_kwargs['n_fft']}", flush=True)
        
        # Remove None values from kwargs to let noisereduce use its defaults
        noise_reduction_kwargs_clean = {k: v for k, v in noise_reduction_kwargs.items() if v is not None}
        
        # Apply noise reduction
        print("Applying noise reduction...", flush=True)
        reduced_noise = nr.reduce_noise(
            y=audio,
            sr=sample_rate,
            **noise_reduction_kwargs_clean
        )
        
        # Ensure output directory exists
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Save the cleaned audio
        print(f"Saving cleaned audio to: {output_path}", flush=True)
        sf.write(str(output_file), reduced_noise, sample_rate)
        
        print(f"RESULT_SAVED|{output_path}", flush=True)
        print(f"✅ Noise reduction complete! Saved to {output_path}", flush=True)
        
    except Exception as e:
        error_msg = f"Noise reduction failed: {str(e)}"
        print(f"ERROR|{error_msg}", file=sys.stderr, flush=True)
        raise NoiseReductionError(error_msg) from e


def main():
    """Main entry point for CLI"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Reduce background noise from audio files"
    )
    
    parser.add_argument(
        "input_path",
        type=str,
        help="Path to input audio file (.wav format)"
    )
    
    parser.add_argument(
        "output_path",
        type=str,
        help="Path to output audio file (.wav format)"
    )
    
    parser.add_argument(
        "--stationary",
        action="store_true",
        default=True,
        help="Assume noise is stationary (default: True)"
    )
    
    parser.add_argument(
        "--non-stationary",
        action="store_false",
        dest="stationary",
        help="Assume noise is non-stationary"
    )
    
    parser.add_argument(
        "--prop-decrease",
        type=float,
        default=0.8,
        help="Proportion of noise to reduce (0.0-1.0, default: 0.8)"
    )
    
    parser.add_argument(
        "--n-fft",
        type=int,
        default=2048,
        help="FFT window size (default: 2048)"
    )
    
    args = parser.parse_args()
    
    try:
        run(
            input_path=args.input_path,
            output_path=args.output_path,
            stationary=args.stationary,
            prop_decrease=args.prop_decrease,
            n_fft=args.n_fft
        )
    except FileNotFoundError as e:
        print(f"ERROR|{str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)
    except NoiseReductionError as e:
        print(f"ERROR|{str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR|Unexpected error: {str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
