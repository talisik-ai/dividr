/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * UnifiedOverlayRenderer - AUDIO FIX VERSION
 *
 * CRITICAL AUDIO FIX:
 * The problem was that BOTH:
 * 1. useVideoPlayback hook was controlling video.volume/muted
 * 2. DualBufferVideo was also controlling its own audio
 *
 * This created double audio when:
 * - useVideoPlayback sets videoRef to play with audio
 * - DualBufferVideo's active video also plays with audio
 * - Both point to different elements OR same element gets double-configured
 *
 * THE FIX:
 * - DualBufferVideo is the ONLY controller of video audio
 * - useVideoPlayback should NOT control video audio anymore (or be disabled)
 * - Pass `handleAudio` prop to DualBufferVideo to tell it who controls audio
 * - If there's an independent audio track, video audio is muted (handleAudio=false)
 *
 * AUDIO ROUTING:
 * - If independentAudioTrack exists: Audio comes from <audio> element, video is muted
 * - If no independentAudioTrack: Audio comes from DualBufferVideo's active slot
 */

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

export interface UnifiedOverlayRendererProps extends OverlayRenderProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  activeVideoTrack?: VideoTrack;
  onVideoLoadedMetadata: () => void;
  isPlaying?: boolean;
  isMuted?: boolean;
  volume?: number;
  playbackRate?: number;
  fps?: number;
  /**
   * CRITICAL: Pass this to determine audio routing.
   * If set, audio comes from AudioOverlay, and video is muted.
   */
  independentAudioTrack?: VideoTrack;
  /** Callback to update currentFrame during playback */
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
  onVideoLoadedMetadata,
  onVideoTransformUpdate,
  onVideoSelect,
  isPlaying = false,
  isMuted = false,
  volume = 1,
  playbackRate = 1,
  fps = 30,
  independentAudioTrack,
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

  // Video render info
  const videoRenderInfo = useMemo(() => {
    if (!activeVideoTrack) return null;

    const transform = activeVideoTrack.textTransform || {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      width: activeVideoTrack.width || baseVideoWidth,
      height: activeVideoTrack.height || baseVideoHeight,
    };

    return {
      track: activeVideoTrack,
      videoWidth:
        (transform.width || activeVideoTrack.width || baseVideoWidth) *
        renderScale,
      videoHeight:
        (transform.height || activeVideoTrack.height || baseVideoHeight) *
        renderScale,
      zIndex: getTrackZIndex(activeVideoTrack, allTracks),
      isSelected: selectedTrackIds.includes(activeVideoTrack.id),
      isHidden: !activeVideoTrack.visible,
    };
  }, [
    activeVideoTrack,
    baseVideoWidth,
    baseVideoHeight,
    renderScale,
    allTracks,
    selectedTrackIds,
  ]);

  const subtitleZIndex = useMemo(() => {
    if (activeSubtitles.length === 0) return 0;
    return Math.max(
      ...activeSubtitles.map((t) => getTrackZIndex(t, allTracks)),
    );
  }, [activeSubtitles, allTracks]);

  /**
   * CRITICAL AUDIO ROUTING DECISION:
   *
   * If there's an independent audio track (extracted audio, separate audio file),
   * the video should be MUTED because audio comes from the <audio> element in AudioOverlay.
   *
   * If there's NO independent audio track, video should have audio.
   * But we also need to check if the video track has a linked audio track that's muted.
   */
  const shouldVideoHandleAudio = useMemo(() => {
    // If there's an independent audio track, video is muted
    if (independentAudioTrack) {
      console.log(
        '[UnifiedOverlay] Audio comes from independent audio track, muting video',
      );
      return false;
    }

    // Check if video track has linked audio that's muted
    if (activeVideoTrack?.isLinked && activeVideoTrack.linkedTrackId) {
      const linkedAudio = allTracks.find(
        (t) => t.id === activeVideoTrack.linkedTrackId,
      );
      if (linkedAudio?.muted) {
        console.log('[UnifiedOverlay] Linked audio is muted, muting video');
        return false;
      }
    }

    // Video handles its own audio
    console.log('[UnifiedOverlay] Video handles its own audio');
    return true;
  }, [independentAudioTrack, activeVideoTrack, allTracks]);

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
      {/* VIDEO - DualBufferVideo handles everything including audio routing */}
      {videoRenderInfo && (
        <div
          key="stable-video-container"
          className="absolute inset-0 pointer-events-none"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: `calc(50% + ${panX}px)`,
            top: `calc(50% + ${panY}px)`,
            transform: 'translate(-50%, -50%)',
            overflow: 'visible',
            zIndex: videoRenderInfo.zIndex,
          }}
        >
          <VideoTransformBoundary
            track={videoRenderInfo.track}
            isSelected={videoRenderInfo.isSelected}
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
                width: `${videoRenderInfo.videoWidth}px`,
                height: `${videoRenderInfo.videoHeight}px`,
                visibility: videoRenderInfo.isHidden ? 'hidden' : 'visible',
                pointerEvents:
                  videoRenderInfo.isHidden ||
                  interactionMode === 'pan' ||
                  interactionMode === 'text-edit'
                    ? 'none'
                    : 'auto',
              }}
            >
              {/* 
                CRITICAL AUDIO FIX:
                handleAudio={shouldVideoHandleAudio} determines if video has audio.
                If false, ALL video elements in DualBufferVideo are muted.
                Audio comes from AudioOverlay instead.
              */}
              <DualBufferVideo
                ref={dualBufferRef}
                activeTrack={activeVideoTrack}
                allTracks={allTracks}
                currentFrame={currentFrame}
                fps={fps}
                isPlaying={isPlaying}
                isMuted={isMuted}
                volume={volume}
                playbackRate={playbackRate}
                onLoadedMetadata={onVideoLoadedMetadata}
                onActiveVideoChange={handleActiveVideoChange}
                onFrameUpdate={handleFrameUpdate}
                width={videoRenderInfo.videoWidth}
                height={videoRenderInfo.videoHeight}
                objectFit="contain"
                handleAudio={shouldVideoHandleAudio}
              />
            </div>
          </VideoTransformBoundary>
        </div>
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
    whiteSpace: 'pre-line',
    wordBreak: 'keep-all',
    overflowWrap: 'normal',
    padding: `${padV}px ${padH}px`,
    maxWidth: `${baseVideoWidth * renderScale * 0.9}px`,
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
