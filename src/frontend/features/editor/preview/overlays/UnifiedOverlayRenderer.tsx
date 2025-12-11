/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useMemo, useRef } from 'react';
import { useVideoEditorStore, VideoTrack } from '../../stores/videoEditor';
import { ImageTransformBoundary } from '../components/ImageTransformBoundary';
import { SubtitleTransformBoundary } from '../components/SubtitleTransformBoundary';
import { TextTransformBoundary } from '../components/TextTransformBoundary';
import { VideoTransformBoundary } from '../components/VideoTransformBoundary';
import {
  SUBTITLE_PADDING_HORIZONTAL,
  SUBTITLE_PADDING_VERTICAL,
  TEXT_CLIP_PADDING_HORIZONTAL,
  TEXT_CLIP_PADDING_VERTICAL,
} from '../core/constants';
import { OverlayRenderProps } from '../core/types';
import { scaleTextShadow } from '../utils/scalingUtils';
import { getTextStyleForTextClip } from '../utils/textStyleUtils';
import {
  getActiveVisualTracksAtFrame,
  getTrackZIndex,
} from '../utils/trackUtils';
import { DualBufferVideo, DualBufferVideoRef } from './DualBufferVideoOverlay';
import { MultiAudioPlayer } from './MultiAudioOverlay';

export interface UnifiedOverlayRendererProps extends OverlayRenderProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  activeVideoTrack?: VideoTrack;
  independentAudioTrack?: VideoTrack;
  /** ALL active video tracks for multi-layer compositing */
  activeVideoTracks?: VideoTrack[];
  /** ALL active independent audio tracks for multi-audio mixing */
  activeIndependentAudioTracks?: VideoTrack[];
  onVideoLoadedMetadata: () => void;
  isPlaying?: boolean;
  isMuted?: boolean;
  volume?: number;
  playbackRate?: number;
  fps?: number;

  setCurrentFrame?: (frame: number) => void;
  onVideoTransformUpdate: (trackId: string, transform: any) => void;
  onVideoSelect: (trackId: string) => void;
  allTracks: VideoTrack[];
  selectedTrackIds: string[];
  currentFrame: number;
  isTextEditMode?: boolean;
  getTextStyleForSubtitle: (style: any, segmentStyle?: any) => any;
  activeStyle: any;
  globalSubtitlePosition: { x: number; y: number };
  onSubtitleTransformUpdate: (trackId: string, transform: any) => void;
  onSubtitleSelect: (trackId: string) => void;
  onSubtitleTextUpdate?: (trackId: string, newText: string) => void;
  onImageTransformUpdate: (trackId: string, transform: any) => void;
  onImageSelect: (trackId: string) => void;
  onTextTransformUpdate: (trackId: string, transform: any) => void;
  onTextSelect: (trackId: string) => void;
  onTextUpdate: (trackId: string, newText: string) => void;
  pendingEditTextId?: string | null;
  onEditStarted?: () => void;
  onRotationStateChange: (isRotating: boolean) => void;
  onDragStateChange: (isDragging: boolean, position?: any) => void;
}

type InteractionMode = 'select' | 'pan' | 'text-edit';

