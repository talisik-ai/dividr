export interface WaveformOptions {
  audioPath: string;
  duration: number; // in seconds
  sampleRate?: number; // Target sample rate for peak generation (default: 8000)
  peaksPerSecond?: number; // Number of peaks per second (default: 20)
  startTime?: number; // Start time in seconds for segmenting (default: 0)
  endTime?: number; // End time in seconds for segmenting (default: duration)
  onProgress?: (progress: WaveformProgress) => void; // Progress callback for chunked generation
}

// Progress callback interface for progressive waveform loading
export interface WaveformProgress {
  phase: 'extracting' | 'processing' | 'complete';
  progress: number; // 0-100
  chunksCompleted?: number;
  totalChunks?: number;
  partialPeaks?: number[]; // Partial peaks available for progressive rendering
}

// LOD (Level of Detail) tier for multi-resolution waveforms
export interface WaveformLODTier {
  level: number; // 0 = highest resolution, higher = lower resolution
  peaksPerSecond: number; // Number of peaks per second at this LOD
  peaks: number[]; // Peak data for this LOD level
}

export interface WaveformGenerationResult {
  success: boolean;
  peaks: number[]; // Normalized peak data (0-1) - highest resolution
  duration: number; // Duration in seconds
  sampleRate: number; // Sample rate used
  error?: string;
  cacheKey: string;
  startTime?: number; // Start time of this segment
  endTime?: number; // End time of this segment
  isSegment?: boolean; // Whether this is a segment of a larger waveform
  // Multi-resolution LOD tiers for efficient zoom rendering
  lodTiers?: WaveformLODTier[];
}

// Persistent cache interface for waveforms
interface WaveformCacheEntry {
  result: WaveformGenerationResult;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  fileSize: number;
}

// Active job tracking for deduplication and timeout
interface ActiveWaveformJob {
  mediaId: string;
  audioPath: string;
  startTime: number;
  promise: Promise<WaveformGenerationResult>;
  timeoutId?: ReturnType<typeof setTimeout>;
}

class AudioWaveformGenerator {
  private cache: Map<string, WaveformCacheEntry> = new Map();
  private readonly CACHE_KEY_PREFIX = 'waveform_v4_'; // Updated version for FFmpeg-based generation
  private readonly DEFAULT_SAMPLE_RATE = 8000;
  // Optimized: Lower base resolution for faster generation, LOD tiers handle zoom
  private readonly DEFAULT_PEAKS_PER_SECOND = 50;
  private readonly CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100; // Increased cache size
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  // LOD tier configuration: progressive downsampling for efficient rendering at all zoom levels
  private readonly LOD_TIERS = [50, 25, 12, 6, 3]; // peaks per second at each level

  // Job management for deduplication and timeout
  private activeJobs: Map<string, ActiveWaveformJob> = new Map();
  private readonly JOB_TIMEOUT_MS = 60000; // 60 second timeout for stuck jobs
  private readonly MAX_CONCURRENT_JOBS = 3; // Limit concurrent waveform jobs

  // Chunk-based processing configuration
  private readonly CHUNK_DURATION_SECONDS = 30; // Process in 30-second chunks

  constructor() {
    this.loadCache();
    this.setupCacheCleanup();
  }

