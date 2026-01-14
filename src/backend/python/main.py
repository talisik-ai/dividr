"""
DiviDr Tools - Unified media processing binary
Supports transcription and noise reduction via CLI subcommands

Usage:
    dividr-tools transcribe --input <file> --output <file> [options]
    dividr-tools transcribe --input <file> --output - [options]  # stdout
    dividr-tools noise-reduce --input <file> --output <file> [options]
    dividr-tools --version
"""

import argparse
import json
import sys
from scripts import transcribe, noisereduction

__version__ = "1.0.0"


def main():
    parser = argparse.ArgumentParser(
        prog="dividr-tools",
        description="DiviDr unified media processing tools"
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}"
    )

    subparsers = parser.add_subparsers(
        dest="command",
        title="commands",
        description="Available commands",
        help="Run 'dividr-tools <command> --help' for more info"
    )

    # =========================================================================
    # Transcribe subcommand
    # =========================================================================
    transcribe_parser = subparsers.add_parser(
        "transcribe",
        help="Transcribe audio/video files using Faster-Whisper"
    )
    transcribe_parser.add_argument(
        "--input",
        required=True,
        help="Path to input audio/video file"
    )
    transcribe_parser.add_argument(
        "--output",
        required=True,
        help="Path to output JSON file (use '-' for stdout)"
    )
    transcribe_parser.add_argument(
        "--model",
        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3"],
        default="large-v3",
        help="Whisper model size (default: large-v3)"
    )
    transcribe_parser.add_argument(
        "--language",
        default=None,
        help="Language code (e.g., 'en', 'es'). Auto-detect if not specified"
    )
    transcribe_parser.add_argument(
        "--translate",
        action="store_true",
        help="Translate to English"
    )
    transcribe_parser.add_argument(
        "--device",
        choices=["cpu", "cuda"],
        default="cpu",
        help="Device to use (default: cpu)"
    )
    transcribe_parser.add_argument(
        "--compute-type",
        choices=["int8", "int16", "float16", "float32"],
        default="int8",
        help="Compute type (default: int8)"
    )
    transcribe_parser.add_argument(
        "--beam-size",
        type=int,
        default=5,
        help="Beam size for decoding (default: 5)"
    )
    transcribe_parser.add_argument(
        "--no-vad",
        action="store_true",
        help="Disable voice activity detection"
    )

    # =========================================================================
    # Noise-reduce subcommand
    # =========================================================================
    noise_parser = subparsers.add_parser(
        "noise-reduce",
        help="Reduce background noise from audio files"
    )
    noise_parser.add_argument(
        "--input",
        required=True,
        help="Path to input audio file (.wav format recommended)"
    )
    noise_parser.add_argument(
        "--output",
        required=True,
        help="Path to output audio file (.wav format)"
    )
    noise_parser.add_argument(
        "--stationary",
        action="store_true",
        default=True,
        help="Assume noise is stationary (default: True)"
    )
    noise_parser.add_argument(
        "--non-stationary",
        action="store_false",
        dest="stationary",
        help="Assume noise is non-stationary"
    )
    noise_parser.add_argument(
        "--prop-decrease",
        type=float,
        default=0.8,
        help="Proportion of noise to reduce (0.0-1.0, default: 0.8)"
    )
    noise_parser.add_argument(
        "--n-fft",
        type=int,
        default=2048,
        help="FFT window size (default: 2048)"
    )

    # Parse arguments
    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    # Route to appropriate handler
    try:
        if args.command == "transcribe":
            # Build kwargs for transcribe
            transcribe_kwargs = {
                "model_size": args.model,
                "device": args.device,
                "compute_type": args.compute_type.replace("-", "_"),
                "beam_size": args.beam_size,
                "vad_filter": not args.no_vad,
            }
            if args.language:
                transcribe_kwargs["language"] = args.language
            if args.translate:
                transcribe_kwargs["translate"] = True

            # Handle stdout output (--output -)
            if args.output == "-":
                # Call transcribe_audio directly and print RESULT| to stdout
                result = transcribe.transcribe_audio(args.input, **transcribe_kwargs)
                result_json = json.dumps(result)
                print(f"RESULT|{result_json}", flush=True)
            else:
                # Save to file using run()
                transcribe.run(args.input, args.output, **transcribe_kwargs)

        elif args.command == "noise-reduce":
            noisereduction.run(
                args.input,
                args.output
            )
        else:
            print(f"Unknown command: {args.command}", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"ERROR|{str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
