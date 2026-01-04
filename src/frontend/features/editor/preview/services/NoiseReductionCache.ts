/**
 * NoiseReductionCache - Global Singleton for Processed Audio Management
 *
 * This service manages noise-reduced audio files cached by source.
 * Key principles:
 * - ONE processed audio file per unique media source
 * - Source-level caching (not track-level) for efficiency
 * - Subscription system for reactive UI updates
 * - Temp file cleanup on app exit
 *
 * Multiple clips from the same source share the processed audio.
 */

// =============================================================================
// TYPES
// =============================================================================

export type ProcessingState = 'idle' | 'processing' | 'cached' | 'error';

export interface NoiseReductionProgress {
  stage: 'loading' | 'processing' | 'saving' | 'complete' | 'error';
  progress: number;
  message?: string;
}

export interface NoiseReductionCacheEntry {
  sourceId: string;
  originalUrl: string;
  processedPath: string | null;
  processedPreviewUrl: string | null;
  state: ProcessingState;
  progress: number;
  error: string | null;
  refCount: number;
  processedAt: number | null;
}

type SubscriptionCallback = () => void;

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEBUG_NOISE_REDUCTION_CACHE = false;

function logCache(message: string, data?: unknown) {
  if (DEBUG_NOISE_REDUCTION_CACHE) {
    console.log(`[NoiseReductionCache] ${message}`, data || '');
  }
}

// =============================================================================
// NOISE REDUCTION CACHE SINGLETON
// =============================================================================

class NoiseReductionCacheImpl {
  private cache: Map<string, NoiseReductionCacheEntry> = new Map();
  private subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();
  private pendingProcessing: Map<string, Promise<string>> = new Map();

  // =========================================================================
  // SOURCE IDENTIFICATION
  // =========================================================================

  /**
   * Normalize a URL for consistent source identification.
   * Uses the same pattern as SourceRegistry for compatibility.
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

  // =========================================================================
  // CACHE QUERIES
  // =========================================================================

  /**
   * Check if source has cached processed audio.
   */
  hasCached(sourceId: string): boolean {
    const normalizedId = this.normalizeSourceId(sourceId);
    const entry = this.cache.get(normalizedId);
    return entry?.state === 'cached' && entry?.processedPreviewUrl !== null;
  }

  /**
   * Get processed audio URL for playback.
   * Returns null if not cached.
   */
  getProcessedUrl(sourceId: string): string | null {
    const normalizedId = this.normalizeSourceId(sourceId);
    const entry = this.cache.get(normalizedId);
    if (entry?.state === 'cached' && entry?.processedPreviewUrl) {
      return entry.processedPreviewUrl;
    }
    return null;
  }

  /**
   * Get processing state for a source.
   */
  getState(sourceId: string): ProcessingState {
    const normalizedId = this.normalizeSourceId(sourceId);
    const entry = this.cache.get(normalizedId);
    return entry?.state ?? 'idle';
  }

  /**
   * Get processing progress (0-100).
   */
  getProgress(sourceId: string): number {
    const normalizedId = this.normalizeSourceId(sourceId);
    const entry = this.cache.get(normalizedId);
    return entry?.progress ?? 0;
  }

  /**
   * Get error message if processing failed.
   */
  getError(sourceId: string): string | null {
    const normalizedId = this.normalizeSourceId(sourceId);
    const entry = this.cache.get(normalizedId);
    return entry?.error ?? null;
  }

  /**
   * Get full cache entry for a source.
   */
  getEntry(sourceId: string): NoiseReductionCacheEntry | null {
    const normalizedId = this.normalizeSourceId(sourceId);
    return this.cache.get(normalizedId) ?? null;
  }

  // =========================================================================
  // PROCESSING
  // =========================================================================

  /**
   * Process audio for a source.
   * Returns the processed audio URL when complete.
   * Reuses existing processing if already in progress.
   */
  async processSource(
    sourceId: string,
    originalUrl: string,
    onProgress?: (progress: NoiseReductionProgress) => void,
  ): Promise<string> {
    const normalizedId = this.normalizeSourceId(sourceId);

    logCache('processSource called', { sourceId: normalizedId, originalUrl });

    // Check if already cached
    const existing = this.cache.get(normalizedId);
    if (existing?.state === 'cached' && existing.processedPreviewUrl) {
      logCache('Using cached result', { sourceId: normalizedId });
      return existing.processedPreviewUrl;
    }

    // Check if already processing
    const pending = this.pendingProcessing.get(normalizedId);
    if (pending) {
      logCache('Waiting for pending processing', { sourceId: normalizedId });
      return pending;
    }

    // Start new processing
    const processingPromise = this.doProcessSource(
      normalizedId,
      originalUrl,
      onProgress,
    );
    this.pendingProcessing.set(normalizedId, processingPromise);

    try {
      const result = await processingPromise;
      return result;
    } finally {
      this.pendingProcessing.delete(normalizedId);
    }
  }

