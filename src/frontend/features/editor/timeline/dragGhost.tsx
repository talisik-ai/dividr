import { cn } from '@/frontend/utils/utils';
import React, { useEffect, useRef } from 'react';
import { VideoTrack } from '../stores/videoEditor/index';
import { AudioWaveform } from './audioWaveform';
import { getTrackItemHeightClasses } from './utils/timelineConstants';
import { VideoSpriteSheetStrip } from './videoSpriteSheetStrip';

interface DragGhostProps {
  track: VideoTrack;
  frameWidth: number;
  zoomLevel: number;
  mouseX: number;
  mouseY: number;
  offsetX: number; // Offset from left edge of track to mouse cursor
  offsetY: number; // Offset from top edge of track to mouse cursor
}

/**
 * DragGhost - Floating preview of the dragged clip that follows the cursor
 *
 * Features:
 * - Matches exact size and aspect of the original clip
 * - Reduced opacity (0.6) with shadow for visual distinction
 * - Follows cursor smoothly using transform for performance
 * - Renders track content (video sprite sheet, audio waveform, or text)
 */
export const DragGhost: React.FC<DragGhostProps> = React.memo(
  ({ track, frameWidth, zoomLevel, mouseX, mouseY, offsetX, offsetY }) => {
    const ghostRef = useRef<HTMLDivElement>(null);

    // Calculate dimensions
    const width = Math.max(1, (track.endFrame - track.startFrame) * frameWidth);

    // Update position using RAF for smooth movement
    useEffect(() => {
      if (!ghostRef.current) return;

      const updatePosition = () => {
        if (!ghostRef.current) return;

        // Position the ghost so the cursor is at the same relative position
        // as when the user started dragging
        const left = mouseX - offsetX;
        const top = mouseY - offsetY;

        ghostRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      };

      requestAnimationFrame(updatePosition);
    }, [mouseX, mouseY, offsetX, offsetY]);

    const getTrackGradient = (type: VideoTrack['type']) => {
      switch (type) {
        case 'text':
          return 'hsl(0, 0%, 35%)';
        case 'subtitle':
          return 'hsl(0, 0%, 35%)';
        case 'video':
          return 'transparent';
        case 'audio':
          return 'hsl(var(--secondary) / 0.3)';
        case 'image':
          return 'linear-gradient(135deg, #e67e22, #f39c12)';
        default:
          return 'linear-gradient(135deg, #34495e, #7f8c8d)';
      }
    };

    // Render appropriate content based on track type
    const renderContent = () => {
      if (track.type === 'video') {
        return (
          <VideoSpriteSheetStrip
            track={track}
            frameWidth={frameWidth}
            width={width}
            height={44} // Use standard height for ghost
            zoomLevel={zoomLevel}
          />
        );
      }

      if (track.type === 'audio') {
        return (
          <div
            className={`w-full h-full ${track.muted ? 'opacity-50 grayscale' : ''}`}
          >
            <AudioWaveform
              track={track}
              frameWidth={frameWidth}
              width={width}
              height={44} // Use standard height for ghost
              zoomLevel={zoomLevel}
            />
          </div>
        );
      }

      // Text content for other track types
      return (
        <div className="text-white text-[11px] h-fit whitespace-nowrap overflow-hidden px-2 py-1">
          {track.type === 'subtitle' && track.subtitleText
            ? track.subtitleText
            : track.type === 'text' && track.textContent
              ? track.textContent
              : track.name}
        </div>
      );
    };

    return (
      <div
        ref={ghostRef}
        className={cn(
          'fixed top-0 left-0 pointer-events-none z-[9999]',
          'rounded flex items-center select-none overflow-hidden',
          'opacity-60 shadow-2xl border-2 border-secondary',
          getTrackItemHeightClasses(track.type),
        )}
        style={{
          width: `${width}px`,
          background: getTrackGradient(track.type),
          willChange: 'transform',
        }}
      >
        {renderContent()}

        {/* Status indicators */}
        {track.type === 'audio' && track.volume !== undefined && (
          <div className="absolute right-1 top-1 text-[8px] text-foreground z-20">
            {Math.round(track.volume * 100)}%
          </div>
        )}

        {track.locked && (
          <div className="absolute top-0.5 right-0.5 text-[10px] text-foreground/60 z-20">
            🔒
          </div>
        )}

        {track.isLinked && (
          <div
            className="absolute top-0.5 left-0.5 text-[10px] text-blue-400 z-20"
            title={`Linked to ${track.type === 'video' ? 'audio' : 'video'} track`}
          >
            🔗
          </div>
        )}
      </div>
    );
  },
);

DragGhost.displayName = 'DragGhost';