export const UnifiedOverlayRenderer: React.FC<UnifiedOverlayRendererProps> = ({
  videoRef,
  activeVideoTrack,
  independentAudioTrack,
  activeVideoTracks,
  activeIndependentAudioTracks,
  onVideoLoadedMetadata,
  onVideoTransformUpdate,
  onVideoSelect,
  isPlaying = false,
  isMuted = false,
  volume = 1,
  playbackRate = 1,
  fps = 30,
  setCurrentFrame,
  allTracks,
  selectedTrackIds,
  currentFrame,
  isTextEditMode = false,
  previewScale,
  panX,
  panY,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
  coordinateSystem,
  interactionMode,
  getTextStyleForSubtitle,
  activeStyle,
  globalSubtitlePosition,
  onSubtitleTransformUpdate,
  onSubtitleSelect,
  onSubtitleTextUpdate,
  onImageTransformUpdate,
  onImageSelect,
  onTextTransformUpdate,
  onTextSelect,
  onTextUpdate,
  pendingEditTextId,
  onEditStarted,
  onRotationStateChange,
  onDragStateChange,
}) => {
  const renderScale = coordinateSystem.baseScale;
  const dualBufferRef = useRef<DualBufferVideoRef>(null);

  const setPreviewInteractionMode = useVideoEditorStore(
    (state) => state.setPreviewInteractionMode,
  );

  const handleEditModeChange = useCallback(
    (isEditing: boolean) => {
      if (isEditing) setPreviewInteractionMode('text-edit');
    },
    [setPreviewInteractionMode],
  );

  // Sync videoRef to DualBufferVideo's active element
  const handleActiveVideoChange = useCallback(
    (video: HTMLVideoElement) => {
      if (videoRef) {
        (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current =
          video;
      }
    },
    [videoRef],
  );

  // Handle frame updates from DualBufferVideo
  const handleFrameUpdate = useCallback(
    (frame: number) => {
      if (setCurrentFrame) {
        setCurrentFrame(frame);
      }
    },
    [setCurrentFrame],
  );

  // Get sorted visual tracks
  const sortedVisualTracks = useMemo(
    () => getActiveVisualTracksAtFrame(allTracks, currentFrame),
    [allTracks, currentFrame],
  );

  const activeSubtitles = useMemo(
    () =>
      sortedVisualTracks.filter((t) => t.type === 'subtitle' && t.subtitleText),
    [sortedVisualTracks],
  );

  // Get all video tracks to render (multi-layer support)
  const videoRenderInfos = useMemo(() => {
    // Use activeVideoTracks if provided, otherwise fall back to single activeVideoTrack
    const videoTracksToRender = activeVideoTracks?.length
      ? activeVideoTracks
      : activeVideoTrack
        ? [activeVideoTrack]
        : [];

    return videoTracksToRender.map((track) => {
      const transform = track.textTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: track.width || baseVideoWidth,
        height: track.height || baseVideoHeight,
      };

      return {
        track,
        videoWidth:
          (transform.width || track.width || baseVideoWidth) * renderScale,
        videoHeight:
          (transform.height || track.height || baseVideoHeight) * renderScale,
        zIndex: getTrackZIndex(track, allTracks),
        isSelected: selectedTrackIds.includes(track.id),
        isHidden: !track.visible,
        // First video track handles audio if no independent audio tracks
        handlesAudio:
          track === videoTracksToRender[0] && !independentAudioTrack,
      };
    });
  }, [
    activeVideoTracks,
    activeVideoTrack,
    baseVideoWidth,
    baseVideoHeight,
    renderScale,
    allTracks,
    selectedTrackIds,
    independentAudioTrack,
  ]);

  const subtitleZIndex = useMemo(() => {
    if (activeSubtitles.length === 0) return 0;
    return Math.max(
      ...activeSubtitles.map((t) => getTrackZIndex(t, allTracks)),
    );
  }, [activeSubtitles, allTracks]);

  // Determine which video track (if any) should handle embedded audio
  const videoIndexWithAudio = useMemo(() => {
    // If there are ANY independent audio tracks, NO video handles audio
    if (activeIndependentAudioTracks?.length || independentAudioTrack) {
      return -1; // No video handles audio
    }

    // Find the first (lowest z-index) video track that has linked audio
    // and whose linked audio is not muted
    const videoTracksToCheck =
      activeVideoTracks || (activeVideoTrack ? [activeVideoTrack] : []);

    for (let i = 0; i < videoTracksToCheck.length; i++) {
      const track = videoTracksToCheck[i];

      if (track.isLinked && track.linkedTrackId) {
        // Check if linked audio track is muted
        const linkedAudio = allTracks.find((t) => t.id === track.linkedTrackId);
        if (linkedAudio && !linkedAudio.muted) {
          return i; // This video handles audio
        }
      }
    }

    return -1; // No video handles audio
  }, [
    activeVideoTracks,
    activeVideoTrack,
    activeIndependentAudioTracks,
    independentAudioTrack,
    allTracks,
  ]);

  // Helper function for render
  const shouldVideoHandleAudio = useCallback(
    (trackIndex: number): boolean => {
      return trackIndex === videoIndexWithAudio;
    },
    [videoIndexWithAudio],
  );

  // Render non-video tracks
  const renderNonVideoTrack = useCallback(
    (track: VideoTrack) => {
      const zIndex = getTrackZIndex(track, allTracks);
      const isSelected = selectedTrackIds.includes(track.id);

      if (track.type === 'image') {
        return renderImageTrack(
          track,
          zIndex,
          isSelected,
          renderScale,
          previewScale,
          baseVideoWidth,
          baseVideoHeight,
          actualWidth,
          actualHeight,
          panX,
          panY,
          interactionMode,
          onImageTransformUpdate,
          onImageSelect,
          onRotationStateChange,
          onDragStateChange,
        );
      }

      if (track.type === 'text') {
        return renderTextTrack(
          track,
          zIndex,
          isSelected,
          renderScale,
          previewScale,
          baseVideoWidth,
          baseVideoHeight,
          actualWidth,
          actualHeight,
          panX,
          panY,
          interactionMode,
          isTextEditMode,
          onTextTransformUpdate,
          onTextSelect,
          onTextUpdate,
          onRotationStateChange,
          onDragStateChange,
          handleEditModeChange,
          pendingEditTextId,
          onEditStarted,
        );
      }

      return null;
    },
    [
      allTracks,
      selectedTrackIds,
      renderScale,
      previewScale,
      baseVideoWidth,
      baseVideoHeight,
      actualWidth,
      actualHeight,
      panX,
      panY,
      interactionMode,
      isTextEditMode,
      onImageTransformUpdate,
      onImageSelect,
      onTextTransformUpdate,
      onTextSelect,
      onTextUpdate,
      onRotationStateChange,
      onDragStateChange,
      handleEditModeChange,
      pendingEditTextId,
      onEditStarted,
    ],
  );

  const renderSubtitles = useCallback(() => {
    if (activeSubtitles.length === 0) return null;

    const hasSelected = activeSubtitles.some((t) =>
      selectedTrackIds.includes(t.id),
    );
    const selectedSub = activeSubtitles.find((t) =>
      selectedTrackIds.includes(t.id),
    );

    const globalTrack: VideoTrack = {
      ...activeSubtitles[0],
      id: 'global-subtitle-transform',
      subtitleTransform: globalSubtitlePosition,
    };

    return (
      <SubtitleTransformBoundary
        key="global-subtitle-transform"
        track={globalTrack}
        isSelected={hasSelected}
        isActive={true}
        previewScale={previewScale}
        videoWidth={baseVideoWidth}
        videoHeight={baseVideoHeight}
        actualWidth={actualWidth}
        actualHeight={actualHeight}
        panX={panX}
        panY={panY}
        zIndexOverlay={subtitleZIndex}
        renderScale={renderScale}
        isTextEditMode={isTextEditMode}
        interactionMode={interactionMode}
        onTransformUpdate={(_, transform) => {
          onSubtitleTransformUpdate(
            selectedSub?.id || activeSubtitles[0].id,
            transform,
          );
        }}
        onSelect={() => onSubtitleSelect(activeSubtitles[0]?.id)}
        onTextUpdate={
          selectedSub
            ? (_, text) => onSubtitleTextUpdate?.(selectedSub.id, text)
            : undefined
        }
        onDragStateChange={onDragStateChange}
        onEditModeChange={handleEditModeChange}
      >
        {activeSubtitles.map((track) =>
          renderSubtitleContent(
            track,
            getTextStyleForSubtitle,
            activeStyle,
            renderScale,
            baseVideoWidth,
            actualWidth,
            onSubtitleSelect,
          ),
        )}
      </SubtitleTransformBoundary>
    );
  }, [
    activeSubtitles,
    selectedTrackIds,
    globalSubtitlePosition,
    previewScale,
    baseVideoWidth,
    baseVideoHeight,
    actualWidth,
    actualHeight,
    panX,
    panY,
    subtitleZIndex,
    renderScale,
    isTextEditMode,
    interactionMode,
    onSubtitleTransformUpdate,
    onSubtitleSelect,
    onSubtitleTextUpdate,
    onDragStateChange,
    handleEditModeChange,
    getTextStyleForSubtitle,
    activeStyle,
  ]);

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================

  return (
    <>
      {/* VIDEO LAYERS - Render ALL active video tracks */}
      {videoRenderInfos.map((info, index) => (
        <div
          key={`video-container-${info.track.id}`}
          className="absolute inset-0 pointer-events-none"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: `calc(50% + ${panX}px)`,
            top: `calc(50% + ${panY}px)`,
            transform: 'translate(-50%, -50%)',
            overflow: 'visible',
            zIndex: info.zIndex,
          }}
        >
          <VideoTransformBoundary
            track={info.track}
            isSelected={info.isSelected}
            previewScale={coordinateSystem.baseScale}
            videoWidth={baseVideoWidth}
            videoHeight={baseVideoHeight}
            renderScale={renderScale}
            interactionMode={interactionMode}
            onTransformUpdate={onVideoTransformUpdate}
            onSelect={onVideoSelect}
            onRotationStateChange={onRotationStateChange}
            onDragStateChange={onDragStateChange}
            clipContent={true}
            clipWidth={actualWidth}
            clipHeight={actualHeight}
          >
            <div
              className="relative"
              style={{
                width: `${info.videoWidth}px`,
                height: `${info.videoHeight}px`,
                visibility: info.isHidden ? 'hidden' : 'visible',
                pointerEvents:
                  info.isHidden ||
                  interactionMode === 'pan' ||
                  interactionMode === 'text-edit'
                    ? 'none'
                    : 'auto',
              }}
            >
              <DualBufferVideo
                ref={index === 0 ? dualBufferRef : undefined}
                activeTrack={info.track}
                allTracks={allTracks}
                currentFrame={currentFrame}
                fps={fps}
                isPlaying={isPlaying}
                isMuted={isMuted}
                volume={volume}
                playbackRate={playbackRate}
                onLoadedMetadata={
                  index === 0 ? onVideoLoadedMetadata : undefined
                }
                onActiveVideoChange={
                  index === 0 ? handleActiveVideoChange : undefined
                }
                onFrameUpdate={index === 0 ? handleFrameUpdate : undefined}
                width={info.videoWidth}
                height={info.videoHeight}
                objectFit="contain"
                handleAudio={shouldVideoHandleAudio(index)}
              />
            </div>
          </VideoTransformBoundary>
        </div>
      ))}

      {(activeIndependentAudioTracks?.length || independentAudioTrack) && (
        <MultiAudioPlayer
          audioTracks={
            activeIndependentAudioTracks ||
            (independentAudioTrack ? [independentAudioTrack] : [])
          }
          currentFrame={currentFrame}
          fps={fps}
          isPlaying={isPlaying}
          isMuted={isMuted}
          volume={volume}
          playbackRate={playbackRate}
        />
      )}

      {/* Non-video tracks */}
      {sortedVisualTracks
        .filter((t) => t.type !== 'subtitle' && t.type !== 'video')
        .map((track) => renderNonVideoTrack(track))}

      {/* Subtitles */}
      {renderSubtitles()}
    </>
  );
};

