import { VideoTrack } from '../Store/VideoEditorStore';

export interface SpriteSheetOptions {
  videoPath: string;
  duration: number; // in seconds
  fps: number;
  thumbWidth?: number; // Width of each thumbnail (default: 120)
  thumbHeight?: number; // Height of each thumbnail (default: 68)
  maxThumbnailsPerSheet?: number; // Max thumbnails per sprite sheet (default: 100)
  sourceStartTime?: number; // Start time in source video (default: 0)
  intervalSeconds?: number; // Generate thumbnail every N seconds (default: auto-calculated)
}

export interface SpriteSheetThumbnail {
  id: string;
  timestamp: number; // in seconds (relative to track)
  frameNumber: number;
  sheetIndex: number; // Which sprite sheet contains this thumbnail
  x: number; // X position in sprite sheet
  y: number; // Y position in sprite sheet
  width: number;
  height: number;
}

export interface SpriteSheet {
  id: string;
  url: string;
  width: number;
  height: number;
  thumbnailsPerRow: number;
  thumbnailsPerColumn: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnails: SpriteSheetThumbnail[];
}

export interface SpriteSheetGenerationResult {
  success: boolean;
  spriteSheets: SpriteSheet[];
  error?: string;
  cacheKey: string;
}

// Persistent cache interface for sprite sheets
interface SpriteSheetCacheEntry {
  result: SpriteSheetGenerationResult;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  fileSize: number;
  videoPath: string;
}

export class VideoSpriteSheetGenerator {
  private static spriteSheetCache = new Map<
    string,
    SpriteSheetGenerationResult
  >();
  private static activeGenerations = new Map<
    string,
    Promise<SpriteSheetGenerationResult>
  >();
  private static cacheAccessTimes = new Map<string, number>();
  private static readonly MAX_CACHE_SIZE = 15; // Reduced to handle larger sprite sheets
  private static readonly CACHE_STORAGE_KEY = 'dividr_sprite_cache';
  private static readonly MAX_CACHE_AGE_DAYS = 7; // Cache expires after 7 days
  private static cacheInitialized = false;

  /**
   * Get precise video metadata using FFprobe
   */
  private static async getVideoMetadata(videoPath: string): Promise<{
    duration: number;
    fps: number;
    frameCount: number;
  }> {
    try {
      if (typeof window === 'undefined' || !window.electronAPI) {
        throw new Error('Video metadata requires Electron environment');
      }

      // Validate videoPath before proceeding
      if (!videoPath || typeof videoPath !== 'string') {
        console.error(
          '❌ Invalid videoPath provided to getVideoMetadata:',
          videoPath,
        );
        throw new Error(`Invalid video path: ${videoPath}`);
      }

      // Use FFprobe to get exact video information
      const probeCommand = [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        '-select_streams',
        'v:0',
        videoPath,
      ];

      const result = await (
        window.electronAPI as unknown as {
          runCustomFFmpeg: (
            args: string[],
          ) => Promise<{ success: boolean; output?: string; error?: string }>;
        }
      ).runCustomFFmpeg(['ffprobe', ...probeCommand]);

      if (!result.success || !result.output) {
        throw new Error(result.error || 'Failed to get video metadata');
      }

      const metadata = JSON.parse(result.output);
      const videoStream = metadata.streams?.[0];
      const format = metadata.format;

      if (!videoStream || !format) {
        throw new Error('No video stream found in metadata');
      }

      // Get precise duration and fps
      const duration =
        parseFloat(format.duration) || parseFloat(videoStream.duration) || 0;
      const fpsString =
        videoStream.r_frame_rate || videoStream.avg_frame_rate || '30/1';
      const [num, den] = fpsString.split('/').map(Number);
      const fps = num / (den || 1);

      // Calculate exact frame count
      const frameCount = Math.floor(duration * fps);

      console.log(`📊 Video metadata for ${videoPath.split(/[\\/]/).pop()}:`);
      console.log(`   • Duration: ${duration.toFixed(3)}s`);
      console.log(`   • FPS: ${fps.toFixed(3)} (${fpsString})`);
      console.log(`   • Frame count: ${frameCount}`);

      return { duration, fps, frameCount };
    } catch (error) {
      console.warn(
        '⚠️ Failed to get precise video metadata, using fallback:',
        error,
      );
      // Fallback to provided values
      return { duration: 0, fps: 30, frameCount: 0 };
    }
  }

