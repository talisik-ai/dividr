"""
Faster-Whisper Transcription Script for Dividr
Provides word-level transcription with real-time progress updates
Outputs structured JSON for Electron integration

Can be used as a callable function or CLI script:
    # As a library function:
    from transcribe import transcribe_audio
    result = transcribe_audio("audio.mp3", model_size="large-v3")
    
    # As a CLI script:
    python transcribe.py audio.mp3 --model large-v3
"""

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, List, Any, Optional, Callable

try:
    from faster_whisper import WhisperModel
except ImportError:
    # Only exit if running as CLI, otherwise raise exception for library use
    if __name__ == "__main__":
        print(json.dumps({
            "error": "faster-whisper not installed",
            "message": "Please install: pip install faster-whisper",
            "type": "dependency_error"
        }), flush=True)
        sys.exit(1)
    else:
        WhisperModel = None  # Will raise ImportError when used


# Custom exceptions for better error handling
class TranscriptionError(Exception):
    """Base exception for transcription errors"""
    pass


class FileNotFoundError(TranscriptionError):
    """Raised when audio file is not found"""
    pass


class ModelLoadError(TranscriptionError):
    """Raised when model fails to load"""
    pass


def log_progress(stage: str, progress: float, message: str = ""):
    """
    Send progress updates to stdout in JSON format
    Format: PROGRESS|{json_data}
    """
    progress_data = {
        "stage": stage,
        "progress": min(100, max(0, progress)),
        "message": message
    }
    print(f"PROGRESS|{json.dumps(progress_data)}", flush=True)


def log_error(error_type: str, message: str, details: str = ""):
    """Send error information to stdout in JSON format"""
    error_data = {
        "error": error_type,
        "message": message,
        "details": details,
        "type": "transcription_error"
    }
    print(json.dumps(error_data), flush=True)


def transcribe_audio(
    audio_path: str,
    model_size: str = "large-v3",
    language: Optional[str] = None,
    translate: bool = False,
    device: str = "cpu",
    compute_type: str = "int8",
    beam_size: int = 5,
    vad_filter: bool = True,
    on_progress: Optional[Callable[[str, float, str], None]] = None,
) -> Dict[str, Any]:
    """
    Transcribe audio file using Faster-Whisper
    
    This function can be called programmatically or used via CLI.
    It raises exceptions instead of calling sys.exit() for better library usage.
    
    Args:
        audio_path: Path to audio file
        model_size: Model size (tiny, base, small, medium, large-v3)
        language: Language code (None for auto-detect)
        translate: Translate to English
        device: cpu or cuda
        compute_type: int8, int16, float16, float32
        beam_size: Beam search size (higher = more accurate but slower)
        vad_filter: Use Voice Activity Detection to filter silence
        on_progress: Optional callback function(stage, progress, message) for progress updates.
                     If None, uses default stdout logging for CLI compatibility.
    
    Returns:
        Dictionary with transcription results containing:
        - success: bool
        - segments: List of segment dicts with start, end, text, words
        - language: Detected language code
        - language_probability: Confidence score
        - duration: Audio duration in seconds
        - text: Full transcription text
        - processing_time: Time taken in seconds
        - model: Model size used
        - device: Device used
        - segment_count: Number of segments
        - real_time_factor: Processing speed ratio
        - faster_than_realtime: bool
    
    Raises:
        FileNotFoundError: If audio file doesn't exist
        ModelLoadError: If model fails to load
        TranscriptionError: If transcription fails
        ImportError: If faster-whisper is not installed
    
    Example:
        >>> from transcribe import transcribe_audio
        >>> result = transcribe_audio("audio.mp3", model_size="large-v3")
        >>> print(result["text"])
    """
    
    # Check if faster-whisper is available
    if WhisperModel is None:
        raise ImportError(
            "faster-whisper not installed. Please install: pip install faster-whisper"
        )
    
    # Use default progress logging if no callback provided (CLI mode)
    progress_callback = on_progress if on_progress is not None else log_progress
    
    # Validate audio file
    audio_file = Path(audio_path)
    if not audio_file.exists():
        error_msg = f"Audio file not found: {audio_path}"
        if on_progress is None:
            log_error("file_not_found", error_msg)
        raise FileNotFoundError(error_msg)
    
    if not audio_file.is_file():
        error_msg = f"Path is not a file: {audio_path}"
        if on_progress is None:
            log_error("invalid_path", error_msg)
        raise FileNotFoundError(error_msg)
    
    # Log initial progress
    progress_callback("loading", 0, f"Loading {model_size} model...")
    
    try:
        # Load model
        load_start = time.time()
        model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            num_workers=4  # Use multiple CPU cores
        )
        load_time = time.time() - load_start
        
        progress_callback("loading", 10, f"Model loaded in {load_time:.1f}s")
        
    except Exception as e:
        error_msg = f"Failed to load model: {str(e)}"
        if on_progress is None:
            log_error("model_load_error", error_msg, str(e))
        raise ModelLoadError(error_msg) from e
    
    # Start transcription
    progress_callback("processing", 15, "Starting transcription...")
    
    try:
        start_time = time.time()
        
        # Transcribe with word-level timestamps
        segments_generator, info = model.transcribe(
            str(audio_file),
            beam_size=beam_size,
            language=language,
            vad_filter=vad_filter,
            word_timestamps=True,  # Enable word-level timestamps
            condition_on_previous_text=False,  # Slightly faster and more consistent
            task="translate" if translate else "transcribe"
        )
        
        # Log detected language
        progress_callback(
            "processing",
            20,
            f"Language: {info.language} ({info.language_probability:.1%} confidence)"
        )
        
        # Process segments
        segments_list = []
        segment_count = 0
        total_duration = info.duration if hasattr(info, 'duration') else 0
        
        for segment in segments_generator:
            segment_count += 1
            
            # Build word list with timestamps
            words = []
            if segment.words:
                for word in segment.words:
                    words.append({
                        "word": word.word.strip(),
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                        "confidence": round(word.probability, 3)
                    })
            
            # Build segment object
            segment_obj = {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text.strip(),
                "words": words
            }
            segments_list.append(segment_obj)
            
            # Calculate progress based on segment end time
            if total_duration > 0:
                progress = 20 + (segment.end / total_duration) * 70
                progress_callback(
                    "processing",
                    progress,
                    f"Processed {segment_count} segments..."
                )
        
        elapsed_time = time.time() - start_time
        
        # Build full text
        full_text = " ".join(seg["text"] for seg in segments_list)
        
        # Calculate final duration from last segment
        final_duration = segments_list[-1]["end"] if segments_list else 0
        
        # Build result
        result = {
            "success": True,
            "segments": segments_list,
            "language": info.language,
            "language_probability": round(info.language_probability, 3),
            "duration": round(final_duration, 3),
            "text": full_text,
            "processing_time": round(elapsed_time, 2),
            "model": model_size,
            "device": device,
            "segment_count": segment_count
        }
        
        # Add performance metrics
        if final_duration > 0:
            rtf = elapsed_time / final_duration
            result["real_time_factor"] = round(rtf, 3)
            result["faster_than_realtime"] = bool(rtf < 1.0)
        
        progress_callback("complete", 100, f"Transcription complete! {segment_count} segments")
        
        return result
        
    except (FileNotFoundError, ModelLoadError):
        # Re-raise our custom exceptions
        raise
    except Exception as e:
        error_msg = f"Transcription failed: {str(e)}"
        if on_progress is None:
            log_error("transcription_error", error_msg, str(e))
        raise TranscriptionError(error_msg) from e