// ==========================================================================
// HELPER RENDER FUNCTIONS
// ==========================================================================

function renderSubtitleContent(
  track: VideoTrack,
  getStyle: (style: any, seg?: any) => any,
  activeStyle: any,
  renderScale: number,
  baseVideoWidth: number,
  actualWidth: number,
  onSelect: (id: string) => void,
) {
  const style = getStyle(activeStyle, track.subtitleStyle);
  const fontSize = (parseFloat(style.fontSize) || 40) * renderScale;
  const padV = SUBTITLE_PADDING_VERTICAL * renderScale;
  const padH = SUBTITLE_PADDING_HORIZONTAL * renderScale;
  const shadow = scaleTextShadow(style.textShadow, renderScale);

  const base: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textTransform: style.textTransform,
    textDecoration: style.textDecoration,
    textAlign: style.textAlign,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing
      ? `${parseFloat(String(style.letterSpacing)) * renderScale}px`
      : undefined,
    display: 'inline-block', // Prevent block-level full-width wrapping
    width: 'fit-content', // Hug content while we clip at canvas bounds
    whiteSpace: 'pre', // Preserve explicit breaks; avoid soft wraps
    wordBreak: 'keep-all',
    overflowWrap: 'normal',
    padding: `${padV}px ${padH}px`,
  };

  return (
    <div
      key={`sub-${track.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(track.id);
      }}
    >
      <div
        style={{
          ...base,
          textShadow: shadow,
          color: style.color,
          backgroundColor: style.backgroundColor,
          opacity: style.opacity,
          maxWidth: 'none', // Avoid soft wrapping; rely on clipping
        }}
      >
        {track.subtitleText}
      </div>
    </div>
  );
}

function renderImageTrack(
  track: VideoTrack,
  zIndex: number,
  isSelected: boolean,
  renderScale: number,
  previewScale: number,
  baseVideoWidth: number,
  baseVideoHeight: number,
  actualWidth: number,
  actualHeight: number,
  panX: number,
  panY: number,
  interactionMode: InteractionMode | undefined,
  onTransformUpdate: (id: string, t: any) => void,
  onSelect: (id: string) => void,
  onRotationStateChange: (r: boolean) => void,
  onDragStateChange: (d: boolean, p?: any) => void,
) {
  const url = track.previewUrl || track.source;
  const w = track.width || baseVideoWidth;
  const h = track.height || baseVideoHeight;
  const t = track.textTransform || {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    width: w,
    height: h,
  };

  return (
    <div
      key={`img-${track.id}`}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'visible',
        zIndex,
      }}
    >
      <ImageTransformBoundary
        track={track}
        isSelected={isSelected}
        previewScale={previewScale}
        videoWidth={baseVideoWidth}
        videoHeight={baseVideoHeight}
        renderScale={renderScale}
        interactionMode={interactionMode}
        onTransformUpdate={onTransformUpdate}
        onSelect={onSelect}
        onRotationStateChange={onRotationStateChange}
        onDragStateChange={onDragStateChange}
        clipContent={true}
        clipWidth={actualWidth}
        clipHeight={actualHeight}
      >
        <div
          style={{
            width: `${(t.width || w) * renderScale}px`,
            height: `${(t.height || h) * renderScale}px`,
            opacity:
              track.textStyle?.opacity !== undefined
                ? track.textStyle.opacity / 100
                : 1,
            pointerEvents:
              interactionMode === 'pan' || interactionMode === 'text-edit'
                ? 'none'
                : 'auto',
          }}
        >
          <img
            src={url}
            alt={track.name}
            className="w-full h-full object-contain"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
            draggable={false}
          />
        </div>
      </ImageTransformBoundary>
    </div>
  );
}

function renderTextTrack(
  track: VideoTrack,
  zIndex: number,
  isSelected: boolean,
  renderScale: number,
  previewScale: number,
  baseVideoWidth: number,
  baseVideoHeight: number,
  actualWidth: number,
  actualHeight: number,
  panX: number,
  panY: number,
  interactionMode: InteractionMode | undefined,
  isTextEditMode: boolean,
  onTransformUpdate: (id: string, t: any) => void,
  onSelect: (id: string) => void,
  onTextUpdate: (id: string, text: string) => void,
  onRotationStateChange: (r: boolean) => void,
  onDragStateChange: (d: boolean, p?: any) => void,
  onEditModeChange: (e: boolean) => void,
  pendingEditTextId?: string | null,
  onEditStarted?: () => void,
) {
  const style = getTextStyleForTextClip(track);
  const scale = track.textTransform?.scale || 1;
  const fontSize = (parseFloat(style.fontSize) || 40) * renderScale * scale;
  const effScale = renderScale * scale;
  const padV = TEXT_CLIP_PADDING_VERTICAL * effScale;
  const padH = TEXT_CLIP_PADDING_HORIZONTAL * effScale;
  const shadow = scaleTextShadow(style.textShadow, effScale);

  const base: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textTransform: style.textTransform as any,
    textDecoration: style.textDecoration,
    textAlign: style.textAlign as any,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing
      ? `${parseFloat(String(style.letterSpacing)) * previewScale}px`
      : undefined,
    whiteSpace: 'pre-line',
    wordBreak: 'keep-all',
    overflowWrap: 'normal',
    padding: `${padV}px ${padH}px`,
  };

  const complete: React.CSSProperties = {
    ...base,
    textShadow: shadow,
    color: style.color,
    backgroundColor: style.backgroundColor,
    opacity: style.opacity,
  };

  return (
    <div
      key={`txt-${track.id}`}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'visible',
        zIndex,
      }}
    >
      <TextTransformBoundary
        track={track}
        isSelected={isSelected}
        previewScale={previewScale}
        videoWidth={baseVideoWidth}
        videoHeight={baseVideoHeight}
        renderScale={renderScale}
        isTextEditMode={isTextEditMode}
        interactionMode={interactionMode}
        onTransformUpdate={onTransformUpdate}
        onSelect={onSelect}
        onTextUpdate={onTextUpdate}
        onRotationStateChange={onRotationStateChange}
        onDragStateChange={onDragStateChange}
        onEditModeChange={onEditModeChange}
        appliedStyle={complete}
        clipContent={true}
        clipWidth={actualWidth}
        clipHeight={actualHeight}
        disableScaleTransform={true}
        autoEnterEditMode={pendingEditTextId === track.id}
        onEditStarted={onEditStarted}
      >
        <div style={complete}>{track.textContent}</div>
      </TextTransformBoundary>
    </div>
  );
}
