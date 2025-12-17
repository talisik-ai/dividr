/**
 * VirtualTimelineManager
 *
 * Creates an abstraction layer that treats multiple timeline clips from the same
 * source as a unified playback sequence. This enables same-source transitions
 * without video element reload - just a seek operation.
 *
 * Key features:
 * - Groups timeline clips by source URL
 * - Pre-calculates all segment transitions
 * - Identifies "same-source transitions" where only a seek is needed
 * - Provides lookahead for preloading
 */

import { VideoTrack } from '../../stores/videoEditor/index';

// =============================================================================
// TYPES
// =============================================================================

export interface SourceSegment {
  trackId: string;
  sourceUrl: string;
  sourceStartTime: number; // In-point in source media (seconds)
  sourceEndTime: number; // Out-point in source media (seconds)
  timelineStartFrame: number;
  timelineEndFrame: number;
  trackRowIndex: number;
  layer: number;
}

export interface SegmentTransition {
  exitSegment: SourceSegment;
  enterSegment: SourceSegment;
  transitionFrame: number;
  isSameSource: boolean; // KEY: same source = no reload needed, just seek
  frameDelta: number; // Gap between exit and enter (negative = overlap)
}

export interface UpcomingSegment {
  segment: SourceSegment;
  framesUntilStart: number;
  requiresSourceChange: boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEBUG_VIRTUAL_TIMELINE = false;

function logVT(message: string, data?: unknown) {
  if (DEBUG_VIRTUAL_TIMELINE) {
    console.log(`[VirtualTimeline] ${message}`, data || '');
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the video source URL from a track.
 */
function getVideoSource(track: VideoTrack): string | undefined {
  if (!track) return undefined;
  if (track.previewUrl?.trim()) return track.previewUrl;
  if (track.source?.trim()) {
    const src = track.source.trim();
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    return `http://localhost:3001/${encodeURIComponent(src)}`;
  }
  return undefined;
}

/**
 * Convert a VideoTrack to a SourceSegment.
 */
function trackToSegment(track: VideoTrack, fps: number): SourceSegment | null {
  const sourceUrl = getVideoSource(track);
  if (!sourceUrl) return null;

  const durationFrames = track.endFrame - track.startFrame;
  const durationSeconds = durationFrames / fps;

  return {
    trackId: track.id,
    sourceUrl,
    sourceStartTime: track.sourceStartTime || 0,
    sourceEndTime: (track.sourceStartTime || 0) + durationSeconds,
    timelineStartFrame: track.startFrame,
    timelineEndFrame: track.endFrame,
    trackRowIndex: track.trackRowIndex ?? 0,
    layer: track.layer ?? 0,
  };
}

// =============================================================================
// VIRTUAL TIMELINE MANAGER CLASS
// =============================================================================

export class VirtualTimelineManager {
  private segments: SourceSegment[] = [];
  private segmentsBySource: Map<string, SourceSegment[]> = new Map();
  private transitions: SegmentTransition[] = [];
  private fps: number;

  constructor(tracks: VideoTrack[], fps: number) {
    this.fps = fps;
    this.buildFromTracks(tracks);
  }

  /**
   * Rebuild the virtual timeline from tracks.
   */
  buildFromTracks(tracks: VideoTrack[]): void {
    this.segments = [];
    this.segmentsBySource.clear();
    this.transitions = [];

    // Convert video tracks to segments
    const videoTracks = tracks.filter(
      (t) => t.type === 'video' && t.visible && getVideoSource(t),
    );

    for (const track of videoTracks) {
      const segment = trackToSegment(track, this.fps);
      if (segment) {
        this.segments.push(segment);

        // Group by source
        if (!this.segmentsBySource.has(segment.sourceUrl)) {
          this.segmentsBySource.set(segment.sourceUrl, []);
        }
        this.segmentsBySource.get(segment.sourceUrl)!.push(segment);
      }
    }

    // Sort segments by timeline position
    this.segments.sort((a, b) => a.timelineStartFrame - b.timelineStartFrame);

    // Sort each source's segments by timeline position
    for (const segments of this.segmentsBySource.values()) {
      segments.sort((a, b) => a.timelineStartFrame - b.timelineStartFrame);
    }

    // Pre-calculate transitions
    this.calculateTransitions();

    logVT('Built virtual timeline', {
      segmentCount: this.segments.length,
      sourceCount: this.segmentsBySource.size,
      transitionCount: this.transitions.length,
    });
  }

  /**
   * Get the segment at a specific frame (if any).
   */
  getSegmentAtFrame(frame: number): SourceSegment | null {
    for (const segment of this.segments) {
      if (
        frame >= segment.timelineStartFrame &&
        frame < segment.timelineEndFrame
      ) {
        return segment;
      }
    }
    return null;
  }

  /**
   * Get all segments that are active at a specific frame (for multi-layer).
   */
  getSegmentsAtFrame(frame: number): SourceSegment[] {
    return this.segments.filter(
      (s) => frame >= s.timelineStartFrame && frame < s.timelineEndFrame,
    );
  }

  /**
   * Get upcoming segments within N frames for preloading.
   */
  getUpcomingSegments(
    currentFrame: number,
    lookaheadFrames: number,
  ): UpcomingSegment[] {
    const upcoming: UpcomingSegment[] = [];
    const checkEndFrame = currentFrame + lookaheadFrames;

    // Get current segment to check for same-source
    const currentSegment = this.getSegmentAtFrame(currentFrame);

    for (const segment of this.segments) {
      // Skip segments that have already started
      if (segment.timelineStartFrame <= currentFrame) continue;

      // Skip segments too far in the future
      if (segment.timelineStartFrame > checkEndFrame) continue;

      upcoming.push({
        segment,
        framesUntilStart: segment.timelineStartFrame - currentFrame,
        requiresSourceChange: currentSegment
          ? segment.sourceUrl !== currentSegment.sourceUrl
          : true,
      });
    }

    // Sort by proximity
    upcoming.sort((a, b) => a.framesUntilStart - b.framesUntilStart);

    return upcoming;
  }

  /**
   * Get transitions that will occur within N frames.
   */
  getTransitionsWithin(
    currentFrame: number,
    framesToCheck: number,
  ): SegmentTransition[] {
    const checkEndFrame = currentFrame + framesToCheck;

    return this.transitions.filter(
      (t) =>
        t.transitionFrame > currentFrame && t.transitionFrame <= checkEndFrame,
    );
  }

  /**
   * Find the next transition from the current frame.
   */
  getNextTransition(currentFrame: number): SegmentTransition | null {
    for (const transition of this.transitions) {
      if (transition.transitionFrame > currentFrame) {
        return transition;
      }
    }
    return null;
  }

  /**
   * Check if a frame is at or near a segment boundary.
   */
  isNearBoundary(frame: number, toleranceFrames = 2): boolean {
    for (const segment of this.segments) {
      if (
        Math.abs(frame - segment.timelineStartFrame) <= toleranceFrames ||
        Math.abs(frame - segment.timelineEndFrame) <= toleranceFrames
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all unique source URLs in the timeline.
   */
  getAllSources(): string[] {
    return Array.from(this.segmentsBySource.keys());
  }

  /**
   * Get all segments for a specific source.
   */
  getSegmentsForSource(sourceUrl: string): SourceSegment[] {
    return this.segmentsBySource.get(sourceUrl) || [];
  }

  /**
   * Check if two consecutive segments share the same source.
   * This is the key optimization - same source means we can just seek.
   */
  isSameSourceTransition(
    currentSegment: SourceSegment,
    nextSegment: SourceSegment,
  ): boolean {
    return currentSegment.sourceUrl === nextSegment.sourceUrl;
  }

  /**
   * Get statistics about the virtual timeline.
   */
  getStats(): {
    totalSegments: number;
    uniqueSources: number;
    sameSourceTransitions: number;
    differentSourceTransitions: number;
  } {
    const sameSource = this.transitions.filter((t) => t.isSameSource).length;
    const differentSource = this.transitions.filter(
      (t) => !t.isSameSource,
    ).length;

    return {
      totalSegments: this.segments.length,
      uniqueSources: this.segmentsBySource.size,
      sameSourceTransitions: sameSource,
      differentSourceTransitions: differentSource,
    };
  }

  /**
   * Get all segments in timeline order.
   */
  getAllSegments(): SourceSegment[] {
    return [...this.segments];
  }

  /**
   * Get all transitions.
   */
  getAllTransitions(): SegmentTransition[] {
    return [...this.transitions];
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private calculateTransitions(): void {
    this.transitions = [];

    // Sort segments by end frame to find sequential transitions
    const sortedByEnd = [...this.segments].sort(
      (a, b) => a.timelineEndFrame - b.timelineEndFrame,
    );

    for (const exitSegment of sortedByEnd) {
      // Find the segment that starts at or after this one ends
      const enterSegment = this.segments.find(
        (s) =>
          s.trackId !== exitSegment.trackId &&
          s.timelineStartFrame >= exitSegment.timelineEndFrame - 1 &&
          s.timelineStartFrame <= exitSegment.timelineEndFrame + 1,
      );

      if (enterSegment) {
        const frameDelta =
          enterSegment.timelineStartFrame - exitSegment.timelineEndFrame;

        this.transitions.push({
          exitSegment,
          enterSegment,
          transitionFrame: exitSegment.timelineEndFrame,
          isSameSource: exitSegment.sourceUrl === enterSegment.sourceUrl,
          frameDelta,
        });

        logVT('Found transition', {
          from: exitSegment.trackId,
          to: enterSegment.trackId,
          frame: exitSegment.timelineEndFrame,
          isSameSource: exitSegment.sourceUrl === enterSegment.sourceUrl,
        });
      }
    }

    // Sort transitions by frame
    this.transitions.sort((a, b) => a.transitionFrame - b.transitionFrame);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new VirtualTimelineManager from tracks.
 */
export function createVirtualTimeline(
  tracks: VideoTrack[],
  fps: number,
): VirtualTimelineManager {
  return new VirtualTimelineManager(tracks, fps);
}

export default VirtualTimelineManager;
