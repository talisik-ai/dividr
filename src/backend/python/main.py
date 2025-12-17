import argparse
from scripts import transcribe, noisereduction

def main():
    parser = argparse.ArgumentParser(description="Multi-tool Python binary")
    parser.add_argument("command", choices=["transcribe", "noisereduction"], help="Command to run")
    parser.add_argument("--input", required=True, help="Input file path")
    parser.add_argument("--output", required=True, help="Output file path")
    args = parser.parse_args()

    if args.command == "transcribe":
        transcribe.run(args.input, args.output)
    elif args.command == "noisereduction":
        noisereduction.run(args.input, args.output)
    else:
        print(f"Unknown command: {args.command}")

if __name__ == "__main__":
    main()
