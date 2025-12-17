/**
 * SourceRegistry - Global Singleton for Media Decoder Management
 *
 * This service owns ALL video/audio decoders in the application.
 * Key principles:
 * - ONE decoder (HTMLVideoElement) per unique media source
 * - LRU frame cache for decoded frames (ImageBitmap)
 * - Immutable, shareable frames across clips
 * - Last valid frame fallback to prevent black frames
 * - Same-source clips share a single decoder instance
 *
 * This eliminates decoder conflicts when:
 * - Same source is used across multiple tracks
 * - Same source overlaps with itself
 * - Rapid scrubbing across clip boundaries
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SourceConfig {
  sourceId: string;
  url: string;
  fps: number;
}

export interface FrameResult {
  frame: ImageBitmap | null;
  sourceFrame: number;
  isFromCache: boolean;
  isFallback: boolean;
}

interface Source {
  sourceId: string;
  url: string;
  fps: number;
  decoder: HTMLVideoElement;
  frameCache: Map<number, ImageBitmap>;
  lastValidFrame: ImageBitmap | null;
  lastRequestedFrame: number;
  isPreloading: boolean;
  pendingRequests: Map<number, Promise<ImageBitmap | null>>;
  refCount: number;
}

interface AudioSource {
  sourceId: string;
  url: string;
  decoder: HTMLAudioElement;
  refCount: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_CACHE_SIZE = 30; // Frames per source
const SEEK_TOLERANCE = 0.016; // ~1 frame at 60fps
const DECODE_TIMEOUT_MS = 500;
const DEBUG_SOURCE_REGISTRY = false;

function logRegistry(message: string, data?: unknown) {
  if (DEBUG_SOURCE_REGISTRY) {
    console.log(`[SourceRegistry] ${message}`, data || '');
  }
}

// =============================================================================
// LRU CACHE HELPER
// =============================================================================

class LRUFrameCache {
  private cache: Map<number, ImageBitmap>;
  private maxSize: number;

  constructor(maxSize: number = DEFAULT_CACHE_SIZE) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(frameNumber: number): ImageBitmap | undefined {
    const frame = this.cache.get(frameNumber);
    if (frame) {
      // Move to end (most recently used)
      this.cache.delete(frameNumber);
      this.cache.set(frameNumber, frame);
    }
    return frame;
  }

  set(frameNumber: number, frame: ImageBitmap): void {
    // If already exists, update
    if (this.cache.has(frameNumber)) {
      this.cache.delete(frameNumber);
    }
    // Evict oldest if at capacity
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldFrame = this.cache.get(oldestKey);
        oldFrame?.close(); // Release ImageBitmap memory
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(frameNumber, frame);
  }

  has(frameNumber: number): boolean {
    return this.cache.has(frameNumber);
  }

  clear(): void {
    this.cache.forEach((frame) => frame.close());
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// =============================================================================
// SOURCE REGISTRY SINGLETON
// =============================================================================

class SourceRegistryImpl {
  private sources: Map<string, Source> = new Map();
  private audioSources: Map<string, AudioSource> = new Map();
  private frameCaches: Map<string, LRUFrameCache> = new Map();

  // =========================================================================
  // SOURCE MANAGEMENT
  // =========================================================================

  /**
   * Normalize a URL for consistent source identification.
   */
  normalizeSourceId(url: string): string {
    if (!url) return '';
    try {
      if (url.startsWith('blob:')) return url;
      const parsed = new URL(url, window.location.origin);
      return decodeURIComponent(parsed.pathname);
    } catch {
      return url;
    }
  }

  /**
   * Register a source and get its decoder.
   * Creates a new decoder if one doesn't exist for this source.
   */
  registerSource(config: SourceConfig): HTMLVideoElement {
    const normalizedId = this.normalizeSourceId(config.url);

    let source = this.sources.get(normalizedId);

    if (source) {
      source.refCount++;
      logRegistry('Source ref incremented', {
        sourceId: normalizedId,
        refCount: source.refCount,
      });
      return source.decoder;
    }

    // Create new decoder
    const decoder = document.createElement('video');
    decoder.crossOrigin = 'anonymous';
    decoder.preload = 'auto';
    decoder.muted = true; // Always muted - audio handled separately
    decoder.playsInline = true;
    decoder.src = config.url;

    source = {
      sourceId: normalizedId,
      url: config.url,
      fps: config.fps,
      decoder,
      frameCache: new Map(),
      lastValidFrame: null,
      lastRequestedFrame: -1,
      isPreloading: false,
      pendingRequests: new Map(),
      refCount: 1,
    };

    this.sources.set(normalizedId, source);
    this.frameCaches.set(normalizedId, new LRUFrameCache());

    logRegistry('Source registered', {
      sourceId: normalizedId,
      url: config.url.substring(0, 50),
    });

    return decoder;
  }

  /**
   * Release a reference to a source.
   * Decoder is destroyed when refCount reaches 0.
   */
  releaseSource(sourceId: string): void {
    const normalizedId = this.normalizeSourceId(sourceId);
    const source = this.sources.get(normalizedId);

    if (!source) return;

    source.refCount--;
    logRegistry('Source ref decremented', {
      sourceId: normalizedId,
      refCount: source.refCount,
    });

    if (source.refCount <= 0) {
      // Cleanup
      source.decoder.pause();
      source.decoder.src = '';
      source.decoder.load();
      source.lastValidFrame?.close();

      this.frameCaches.get(normalizedId)?.clear();
      this.frameCaches.delete(normalizedId);
      this.sources.delete(normalizedId);

      logRegistry('Source destroyed', { sourceId: normalizedId });
    }
  }

  /**
   * Check if a source is registered.
   */
  hasSource(sourceId: string): boolean {
    return this.sources.has(this.normalizeSourceId(sourceId));
  }

  /**
   * Get decoder for a source without incrementing ref count.
   */
  getDecoder(sourceId: string): HTMLVideoElement | null {
    const source = this.sources.get(this.normalizeSourceId(sourceId));
    return source?.decoder ?? null;
  }

  // =========================================================================
  // FRAME EXTRACTION
  // =========================================================================

  /**
   * Get a decoded frame at a specific source frame number.
   * Returns cached frame if available, otherwise decodes new frame.
   * Falls back to last valid frame if decode fails (prevents black frames).
   */
  async getFrame(
    sourceId: string,
    sourceFrame: number,
    fps: number,
  ): Promise<FrameResult> {
    const normalizedId = this.normalizeSourceId(sourceId);
    const source = this.sources.get(normalizedId);

    if (!source) {
      logRegistry('getFrame: Source not found', { sourceId: normalizedId });
      return {
        frame: null,
        sourceFrame,
        isFromCache: false,
        isFallback: false,
      };
    }

    const cache = this.frameCaches.get(normalizedId);

    // Check cache first
    const cached = cache?.get(sourceFrame);
    if (cached) {
      logRegistry('Frame from cache', { sourceId: normalizedId, sourceFrame });
      return {
        frame: cached,
        sourceFrame,
        isFromCache: true,
        isFallback: false,
      };
    }

    // Check for pending request for this frame
    const pending = source.pendingRequests.get(sourceFrame);
    if (pending) {
      const frame = await pending;
      return {
        frame,
        sourceFrame,
        isFromCache: false,
        isFallback: false,
      };
    }

    // Decode new frame
    const decodePromise = this.decodeFrame(source, sourceFrame, fps);
    source.pendingRequests.set(sourceFrame, decodePromise);

    try {
      const frame = await decodePromise;
      source.pendingRequests.delete(sourceFrame);

      if (frame) {
        // Update last valid frame
        source.lastValidFrame = frame;
        cache?.set(sourceFrame, frame);

        return {
          frame,
          sourceFrame,
          isFromCache: false,
          isFallback: false,
        };
      }

      // Fallback to last valid frame (BLACK FRAME PREVENTION)
      if (source.lastValidFrame) {
        logRegistry('Using fallback frame', {
          sourceId: normalizedId,
          requestedFrame: sourceFrame,
        });
        return {
          frame: source.lastValidFrame,
          sourceFrame,
          isFromCache: false,
          isFallback: true,
        };
      }

      return {
        frame: null,
        sourceFrame,
        isFromCache: false,
        isFallback: false,
      };
    } catch (error) {
      source.pendingRequests.delete(sourceFrame);
      logRegistry('Frame decode error', { sourceId: normalizedId, error });

      // Fallback on error
      return {
        frame: source.lastValidFrame,
        sourceFrame,
        isFromCache: false,
        isFallback: true,
      };
    }
  }

  /**
   * Internal: Decode a single frame from the video.
   */
  private async decodeFrame(
    source: Source,
    sourceFrame: number,
    fps: number,
  ): Promise<ImageBitmap | null> {
    const { decoder } = source;
    const targetTime = sourceFrame / fps;

    // Wait for decoder to be ready
    if (decoder.readyState < 2) {
      await this.waitForReadyState(decoder, 2);
    }

    // Seek if needed
    const currentTime = decoder.currentTime;
    if (Math.abs(currentTime - targetTime) > SEEK_TOLERANCE) {
      await this.seekWithVerification(decoder, targetTime);
    }

    // Ensure we have a frame
    if (decoder.readyState < 2) {
      return null;
    }

    // Create ImageBitmap from current frame
    try {
      const bitmap = await createImageBitmap(decoder);
      source.lastRequestedFrame = sourceFrame;
      return bitmap;
    } catch (error) {
      logRegistry('createImageBitmap failed', { error });
      return null;
    }
  }

  /**
   * Wait for video to reach a specific ready state.
   */
  private waitForReadyState(
    video: HTMLVideoElement,
    minState: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (video.readyState >= minState) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Ready state timeout'));
      }, DECODE_TIMEOUT_MS);

      const onCanPlay = () => {
        if (video.readyState >= minState) {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('loadeddata', onCanPlay);
      };

      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('loadeddata', onCanPlay);
    });
  }

  /**
   * Seek to a specific time and verify completion.
   */
  private seekWithVerification(
    video: HTMLVideoElement,
    targetTime: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - targetTime) <= SEEK_TOLERANCE) {
        resolve();
        return;
      }

      let resolved = false;

      const onSeeked = () => {
        if (resolved) return;
        resolved = true;
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };

      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }, DECODE_TIMEOUT_MS);

      video.addEventListener('seeked', onSeeked);
      video.currentTime = targetTime;

      // Clear timeout on success
      video.addEventListener('seeked', () => clearTimeout(timeout), {
        once: true,
      });
    });
  }

  // =========================================================================
  // PRELOADING
  // =========================================================================

  /**
   * Preload frames for upcoming playback (micro-preloading).
   * Non-blocking - does not wait for completion.
   */
  preloadFrames(sourceId: string, frames: number[], fps: number): void {
    const normalizedId = this.normalizeSourceId(sourceId);
    const source = this.sources.get(normalizedId);

    if (!source || source.isPreloading) return;

    source.isPreloading = true;

    // Preload asynchronously without blocking
    (async () => {
      for (const frame of frames) {
        const cache = this.frameCaches.get(normalizedId);
        if (cache?.has(frame)) continue;

        try {
          await this.getFrame(sourceId, frame, fps);
        } catch {
          // Ignore preload errors
        }
      }
      source.isPreloading = false;
    })();
  }

  /**
   * Preload a single frame.
   */
  preloadFrame(sourceId: string, sourceFrame: number, fps: number): void {
    this.preloadFrames(sourceId, [sourceFrame], fps);
  }

  // =========================================================================
  // AUDIO SOURCE MANAGEMENT
  // =========================================================================

  /**
   * Register an audio source.
   */
  registerAudioSource(sourceId: string, url: string): HTMLAudioElement {
    const normalizedId = this.normalizeSourceId(url);

    let audioSource = this.audioSources.get(normalizedId);

    if (audioSource) {
      audioSource.refCount++;
      return audioSource.decoder;
    }

    const decoder = new Audio();
    decoder.preload = 'auto';
    decoder.src = url;

    audioSource = {
      sourceId: normalizedId,
      url,
      decoder,
      refCount: 1,
    };

    this.audioSources.set(normalizedId, audioSource);

    logRegistry('Audio source registered', {
      sourceId: normalizedId,
      url: url.substring(0, 50),
    });

    return decoder;
  }

  /**
   * Release an audio source reference.
   */
  releaseAudioSource(sourceId: string): void {
    const normalizedId = this.normalizeSourceId(sourceId);
    const audioSource = this.audioSources.get(normalizedId);

    if (!audioSource) return;

    audioSource.refCount--;

    if (audioSource.refCount <= 0) {
      audioSource.decoder.pause();
      audioSource.decoder.src = '';
      audioSource.decoder.load();
      this.audioSources.delete(normalizedId);

      logRegistry('Audio source destroyed', { sourceId: normalizedId });
    }
  }

  /**
   * Get audio decoder without incrementing ref count.
   */
  getAudioDecoder(sourceId: string): HTMLAudioElement | null {
    const audioSource = this.audioSources.get(this.normalizeSourceId(sourceId));
    return audioSource?.decoder ?? null;
  }

  // =========================================================================
  // UTILITY
  // =========================================================================

  /**
   * Clear all caches for a source.
   */
  clearCache(sourceId: string): void {
    const normalizedId = this.normalizeSourceId(sourceId);
    const cache = this.frameCaches.get(normalizedId);
    cache?.clear();
  }

  /**
   * Clear all sources and caches.
   */
  clearAll(): void {
    this.sources.forEach((source) => {
      source.decoder.pause();
      source.decoder.src = '';
      source.decoder.load();
      source.lastValidFrame?.close();
    });
    this.sources.clear();

    this.frameCaches.forEach((cache) => cache.clear());
    this.frameCaches.clear();

    this.audioSources.forEach((audioSource) => {
      audioSource.decoder.pause();
      audioSource.decoder.src = '';
      audioSource.decoder.load();
    });
    this.audioSources.clear();

    logRegistry('All sources cleared');
  }

  /**
   * Get statistics about registered sources.
   */
  getStats(): {
    videoSourceCount: number;
    audioSourceCount: number;
    totalCachedFrames: number;
  } {
    let totalCachedFrames = 0;
    this.frameCaches.forEach((cache) => {
      totalCachedFrames += cache.size;
    });

    return {
      videoSourceCount: this.sources.size,
      audioSourceCount: this.audioSources.size,
      totalCachedFrames,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const SourceRegistry = new SourceRegistryImpl();

export default SourceRegistry;