  /**
   * Internal: Actually process the audio.
   */
  private async doProcessSource(
    normalizedId: string,
    originalUrl: string,
    onProgress?: (progress: NoiseReductionProgress) => void,
  ): Promise<string> {
    logCache('Starting processing', { sourceId: normalizedId });

    // Initialize cache entry
    this.updateEntry(normalizedId, {
      sourceId: normalizedId,
      originalUrl,
      processedPath: null,
      processedPreviewUrl: null,
      state: 'processing',
      progress: 0,
      error: null,
      refCount: 1,
      processedAt: null,
    });

    try {
      // Get input path from URL
      const inputPath = this.getInputPathFromUrl(originalUrl);
      if (!inputPath) {
        throw new Error('Could not determine input path from URL');
      }

      logCache('Input path resolved', { inputPath });

      // Get output path from backend
      const outputPathResult =
        await window.electronAPI.noiseReductionGetOutputPath(inputPath);
      if (!outputPathResult.success || !outputPathResult.outputPath) {
        throw new Error(outputPathResult.error || 'Failed to get output path');
      }

      const outputPath = outputPathResult.outputPath;
      logCache('Output path generated', { outputPath });

      // Set up progress listener
      const progressHandler = (progress: NoiseReductionProgress) => {
        const currentEntry = this.cache.get(normalizedId);
        if (currentEntry) {
          this.updateEntry(normalizedId, {
            ...currentEntry,
            progress: progress.progress,
          });
        }
        onProgress?.(progress);
      };

      window.electronAPI.onMediaToolsProgress(progressHandler);

      try {
        // Run noise reduction
        const result = await window.electronAPI.mediaToolsNoiseReduce(
          inputPath,
          outputPath,
          {
            stationary: true,
            propDecrease: 0.8,
          },
        );

        if (!result.success) {
          throw new Error(result.error || 'Noise reduction failed');
        }

        logCache('Noise reduction complete', { outputPath });

        // Create preview URL from processed file
        const previewResult =
          await window.electronAPI.noiseReductionCreatePreviewUrl(outputPath);
        if (!previewResult.success || !previewResult.base64) {
          throw new Error(
            previewResult.error || 'Failed to create preview URL',
          );
        }

        // Create blob URL from base64 data
        const binaryString = atob(previewResult.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], {
          type: previewResult.mimeType || 'audio/wav',
        });
        const previewUrl = URL.createObjectURL(blob);

        logCache('Preview URL created', { previewUrl });

        // Update cache entry
        const successEntry = this.cache.get(normalizedId);
        if (successEntry) {
          this.updateEntry(normalizedId, {
            ...successEntry,
            processedPath: outputPath,
            processedPreviewUrl: previewUrl,
            state: 'cached',
            progress: 100,
            error: null,
            processedAt: Date.now(),
          });
        }

        return previewUrl;
      } finally {
        window.electronAPI.removeMediaToolsProgressListener();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logCache('Processing failed', {
        sourceId: normalizedId,
        error: errorMessage,
      });

      const errorEntry = this.cache.get(normalizedId);
      if (errorEntry) {
        this.updateEntry(normalizedId, {
          ...errorEntry,
          state: 'error',
          error: errorMessage,
          progress: 0,
        });
      }

      throw error;
    }
  }

  /**
   * Extract file path from URL.
   */
  private getInputPathFromUrl(url: string): string | null {
    if (!url) return null;

    logCache('getInputPathFromUrl called', { url });

    // Handle blob URLs - we can't process these directly
    if (url.startsWith('blob:')) {
      logCache('Cannot process blob URL directly', { url });
      return null;
    }

    // Handle file:// URLs
    if (url.startsWith('file://')) {
      try {
        const urlObj = new URL(url);
        // On Windows, pathname starts with /C:/ - need to remove leading slash
        let pathname = decodeURIComponent(urlObj.pathname);
        if (pathname.startsWith('/') && pathname[2] === ':') {
          pathname = pathname.slice(1);
        }
        logCache('Extracted path from file:// URL', { pathname });
        return pathname;
      } catch (e) {
        logCache('Failed to parse file:// URL', { error: e });
        return null;
      }
    }

    // Handle local media server URLs (http://localhost:PORT/media-file?path=...)
    if (url.includes('/media-file?path=')) {
      try {
        const urlObj = new URL(url);
        const encodedPath = urlObj.searchParams.get('path');
        if (encodedPath) {
          const decodedPath = decodeURIComponent(encodedPath);
          logCache('Extracted path from media-file query param', {
            decodedPath,
          });
          return decodedPath;
        }
      } catch (e) {
        logCache('Failed to parse media-file URL', { error: e });
        return null;
      }
    }

    // Handle local media server URLs (http://localhost:PORT/encodedFilePath)
    // This is the format used by the local media server
    if (
      url.startsWith('http://localhost:') ||
      url.startsWith('http://127.0.0.1:')
    ) {
      try {
        const urlObj = new URL(url);
        // The pathname is the encoded file path (after the port)
        // e.g., http://localhost:3456/C%3A%5CUsers%5C... -> C:\Users\...
        let pathname = decodeURIComponent(urlObj.pathname);
        // Remove leading slash
        if (pathname.startsWith('/')) {
          pathname = pathname.slice(1);
        }
        // On Windows, the path might be encoded like C%3A -> C:
        if (pathname && pathname.length > 1) {
          logCache('Extracted path from localhost URL', { pathname });
          return pathname;
        }
      } catch (e) {
        logCache('Failed to parse localhost URL', { error: e });
        return null;
      }
    }

    // Handle direct file paths (no protocol)
    if (url.match(/^[A-Za-z]:\\/) || url.startsWith('/')) {
      logCache('Using direct file path', { url });
      return url;
    }

    logCache('Could not determine input path', { url });

    return null;
  }