  /**
   * Initialize persistent cache from localStorage
   */
  private static async initializeCache(): Promise<void> {
    if (this.cacheInitialized) return;

    try {
      // Try to load from localStorage if available
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(this.CACHE_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Record<
            string,
            SpriteSheetCacheEntry
          >;
          const now = Date.now();
          const maxAge = this.MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;

          // Filter out expired entries and validate URLs
          for (const [key, entry] of Object.entries(parsed)) {
            if (now - entry.timestamp < maxAge) {
              // Validate that sprite sheet URLs are still accessible
              const isValid = await this.validateCacheEntry(entry.result);
              if (isValid) {
                this.spriteSheetCache.set(key, entry.result);
                this.cacheAccessTimes.set(key, entry.lastAccessed);
              }
            }
          }

          console.log(
            `📦 Loaded ${this.spriteSheetCache.size} valid sprite sheet cache entries`,
          );
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to load sprite sheet cache from storage:', error);
    }

    this.cacheInitialized = true;
  }

  /**
   * Validate that a cached sprite sheet entry is still valid
   */
  private static async validateCacheEntry(
    result: SpriteSheetGenerationResult,
  ): Promise<boolean> {
    try {
      // Check if sprite sheet URLs are still accessible
      for (const sheet of result.spriteSheets) {
        const response = await fetch(sheet.url, { method: 'HEAD' });
        if (!response.ok) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save cache to persistent storage
   */
  private static saveCacheToStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cacheEntries: Record<string, SpriteSheetCacheEntry> = {};

        for (const [key, result] of this.spriteSheetCache.entries()) {
          const accessTime = this.cacheAccessTimes.get(key) || Date.now();
          cacheEntries[key] = {
            result,
            timestamp: Date.now(),
            accessCount: 1,
            lastAccessed: accessTime,
            fileSize: this.estimateCacheEntrySize(result),
            videoPath: result.spriteSheets[0]?.url || '',
          };
        }

        window.localStorage.setItem(
          this.CACHE_STORAGE_KEY,
          JSON.stringify(cacheEntries),
        );
        console.log(
          `💾 Saved ${Object.keys(cacheEntries).length} sprite sheet cache entries`,
        );
      }
    } catch (error) {
      console.warn('⚠️ Failed to save sprite sheet cache to storage:', error);
    }
  }

  /**
   * Estimate the size of a cache entry for memory management
   */
  private static estimateCacheEntrySize(
    result: SpriteSheetGenerationResult,
  ): number {
    // Rough estimate based on number of thumbnails and sheet dimensions
    let size = 0;
    for (const sheet of result.spriteSheets) {
      size += sheet.width * sheet.height * 0.3; // Rough bytes estimate for PNG (higher than JPEG)
      size += sheet.thumbnails.length * 200; // Metadata overhead
    }
    return size;
  }

  /**
   * Generate sprite sheets for a video with optimized FFmpeg command
   */
  static async generateSpriteSheets(
    options: SpriteSheetOptions,
  ): Promise<SpriteSheetGenerationResult> {
    // Initialize cache if not already done
    await this.initializeCache();

    const cacheKey = this.createCacheKey(options);

    // Return cached result if available
    if (this.spriteSheetCache.has(cacheKey)) {
      const cached = this.spriteSheetCache.get(cacheKey);
      if (cached) {
        this.cacheAccessTimes.set(cacheKey, Date.now());
        console.log('✅ Sprite sheet cache HIT for', cacheKey);
        return cached;
      }
    }

    // Return active generation if already in progress
    if (this.activeGenerations.has(cacheKey)) {
      const activeGeneration = this.activeGenerations.get(cacheKey);
      if (activeGeneration) {
        console.log('🔄 Using active sprite sheet generation for', cacheKey);
        return activeGeneration;
      }
    }

    // Start new generation
    const generationPromise = this.performSpriteSheetGeneration(
      options,
      cacheKey,
    );
    this.activeGenerations.set(cacheKey, generationPromise);

    try {
      const result = await generationPromise;
      this.activeGenerations.delete(cacheKey);
      return result;
    } catch (error) {
      this.activeGenerations.delete(cacheKey);
      throw error;
    }
  }

  /**
   * Perform the actual sprite sheet generation using background FFmpeg worker
   */
  private static async performSpriteSheetGeneration(
    options: SpriteSheetOptions,
    cacheKey: string,
  ): Promise<SpriteSheetGenerationResult> {
    const {
      videoPath,
      duration: providedDuration,
      fps: providedFps,
      thumbWidth = 120,
      thumbHeight = 68,
      maxThumbnailsPerSheet = 100,
      sourceStartTime = 0,
    } = options;

    // Get precise video metadata for accurate frame extraction
    const videoMetadata = await this.getVideoMetadata(videoPath);
    const duration = videoMetadata.duration || providedDuration;
    const fps = videoMetadata.fps || providedFps;

    console.log(
      `🎬 Using ${videoMetadata.duration ? 'precise' : 'fallback'} video metadata:`,
    );
    console.log(
      `   • Duration: ${duration.toFixed(3)}s (provided: ${providedDuration.toFixed(3)}s)`,
    );
    console.log(
      `   • FPS: ${fps.toFixed(3)} (provided: ${providedFps.toFixed(3)})`,
    );

    // Calculate optimal interval based on duration and zoom level
    const intervalSeconds =
      options.intervalSeconds || this.calculateOptimalInterval(duration);

    // Calculate exact thumbnails needed based on actual video duration
    // Use precise calculation to prevent generating more thumbnails than video content
    const exactThumbnails = Math.floor(duration / intervalSeconds) + 1; // +1 for the first frame

    // Limit total thumbnails to prevent memory issues with large files
    const maxThumbnails = Math.min(exactThumbnails, 5000); // Reasonable limit
    const adjustedTotalThumbnails = Math.max(5, maxThumbnails); // Minimum 5 thumbnails

    // Ensure we don't exceed actual video content
    const maxPossibleThumbnails = Math.floor(duration / intervalSeconds) + 1;
    const finalTotalThumbnails = Math.min(
      adjustedTotalThumbnails,
      maxPossibleThumbnails,
    );

    const numberOfSheets = Math.ceil(
      finalTotalThumbnails / maxThumbnailsPerSheet,
    );

    console.log(
      `🎬 Generating ${numberOfSheets} sprite sheet(s) with ${finalTotalThumbnails} thumbnails total (${adjustedTotalThumbnails} adjusted)`,
    );
    console.log(
      `📐 Thumbnail size: ${thumbWidth}x${thumbHeight}, interval: ${intervalSeconds}s`,
    );
    console.log(`⏱️ Duration: ${duration}s, Source start: ${sourceStartTime}s`);
    console.log(
      `📊 Calculation: exactThumbnails=${exactThumbnails}, maxPossible=${maxPossibleThumbnails}`,
    );

    try {
      // Check if we're in an Electron environment
      if (typeof window === 'undefined' || !window.electronAPI) {
        throw new Error(
          'Sprite sheet generation requires Electron environment',
        );
      }

      // Check if the custom FFmpeg method is available
      if (
        !(window.electronAPI as unknown as { runCustomFFmpeg?: unknown })
          .runCustomFFmpeg
      ) {
        throw new Error(
          'Sprite sheet generation requires app restart to enable new IPC handlers',
        );
      }

      const outputDir = `public/sprite-sheets/${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const commands: string[][] = [];
      const sheetMetadata: Array<{
        index: number;
        thumbnailsInSheet: number;
        thumbnailsPerRow: number;
        thumbnailsPerColumn: number;
        width: number;
        height: number;
        startThumbnailIndex: number;
        actualFrameCount: number;
      }> = [];

      // Prepare all FFmpeg commands for background processing
      for (let sheetIndex = 0; sheetIndex < numberOfSheets; sheetIndex++) {
        const startThumbnailIndex = sheetIndex * maxThumbnailsPerSheet;
        const endThumbnailIndex = Math.min(
          startThumbnailIndex + maxThumbnailsPerSheet,
          finalTotalThumbnails,
        );
        const thumbnailsInSheet = endThumbnailIndex - startThumbnailIndex;

        // Calculate time range for this sheet with strict video duration bounds
        const startTime =
          sourceStartTime + startThumbnailIndex * intervalSeconds;
        const rawEndTime =
          sourceStartTime + endThumbnailIndex * intervalSeconds;
        const maxVideoTime = sourceStartTime + duration;

        // Don't exceed actual video duration
        const endTime = Math.min(rawEndTime, maxVideoTime);
        const maxSheetDuration = endTime - startTime;

        // Skip this sheet if there's no valid time range (startTime >= maxVideoTime)
        if (startTime >= maxVideoTime) {
          console.warn(
            `⚠️ Skipping sprite sheet ${sheetIndex + 1} - start time (${startTime.toFixed(2)}s) exceeds video duration (${maxVideoTime.toFixed(2)}s)`,
          );
          continue;
        }

        // Calculate how many frames we can actually fit in this time range
        const maxPossibleFrames =
          Math.floor(maxSheetDuration / intervalSeconds) + 1;
        const requestedFrames = Math.min(thumbnailsInSheet, maxPossibleFrames);

        // Calculate precise duration to generate exactly the frames we need
        // For N frames at interval I, we need duration = (N-1) * I + minimal buffer
        // Use very small buffer to avoid generating extra frames
        const preciseDuration = (requestedFrames - 1) * intervalSeconds + 0.001; // Minimal buffer
        const sheetDuration = Math.min(preciseDuration, maxSheetDuration);

        // Additional check: skip if sheet duration is too small to be meaningful
        if (sheetDuration < intervalSeconds / 2) {
          console.warn(
            `⚠️ Skipping sprite sheet ${sheetIndex + 1} - duration (${sheetDuration.toFixed(2)}s) too small for interval (${intervalSeconds}s)`,
          );
          continue;
        }

        const finalFrameCount = requestedFrames;

        // Calculate optimal grid dimensions to minimize empty slots
        const optimalGrid = this.calculateOptimalGrid(finalFrameCount);
        const optimalCols = optimalGrid.cols;
        const optimalRows = optimalGrid.rows;

        // Use the original optimal grid since FFmpeg generates exactly what we plan
        // Only add minimal tolerance for edge cases
        const conservativeFrameCount = finalFrameCount;

        console.log(
          `📐 Grid calculation: using optimal grid for exactly ${finalFrameCount} frames`,
        );

        // Calculate exact frame numbers to extract (no time-based extraction)
        const frameNumbers = [];
        for (let i = 0; i < finalFrameCount; i++) {
          const globalThumbnailIndex = startThumbnailIndex + i;
          const timestamp =
            sourceStartTime + globalThumbnailIndex * intervalSeconds;
          const frameNumber = Math.floor(timestamp * fps);
          frameNumbers.push(frameNumber);
        }

        // Use select filter to extract exact frames (prevents excess frames)
        const selectFilter = frameNumbers
          .map((frame) => `eq(n\\,${frame})`)
          .join('+');

        const spriteSheetCommand = [
          '-i',
          videoPath,
          '-vf',
          [
            `select='${selectFilter}'`, // Extract exact frames by frame number
            `scale=${thumbWidth}:${thumbHeight}:force_original_aspect_ratio=increase`, // Scale to fill, may crop
            `crop=${thumbWidth}:${thumbHeight}`, // Crop to exact dimensions (no padding/black strips)
            `tile=${optimalCols}x${optimalRows}`, // Use calculated grid dimensions
          ].join(','),
          '-q:v',
          '5',
          '-f',
          'image2',
          '-avoid_negative_ts',
          'make_zero', // Handle negative timestamps
          '-vsync',
          '0', // Prevent frame dropping
          '-threads',
          '4',
          '-frames:v',
          '1', // Generate exactly one output image (the tiled sprite sheet)
          '-y', // Overwrite output files
          `${outputDir}/sprite_${sheetIndex.toString().padStart(3, '0')}.jpg`,
        ];

        // Update metadata with actual dimensions
        const actualSheetWidth = optimalCols * thumbWidth;
        const actualSheetHeight = optimalRows * thumbHeight;

        commands.push(spriteSheetCommand);
        sheetMetadata.push({
          index: sheetIndex,
          thumbnailsInSheet: finalFrameCount, // Use final calculated frame count
          thumbnailsPerRow: optimalCols,
          thumbnailsPerColumn: optimalRows,
          width: actualSheetWidth,
          height: actualSheetHeight,
          startThumbnailIndex,
          actualFrameCount: finalFrameCount, // Track actual frames for filtering
        });

        const actualEmptySlots =
          optimalCols * optimalRows - conservativeFrameCount;
        console.log(
          `🖼️ Prepared sprite sheet ${sheetIndex + 1}/${numberOfSheets}:`,
          `\n   • ${finalFrameCount} exact frames (${thumbnailsInSheet} requested, ${maxPossibleFrames} max possible)`,
          `\n   • OPTIMAL grid: ${optimalCols}x${optimalRows} (${optimalCols * optimalRows} slots for ${finalFrameCount} frames)`,
          `\n   • Expected empty slots: ${actualEmptySlots}`,
          `\n   • Frame numbers: [${frameNumbers.slice(0, 3).join(', ')}${frameNumbers.length > 3 ? '...' : ''}] (${frameNumbers.length} total)`,
          `\n   • Time range: ${startTime.toFixed(2)}s to ${(startTime + sheetDuration).toFixed(2)}s (max: ${maxVideoTime.toFixed(2)}s)`,
          `\n   • Duration: ${sheetDuration.toFixed(2)}s (precise: ${preciseDuration.toFixed(2)}s), Interval: ${intervalSeconds}s`,
          `\n   • FFmpeg select: exact frame extraction (no time-based fps)`,
          `\n   • Thumbnail indices: ${startThumbnailIndex} to ${endThumbnailIndex - 1}`,
        );
      }

      // Start background generation
      const jobId = `sprite_${cacheKey}_${Date.now()}`;

      const backgroundResult = await (
        window.electronAPI as unknown as {
          generateSpriteSheetBackground: (options: {
            jobId: string;
            videoPath: string;
            outputDir: string;
            commands: string[][];
          }) => Promise<{ success: boolean; error?: string; jobId?: string }>;
        }
      ).generateSpriteSheetBackground({
        jobId,
        videoPath,
        outputDir,
        commands,
      });

      if (!backgroundResult.success) {
        throw new Error(
          backgroundResult.error ||
            'Failed to start background sprite sheet generation',
        );
      }

      // Calculate adaptive timeout based on video duration and number of sheets
      const baseTimeout = 60000; // 1 minute base
      const perSheetTimeout = 30000; // 30 seconds per sheet
      const durationFactor = Math.max(1, duration / 60); // Factor based on video length
      const sheetCount = Math.ceil(
        finalTotalThumbnails / maxThumbnailsPerSheet,
      );
      const adaptiveTimeout = Math.min(
        baseTimeout + sheetCount * perSheetTimeout * durationFactor,
        600000, // Max 10 minutes
      );

      // Wait for completion with progress polling
      const result = await this.waitForBackgroundCompletion(
        jobId,
        backgroundResult.jobId || jobId,
        adaptiveTimeout,
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      // Build sprite sheet metadata after successful generation
      const spriteSheets: SpriteSheet[] = [];

      for (const metadata of sheetMetadata) {
        const spriteSheetUrl = `http://localhost:3001/${outputDir}/sprite_${metadata.index.toString().padStart(3, '0')}.jpg`;
        const thumbnails: SpriteSheetThumbnail[] = [];

        // Only create thumbnails for actual frames (not empty grid slots)
        const actualFramesToProcess = metadata.actualFrameCount;

        for (let i = 0; i < actualFramesToProcess; i++) {
          const globalThumbnailIndex = metadata.startThumbnailIndex + i;
          const row = Math.floor(i / metadata.thumbnailsPerRow);
          const col = i % metadata.thumbnailsPerRow;
          const timestamp =
            sourceStartTime + globalThumbnailIndex * intervalSeconds;

          // Strict bounds checking: only include thumbnails within video duration
          // and within the sprite sheet grid bounds
          const isWithinVideoDuration = timestamp <= sourceStartTime + duration;
          const isWithinSpriteSheet =
            col < metadata.thumbnailsPerRow &&
            row < metadata.thumbnailsPerColumn &&
            row * metadata.thumbnailsPerRow + col < actualFramesToProcess;

          if (isWithinVideoDuration && isWithinSpriteSheet) {
            thumbnails.push({
              id: `${cacheKey}_${globalThumbnailIndex}`,
              timestamp,
              frameNumber: Math.floor(timestamp * fps),
              sheetIndex: metadata.index,
              x: col * thumbWidth,
              y: row * thumbHeight,
              width: thumbWidth,
              height: thumbHeight,
            });
          }
        }

        spriteSheets.push({
          id: `${cacheKey}_sheet_${metadata.index}`,
          url: spriteSheetUrl,
          width: metadata.width,
          height: metadata.height,
          thumbnailsPerRow: metadata.thumbnailsPerRow,
          thumbnailsPerColumn: metadata.thumbnailsPerColumn,
          thumbnailWidth: thumbWidth,
          thumbnailHeight: thumbHeight,
          thumbnails,
        });

        // Check for potential padding issues
        const expectedWidth = metadata.thumbnailsPerRow * thumbWidth;
        const expectedHeight = metadata.thumbnailsPerColumn * thumbHeight;
        const hasUnexpectedPadding =
          metadata.width !== expectedWidth ||
          metadata.height !== expectedHeight;

        console.log(
          `✅ Built sprite sheet ${metadata.index} metadata:`,
          `\n   • ${thumbnails.length} valid thumbnails created (planned: ${metadata.actualFrameCount})`,
          `\n   • ACTUAL sheet size: ${metadata.width}x${metadata.height}px (expected: ${expectedWidth}x${expectedHeight}px)`,
          `\n   • ACTUAL grid: ${metadata.thumbnailsPerRow}x${metadata.thumbnailsPerColumn}`,
          `\n   • Expected grid slots: ${metadata.thumbnailsPerRow * metadata.thumbnailsPerColumn}`,
          `\n   • Actual thumbnails: ${thumbnails.length} (difference: ${metadata.thumbnailsPerRow * metadata.thumbnailsPerColumn - thumbnails.length})`,
          hasUnexpectedPadding
            ? `\n   ⚠️ PADDING DETECTED: FFmpeg added unexpected padding to sprite sheet`
            : '',
        );
      }

      console.log('✅ All sprite sheets generated successfully in background');

      // Cache the result with persistent storage
      const generationResult: SpriteSheetGenerationResult = {
        success: true,
        spriteSheets,
        cacheKey,
      };

      this.cleanupCache();
      this.spriteSheetCache.set(cacheKey, generationResult);
      this.cacheAccessTimes.set(cacheKey, Date.now());

      // Save to persistent storage
      this.saveCacheToStorage();

      return generationResult;
    } catch (error) {
      console.error('❌ Sprite sheet generation failed:', error);
      return {
        success: false,
        spriteSheets: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        cacheKey,
      };
    }
  }

