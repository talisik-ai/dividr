"""
Noise Reduction Script for Dividr
Reduces background noise from audio files using noisereduce library
"""

import json
import sys
from pathlib import Path
from typing import Optional, Callable

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


def log_progress(stage: str, progress: float, message: str = ""):
    """
    Send progress updates to stdout in JSON format
    Format: PROGRESS|{json_data}

    Args:
        stage: Current stage (loading, processing, saving, complete)
        progress: Progress percentage (0-100)
        message: Optional descriptive message
    """
    progress_data = {
        "stage": stage,
        "progress": min(100, max(0, progress)),
        "message": message
    }
    print(f"PROGRESS|{json.dumps(progress_data)}", flush=True)


def run(
    input_path: str,
    output_path: str,
    on_progress: Optional[Callable[[str, float, str], None]] = None,
    **kwargs
) -> None:
    """
    Reduce background noise from an audio file.

    Args:
        input_path: Path to input audio file (.wav format)
        output_path: Path to output audio file (.wav format)
        on_progress: Optional callback for progress updates (stage, progress, message)
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
    def report_progress(stage: str, progress: float, message: str = ""):
        """Report progress via callback or stdout"""
        log_progress(stage, progress, message)
        if on_progress:
            on_progress(stage, progress, message)

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
        # Stage 1: Loading audio file
        report_progress("loading", 0, f"Loading audio from: {input_path}")
        audio, sample_rate = sf.read(str(input_file))

        # Handle stereo audio - convert to mono if needed
        if len(audio.shape) > 1 and audio.shape[1] > 1:
            report_progress("loading", 10, f"Converting stereo ({audio.shape[1]} channels) to mono...")
            audio = audio.mean(axis=1)  # Average channels to mono

        report_progress("loading", 20, f"Audio loaded: {len(audio)} samples at {sample_rate} Hz")

        # Validate audio length
        if len(audio) < 100:
            raise NoiseReductionError(f"Audio file is too short ({len(audio)} samples). Minimum 100 samples required.")

        # Ensure n_fft is not larger than audio length
        audio_length = len(audio)
        if noise_reduction_kwargs["n_fft"] > audio_length:
            report_progress("loading", 25, f"Adjusting FFT window size for audio length...")
            # Use a power of 2 that's smaller than audio length
            noise_reduction_kwargs["n_fft"] = 2 ** int(np.log2(audio_length))

        # Remove None values from kwargs to let noisereduce use its defaults
        noise_reduction_kwargs_clean = {k: v for k, v in noise_reduction_kwargs.items() if v is not None}

        report_progress("loading", 30, "Audio preprocessing complete")

        # Stage 2: Apply noise reduction
        report_progress("processing", 30, "Applying noise reduction algorithm...")
        reduced_noise = nr.reduce_noise(
            y=audio,
            sr=sample_rate,
            **noise_reduction_kwargs_clean
        )

        report_progress("processing", 80, "Noise reduction complete")

        # Stage 3: Save output
        report_progress("saving", 85, "Preparing output file...")
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        report_progress("saving", 90, f"Saving cleaned audio to: {output_path}")
        sf.write(str(output_file), reduced_noise, sample_rate)

        # Stage 4: Complete
        report_progress("complete", 100, f"Noise reduction complete: {output_path}")
        print(f"RESULT_SAVED|{output_path}", flush=True)

    except NoiseReductionError:
        raise
    except Exception as e:
        error_msg = f"Noise reduction failed: {str(e)}"
        log_progress("error", 0, error_msg)
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
