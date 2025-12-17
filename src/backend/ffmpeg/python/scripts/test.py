"""
Faster Whisper Test with Progress Indicators
Shows real-time progress during transcription
"""

from faster_whisper import WhisperModel
import time
import os
import sys

def print_progress(message):
    """Print with flush for immediate display"""
    print(message, flush=True)

def test_whisper(audio_file, model_size="base"):
    """
    Test Faster Whisper with your audio file
    
    Model sizes (from fastest to most accurate):
    - tiny: Fastest, least accurate (~1GB RAM)
    - base: Fast, good accuracy (~1GB RAM)  ← RECOMMENDED FOR TESTING
    - small: Balanced (~2GB RAM)
    - medium: Slower, better (~5GB RAM)
    - large-v3: Slowest, best accuracy (~10GB RAM)
    """
    
    # Check if file exists
    if not os.path.exists(audio_file):
        print_progress(f"❌ Error: Audio file not found: {audio_file}")
        print_progress("\nPlease:")
        print_progress("1. Place an audio file (MP3, WAV, M4A, etc.) in this folder")
        print_progress("2. Update the 'audio_file' variable below with your filename")
        return
    
    print_progress("=" * 60)
    print_progress(f"🎤 Faster Whisper Test (Model: {model_size})")
    print_progress("=" * 60)
    print_progress(f"\n📁 Audio file: {audio_file}")
    print_progress(f"📊 File size: {os.path.getsize(audio_file) / 1024:.1f} KB")
    
    print_progress(f"\n⏳ Loading '{model_size}' model...")
    print_progress("   (First run downloads model, please wait...)")
    
    load_start = time.time()
    
    # Load model
    model = WhisperModel(
        model_size,
        device="cpu",
        compute_type="int8",
        num_workers=4  # Use multiple CPU cores
    )
    
    load_time = time.time() - load_start
    print_progress(f"✅ Model loaded in {load_time:.1f} seconds!\n")
    
    print_progress("🎯 Starting transcription...")
    print_progress("   💡 Progress will show below as segments are processed")
    print_progress("-" * 60)
    
    start_time = time.time()
    
    # Transcribe with progress
    segments, info = model.transcribe(
        audio_file,
        beam_size=5,
        language=None,
        vad_filter=True,
        word_timestamps=True,  # Enable word-level timestamps
        condition_on_previous_text=False  # Slightly faster
    )
    
    # Print info
    print_progress(f"\n🌍 Language: {info.language} ({info.language_probability:.1%} confidence)")
    print_progress(f"⏱️  Duration: {info.duration:.2f}s\n")
    
    print_progress("📝 Transcription (processing in real-time):")
    print_progress("=" * 60)
    
    # Process segments as they come
    segment_count = 0
    for segment in segments:
        segment_count += 1
        timestamp = f"[{segment.start:6.2f}s → {segment.end:6.2f}s]"
        print_progress(f"\n{timestamp} {segment.text.strip()}")
        
        # Show word-level timestamps
        if segment.words:
            print_progress("   Words:")
            for word in segment.words:
                word_time = f"[{word.start:.2f}s → {word.end:.2f}s]"
                print_progress(f"      {word_time} {word.word}")
        
        # Show progress indicator
        if segment_count % 5 == 0:
            elapsed = time.time() - start_time
            print_progress(f"   ... processed {segment_count} segments in {elapsed:.1f}s ...")
    
    if segment_count == 0:
        print_progress("⚠️  No speech detected in audio file")
    
    print_progress("=" * 60)
    
    elapsed_time = time.time() - start_time
    print_progress(f"\n✅ Completed! {segment_count} segments transcribed")
    print_progress(f"⏱️  Total time: {elapsed_time:.2f} seconds")
    
    if info.duration > 0:
        rtf = elapsed_time / info.duration
        print_progress(f"⚡ Speed: {rtf:.2f}x real-time")
        if rtf < 1:
            print_progress(f"   🚀 Faster than real-time!")
    
    print_progress("\n" + "=" * 60)

if __name__ == "__main__":
    # ========================================
    # CONFIGURATION
    # ========================================
    
    audio_file = "C:/Users/Nelson/Downloads/What’s the best way to lift people out of poverty_mp3/audio.mp3"  # ← CHANGE THIS to your audio file
    
    # Choose model size (IMPORTANT FOR SPEED):
    model_size = "base"  # ← Start with "base" for testing (fast!)
    
    # Other options:
    # model_size = "tiny"      # Fastest (30 seconds for 1 min audio)
    # model_size = "base"      # Fast and accurate (1-2 min for 1 min audio)
    # model_size = "small"     # Balanced (2-3 min for 1 min audio)
    # model_size = "medium"    # Slow but accurate (5-10 min for 1 min audio)
    # model_size = "large-v3"  # Slowest, best quality (10-20 min for 1 min audio)
    
    print_progress("\n🚀 Starting Faster Whisper Test\n")
    
    if not os.path.exists(audio_file):
        print_progress(f"⚠️  File not found: {audio_file}\n")
        print_progress("Quick test: Place any audio file here and update the filename above!")
        print_progress("\nSupported formats: MP3, WAV, M4A, FLAC, OGG, WEBM, etc.")
    else:
        test_whisper(audio_file, model_size)
    
    print_progress("\n💡 Tips:")
    print_progress(f"   - Current model: '{model_size}'")
    print_progress("   - For faster results: Use 'tiny' or 'base' model")
    print_progress("   - For best accuracy: Use 'large-v3' model (much slower)")
    print_progress("   - Stuck? Try a smaller model size first!")
    print_progress("   - GPU available? Change device='cpu' to device='cuda'")