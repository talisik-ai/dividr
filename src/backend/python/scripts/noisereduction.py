"""
Noise Reduction Script for Dividr
Reduces background noise from audio files using noisereduce library
"""

import json
import sys
from pathlib import Path
from typing import Optional, Callable

try:
    import soundfile as sf
    import numpy as np
except ImportError as e:
    print(f"Error: Required dependencies not installed. Please install: pip install soundfile numpy", file=sys.stderr)
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


def denoise_with_fft(
    audio: np.ndarray,
    sample_rate: int,
    noise_sample_duration: float = 0.1,
    n_fft: int = 2048,
    hop_length: Optional[int] = None,
    alpha: float = 2.0,
    beta: float = 0.01
) -> np.ndarray:
    """
    Denoise audio using Fourier Transform spectral subtraction.
    
    This algorithm:
    1. Samples the first portion of audio (default 0.1s) as noise reference
    2. Computes the average noise spectrum using FFT
    3. Processes the entire audio in overlapping windows
    4. Subtracts the noise spectrum from each window's spectrum
    5. Keeps only frequencies where signal > noise threshold
    
    Args:
        audio: Input audio array (mono, 1D numpy array)
        sample_rate: Sample rate in Hz
        noise_sample_duration: Duration in seconds to use as noise reference (default: 0.1)
        n_fft: FFT window size (default: 2048)
        hop_length: Hop length for STFT (default: n_fft // 4)
        alpha: Oversubtraction factor - how aggressively to subtract noise (default: 2.0)
        beta: Spectral floor factor - minimum gain to prevent over-suppression (default: 0.01)
    
    Returns:
        Denoised audio array with same shape as input
    """
    if len(audio) == 0:
        return audio
    
    # Ensure audio is 1D
    if len(audio.shape) > 1:
        audio = audio.flatten()
    
    # Calculate noise sample length
    noise_sample_length = int(noise_sample_duration * sample_rate)
    noise_sample_length = min(noise_sample_length, len(audio) // 4)  # Use at most 25% of audio
    
    if noise_sample_length < n_fft:
        # If noise sample is too short, adjust n_fft
        n_fft = 2 ** int(np.log2(noise_sample_length))
        n_fft = max(64, n_fft)  # Minimum FFT size
    
    # Extract noise reference from the beginning of the audio
    noise_reference = audio[:noise_sample_length]
    
    # Set hop length (overlap of 75% for smooth reconstruction)
    if hop_length is None:
        hop_length = n_fft // 4
    
    # Compute noise spectrum using FFT
    # Use multiple windows from noise reference and average them
    noise_spectrum_magnitude = np.zeros(n_fft // 2 + 1, dtype=np.float64)
    num_noise_windows = 0
    
    for i in range(0, len(noise_reference) - n_fft, hop_length):
        noise_window = noise_reference[i:i + n_fft]
        # Apply window function (Hanning) to reduce spectral leakage
        window = np.hanning(len(noise_window))
        noise_window_windowed = noise_window * window
        
        # Compute FFT
        noise_fft = np.fft.rfft(noise_window_windowed, n=n_fft)
        noise_magnitude = np.abs(noise_fft)
        
        # Accumulate magnitude spectrum
        noise_spectrum_magnitude += noise_magnitude
        num_noise_windows += 1
    
    if num_noise_windows > 0:
        # Average the noise spectrum
        noise_spectrum_magnitude = noise_spectrum_magnitude / num_noise_windows
    else:
        # Fallback: use single FFT of entire noise reference
        window = np.hanning(len(noise_reference))
        noise_windowed = noise_reference * window
        # Pad to n_fft if needed
        if len(noise_windowed) < n_fft:
            noise_windowed = np.pad(noise_windowed, (0, n_fft - len(noise_windowed)))
        noise_fft = np.fft.rfft(noise_windowed[:n_fft], n=n_fft)
        noise_spectrum_magnitude = np.abs(noise_fft)
    
    # Add small epsilon to avoid division by zero
    noise_spectrum_magnitude = np.maximum(noise_spectrum_magnitude, 1e-10)
    
    # Process entire audio using Short-Time Fourier Transform (STFT)
    # Compute STFT of the full audio
    num_frames = (len(audio) - n_fft) // hop_length + 1
    num_freq_bins = n_fft // 2 + 1
    
    # Initialize output spectrum
    stft_denoised = np.zeros((num_freq_bins, num_frames), dtype=complex)
    
    # Process each frame
    for frame_idx in range(num_frames):
        start_sample = frame_idx * hop_length
        end_sample = start_sample + n_fft
        
        if end_sample > len(audio):
            # Pad last frame if needed
            frame = np.pad(audio[start_sample:], (0, end_sample - len(audio)))
        else:
            frame = audio[start_sample:end_sample]
        
        # Apply window function
        window = np.hanning(len(frame))
        frame_windowed = frame * window
        
        # Compute FFT
        frame_fft = np.fft.rfft(frame_windowed, n=n_fft)
        frame_magnitude = np.abs(frame_fft)
        frame_phase = np.angle(frame_fft)
        
        # Spectral subtraction: subtract noise spectrum from signal spectrum
        # Gain function: G(k) = max(beta, 1 - alpha * |N(k)| / |X(k)|)
        # where N(k) is noise spectrum and X(k) is signal spectrum
        gain = 1.0 - alpha * (noise_spectrum_magnitude / np.maximum(frame_magnitude, 1e-10))
        gain = np.maximum(beta, gain)  # Apply spectral floor
        
        # Apply gain to magnitude, keep phase
        denoised_magnitude = frame_magnitude * gain
        stft_denoised[:, frame_idx] = denoised_magnitude * np.exp(1j * frame_phase)
    
    # Reconstruct audio using inverse STFT (overlap-add)
    denoised_audio = np.zeros(len(audio))
    window_sum = np.zeros(len(audio))
    
    for frame_idx in range(num_frames):
        start_sample = frame_idx * hop_length
        
        # Inverse FFT
        frame_reconstructed = np.fft.irfft(stft_denoised[:, frame_idx], n=n_fft)
        
        # Apply window again for overlap-add
        window = np.hanning(len(frame_reconstructed))
        frame_windowed = frame_reconstructed * window
        
        # Add to output with overlap
        end_sample = min(start_sample + len(frame_windowed), len(denoised_audio))
        frame_length = end_sample - start_sample
        
        denoised_audio[start_sample:end_sample] += frame_windowed[:frame_length]
        window_sum[start_sample:end_sample] += window[:frame_length]
    
    # Normalize by window sum to account for overlap
    window_sum = np.maximum(window_sum, 1e-10)  # Avoid division by zero
    denoised_audio = denoised_audio / window_sum
    
    # Ensure output length matches input
    denoised_audio = denoised_audio[:len(audio)]
    
    return denoised_audio


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
            - stationary: bool (default: True) - Unused, stored for backward compatibility
            - prop_decrease: float (default: 0.8) - Unused, stored for backward compatibility
            - n_fft: int (default: 2048) - FFT window size
            - win_length: Optional[int] (default: None) - Unused, stored for backward compatibility
            - hop_length: Optional[int] (default: None) - Hop length for STFT (default: n_fft // 4)
            - noise_sample_duration: float (default: 0.1) - Duration in seconds to use as noise reference
            - alpha: float (default: 2.0) - Oversubtraction factor (higher = more aggressive noise removal)
            - beta: float (default: 0.01) - Spectral floor factor (minimum gain to prevent over-suppression)

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

    # Check file extension
    if not input_file.suffix.lower() == '.wav':
        print(f"Warning: Input file is not .wav format ({input_file.suffix}). Results may vary.", file=sys.stderr)

    # Extract noise reduction parameters from kwargs, with defaults
    # Store all original kwargs for backward compatibility (some may be unused)
    noise_reduction_kwargs = {
        "stationary": kwargs.get("stationary", True),  # Unused but stored for compatibility
        "prop_decrease": kwargs.get("prop_decrease", 0.8),  # Unused but stored for compatibility
        "n_fft": kwargs.get("n_fft", 2048),
        "win_length": kwargs.get("win_length", None),  # Unused but stored for compatibility
        "hop_length": kwargs.get("hop_length", None),
        "noise_sample_duration": kwargs.get("noise_sample_duration", 0.1),
        "alpha": kwargs.get("alpha", 2.0),  # Oversubtraction factor
        "beta": kwargs.get("beta", 0.01),   # Spectral floor factor
    }
    
    # Extract parameters used by FFT-based denoising
    n_fft = noise_reduction_kwargs["n_fft"]
    hop_length = noise_reduction_kwargs["hop_length"]
    noise_sample_duration = noise_reduction_kwargs["noise_sample_duration"]
    alpha = noise_reduction_kwargs["alpha"]
    beta = noise_reduction_kwargs["beta"]

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
        if n_fft > audio_length:
            report_progress("loading", 25, f"Adjusting FFT window size for audio length...")
            # Use a power of 2 that's smaller than audio length
            n_fft = 2 ** int(np.log2(audio_length))
            n_fft = max(64, n_fft)  # Minimum FFT size

        report_progress("loading", 30, "Audio preprocessing complete")

        # Stage 2: Apply FFT-based noise reduction
        report_progress("processing", 30, "Sampling noise reference from first 0.1 seconds...")
        report_progress("processing", 40, "Applying FFT-based spectral subtraction denoising...")
        reduced_noise = denoise_with_fft(
            audio=audio,
            sample_rate=sample_rate,
            noise_sample_duration=noise_sample_duration,
            n_fft=n_fft,
            hop_length=hop_length,
            alpha=alpha,
            beta=beta
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
        help="Assume noise is stationary (default: True, stored for compatibility)"
    )

    parser.add_argument(
        "--non-stationary",
        action="store_false",
        dest="stationary",
        help="Assume noise is non-stationary (stored for compatibility)"
    )

    parser.add_argument(
        "--prop-decrease",
        type=float,
        default=0.8,
        help="Proportion of noise to reduce (0.0-1.0, default: 0.8, stored for compatibility)"
    )

    parser.add_argument(
        "--n-fft",
        type=int,
        default=2048,
        help="FFT window size (default: 2048)"
    )

    parser.add_argument(
        "--noise-sample-duration",
        type=float,
        default=0.1,
        help="Duration in seconds to use as noise reference from start of audio (default: 0.1)"
    )

    parser.add_argument(
        "--alpha",
        type=float,
        default=2.0,
        help="Oversubtraction factor - higher values remove more noise but may cause artifacts (default: 2.0)"
    )

    parser.add_argument(
        "--beta",
        type=float,
        default=0.01,
        help="Spectral floor factor - minimum gain to prevent over-suppression (default: 0.01)"
    )

    args = parser.parse_args()

    try:
        run(
            input_path=args.input_path,
            output_path=args.output_path,
            stationary=args.stationary,
            prop_decrease=args.prop_decrease,
            n_fft=args.n_fft,
            noise_sample_duration=args.noise_sample_duration,
            alpha=args.alpha,
            beta=args.beta
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