def run(input_path: str, output_path: str, **kwargs) -> None:
   
    # Extract transcription parameters from kwargs, with defaults
    transcribe_kwargs = {
        "model_size": kwargs.get("model_size", "large-v3"),
        "language": kwargs.get("language", None),
        "translate": kwargs.get("translate", False),
        "device": kwargs.get("device", "cpu"),
        "compute_type": kwargs.get("compute_type", "int8"),
        "beam_size": kwargs.get("beam_size", 5),
        "vad_filter": kwargs.get("vad_filter", True),
        "on_progress": kwargs.get("on_progress", None),
    }
    
    # Run transcription
    result = transcribe_audio(input_path, **transcribe_kwargs)
    
    # Save result to output file
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)  # Create parent directories if needed
    output_file.write_text(json.dumps(result, indent=2), encoding="utf-8")
    
    # Print success message (for compatibility with main.py output expectations)
    print(f"RESULT_SAVED|{output_path}", flush=True)


def main():
    """Main entry point for CLI"""
    parser = argparse.ArgumentParser(
        description="Transcribe audio using Faster-Whisper"
    )
    
    # Required arguments
    parser.add_argument(
        "audio_path",
        type=str,
        help="Path to audio file"
    )
    
    # Optional arguments
    parser.add_argument(
        "--model",
        type=str,
        default="large-v3",
        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3"],
        help="Model size (default: large-v3)"
    )
    
    parser.add_argument(
        "--language",
        type=str,
        default=None,
        help="Language code (e.g., 'en', 'es', 'fr'). Auto-detect if not specified."
    )
    
    parser.add_argument(
        "--translate",
        action="store_true",
        help="Translate to English"
    )
    
    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        choices=["cpu", "cuda"],
        help="Device to use (default: cpu)"
    )
    
    parser.add_argument(
        "--compute-type",
        type=str,
        default="int8",
        choices=["int8", "int16", "float16", "float32"],
        help="Compute type (default: int8)"
    )
    
    parser.add_argument(
        "--beam-size",
        type=int,
        default=5,
        help="Beam size for search (default: 5)"
    )
    
    parser.add_argument(
        "--no-vad",
        action="store_true",
        help="Disable Voice Activity Detection"
    )
    
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output JSON file path (optional, prints to stdout if not specified)"
    )
    
    args = parser.parse_args()
    
    # Run transcription
    result = transcribe_audio(
        audio_path=args.audio_path,
        model_size=args.model,
        language=args.language,
        translate=args.translate,
        device=args.device,
        compute_type=args.compute_type,
        beam_size=args.beam_size,
        vad_filter=not args.no_vad
    )
    
    # Output result (no indentation for single-line output)
    result_json = json.dumps(result)
    
    if args.output:
        output_path = Path(args.output)
        # Save with indentation for readability
        output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"RESULT_SAVED|{args.output}", flush=True)
    else:
        # Print result to stdout with marker (single line to avoid parsing issues)
        print(f"RESULT|{result_json}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log_error("cancelled", "Transcription cancelled by user")
        sys.exit(130)
    except FileNotFoundError as e:
        log_error("file_not_found", str(e))
        sys.exit(1)
    except ModelLoadError as e:
        log_error("model_load_error", str(e))
        sys.exit(1)
    except TranscriptionError as e:
        log_error("transcription_error", str(e))
        sys.exit(1)
    except Exception as e:
        log_error("unknown_error", f"Unexpected error: {str(e)}", str(e))
        sys.exit(1)