  /**
   * Wait for background sprite sheet generation to complete
   */
  private static async waitForBackgroundCompletion(
    jobId: string,
    actualJobId: string,
    timeoutMs = 300000,
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let isResolved = false;

      // Set up event listeners for job completion
      (
        window.electronAPI as unknown as {
          onSpriteSheetJobCompleted: (
            callback: (data: { jobId: string }) => void,
          ) => void;
        }
      ).onSpriteSheetJobCompleted((data: { jobId: string }) => {
        if (data.jobId === actualJobId && !isResolved) {
          isResolved = true;
          console.log('✅ Background sprite sheet generation completed');
          resolve({ success: true });
        }
      });

      (
        window.electronAPI as unknown as {
          onSpriteSheetJobError: (
            callback: (data: { jobId: string; error: string }) => void,
          ) => void;
        }
      ).onSpriteSheetJobError((data: { jobId: string; error: string }) => {
        if (data.jobId === actualJobId && !isResolved) {
          isResolved = true;
          console.error(
            '❌ Background sprite sheet generation failed:',
            data.error,
          );
          resolve({ success: false, error: data.error });
        }
      });

      // Progress polling as fallback
      const pollProgress = async () => {
        if (isResolved) return;

        try {
          const progressResult = await (
            window.electronAPI as unknown as {
              getSpriteSheetProgress: (jobId: string) => Promise<{
                success: boolean;
                progress?: { current: number; total: number; stage: string };
                error?: string;
              }>;
            }
          ).getSpriteSheetProgress(actualJobId);

          if (progressResult.success && progressResult.progress) {
            const { current, total, stage } = progressResult.progress;
            console.log(
              `🎬 Sprite sheet progress: ${current}/${total} - ${stage}`,
            );

            // Check if completed via progress (fallback)
            if (current >= total && stage === 'Completed') {
              if (!isResolved) {
                isResolved = true;
                resolve({ success: true });
                return;
              }
            }
          } else if (
            !progressResult.success &&
            progressResult.error === 'Job not found'
          ) {
            // Job might have completed and been cleaned up
            if (!isResolved) {
              isResolved = true;
              resolve({ success: true });
              return;
            }
          }
        } catch (error) {
          console.warn('Warning: Failed to poll sprite sheet progress:', error);
        }

        // Continue polling if not resolved
        if (!isResolved) {
          setTimeout(pollProgress, 1000); // Poll every second
        }
      };

      // Start polling after a short delay
      setTimeout(pollProgress, 500);

      // Set timeout
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          (
            window.electronAPI as unknown as {
              removeSpriteSheetListeners?: () => void;
            }
          ).removeSpriteSheetListeners?.();
          resolve({
            success: false,
            error: `Sprite sheet generation timed out after ${Math.round(timeoutMs / 1000)} seconds`,
          });
        }
      }, timeoutMs);
    });
  }

  /**
   * Calculate optimal grid dimensions to minimize empty slots while maintaining reasonable dimensions
   * Force single row for uneven counts to avoid black cells
   */
  private static calculateOptimalGrid(frameCount: number): {
    cols: number;
    rows: number;
    emptySlots: number;
  } {
    if (frameCount <= 0) return { cols: 1, rows: 1, emptySlots: 0 };

    // ALWAYS use single row for precise frame count to avoid empty cells
    // This prevents black strips from empty grid slots
    if (frameCount <= 50) {
      return { cols: frameCount, rows: 1, emptySlots: 0 };
    }

    // For larger counts, prefer configurations that result in zero empty slots
    // Try to find perfect divisors first
    const perfectDivisors = [];
    for (let i = 1; i <= Math.sqrt(frameCount); i++) {
      if (frameCount % i === 0) {
        perfectDivisors.push({ cols: i, rows: frameCount / i });
        if (i !== frameCount / i) {
          perfectDivisors.push({ cols: frameCount / i, rows: i });
        }
      }
    }

    // If we have perfect divisors, choose the one with best aspect ratio
    if (perfectDivisors.length > 0) {
      let bestDivisor = perfectDivisors[0];
      let bestAspectRatio = Math.max(
        bestDivisor.cols / bestDivisor.rows,
        bestDivisor.rows / bestDivisor.cols,
      );

      for (const divisor of perfectDivisors) {
        const aspectRatio = Math.max(
          divisor.cols / divisor.rows,
          divisor.rows / divisor.cols,
        );
        if (aspectRatio < bestAspectRatio && aspectRatio <= 10) {
          bestAspectRatio = aspectRatio;
          bestDivisor = divisor;
        }
      }

      console.log(
        `🎯 Perfect grid found: ${bestDivisor.cols}x${bestDivisor.rows} for ${frameCount} frames (0 empty slots)`,
      );
      return { cols: bestDivisor.cols, rows: bestDivisor.rows, emptySlots: 0 };
    }

    // Fallback: prefer single row to avoid any empty cells
    console.log(
      `📏 Using single row layout for ${frameCount} frames to avoid empty cells`,
    );
    return { cols: frameCount, rows: 1, emptySlots: 0 };
  }

  /**
   * Calculate optimal thumbnail interval for timeline coveragev
   */
  private static calculateOptimalInterval(duration: number): number {
    // For timeline display, we want dense coverage for smooth appearance
    // Adaptive interval based on video duration to balance quality and performance

    if (duration <= 5) {
      return 0.1; // Very dense for short videos
    } else if (duration <= 30) {
      return 0.25; // Dense coverage for short videos
    } else if (duration <= 120) {
      return 0.5; // Good coverage for medium videos
    } else if (duration <= 600) {
      return 1.0; // Reasonable coverage for long videos
    } else if (duration <= 3599 && duration >= 601) {
      return duration / 300;
    } else if (duration >= 3600) {
      return duration / 1200; // Sparse coverage for very long videos to prevent memory issues
    } else {
      return 2.0;
    }
  }

  /**
   * Generate cache key for sprite sheet options
   */
  private static createCacheKey(options: SpriteSheetOptions): string {
    const {
      videoPath,
      duration,
      thumbWidth = 120,
      thumbHeight = 68,
      sourceStartTime = 0,
      intervalSeconds,
    } = options;

    // Use filename instead of full path for better cache sharing
    const filename = videoPath.split(/[\\/]/).pop() || videoPath;
    const calculatedInterval =
      intervalSeconds || this.calculateOptimalInterval(duration);

    // Round values to reduce cache fragmentation
    const roundedInterval = Math.round(calculatedInterval * 100) / 100;
    const roundedDuration = Math.round(duration * 10) / 10;
    const roundedStartTime = Math.round(sourceStartTime * 10) / 10;

    return `sprite_png_v3_${filename}_${roundedStartTime}_${roundedDuration}_${roundedInterval}_${thumbWidth}x${thumbHeight}`;
  }

  /**
   * Get cached sprite sheets if available
   */
  static async getCachedSpriteSheets(
    options: SpriteSheetOptions,
  ): Promise<SpriteSheetGenerationResult | null> {
    // Initialize cache if not already done
    await this.initializeCache();

    const cacheKey = this.createCacheKey(options);
    const cached = this.spriteSheetCache.get(cacheKey);

    if (cached) {
      // Validate that cached URLs are still accessible
      const isValid = await this.validateCacheEntry(cached);
      if (isValid) {
        this.cacheAccessTimes.set(cacheKey, Date.now());
        console.log(`✅ Sprite sheet cache HIT for ${cacheKey}`);
        return cached;
      } else {
        // Remove invalid cache entry
        this.spriteSheetCache.delete(cacheKey);
        this.cacheAccessTimes.delete(cacheKey);
        console.log(`❌ Sprite sheet cache INVALID for ${cacheKey}, removed`);
      }
    } else {
      console.log(`❌ Sprite sheet cache MISS for ${cacheKey}`);
    }

    return null;
  }

  /**
   * Clear sprite sheet cache
   */
  static clearCache(): void {
    this.spriteSheetCache.clear();
    this.cacheAccessTimes.clear();

    // Clear persistent storage
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(this.CACHE_STORAGE_KEY);
    }

    console.log('🧹 Sprite sheet cache cleared (memory and storage)');
  }

  /**
   * Get cache statistics for debugging
   */
  static getCacheStats() {
    return {
      size: this.spriteSheetCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      keys: Array.from(this.spriteSheetCache.keys()),
      activeGenerations: this.activeGenerations.size,
    };
  }

  /**
   * Remove specific video from cache
   */
  static removeCacheEntry(videoPath: string): void {
    const filename = videoPath.split(/[\\/]/).pop() || videoPath;
    const keysToRemove = Array.from(this.spriteSheetCache.keys()).filter(
      (key) => key.includes(filename),
    );
    keysToRemove.forEach((key) => {
      this.spriteSheetCache.delete(key);
      this.cacheAccessTimes.delete(key);
    });
    console.log(
      `🗑️ Removed ${keysToRemove.length} sprite sheet cache entries for ${filename}`,
    );
  }

  /**
   * Clean up old cache entries when limit is reached with intelligent eviction
   */
  private static cleanupCache() {
    if (this.spriteSheetCache.size <= this.MAX_CACHE_SIZE) return;

    console.log(
      `🧹 Cleaning up sprite sheet cache (current size: ${this.spriteSheetCache.size})`,
    );

    // Create scoring system for cache eviction (LRU + size considerations)
    const cacheScores = new Map<string, number>();
    const now = Date.now();

    for (const [key, result] of this.spriteSheetCache.entries()) {
      const lastAccessed = this.cacheAccessTimes.get(key) || now;
      const ageMinutes = (now - lastAccessed) / (1000 * 60);
      const size = this.estimateCacheEntrySize(result);

      // Score: higher score = more likely to be evicted
      // Factor in age (older = higher score) and size (larger = higher score)
      const score = ageMinutes * 0.1 + size * 0.0001;
      cacheScores.set(key, score);
    }

    // Sort by score and remove highest scoring entries
    const sortedEntries = Array.from(cacheScores.entries())
      .sort(([, a], [, b]) => b - a) // Highest score first
      .slice(0, this.spriteSheetCache.size - this.MAX_CACHE_SIZE + 3); // Remove extra entries

    for (const [key] of sortedEntries) {
      this.spriteSheetCache.delete(key);
      this.cacheAccessTimes.delete(key);
    }

    // Update persistent storage
    this.saveCacheToStorage();

    console.log(
      `✅ Sprite sheet cache cleaned up (new size: ${this.spriteSheetCache.size})`,
    );
  }

  /**
   * Generate sprite sheets optimized for a specific track
   */
  static async generateForTrack(
    track: VideoTrack,
    fps: number,
  ): Promise<SpriteSheetGenerationResult> {
    if (track.type !== 'video' || !track.source) {
      throw new Error('Track must be a video track with a valid source');
    }

    const videoPath = track.tempFilePath || track.source;
    const durationSeconds = (track.endFrame - track.startFrame) / fps;
    console.log('calculated seconds: ' + durationSeconds);
    // Handle blob URLs (won't work with FFmpeg)
    if (videoPath.startsWith('blob:')) {
      throw new Error('Cannot generate sprite sheets from blob URL');
    }

    return this.generateSpriteSheets({
      videoPath,
      duration: durationSeconds,
      fps,
      sourceStartTime: track.sourceStartTime || 0,
      thumbWidth: 120, // Optimized size for timeline display
      thumbHeight: 68, // 16:9 aspect ratio
      maxThumbnailsPerSheet: 100, // Balance between file size and HTTP requests
      intervalSeconds: 6, // larger interval
    });
  }
}

export default VideoSpriteSheetGenerator;
