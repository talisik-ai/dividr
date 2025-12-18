/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ProcessedTimeline,
  ProcessedTimelineSegment,
  VideoEditJob,
} from '../schema/ffmpegConfig';

/**
 * Represents a single layer that may contain video, image, and/or text content
 */
export interface LayerTrack {
  type: 'video' | 'image' | 'text';
  layer: number;
  videoTimeline?: ProcessedTimeline;
  imageSegments?: ProcessedTimelineSegment[];
  textSegments?: any[];
}

/**
 * Collects all layers from video, image, and text sources
 * Organizes them by layer number for proper compositing order
 */
export function collectAllLayers(
  videoLayers: Map<number, ProcessedTimeline>,
  imageLayers: Map<number, ProcessedTimeline>,
  job: VideoEditJob,
): Map<number, LayerTrack> {
  const allLayers = new Map<number, LayerTrack>();

  // Add video layers
  for (const [layerNum, timeline] of videoLayers.entries()) {
    allLayers.set(layerNum, {
      type: 'video',
      layer: layerNum,
      videoTimeline: timeline,
    });
  }

  // Add image layers (may overlap with video layers)
  for (const [layerNum, timeline] of imageLayers.entries()) {
    if (allLayers.has(layerNum)) {
      // Layer already exists (has video) - add images to it
      const existing = allLayers.get(layerNum);
      if (!existing) {
        continue;
      }
      existing.imageSegments = timeline.segments;
    } else {
      allLayers.set(layerNum, {
        type: 'image',
        layer: layerNum,
        imageSegments: timeline.segments,
      });
    }
  }

  // Add text layers (may overlap with video/image layers)
  // Include ALL text segments, even empty ones, as they still occupy layer positions
  const textSegmentsForProcessing = job.textClips
    ? (job.textClips.filter(
        (clip: any) =>
          clip.startTime !== undefined && clip.endTime !== undefined,
      ) as any[])
    : [];

  console.log(
    `📝 Found ${textSegmentsForProcessing.length} text segment(s) for processing`,
  );
  textSegmentsForProcessing.forEach((seg, idx) => {
    console.log(
      `   Text segment ${idx + 1}: layer=${seg.layer ?? 0}, text="${seg.text || '(empty)'}", time=[${seg.startTime?.toFixed(2)}s-${seg.endTime?.toFixed(2)}s]`,
    );
  });

  // Group text segments by layer
  const textByLayer = new Map<number, any[]>();
  textSegmentsForProcessing.forEach((segment: any) => {
    const layer = segment.layer ?? 0;
    if (!textByLayer.has(layer)) {
      textByLayer.set(layer, []);
    }
    const existing = textByLayer.get(layer);
    if (!existing) {
      return;
    }
    existing.push(segment);
  });

  console.log(
    `📝 Text segments grouped by layer:`,
    Array.from(textByLayer.entries())
      .map(([layer, segs]) => `Layer ${layer}: ${segs.length} segment(s)`)
      .join(', '),
  );

  // Add text to layers
  for (const [layerNum, segments] of textByLayer.entries()) {
    if (allLayers.has(layerNum)) {
      // Layer already exists - add text to it
      const existing = allLayers.get(layerNum);
      if (!existing) {
        continue;
      }
      existing.textSegments = segments;
    } else {
      allLayers.set(layerNum, {
        type: 'text',
        layer: layerNum,
        textSegments: segments,
      });
    }
  }

  return allLayers;
}

/**
 * Sorts layers by layer number (ascending)
 * Lower layer numbers are processed first, higher layers overlay on top
 */
export function sortLayersByNumber(
  layers: Map<number, LayerTrack>,
): Array<[number, LayerTrack]> {
  return Array.from(layers.entries()).sort((a, b) => a[0] - b[0]);
}

/**
 * Calculates the total duration across all video and image layers
 * Used for overlay end times to ensure overlays stay visible
 */
export function calculateTotalVideoDuration(
  videoLayers: Map<number, ProcessedTimeline>,
  imageLayers: Map<number, ProcessedTimeline>,
  audioTimeline: ProcessedTimeline,
): number {
  let totalDuration = audioTimeline.totalDuration;
  for (const timeline of videoLayers.values()) {
    totalDuration = Math.max(totalDuration, timeline.totalDuration);
  }
  for (const timeline of imageLayers.values()) {
    totalDuration = Math.max(totalDuration, timeline.totalDuration);
  }
  return totalDuration;
}

/**
 * Finds the bottom-most video/image layer (lowest layer number)
 * This layer will have gaps filled with black video
 */
export function findBottomMostVideoImageLayer(
  sortedLayers: Array<[number, LayerTrack]>,
): number | null {
  return (
    sortedLayers.find(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ([num, track]) => track.videoTimeline || track.imageSegments,
    )?.[0] ?? null
  );
}

/**
 * Represents a single overlay item in the compositing order
 */
export interface OverlayItem {
  layer: number;
  type: 'video' | 'image' | 'text';
  segment?: ProcessedTimelineSegment | any; // Image segment or TextSegment
  videoTimeline?: ProcessedTimeline; // For video layers
  layerLabel?: string; // Prepared layer label for video layers (e.g., "layer_0")
}

/**
 * Builds the complete overlay order by collecting all overlays from all layers
 * and sorting them by layer number. This ensures proper z-ordering.
 *
 * Returns overlays sorted by layer number, with video layers prepared first.
 */
export function buildOverlayOrder(
  sortedLayers: Array<[number, LayerTrack]>,
): OverlayItem[] {
  const allOverlays: OverlayItem[] = [];

  for (const [layerNum, track] of sortedLayers) {
    // Add video timeline as overlay item (with layer label to be set later)
    if (track.videoTimeline) {
      allOverlays.push({
        layer: layerNum,
        type: 'video',
        videoTimeline: track.videoTimeline,
        layerLabel: `layer_${layerNum}`, // Will be prepared before compositing
      });
    }

    // Add image segments as overlay items
    if (track.imageSegments && track.imageSegments.length > 0) {
      track.imageSegments.forEach((imageSegment: ProcessedTimelineSegment) => {
        allOverlays.push({
          layer: layerNum,
          type: 'image',
          segment: imageSegment,
        });
      });
    }

    // Add text segments as overlay items
    if (track.textSegments && track.textSegments.length > 0) {
      track.textSegments.forEach((textSegment: any) => {
        allOverlays.push({
          layer: layerNum,
          type: 'text',
          segment: textSegment,
        });
      });
    }
  }

  // Sort by layer number (ascending) - lower layers processed first, higher layers on top
  allOverlays.sort((a, b) => a.layer - b.layer);

  return allOverlays;
}
