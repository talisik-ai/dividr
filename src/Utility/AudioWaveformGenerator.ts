export interface WaveformOptions {
  audioPath: string;
  duration: number; // in seconds
  sampleRate?: number; // Target sample rate for peak generation (default: 8000)
  peaksPerSecond?: number; // Number of peaks per second (default: 20)
}

export interface WaveformGenerationResult {
  success: boolean;
  peaks: number[]; // Normalized peak data (0-1)
  duration: number; // Duration in seconds
  sampleRate: number; // Sample rate used
  error?: string;
  cacheKey: string;
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
    } = options;

    const cacheKey = this.generateCacheKey(
      audioPath,
      duration,
      sampleRate,
      peaksPerSecond,
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

    try {
      // Use Web Audio API to analyze the audio file
      const peaks = await this.extractPeaksFromAudio(
        audioPath,
        duration,
        sampleRate,
        peaksPerSecond,
      );

      const result: WaveformGenerationResult = {
        success: true,
        peaks,
        duration,
        sampleRate,
        cacheKey,
      };

      // Cache the result
      this.cacheResult(cacheKey, result, audioPath);

      console.log(`✅ Waveform generated successfully for: ${audioPath}`);
      console.log(`📈 Generated ${peaks.length} peaks for ${duration}s audio`);

      return result;
    } catch (error) {
      console.error(`❌ Failed to generate waveform for: ${audioPath}`, error);
      return {
        success: false,
        peaks: [],
        duration,
        sampleRate,
        error: error instanceof Error ? error.message : 'Unknown error',
        cacheKey,
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
  ): Promise<number[]> {
    // Check if we're dealing with a URL (preview URL) or file path
    const audioUrl = audioPath.startsWith('http')
      ? audioPath
      : `file://${audioPath}`;

    // Fetch the audio file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    // Create audio context
    const audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();

    try {
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Calculate number of peaks needed
      const totalPeaks = Math.floor(duration * peaksPerSecond);
      const samplesPerPeak = Math.floor(audioBuffer.length / totalPeaks);

      // Extract peaks from the first channel (mono or left channel)
      const channelData = audioBuffer.getChannelData(0);
      const peaks: number[] = [];

      for (let i = 0; i < totalPeaks; i++) {
        const start = i * samplesPerPeak;
        const end = Math.min(start + samplesPerPeak, channelData.length);

        // Find the maximum absolute value in this segment
        let peak = 0;
        for (let j = start; j < end; j++) {
          const sample = Math.abs(channelData[j]);
          if (sample > peak) {
            peak = sample;
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
  ): string {
    const pathHash = this.simpleHash(audioPath);
    return `${this.CACHE_KEY_PREFIX}${pathHash}_${duration}_${sampleRate}_${peaksPerSecond}`;
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
    _audioPath: string,
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