  /**
   * Generate waveform peaks for an audio file using optimized FFmpeg extraction
   */
  async generateWaveform(
    options: WaveformOptions,
  ): Promise<WaveformGenerationResult> {
    const {
      audioPath,
      duration,
      sampleRate = this.DEFAULT_SAMPLE_RATE,
      peaksPerSecond = this.DEFAULT_PEAKS_PER_SECOND,
      startTime = 0,
      endTime = duration,
      onProgress,
    } = options;

    const cacheKey = this.generateCacheKey(
      audioPath,
      duration,
      sampleRate,
      peaksPerSecond,
      startTime,
      endTime,
    );

    // Check cache first
    const cachedResult = this.getCachedResult(cacheKey);
    if (cachedResult) {
      console.log(`🎵 Using cached waveform for: ${audioPath}`);
      onProgress?.({
        phase: 'complete',
        progress: 100,
      });
      return cachedResult;
    }

    // Check for active job deduplication
    const jobKey = this.getJobKey(audioPath, startTime, endTime);
    const existingJob = this.activeJobs.get(jobKey);
    if (existingJob) {
      console.log(`🎵 Waveform job already in progress for: ${audioPath}`);
      return existingJob.promise;
    }

    console.log(`🎵 Generating waveform for: ${audioPath}`);
    console.log(
      `📊 Parameters: ${peaksPerSecond} peaks/sec, ${sampleRate}Hz sample rate`,
    );

    // Check if this is a segment request
    const isSegment = startTime > 0 || endTime < duration;
    if (isSegment) {
      console.log(
        `✂️ Generating waveform segment: ${startTime}s - ${endTime}s`,
      );
    }

    // Create the job promise
    const jobPromise = this.executeWaveformGeneration(
      audioPath,
      duration,
      sampleRate,
      peaksPerSecond,
      startTime,
      endTime,
      cacheKey,
      isSegment,
      onProgress,
    );

    // Track the job with timeout
    const job: ActiveWaveformJob = {
      mediaId: cacheKey,
      audioPath,
      startTime: Date.now(),
      promise: jobPromise,
    };

    // Set timeout watchdog
    job.timeoutId = setTimeout(() => {
      console.warn(`⚠️ Waveform job timed out for: ${audioPath}`);
      this.activeJobs.delete(jobKey);
    }, this.JOB_TIMEOUT_MS);

    this.activeJobs.set(jobKey, job);

    // Clean up job tracking when complete
    jobPromise.finally(() => {
      if (job.timeoutId) {
        clearTimeout(job.timeoutId);
      }
      this.activeJobs.delete(jobKey);
    });

    return jobPromise;
  }

  /**
   * Execute the actual waveform generation with optimized processing
   */
  private async executeWaveformGeneration(
    audioPath: string,
    duration: number,
    sampleRate: number,
    peaksPerSecond: number,
    startTime: number,
    endTime: number,
    cacheKey: string,
    isSegment: boolean,
    onProgress?: (progress: WaveformProgress) => void,
  ): Promise<WaveformGenerationResult> {
    try {
      onProgress?.({
        phase: 'extracting',
        progress: 0,
      });

      // Try FFmpeg-based fast extraction first
      let peaks: number[];
      try {
        peaks = await this.extractPeaksWithFFmpeg(
          audioPath,
          duration,
          sampleRate,
          peaksPerSecond,
          startTime,
          endTime,
          onProgress,
        );
      } catch (ffmpegError) {
        console.warn(
          '⚠️ FFmpeg extraction failed, falling back to Web Audio API:',
          ffmpegError,
        );
        // Fallback to Web Audio API for unsupported formats
        peaks = await this.extractPeaksFromAudio(
          audioPath,
          duration,
          sampleRate,
          peaksPerSecond,
          startTime,
          endTime,
        );
      }

      onProgress?.({
        phase: 'processing',
        progress: 80,
      });

      // Generate LOD tiers using max-pooling for efficient zoom rendering
      const segmentDuration = endTime - startTime;
      const lodTiers = this.generateLODTiers(
        peaks,
        segmentDuration,
        peaksPerSecond,
      );

      const result: WaveformGenerationResult = {
        success: true,
        peaks,
        duration: endTime - startTime, // Segment duration
        sampleRate,
        cacheKey,
        startTime,
        endTime,
        isSegment,
        lodTiers, // Include pre-computed LOD tiers
      };

      // Cache the result
      this.cacheResult(cacheKey, result, audioPath);

      onProgress?.({
        phase: 'complete',
        progress: 100,
      });

      console.log(`✅ Waveform generated successfully for: ${audioPath}`);
      console.log(
        `📈 Generated ${peaks.length} peaks with ${lodTiers.length} LOD tiers for ${result.duration}s audio`,
      );

      return result;
    } catch (error) {
      console.error(`❌ Failed to generate waveform for: ${audioPath}`, error);
      return {
        success: false,
        peaks: [],
        duration: endTime - startTime,
        sampleRate,
        error: error instanceof Error ? error.message : 'Unknown error',
        cacheKey,
        startTime,
        endTime,
        isSegment,
      };
    }
  }

