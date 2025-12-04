export interface WaveformOptions {
  audioPath: string;
  duration: number; // in seconds
  sampleRate?: number; // Target sample rate for peak generation (default: 8000)
  peaksPerSecond?: number; // Number of peaks per second (default: 20)
  startTime?: number; // Start time in seconds for segmenting (default: 0)
  endTime?: number; // End time in seconds for segmenting (default: duration)
}

export interface WaveformGenerationResult {
  success: boolean;
  peaks: number[]; // Normalized peak data (0-1)
  duration: number; // Duration in seconds
  sampleRate: number; // Sample rate used
  error?: string;
  cacheKey: string;
  startTime?: number; // Start time of this segment
  endTime?: number; // End time of this segment
  isSegment?: boolean; // Whether this is a segment of a larger waveform
}

// Persistent cache interface for waveforms
interface WaveformCacheEntry {
  result: WaveformGenerationResult;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  fileSize: number;
}

class AudioWaveformGenerator {
  private cache: Map<string, WaveformCacheEntry> = new Map();
  private readonly CACHE_KEY_PREFIX = 'waveform_v1_';
  private readonly DEFAULT_SAMPLE_RATE = 8000;
  private readonly DEFAULT_PEAKS_PER_SECOND = 30; // Increased for better accuracy
  private readonly CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 50;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.loadCache();
    this.setupCacheCleanup();
  }

  /**
   * Generate waveform peaks for an audio file
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
      return cachedResult;
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

    try {
      // Use Web Audio API to analyze the audio file
      const peaks = await this.extractPeaksFromAudio(
        audioPath,
        duration,
        sampleRate,
        peaksPerSecond,
        startTime,
        endTime,
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
      };

      // Cache the result
      this.cacheResult(cacheKey, result, audioPath);

      console.log(`✅ Waveform generated successfully for: ${audioPath}`);
      console.log(
        `📈 Generated ${peaks.length} peaks for ${result.duration}s audio`,
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
   * Extract peak data from audio file using Web Audio API
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

    // Create audio context
    const audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();

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
      const peaks: number[] = [];

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

        peaks.push(peak);
      }

      // Normalize peaks to 0-1 range
      const maxPeak = Math.max(...peaks);
      if (maxPeak > 0) {
        for (let i = 0; i < peaks.length; i++) {
          peaks[i] = peaks[i] / maxPeak;
        }
      }

      return peaks;
    } finally {
      // Clean up audio context
      await audioContext.close();
    }
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
    return `${this.CACHE_KEY_PREFIX}${pathHash}_${duration}_${sampleRate}_${peaksPerSecond}${segmentKey}`;
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
        version: 1,
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
  } {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.fileSize, 0);
    const timestamps = entries.map((entry) => entry.timestamp);

    return {
      size: this.cache.size,
      totalSize,
      oldestEntry: Math.min(...timestamps),
      newestEntry: Math.max(...timestamps),
    };
  }
}

// Export singleton instance
export default new AudioWaveformGenerator();