  // =========================================================================
  // SUBSCRIPTIONS
  // =========================================================================

  /**
   * Subscribe to state changes for a source.
   * Returns unsubscribe function.
   */
  subscribe(sourceId: string, callback: SubscriptionCallback): () => void {
    const normalizedId = this.normalizeSourceId(sourceId);

    let subs = this.subscriptions.get(normalizedId);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(normalizedId, subs);
    }

    subs.add(callback);

    return () => {
      const subs = this.subscriptions.get(normalizedId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(normalizedId);
        }
      }
    };
  }

  /**
   * Notify subscribers of state change.
   */
  private notifySubscribers(sourceId: string): void {
    const subs = this.subscriptions.get(sourceId);
    if (subs) {
      subs.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.error('Subscriber callback error:', error);
        }
      });
    }
  }

  /**
   * Update cache entry and notify subscribers.
   */
  private updateEntry(sourceId: string, entry: NoiseReductionCacheEntry): void {
    this.cache.set(sourceId, entry);
    this.notifySubscribers(sourceId);
  }

  // =========================================================================
  // REFERENCE COUNTING
  // =========================================================================

  /**
   * Increment reference count for a source.
   */
  addRef(sourceId: string): void {
    const normalizedId = this.normalizeSourceId(sourceId);
    const entry = this.cache.get(normalizedId);
    if (entry) {
      entry.refCount++;
      logCache('Ref added', {
        sourceId: normalizedId,
        refCount: entry.refCount,
      });
    }
  }

  /**
   * Decrement reference count for a source.
   * Does not delete cache entry (kept for potential re-enable).
   */
  releaseRef(sourceId: string): void {
    const normalizedId = this.normalizeSourceId(sourceId);
    const entry = this.cache.get(normalizedId);
    if (entry && entry.refCount > 0) {
      entry.refCount--;
      logCache('Ref released', {
        sourceId: normalizedId,
        refCount: entry.refCount,
      });
    }
  }

  // =========================================================================
  // CLEANUP
  // =========================================================================

  /**
   * Clear a specific cache entry.
   */
  async clearEntry(sourceId: string): Promise<void> {
    const normalizedId = this.normalizeSourceId(sourceId);
    const entry = this.cache.get(normalizedId);

    if (entry) {
      // Revoke blob URL
      if (entry.processedPreviewUrl) {
        URL.revokeObjectURL(entry.processedPreviewUrl);
      }

      // Delete temp file
      if (entry.processedPath) {
        await window.electronAPI.noiseReductionCleanupFiles([
          entry.processedPath,
        ]);
      }

      this.cache.delete(normalizedId);
      this.notifySubscribers(normalizedId);
      logCache('Entry cleared', { sourceId: normalizedId });
    }
  }

  /**
   * Clear all cache entries and temp files.
   */
  async clearAll(): Promise<void> {
    const filePaths: string[] = [];

    this.cache.forEach((entry) => {
      // Revoke blob URLs
      if (entry.processedPreviewUrl) {
        URL.revokeObjectURL(entry.processedPreviewUrl);
      }

      // Collect temp file paths
      if (entry.processedPath) {
        filePaths.push(entry.processedPath);
      }
    });

    // Delete temp files
    if (filePaths.length > 0) {
      await window.electronAPI.noiseReductionCleanupFiles(filePaths);
    }

    this.cache.clear();
    logCache('All entries cleared');
  }

  /**
   * Reset error state to allow retry.
   */
  resetError(sourceId: string): void {
    const normalizedId = this.normalizeSourceId(sourceId);
    const entry = this.cache.get(normalizedId);
    if (entry?.state === 'error') {
      this.updateEntry(normalizedId, {
        ...entry,
        state: 'idle',
        error: null,
        progress: 0,
      });
    }
  }

  // =========================================================================
  // STATISTICS
  // =========================================================================

  /**
   * Get statistics about the cache.
   */
  getStats(): {
    totalEntries: number;
    cachedEntries: number;
    processingEntries: number;
    errorEntries: number;
  } {
    let cachedEntries = 0;
    let processingEntries = 0;
    let errorEntries = 0;

    this.cache.forEach((entry) => {
      switch (entry.state) {
        case 'cached':
          cachedEntries++;
          break;
        case 'processing':
          processingEntries++;
          break;
        case 'error':
          errorEntries++;
          break;
      }
    });

    return {
      totalEntries: this.cache.size,
      cachedEntries,
      processingEntries,
      errorEntries,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const NoiseReductionCache = new NoiseReductionCacheImpl();

export default NoiseReductionCache;