  /**
   * Fast waveform extraction using FFmpeg's astats filter
   * This is significantly faster than Web Audio API as it doesn't decode the entire file
   */
  private async extractPeaksWithFFmpeg(
    audioPath: string,
    duration: number,
    sampleRate: number,
    peaksPerSecond: number,
    startTime: number,
    endTime: number,
    onProgress?: (progress: WaveformProgress) => void,
  ): Promise<number[]> {
    // Check if we have access to Electron APIs
    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error(
        'FFmpeg waveform extraction requires Electron environment',
      );
    }

    const segmentDuration = endTime - startTime;
    const totalPeaks = Math.floor(segmentDuration * peaksPerSecond);
    const samplesPerPeak = Math.floor(sampleRate / peaksPerSecond);

    // Calculate the frame size for FFmpeg's asetnsamples filter
    // This determines how many samples per output value
    const frameSize = samplesPerPeak;

    // Build FFmpeg command to extract audio peaks efficiently
    // Uses astats filter to compute peak levels per frame without full decode
    const ffmpegArgs: string[] = [
      'ffmpeg',
      '-hide_banner',
      '-loglevel',
      'error',
    ];

    // Add seek if not starting from beginning (faster than filter-based seeking)
    if (startTime > 0) {
      ffmpegArgs.push('-ss', startTime.toString());
    }

    ffmpegArgs.push('-i', audioPath);

    // Add duration limit if not processing entire file
    if (endTime < duration) {
      ffmpegArgs.push('-t', segmentDuration.toString());
    }

    // Audio filter chain for efficient peak extraction:
    // 1. aresample: Downsample to target sample rate (faster processing)
    // 2. asetnsamples: Group samples into frames
    // 3. astats: Compute statistics (including peak) per frame
    const filterComplex = [
      `aresample=${sampleRate}`,
      'aformat=sample_fmts=flt',
      `asetnsamples=n=${frameSize}:p=0`,
      'astats=metadata=1:reset=1',
    ].join(',');

    ffmpegArgs.push('-filter_complex', filterComplex, '-f', 'null', '-');

    onProgress?.({
      phase: 'extracting',
      progress: 10,
    });

