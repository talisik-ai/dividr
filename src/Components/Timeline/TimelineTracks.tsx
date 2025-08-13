import React, { useCallback, useRef } from 'react';
import Draggable from 'react-draggable';
import { VideoTrack } from '../../store/videoEditorStore';

interface TimelineTracksProps {
  tracks: VideoTrack[];
  frameWidth: number;
  timelineWidth: number;
  scrollX: number;
  currentFrame: number;
  selectedTrackIds: string[];
  onTrackSelect: (trackIds: string[]) => void;
}

interface TrackItemProps {
  track: VideoTrack;
  frameWidth: number;
  scrollX: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (newStartFrame: number) => void;
}

export const TrackItem: React.FC<TrackItemProps> = ({
  track,
  frameWidth,
  scrollX,
  isSelected,
  onSelect,
  onMove,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null); // ✅ create nodeRef

  const width = (track.endFrame - track.startFrame) * frameWidth;
  const left = track.startFrame * frameWidth - scrollX;

  const handleDrag = useCallback(
    (_: any, data: { x: number }) => {
      const newStartFrame = Math.max(
        0,
        Math.round((data.x + scrollX) / frameWidth)
      );
      onMove(newStartFrame);
    },
    [frameWidth, scrollX, onMove]
  );

  const getTrackGradient = (type: VideoTrack['type']) => {
    switch (type) {
      case 'video':
        return 'linear-gradient(135deg, #8e44ad, #9b59b6)';
      case 'audio':
        return 'linear-gradient(135deg, #27ae60, #2ecc71)';
      case 'image':
        return 'linear-gradient(135deg, #e67e22, #f39c12)';
      default:
        return 'linear-gradient(135deg, #34495e, #7f8c8d)';
    }
  };

  return (
    <Draggable
      nodeRef={nodeRef} // ✅ pass nodeRef to Draggable
      axis="x"
      position={{ x: left, y: 0 }}
      onDrag={handleDrag}
      grid={[frameWidth, 1]}
      disabled={track.locked}
    >
      <div
        ref={nodeRef} // ✅ attach nodeRef to the draggable element
        style={{
          position: 'absolute',
          width: width,
          height: '50px',
          background: getTrackGradient(track.type),
          border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
          borderRadius: '4px',
          cursor: track.locked ? 'not-allowed' : 'grab',
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          opacity: track.visible ? 1 : 0.5,
          overflow: 'hidden',
          userSelect: 'none',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <div
          style={{
            color: 'white',
            fontSize: '11px',
            fontWeight: 'bold',
            textShadow: '1px 1px 2px rgba(0,0,0,0.7)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {track.name}
        </div>

        {track.type === 'audio' && track.volume !== undefined && (
          <div
            style={{
              position: 'absolute',
              right: '4px',
              top: '4px',
              fontSize: '8px',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            {Math.round(track.volume * 100)}%
          </div>
        )}

        {track.locked && (
          <div
            style={{
              position: 'absolute',
              right: '4px',
              bottom: '4px',
              width: '8px',
              height: '8px',
              backgroundColor: 'rgba(255,255,255,0.8)',
              borderRadius: '2px',
            }}
          />
        )}
      </div>
    </Draggable>
  );
};

export const TimelineTracks: React.FC<TimelineTracksProps> = ({
  tracks,
  frameWidth,
  timelineWidth,
  scrollX,
  currentFrame,
  selectedTrackIds,
  onTrackSelect,
}) => {
  const handleTrackSelect = useCallback((trackId: string, multiSelect = false) => {
    if (multiSelect) {
      const newSelection = selectedTrackIds.includes(trackId)
        ? selectedTrackIds.filter(id => id !== trackId)
        : [...selectedTrackIds, trackId];
      onTrackSelect(newSelection);
    } else {
      onTrackSelect([trackId]);
    }
  }, [selectedTrackIds, onTrackSelect]);

  const handleTrackMove = useCallback((trackId: string, newStartFrame: number) => {
    // This would be handled by the store's moveTrack action
    // For now, we'll just log it
    console.log(`Move track ${trackId} to frame ${newStartFrame}`);
  }, []);

  return (
    <div style={{
      position: 'relative',
      width: timelineWidth,
      minHeight: '100%',
      backgroundColor: '#1a1a1a',
    }}>
      {/* Grid lines */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: -scrollX,
        width: timelineWidth,
        height: '100%',
        background: `repeating-linear-gradient(
          90deg,
          transparent,
          transparent ${frameWidth * 30 - 1}px,
          rgba(255,255,255,0.05) ${frameWidth * 30 - 1}px,
          rgba(255,255,255,0.05) ${frameWidth * 30}px
        )`,
        pointerEvents: 'none',
      }} />

      {/* Track rows */}
      {tracks.map((track, index) => (
        <div
          key={track.id}
          style={{
            position: 'relative',
            height: '60px',
            borderBottom: '1px solid #3d3d3d',
            paddingTop: '5px',
          }}
        >
          <TrackItem
            track={track}
            frameWidth={frameWidth}
            scrollX={scrollX}
            isSelected={selectedTrackIds.includes(track.id)}
            onSelect={() => handleTrackSelect(track.id)}
            onMove={(newStartFrame) => handleTrackMove(track.id, newStartFrame)}
          />
        </div>
      ))}

      {/* Drop zone for new tracks */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40px',
          border: '2px dashed #555',
          borderRadius: '4px',
          margin: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontSize: '12px',
        }}
      >
        Drop media files here to add tracks
      </div>
    </div>
  );
}; 