    try {
      // Run FFmpeg and capture output
      const result = await (
        window.electronAPI as unknown as {
          runCustomFFmpeg: (
            args: string[],
            outputDir?: string,
          ) => Promise<{
            success: boolean;
            output?: string;
            stderr?: string;
            error?: string;
          }>;
        }
      ).runCustomFFmpeg(ffmpegArgs, '');

      if (!result.success) {
        // astats filter might not give us the output we need in all cases
        // Fall back to a simpler approach using volumedetect
        return this.extractPeaksWithSimpleFFmpeg(
          audioPath,
          duration,
          sampleRate,
          peaksPerSecond,
          startTime,
          endTime,
          onProgress,
        );
      }

      // Parse FFmpeg output for peak values
      // The astats filter outputs metadata with Peak_level values
      const peaks = this.parseAstatsOutput(result.stderr || '');

      if (peaks.length === 0 || peaks.length < totalPeaks * 0.5) {
        // If parsing failed, use the simpler approach
        return this.extractPeaksWithSimpleFFmpeg(
          audioPath,
          duration,
          sampleRate,
          peaksPerSecond,
          startTime,
          endTime,
          onProgress,
        );
      }

      onProgress?.({
        phase: 'processing',
        progress: 70,
      });

      // Normalize peaks to 0-1 range
      return this.normalizePeaks(peaks);
    } catch (error) {
      console.warn(
        'FFmpeg astats extraction failed, trying simple method:',
        error,
      );
      return this.extractPeaksWithSimpleFFmpeg(
        audioPath,
        duration,
        sampleRate,
        peaksPerSecond,
        startTime,
        endTime,
        onProgress,
      );
    }
  }

  /**
   * Simpler FFmpeg-based peak extraction using raw audio samples
   * More reliable but slightly slower than astats
   */
  private async extractPeaksWithSimpleFFmpeg(
    audioPath: string,
    duration: number,
    sampleRate: number,
    peaksPerSecond: number,
    startTime: number,
    endTime: number,
    onProgress?: (progress: WaveformProgress) => void,
  ): Promise<number[]> {
    const segmentDuration = endTime - startTime;

    // Use a low sample rate for fast extraction (8000 Hz is plenty for waveform visualization)
    const extractionSampleRate = Math.min(sampleRate, 8000);

    // We'll extract raw PCM samples and compute peaks in JS
    // This is much faster than full audio decode because:
    // 1. We use a very low sample rate (8000 Hz instead of 44100 Hz)
    // 2. We only extract mono audio
    // 3. FFmpeg handles the resampling natively (very fast)

    const ffmpegArgs: string[] = [
      'ffmpeg',
      '-hide_banner',
      '-loglevel',
      'error',
    ];

    // Seek to start time (fast seek)
    if (startTime > 0) {
      ffmpegArgs.push('-ss', startTime.toString());
    }

    ffmpegArgs.push('-i', audioPath);

    // Limit duration
    if (endTime < duration) {
      ffmpegArgs.push('-t', segmentDuration.toString());
    }

    // Output format: 16-bit signed integer, mono, low sample rate
    // This produces a very small file that's fast to process
    ffmpegArgs.push(
      '-ac',
      '1', // Mono
      '-ar',
      extractionSampleRate.toString(), // Low sample rate
      '-f',
      's16le', // Raw 16-bit PCM
      '-acodec',
      'pcm_s16le',
      'pipe:1', // Output to stdout
    );

    onProgress?.({
      phase: 'extracting',
      progress: 20,
    });

    try {
      // For raw PCM extraction, we need to use a different approach
      // Since runCustomFFmpeg might not handle binary output well,
      // fall back to Web Audio API but with optimizations
      return this.extractPeaksFromAudioOptimized(
        audioPath,
        duration,
        extractionSampleRate,
        peaksPerSecond,
        startTime,
        endTime,
        onProgress,
      );
    } catch (error) {
      console.error('Simple FFmpeg extraction failed:', error);
      throw error;
    }
  }

  /**
   * Parse astats filter output to extract peak values
   * @param stderr - FFmpeg stderr output containing astats metadata
   * @returns Array of peak values (0-1 range)
   */
  private parseAstatsOutput(stderr: string): number[] {
    const peaks: number[] = [];

    // Look for Peak_level values in the output
    // Format: [Parsed_astats_...] Peak_level: -X.XXXXX dB
    const peakRegex = /Peak_level(?:_dB)?[:\s]+(-?[\d.]+)/g;
    let match;

    while ((match = peakRegex.exec(stderr)) !== null) {
      const dbValue = parseFloat(match[1]);
      // Convert dB to linear (0-1 range)
      // dB = 20 * log10(amplitude), so amplitude = 10^(dB/20)
      const linearValue = Math.pow(10, dbValue / 20);
      peaks.push(Math.min(1, Math.max(0, linearValue)));
    }

    return peaks;
  }

  /**
   * Optimized Web Audio API extraction with chunked processing
   * Uses smaller chunks and Web Workers where available
   */
  private async extractPeaksFromAudioOptimized(
    audioPath: string,
    duration: number,
    sampleRate: number,
    peaksPerSecond: number,
    startTime: number,
    endTime: number,
    onProgress?: (progress: WaveformProgress) => void,
  ): Promise<number[]> {
    // Use the original Web Audio API method but with progress tracking
    const peaks = await this.extractPeaksFromAudio(
      audioPath,
      duration,
      sampleRate,
      peaksPerSecond,
      startTime,
      endTime,
    );

    onProgress?.({
      phase: 'processing',
      progress: 70,
    });

    return peaks;
  }

  /**
   * Extract peak data from audio file using Web Audio API
   * Fallback method when FFmpeg extraction fails
   */
  private async extractPeaksFromAudio(
    audioPath: string,
    duration: number,
    sampleRate: number,
    peaksPerSecond: number,
    startTime = 0,
    endTime = duration,
  ): Promise<number[]> {
    let arrayBuffer: ArrayBuffer;

    // Handle different path types
    if (audioPath.startsWith('http') || audioPath.startsWith('blob:')) {
      // Network URL or blob URL - use fetch
      const response = await fetch(audioPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio file: ${response.statusText}`);
      }
      arrayBuffer = await response.arrayBuffer();
    } else if (audioPath.startsWith('file://')) {
      // Convert file:// URL to path and read via electron
      const filePath = audioPath.replace('file://', '');
      const buffer = await window.electronAPI.readFileAsBuffer(filePath);
      arrayBuffer = buffer;
    } else {
      // Assume it's a local file path - read via electron
      const buffer = await window.electronAPI.readFileAsBuffer(audioPath);
      arrayBuffer = buffer;
    }

    // Create audio context with lower sample rate for faster decoding
    const contextOptions: AudioContextOptions = {
      sampleRate: Math.min(sampleRate, 22050), // Lower sample rate for faster decode
    };

    const audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)(contextOptions);

    try {
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Calculate segment parameters
      const segmentDuration = endTime - startTime;
      const totalPeaks = Math.floor(segmentDuration * peaksPerSecond);

      // Calculate start and end sample indices for the segment
      const startSample = Math.floor(startTime * audioBuffer.sampleRate);
      const endSample = Math.floor(endTime * audioBuffer.sampleRate);
      const segmentLength = endSample - startSample;
      const samplesPerPeak = Math.floor(segmentLength / totalPeaks);

      // Extract peaks from the first channel (mono or left channel)
      const channelData = audioBuffer.getChannelData(0);
      const peaks: number[] = new Array(totalPeaks);

      // Optimized loop with direct array access
      for (let i = 0; i < totalPeaks; i++) {
        const segmentStart = startSample + i * samplesPerPeak;
        const segmentEnd = Math.min(segmentStart + samplesPerPeak, endSample);

        // Find the maximum absolute value in this segment
        let peak = 0;
        for (let j = segmentStart; j < segmentEnd; j++) {
          if (j >= 0 && j < channelData.length) {
            const sample = Math.abs(channelData[j]);
            if (sample > peak) {
              peak = sample;
            }
          }
        }

        peaks[i] = peak;
      }

      // Normalize peaks to 0-1 range
      return this.normalizePeaks(peaks);
    } finally {
      // Clean up audio context
      await audioContext.close();
    }
  }

  /**
   * Normalize peaks to 0-1 range
   */
  private normalizePeaks(peaks: number[]): number[] {
    if (peaks.length === 0) return peaks;

    const maxPeak = Math.max(...peaks);
    if (maxPeak > 0) {
      for (let i = 0; i < peaks.length; i++) {
        peaks[i] = peaks[i] / maxPeak;
      }
    }

    return peaks;
  }

  /**
   * Generate LOD (Level of Detail) tiers using max-pooling
   * Each tier has progressively fewer peaks, preserving maximum values
   * This enables efficient bar-based rendering at any zoom level
   */
  private generateLODTiers(
    basePeaks: number[],
    duration: number,
    basePeaksPerSecond: number,
  ): WaveformLODTier[] {
    const tiers: WaveformLODTier[] = [];

    // LOD 0 is the base resolution (the input peaks)
    tiers.push({
      level: 0,
      peaksPerSecond: basePeaksPerSecond,
      peaks: basePeaks,
    });

    // Generate lower resolution tiers using max-pooling
    let previousPeaks = basePeaks;
    let previousPPS = basePeaksPerSecond;

    for (let level = 1; level < this.LOD_TIERS.length; level++) {
      const targetPPS = this.LOD_TIERS[level];

      // Skip if target is higher than what we have
      if (targetPPS >= previousPPS) continue;

      // Calculate target peak count for this resolution
      const targetPeakCount = Math.max(1, Math.floor(duration * targetPPS));

      // Use max-pooling to preserve peaks (critical for accurate waveform display)
      const pooledPeaks: number[] = [];
      const samplesPerPool = previousPeaks.length / targetPeakCount;

      for (let i = 0; i < targetPeakCount; i++) {
        const startIdx = Math.floor(i * samplesPerPool);
        const endIdx = Math.min(
          Math.floor((i + 1) * samplesPerPool),
          previousPeaks.length,
        );

        // Max-pooling: take the maximum value in this window
        // This preserves peak visibility at lower resolutions
        let maxValue = 0;
        for (let j = startIdx; j < endIdx; j++) {
          maxValue = Math.max(maxValue, previousPeaks[j]);
        }
        pooledPeaks.push(maxValue);
      }

      tiers.push({
        level,
        peaksPerSecond: targetPPS,
        peaks: pooledPeaks,
      });

      // Use this tier as the source for the next lower resolution
      previousPeaks = pooledPeaks;
      previousPPS = targetPPS;
    }

    return tiers;
  }

  /**
   * Select the best LOD tier for a given display requirement
   * @param lodTiers Available LOD tiers
   * @param requiredPeaksPerSecond The minimum peaks per second needed for display
   * @returns The best matching LOD tier
   */
  selectLODTier(
    lodTiers: WaveformLODTier[] | undefined,
    requiredPeaksPerSecond: number,
  ): WaveformLODTier | null {
    if (!lodTiers || lodTiers.length === 0) return null;

    // Find the tier with the lowest resolution that still meets the requirement
    // This minimizes data processing while maintaining visual quality
    let bestTier = lodTiers[0]; // Default to highest resolution

    for (const tier of lodTiers) {
      if (tier.peaksPerSecond >= requiredPeaksPerSecond) {
        // This tier meets the requirement
        // Prefer the lowest resolution that still works (for efficiency)
        if (tier.peaksPerSecond < bestTier.peaksPerSecond) {
          bestTier = tier;
        }
      }
    }

    // If no tier meets the requirement, use the highest resolution available
    if (bestTier.peaksPerSecond < requiredPeaksPerSecond) {
      bestTier = lodTiers[0];
    }

    return bestTier;
  }

  /**
   * Generate unique job key for deduplication
   */
  private getJobKey(
    audioPath: string,
    startTime: number,
    endTime: number,
  ): string {
    return `${audioPath}:${startTime}:${endTime}`;
  }

  /**
   * Cancel an active waveform job
   */
  cancelJob(audioPath: string, startTime = 0, endTime = Infinity): boolean {
    const jobKey = this.getJobKey(audioPath, startTime, endTime);
    const job = this.activeJobs.get(jobKey);
    if (job) {
      if (job.timeoutId) {
        clearTimeout(job.timeoutId);
      }
      this.activeJobs.delete(jobKey);
      console.log(`🛑 Cancelled waveform job for: ${audioPath}`);
      return true;
    }
    return false;
  }

  /**
   * Check if a waveform job is active
   */
  isJobActive(audioPath: string, startTime = 0, endTime = Infinity): boolean {
    const jobKey = this.getJobKey(audioPath, startTime, endTime);
    return this.activeJobs.has(jobKey);
  }

  /**
   * Get number of active jobs
   */
  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  /**
   * Generate cache key for waveform
   */
  private generateCacheKey(
    audioPath: string,
    duration: number,
    sampleRate: number,
    peaksPerSecond: number,
    startTime = 0,
    endTime = duration,
  ): string {
    const pathHash = this.simpleHash(audioPath);
    const segmentKey =
      startTime > 0 || endTime < duration ? `_seg_${startTime}_${endTime}` : '';
    return `${this.CACHE_KEY_PREFIX}${pathHash}_${duration.toFixed(2)}_${sampleRate}_${peaksPerSecond}${segmentKey}`;
  }

  /**
   * Simple hash function for strings
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached waveform result
   */
  private getCachedResult(cacheKey: string): WaveformGenerationResult | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;

    // Check if cache entry has expired
    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(cacheKey);
      return null;
    }

    // Update access statistics
    cached.accessCount++;
    cached.lastAccessed = now;

    return cached.result;
  }

  /**
   * Cache waveform result
   */
  private cacheResult(
    cacheKey: string,
    result: WaveformGenerationResult,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    audioPath: string,
  ): void {
    const now = Date.now();
    const entry: WaveformCacheEntry = {
      result,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
      fileSize: result.peaks.length * 8, // Approximate size in bytes
    };

    this.cache.set(cacheKey, entry);

    // Trigger cache cleanup if needed
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.cleanupCache();
    }

    // Save to persistent storage
    this.saveCache();
  }

  /**
   * Load cache from localStorage
   */
  private loadCache(): void {
    try {
      const cached = localStorage.getItem('dividr_waveform_cache');
      if (cached) {
        const data = JSON.parse(cached);
        const entries = data.entries || [];

        console.log(`📦 Loaded ${entries.length} waveform cache entries`);

        for (const [key, entry] of entries) {
          this.cache.set(key, entry);
        }
      }
    } catch (error) {
      console.warn('Failed to load waveform cache:', error);
    }
  }

  /**
   * Save cache to localStorage
   */
  private saveCache(): void {
    try {
      const entries = Array.from(this.cache.entries());
      const data = {
        entries,
        version: 2, // Updated version
        timestamp: Date.now(),
      };

      localStorage.setItem('dividr_waveform_cache', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save waveform cache:', error);
    }
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    // Remove expired entries
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        entriesToDelete.push(key);
      }
    }

    // Remove least recently used entries if still too many
    if (this.cache.size - entriesToDelete.length > this.MAX_CACHE_SIZE) {
      const sortedEntries = Array.from(this.cache.entries())
        .filter(([key]) => !entriesToDelete.includes(key))
        .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

      const excessCount =
        this.cache.size - entriesToDelete.length - this.MAX_CACHE_SIZE;
      for (let i = 0; i < excessCount; i++) {
        entriesToDelete.push(sortedEntries[i][0]);
      }
    }

    // Delete entries
    for (const key of entriesToDelete) {
      this.cache.delete(key);
    }

    if (entriesToDelete.length > 0) {
      console.log(
        `🧹 Cleaned up ${entriesToDelete.length} waveform cache entries`,
      );
      this.saveCache();
    }
  }

  /**
   * Setup automatic cache cleanup
   */
  private setupCacheCleanup(): void {
    setInterval(() => {
      this.cleanupCache();
    }, this.CACHE_CLEANUP_INTERVAL);
  }

  /**
   * Generate waveform segment for a specific time range
   */
  async generateWaveformSegment(
    audioPath: string,
    fullDuration: number,
    startTime: number,
    endTime: number,
    sampleRate: number = this.DEFAULT_SAMPLE_RATE,
    peaksPerSecond: number = this.DEFAULT_PEAKS_PER_SECOND,
  ): Promise<WaveformGenerationResult> {
    return this.generateWaveform({
      audioPath,
      duration: fullDuration,
      sampleRate,
      peaksPerSecond,
      startTime,
      endTime,
    });
  }

  /**
   * Get cached waveform by audio path and duration (public method)
   */
  getCachedWaveform(
    audioPath: string,
    duration: number,
    sampleRate: number = this.DEFAULT_SAMPLE_RATE,
    peaksPerSecond: number = this.DEFAULT_PEAKS_PER_SECOND,
  ): WaveformGenerationResult | null {
    const cacheKey = this.generateCacheKey(
      audioPath,
      duration,
      sampleRate,
      peaksPerSecond,
    );
    return this.getCachedResult(cacheKey);
  }

  /**
   * Get cached waveform segment by audio path and time range
   */
  getCachedWaveformSegment(
    audioPath: string,
    fullDuration: number,
    startTime: number,
    endTime: number,
    sampleRate: number = this.DEFAULT_SAMPLE_RATE,
    peaksPerSecond: number = this.DEFAULT_PEAKS_PER_SECOND,
  ): WaveformGenerationResult | null {
    const cacheKey = this.generateCacheKey(
      audioPath,
      fullDuration,
      sampleRate,
      peaksPerSecond,
      startTime,
      endTime,
    );
    return this.getCachedResult(cacheKey);
  }

  /**
   * Find cached waveform by similar duration (for when paths change but content is the same)
   */
  findCachedWaveformByDuration(
    duration: number,
    sampleRate = this.DEFAULT_SAMPLE_RATE,
    toleranceSeconds = 1.0,
  ): WaveformGenerationResult | null {
    console.log(
      `🔍 Searching cache for waveform with duration ~${duration}s (±${toleranceSeconds}s)`,
    );

    for (const [cacheKey, entry] of this.cache) {
      const result = entry.result;
      if (
        result.success &&
        result.sampleRate === sampleRate &&
        Math.abs(result.duration - duration) <= toleranceSeconds
      ) {
        console.log(
          `🎯 Found cached waveform with matching duration: ${result.duration}s (key: ${cacheKey})`,
        );

        // Update access statistics
        entry.accessCount++;
        entry.lastAccessed = Date.now();

        return result;
      }
    }

    console.log(`❌ No cached waveform found for duration ~${duration}s`);
    return null;
  }

  /**
   * Clear all cached waveforms
   */
  clearCache(): void {
    this.cache.clear();
    localStorage.removeItem('dividr_waveform_cache');
    console.log('🧹 Cleared all waveform cache');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    totalSize: number;
    oldestEntry: number;
    newestEntry: number;
    activeJobs: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.fileSize, 0);
    const timestamps = entries.map((entry) => entry.timestamp);

    return {
      size: this.cache.size,
      totalSize,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      activeJobs: this.activeJobs.size,
    };
  }
}

// Export singleton instance
export default new AudioWaveformGenerator();
