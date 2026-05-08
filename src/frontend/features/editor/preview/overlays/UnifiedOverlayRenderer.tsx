/* eslint-disable @typescript-eslint/no-explicit-any */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVideoEditorStore, VideoTrack } from '../../stores/videoEditor';
import { ImageTransformBoundary } from '../components/ImageTransformBoundary';
import { SubtitleTransformBoundary } from '../components/SubtitleTransformBoundary';
import { TextTransformBoundary } from '../components/TextTransformBoundary';
import { VideoTransformBoundary } from '../components/VideoTransformBoundary';
import {
  GLOW_BLUR_MULTIPLIER,
  GLOW_SPREAD_MULTIPLIER,
  SUBTITLE_PADDING_HORIZONTAL,
  SUBTITLE_PADDING_VERTICAL,
  TEXT_CLIP_PADDING_HORIZONTAL,
  TEXT_CLIP_PADDING_VERTICAL,
} from '../core/constants';
import { OverlayRenderProps } from '../core/types';
import { createVirtualTimeline } from '../services/VirtualTimelineManager';
import { scaleTextShadow } from '../utils/scalingUtils';
import {
  getTextStyleForTextClip,
  hasActualBackground,
} from '../utils/textStyleUtils';
import {
  getActiveVisualTracksAtFrame,
  getTrackZIndex,
} from '../utils/trackUtils';
import { DualBufferVideo, DualBufferVideoRef } from './DualBufferVideoOverlay';
import {
  FrameDrivenCompositor,
  FrameDrivenCompositorRef,
} from './FrameDrivenCompositor';
import { MultiAudioPlayer } from './MultiAudioOverlay';

const PRELOAD_LOOKAHEAD_MS = 2000;
const STALL_DETECTION_THRESHOLD_MS = 100;

/**
 * Feature flag for frame-driven playback engine.
 * When true, uses FrameDrivenCompositor for canvas-based multi-layer rendering.
 * When false, uses legacy DualBufferVideo per-clip rendering.
 */
export const USE_FRAME_DRIVEN_PLAYBACK = true;

const hasRenderableVideoSource = (track: VideoTrack): boolean => {
  if (track.type !== 'video') return false;
  const source = track.previewUrl || track.source;
  return Boolean(source?.trim());
};

export interface UnifiedOverlayRendererProps extends OverlayRenderProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  activeVideoTrack?: VideoTrack;
  independentAudioTrack?: VideoTrack;
  activeVideoTracks?: VideoTrack[];
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
  globalSubtitlePosition: {
    x: number;
    y: number;
    scale?: number;
    width?: number;
    height?: number;
  };
  onSubtitleTransformUpdate: (trackId: string, transform: any) => void;
  onSubtitleSelect: (trackId: string) => void;
  onSubtitleTextUpdate?: (trackId: string, newText: string) => void;
  onImageTransformUpdate: (trackId: string, transform: any) => void;
  onImageSelect: (trackId: string) => void;
  onTextTransformUpdate: (
    trackId: string,
    transform: any,
    options?: { skipRecord?: boolean },
  ) => void;
  onTextSelect: (trackId: string) => void;
  onTextUpdate: (trackId: string, newText: string) => void;
  onRequestTextEdit?: (trackId: string) => void;
  pendingEditTextId?: string | null;
  onEditStarted?: () => void;
  onRotationStateChange: (isRotating: boolean) => void;
  onDragStateChange: (isDragging: boolean, position?: any) => void;
  /**
   * Callback to check if another element should receive this interaction.
   * Used for proper spatial hit-testing when elements overlap.
   * Returns the trackId that should receive the click, or null if this element should handle it.
   */
  getTopElementAtPoint?: (screenX: number, screenY: number) => string | null;
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
  onRequestTextEdit,
  pendingEditTextId,
  onEditStarted,
  onRotationStateChange,
  onDragStateChange,
  getTopElementAtPoint,
}) => {
  const renderScale = coordinateSystem.baseScale;

  // Refs
  const dualBufferRef = useRef<DualBufferVideoRef>(null);
  const dualBufferRefsMap = useRef<Map<string, DualBufferVideoRef>>(new Map());
  const compositorRef = useRef<FrameDrivenCompositorRef>(null);
  const masterClockRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const [isAnyTrackStalled, setIsAnyTrackStalled] = useState(false);
  const stallCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const virtualTimelineRef = useRef(createVirtualTimeline(allTracks, fps));

  // Update virtual timeline when tracks change
  useEffect(() => {
    virtualTimelineRef.current = createVirtualTimeline(allTracks, fps);
  }, [allTracks, fps]);

  // Shared clock management
  useEffect(() => {
    if (isPlaying) {
      masterClockRef.current = performance.now();
      lastFrameTimeRef.current = currentFrame;
    }
  }, [isPlaying, currentFrame]);

  // Coordinated preloading
  useEffect(() => {
    if (!isPlaying) return;

    const virtualTimeline = virtualTimelineRef.current;
    const lookaheadFrames = Math.ceil(
      (PRELOAD_LOOKAHEAD_MS / 1000) * fps * playbackRate,
    );

    virtualTimeline.getUpcomingSegments(currentFrame, lookaheadFrames);
  }, [currentFrame, isPlaying, fps, playbackRate]);

  // Stall detection
  useEffect(() => {
    if (!isPlaying) {
      if (stallCheckIntervalRef.current) {
        clearInterval(stallCheckIntervalRef.current);
        stallCheckIntervalRef.current = null;
      }
      setIsAnyTrackStalled(false);
      return;
    }

    stallCheckIntervalRef.current = setInterval(() => {
      let anyStalled = false;

      if (dualBufferRef.current) {
        const status = dualBufferRef.current.getBufferStatus();
        if (status.activeReadyState < 2) {
          anyStalled = true;
        }
      }

      dualBufferRefsMap.current.forEach((ref) => {
        const status = ref.getBufferStatus();
        if (status.activeReadyState < 2) {
          anyStalled = true;
        }
      });

      if (anyStalled !== isAnyTrackStalled) {
        setIsAnyTrackStalled(anyStalled);
      }
    }, STALL_DETECTION_THRESHOLD_MS);

    return () => {
      if (stallCheckIntervalRef.current) {
        clearInterval(stallCheckIntervalRef.current);
        stallCheckIntervalRef.current = null;
      }
    };
  }, [isPlaying, isAnyTrackStalled]);

  const registerDualBufferRef = useCallback(
    (trackId: string, ref: DualBufferVideoRef | null) => {
      if (ref) {
        dualBufferRefsMap.current.set(trackId, ref);
      } else {
        dualBufferRefsMap.current.delete(trackId);
      }
    },
    [],
  );

  const setPreviewInteractionMode = useVideoEditorStore(
    (state) => state.setPreviewInteractionMode,
  );
  const setSubtitleMaxContainerWidth = useVideoEditorStore(
    (state) => state.setSubtitleMaxContainerWidth,
  );

  const handleEditModeChange = useCallback(
    (isEditing: boolean) => {
      if (isEditing) setPreviewInteractionMode('text-edit');
    },
    [setPreviewInteractionMode],
  );

  const handleActiveVideoChange = useCallback(
    (video: HTMLVideoElement) => {
      if (videoRef) {
        (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current =
          video;
      }
    },
    [videoRef],
  );

  const handleFrameUpdate = useCallback(
    (frame: number) => {
      if (setCurrentFrame) {
        setCurrentFrame(frame);
      }
    },
    [setCurrentFrame],
  );

  const sortedVisualTracks = useMemo(
    () => getActiveVisualTracksAtFrame(allTracks, currentFrame),
    [allTracks, currentFrame],
  );

  const videoTracksToRender = useMemo(
    () => sortedVisualTracks.filter(hasRenderableVideoSource),
    [sortedVisualTracks],
  );

  const frameDrivenVideoTrackLists = useMemo(() => {
    return new Map(
      videoTracksToRender.map((track) => [track.id, [track] as VideoTrack[]]),
    );
  }, [videoTracksToRender]);

  const activeSubtitles = useMemo(
    () =>
      sortedVisualTracks.filter((t) => t.type === 'subtitle' && t.subtitleText),
    [sortedVisualTracks],
  );
  const subtitleTracks = useMemo(
    () => allTracks.filter((t) => t.type === 'subtitle' && t.subtitleText),
    [allTracks],
  );
  const storedMaxContainerWidth = useMemo(() => {
    if (subtitleTracks.length === 0) return 0;
    return Math.max(
      ...subtitleTracks.map((track) => track.maxContainerWidth ?? 0),
    );
  }, [subtitleTracks]);
  const storedMaxContainerWidthRef = useRef(storedMaxContainerWidth);
  useEffect(() => {
    storedMaxContainerWidthRef.current = storedMaxContainerWidth;
  }, [storedMaxContainerWidth]);
  const subtitleScale = globalSubtitlePosition.scale ?? 1;
  const subtitleMeasureKey = useMemo(() => {
    if (subtitleTracks.length === 0) return 'no-subtitles';
    const parts = subtitleTracks.map((track) => {
      const style = getTextStyleForSubtitle(activeStyle, track.subtitleStyle);
      return [
        track.id,
        track.subtitleText || '',
        style.fontFamily,
        style.fontWeight,
        style.fontStyle,
        style.fontSize,
        style.letterSpacing,
        style.textTransform,
        style.textDecoration,
        style.lineHeight,
      ].join('|');
    });
    return `${parts.join('||')}|scale:${subtitleScale}`;
  }, [subtitleTracks, activeStyle, getTextStyleForSubtitle, subtitleScale]);
  const handleMaxContainerWidthMeasured = useCallback(
    (widthVideoSpace: number) => {
      if (!Number.isFinite(widthVideoSpace) || widthVideoSpace <= 0) return;
      const roundedWidth = Math.round(widthVideoSpace * 100) / 100;
      const currentWidth = storedMaxContainerWidthRef.current || 0;
      if (Math.abs(roundedWidth - currentWidth) < 0.5) {
        return;
      }
      setSubtitleMaxContainerWidth(roundedWidth);
    },
    [setSubtitleMaxContainerWidth],
  );

  const videoRenderInfos = useMemo(() => {
    const isMultiLayerMode = videoTracksToRender.length > 1;

    return videoTracksToRender.map((track, index) => {
      const transform = track.textTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: track.width || baseVideoWidth,
        height: track.height || baseVideoHeight,
      };

      const isHidden = !track.visible;
      const sourceKey = track.previewUrl || track.source || track.id;

      const hasSameSourceConflict = videoTracksToRender.some(
        (other) =>
          other.id !== track.id &&
          (other.previewUrl || other.source) ===
            (track.previewUrl || track.source),
      );

      const stableKey = hasSameSourceConflict
        ? `video-layer-${sourceKey}-${track.id}`
        : `video-layer-${sourceKey}`;

      const isTopmostLayer = index === videoTracksToRender.length - 1;
      const isBackgroundLayer = isMultiLayerMode && !isTopmostLayer;

      return {
        track,
        videoWidth:
          (transform.width || track.width || baseVideoWidth) * renderScale,
        videoHeight:
          (transform.height || track.height || baseVideoHeight) * renderScale,
        zIndex: getTrackZIndex(track, allTracks),
        isSelected: selectedTrackIds.includes(track.id),
        isHidden,
        isMultiLayerMode,
        isTopmostLayer,
        isBackgroundLayer,
        stableKey,
        handlesAudio:
          track === videoTracksToRender[0] && !independentAudioTrack,
      };
    });
  }, [
    videoTracksToRender,
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

  const videoIndexWithAudio = useMemo(() => {
    if (activeIndependentAudioTracks?.length || independentAudioTrack) {
      return -1;
    }

    const videoTracksToCheck =
      activeVideoTracks || (activeVideoTrack ? [activeVideoTrack] : []);

    for (let i = 0; i < videoTracksToCheck.length; i++) {
      const track = videoTracksToCheck[i];
      if (track.isLinked && track.linkedTrackId) {
        const linkedAudio = allTracks.find((t) => t.id === track.linkedTrackId);
        if (linkedAudio && !linkedAudio.muted) {
          return i;
        }
      }
    }

    return -1;
  }, [
    activeVideoTracks,
    activeVideoTrack,
    activeIndependentAudioTracks,
    independentAudioTrack,
    allTracks,
  ]);

  const activeAudioTracksForMixer = useMemo(
    () =>
      allTracks.filter(
        (track) =>
          track.type === 'audio' &&
          track.visible &&
          currentFrame >= track.startFrame &&
          currentFrame < track.endFrame,
      ),
    [allTracks, currentFrame],
  );

  const mixerAudioTracks = useMemo(() => {
    if (USE_FRAME_DRIVEN_PLAYBACK) {
      return activeAudioTracksForMixer;
    }
    return (
      activeIndependentAudioTracks ||
      (independentAudioTrack ? [independentAudioTrack] : [])
    );
  }, [
    activeAudioTracksForMixer,
    activeIndependentAudioTracks,
    independentAudioTrack,
  ]);

  const shouldVideoHandleAudio = useCallback(
    (trackIndex: number): boolean => {
      return trackIndex === videoIndexWithAudio;
    },
    [videoIndexWithAudio],
  );

  const renderNonVideoTrack = useCallback(
    (track: VideoTrack) => {
      const zIndex = getTrackZIndex(track, allTracks);
      const isSelected = selectedTrackIds.includes(track.id);

      if (track.type === 'image') {
        return (
          <ImageTrackLayer
            key={track.id}
            track={track}
            zIndex={zIndex}
            isSelected={isSelected}
            renderScale={renderScale}
            previewScale={previewScale}
            baseVideoWidth={baseVideoWidth}
            baseVideoHeight={baseVideoHeight}
            actualWidth={actualWidth}
            actualHeight={actualHeight}
            panX={panX}
            panY={panY}
            interactionMode={interactionMode}
            onTransformUpdate={onImageTransformUpdate}
            onSelect={onImageSelect}
            onRotationStateChange={onRotationStateChange}
            onDragStateChange={onDragStateChange}
            getTopElementAtPoint={getTopElementAtPoint}
          />
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
          onRequestTextEdit,
          getTopElementAtPoint,
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
      onRequestTextEdit,
      getTopElementAtPoint,
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

    // Compute the applied style for the editable text area
    // This ensures cursor/caret scales correctly with subtitle styling
    const editableSubtitle = selectedSub || activeSubtitles[0];
    const style = getTextStyleForSubtitle(
      activeStyle,
      editableSubtitle?.subtitleStyle,
    );
    const lockWidth =
      storedMaxContainerWidth > 0 || (globalSubtitlePosition.width ?? 0) > 0;
    const effectiveScale = renderScale * (globalSubtitlePosition.scale ?? 1);
    const fontSize = (parseFloat(style.fontSize) || 40) * effectiveScale;
    const appliedEditStyle: React.CSSProperties = {
      fontSize: `${fontSize}px`,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textTransform: style.textTransform,
      textDecoration: style.textDecoration,
      textAlign: style.textAlign,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing
        ? `${parseFloat(String(style.letterSpacing)) * effectiveScale}px`
        : undefined,
      color: style.color,
      padding: `${SUBTITLE_PADDING_VERTICAL * effectiveScale}px ${SUBTITLE_PADDING_HORIZONTAL * effectiveScale}px`,
      // Text layout properties to match rendered subtitle appearance
      // These prevent unwanted wrapping during edit mode
      display: 'inline-block',
      whiteSpace: 'pre',
      wordBreak: 'keep-all',
      overflowWrap: 'normal',
    };

    const selectedSubtitleId = selectedSub?.id || activeSubtitles[0]?.id;

    const subtitleContentNodes = activeSubtitles.map((track) =>
      renderSubtitleContent(
        track,
        getTextStyleForSubtitle,
        activeStyle,
        renderScale,
        globalSubtitlePosition.scale ?? 1,
        onSubtitleSelect,
        lockWidth,
      ),
    );

    const subtitleBoundaryMeasurementNodes = activeSubtitles.map((track) => (
      <div
        key={`sub-boundary-measure-${track.id}`}
        style={{ visibility: 'hidden', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {renderSubtitleContent(
          track,
          getTextStyleForSubtitle,
          activeStyle,
          renderScale,
          globalSubtitlePosition.scale ?? 1,
          () => undefined,
          lockWidth,
        )}
      </div>
    ));

    return (
      <>
        <SubtitleTransformBoundary
          key="global-subtitle-transform-content"
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
          maxContainerWidth={storedMaxContainerWidth}
          onTransformUpdate={(_, transform) => {
            onSubtitleTransformUpdate(
              selectedSub?.id || activeSubtitles[0].id,
              transform,
            );
          }}
          onSelect={() => onSubtitleSelect(activeSubtitles[0]?.id)}
          onTextUpdate={
            // CRITICAL: Do NOT use trackId from SubtitleTransformBoundary - it could be "global-subtitle-transform"
            // which is a fake track used for unified transform, not a real subtitle track.
            // Instead, use the actual selected subtitle ID or fall back to the first active subtitle.
            (_, text) => {
              const actualTrackId = selectedSub?.id || activeSubtitles[0]?.id;
              if (actualTrackId) {
                onSubtitleTextUpdate?.(actualTrackId, text);
              }
            }
          }
          onDragStateChange={onDragStateChange}
          onEditModeChange={handleEditModeChange}
          getTopElementAtPoint={getTopElementAtPoint}
          selectedTrack={selectedSub}
          appliedStyle={appliedEditStyle}
          contentOnly={hasSelected}
          autoEnterEditMode={
            !!selectedSubtitleId && pendingEditTextId === selectedSubtitleId
          }
          onEditStarted={onEditStarted}
        >
          {subtitleContentNodes}
        </SubtitleTransformBoundary>

        {hasSelected && (
          <SubtitleTransformBoundary
            key="global-subtitle-transform-boundary"
            track={globalTrack}
            isSelected={true}
            isActive={true}
            previewScale={previewScale}
            videoWidth={baseVideoWidth}
            videoHeight={baseVideoHeight}
            actualWidth={actualWidth}
            actualHeight={actualHeight}
            panX={panX}
            panY={panY}
            zIndexOverlay={9500}
            renderScale={renderScale}
            isTextEditMode={isTextEditMode}
            interactionMode={interactionMode}
            maxContainerWidth={storedMaxContainerWidth}
            onTransformUpdate={(_, transform) => {
              onSubtitleTransformUpdate(
                selectedSub?.id || activeSubtitles[0].id,
                transform,
              );
            }}
            onSelect={() => onSubtitleSelect(activeSubtitles[0]?.id)}
            onTextUpdate={(_, text) => {
              const actualTrackId = selectedSub?.id || activeSubtitles[0]?.id;
              if (actualTrackId) {
                onSubtitleTextUpdate?.(actualTrackId, text);
              }
            }}
            onDragStateChange={onDragStateChange}
            onEditModeChange={handleEditModeChange}
            getTopElementAtPoint={getTopElementAtPoint}
            selectedTrack={selectedSub}
            appliedStyle={appliedEditStyle}
            boundaryOnly={true}
            disableAutoSizeUpdates={true}
            onRequestEditMode={() => {
              if (selectedSubtitleId) {
                onRequestTextEdit?.(selectedSubtitleId);
              }
            }}
          >
            {subtitleBoundaryMeasurementNodes}
          </SubtitleTransformBoundary>
        )}
      </>
    );
  }, [
    activeSubtitles,
    selectedTrackIds,
    globalSubtitlePosition,
    storedMaxContainerWidth,
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
    getTopElementAtPoint,
    pendingEditTextId,
    onEditStarted,
    onRequestTextEdit,
  ]);

  return (
    <>
      <SubtitleWidthMeasurer
        subtitles={subtitleTracks}
        activeStyle={activeStyle}
        getTextStyleForSubtitle={getTextStyleForSubtitle}
        renderScale={renderScale}
        subtitleScale={subtitleScale}
        measurementKey={subtitleMeasureKey}
        onMaxWidthMeasured={handleMaxContainerWidthMeasured}
      />
      {/* VIDEO LAYERS */}
      {USE_FRAME_DRIVEN_PLAYBACK
        ? videoRenderInfos.map((info) => (
            <div
              key={info.stableKey}
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
              <FrameDrivenCompositor
                ref={info.isTopmostLayer ? compositorRef : undefined}
                tracks={
                  frameDrivenVideoTrackLists.get(info.track.id) ?? [info.track]
                }
                currentFrame={currentFrame}
                fps={fps}
                isPlaying={isPlaying}
                playbackRate={playbackRate}
                width={actualWidth}
                height={actualHeight}
                baseVideoWidth={baseVideoWidth}
                baseVideoHeight={baseVideoHeight}
                transparent={true}
              />
            </div>
          ))
        : videoRenderInfos.map((info, index) => (
            <div
              key={info.stableKey}
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
                    ref={(ref) => {
                      if (index === 0 && ref) {
                        (
                          dualBufferRef as React.MutableRefObject<DualBufferVideoRef | null>
                        ).current = ref;
                      }
                      registerDualBufferRef(info.track.id, ref);
                    }}
                    activeTrack={info.track}
                    allTracks={allTracks}
                    currentFrame={currentFrame}
                    fps={fps}
                    isPlaying={isPlaying && !isAnyTrackStalled}
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

      {mixerAudioTracks.length > 0 && (
        <MultiAudioPlayer
          audioTracks={mixerAudioTracks}
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

// Helper render functions

function renderSubtitleContent(
  track: VideoTrack,
  getStyle: (style: any, seg?: any) => any,
  activeStyle: any,
  renderScale: number,
  userScale: number,
  onSelect: (id: string) => void,
  lockWidth: boolean,
) {
  const style = getStyle(activeStyle, track.subtitleStyle);
  // Font size includes both renderScale (preview zoom) and userScale (user's scale factor)
  // This is font-based scaling - preserves text quality at all scale levels (no CSS blur)
  const effectiveScale = renderScale * userScale;
  const fontSize = (parseFloat(style.fontSize) || 40) * effectiveScale;
  const padV = SUBTITLE_PADDING_VERTICAL * effectiveScale;
  const padH = SUBTITLE_PADDING_HORIZONTAL * effectiveScale;
  const shadow = scaleTextShadow(style.textShadow, effectiveScale);
  const hasBackground = hasActualBackground(style.backgroundColor);

  // Glow uses text color for the glow effect (matching FFmpeg behavior)
  const glowColor = style.color || '#FFFFFF';

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
      ? `${parseFloat(String(style.letterSpacing)) * effectiveScale}px`
      : undefined,
    display: 'inline-block',
    width: 'fit-content',
    whiteSpace: 'pre',
    wordBreak: 'keep-all',
    overflowWrap: 'normal',
    padding: `${padV}px ${padH}px`,
  };

  const wrapperStyle: React.CSSProperties | undefined = lockWidth
    ? {
        width: '100%',
        textAlign: style.textAlign,
      }
    : undefined;

  // Check if glow is enabled for this subtitle
  // Glow uses a multi-layer approach to match FFmpeg export:
  // Layer 0: Glow layer (blurred, expanded text behind everything)
  // Layer 1: Background layer (if background color is set)
  // Layer 2: Text layer (main text with stroke/shadow)
  //
  // We use CSS Grid with grid-area to stack all layers perfectly on top of each other.
  // This ensures layers remain aligned at all zoom levels (unlike position: absolute).
  if (style.hasGlow) {
    // Scale glow parameters with the effective scale (renderScale * userScale)
    const glowBlurAmount = GLOW_BLUR_MULTIPLIER * effectiveScale;
    const glowSpread = GLOW_SPREAD_MULTIPLIER * effectiveScale;

    // Common layer style - all layers use the same grid cell to stack perfectly
    const layerStyle: React.CSSProperties = {
      gridArea: '1 / 1 / 2 / 2', // All layers occupy the same grid cell
      maxWidth: 'none',
    };

    if (hasBackground) {
      // Triple-layer: glow + background + text
      return (
        <div
          key={`sub-${track.id}`}
          style={wrapperStyle}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(track.id);
          }}
        >
          <div style={{ display: 'inline-grid' }}>
            {/* Glow Layer - furthest back (rendered first = lowest z-order) */}
            <div
              style={{
                ...base,
                ...layerStyle,
                color: glowColor,
                backgroundColor: 'transparent',
                opacity: 0.75,
                filter: `blur(${glowBlurAmount}px)`,
                textShadow: `0 0 ${glowSpread}px ${glowColor}, 0 0 ${glowSpread * 1.5}px ${glowColor}`,
                WebkitTextStroke: `${glowSpread * 0.75}px ${glowColor}`,
              }}
              aria-hidden="true"
            >
              {track.subtitleText}
            </div>
            {/* Background Layer */}
            <div
              style={{
                ...base,
                ...layerStyle,
                color: 'transparent',
                backgroundColor: style.backgroundColor,
                opacity: style.opacity,
              }}
              aria-hidden="true"
            >
              {track.subtitleText}
            </div>
            {/* Text Layer - topmost (rendered last = highest z-order) */}
            <div
              style={{
                ...base,
                ...layerStyle,
                color: style.color,
                backgroundColor: 'transparent',
                opacity: style.opacity,
                textShadow: shadow,
              }}
            >
              {track.subtitleText}
            </div>
          </div>
        </div>
      );
    }

    // Double-layer: glow + text (no background)
    return (
      <div
        key={`sub-${track.id}`}
        style={wrapperStyle}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(track.id);
        }}
      >
        <div style={{ display: 'inline-grid' }}>
          {/* Glow Layer - furthest back (rendered first = lowest z-order) */}
          <div
            style={{
              ...base,
              ...layerStyle,
              color: glowColor,
              backgroundColor: 'transparent',
              opacity: 0.75,
              filter: `blur(${glowBlurAmount}px)`,
              textShadow: `0 0 ${glowSpread}px ${glowColor}, 0 0 ${glowSpread * 1.5}px ${glowColor}`,
              WebkitTextStroke: `${glowSpread * 0.75}px ${glowColor}`,
            }}
            aria-hidden="true"
          >
            {track.subtitleText}
          </div>
          {/* Text Layer - topmost (rendered last = highest z-order) */}
          <div
            style={{
              ...base,
              ...layerStyle,
              color: style.color,
              backgroundColor: 'transparent',
              opacity: style.opacity,
              textShadow: shadow,
            }}
          >
            {track.subtitleText}
          </div>
        </div>
      </div>
    );
  }

  // No glow - render simple single layer
  return (
    <div
      key={`sub-${track.id}`}
      style={wrapperStyle}
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
          maxWidth: 'none',
        }}
      >
        {track.subtitleText}
      </div>
    </div>
  );
}

const SubtitleWidthMeasurer: React.FC<{
  subtitles: VideoTrack[];
  activeStyle: any;
  getTextStyleForSubtitle: (style: any, seg?: any) => any;
  renderScale: number;
  subtitleScale: number;
  measurementKey: string;
  onMaxWidthMeasured: (widthVideoSpace: number) => void;
}> = ({
  subtitles,
  activeStyle,
  getTextStyleForSubtitle,
  renderScale,
  subtitleScale,
  measurementKey,
  onMaxWidthMeasured,
}) => {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  const setItemRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) {
        itemRefs.current.set(id, el);
      } else {
        itemRefs.current.delete(id);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (!measurementKey || subtitles.length === 0) return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      if (!renderScale || renderScale <= 0) return;

      let maxWidthPx = 0;
      for (const track of subtitles) {
        const node = itemRefs.current.get(track.id);
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width > maxWidthPx) {
          maxWidthPx = rect.width;
        }
      }

      if (maxWidthPx > 0) {
        const widthVideoSpace = maxWidthPx / renderScale;
        if (Number.isFinite(widthVideoSpace)) {
          onMaxWidthMeasured(widthVideoSpace);
        }
      }
    };

    const scheduleMeasure = () => {
      requestAnimationFrame(measure);
    };

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) scheduleMeasure();
      });
    } else {
      scheduleMeasure();
    }

    return () => {
      cancelled = true;
    };
    // NOTE: renderScale changes (zoom) intentionally do not trigger re-measure.
  }, [measurementKey, onMaxWidthMeasured]);

  if (subtitles.length === 0) {
    return null;
  }

  const hiddenStyle: React.CSSProperties = {
    position: 'absolute',
    left: '-10000px',
    top: '-10000px',
    visibility: 'hidden',
    pointerEvents: 'none',
    zIndex: -1,
    contain: 'layout style paint',
  };

  return (
    <div aria-hidden="true" style={hiddenStyle}>
      {subtitles.map((track) => {
        const style = getTextStyleForSubtitle(activeStyle, track.subtitleStyle);
        const effectiveScale = renderScale * subtitleScale;
        const fontSize = (parseFloat(style.fontSize) || 40) * effectiveScale;
        const padV = SUBTITLE_PADDING_VERTICAL * effectiveScale;
        const padH = SUBTITLE_PADDING_HORIZONTAL * effectiveScale;
        const letterSpacing = style.letterSpacing
          ? `${parseFloat(String(style.letterSpacing)) * effectiveScale}px`
          : undefined;

        const measureStyle: React.CSSProperties = {
          fontSize: `${fontSize}px`,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          textTransform: style.textTransform,
          textDecoration: style.textDecoration,
          textAlign: style.textAlign,
          lineHeight: style.lineHeight,
          letterSpacing,
          display: 'inline-block',
          whiteSpace: 'pre',
          wordBreak: 'keep-all',
          overflowWrap: 'normal',
          padding: `${padV}px ${padH}px`,
          boxSizing: 'border-box',
        };

        return (
          <div key={`measure-${track.id}`} style={{ margin: 0, padding: 0 }}>
            <div ref={setItemRef(track.id)} style={measureStyle}>
              {track.subtitleText || ''}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Refactored ImageTrackLayer component to handle GIF freezing
const ImageTrackLayer: React.FC<{
  track: VideoTrack;
  zIndex: number;
  isSelected: boolean;
  renderScale: number;
  previewScale: number;
  baseVideoWidth: number;
  baseVideoHeight: number;
  actualWidth: number;
  actualHeight: number;
  panX: number;
  panY: number;
  interactionMode: InteractionMode | undefined;
  onTransformUpdate: (id: string, t: any) => void;
  onSelect: (id: string) => void;
  onRotationStateChange: (r: boolean) => void;
  onDragStateChange: (d: boolean, p?: any) => void;
  getTopElementAtPoint?: (screenX: number, screenY: number) => string | null;
}> = ({
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
  onTransformUpdate,
  onSelect,
  onRotationStateChange,
  onDragStateChange,
  getTopElementAtPoint,
}) => {
  const isRendering = useVideoEditorStore((state) => state.render?.isRendering);
  const imgRef = useRef<HTMLImageElement>(null);
  const [frozenSrc, setFrozenSrc] = useState<string | null>(null);

  // Freeze GIF/Image when rendering starts
  useEffect(() => {
    if (isRendering && imgRef.current) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = imgRef.current.naturalWidth;
        canvas.height = imgRef.current.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(imgRef.current, 0, 0);
          setFrozenSrc(canvas.toDataURL());
        }
      } catch (e) {
        console.warn(
          '[UnifiedOverlayRenderer] Failed to freeze image for render',
          e,
        );
      }
    } else if (!isRendering) {
      setFrozenSrc(null);
    }
  }, [isRendering]);

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

  const displaySrc = isRendering && frozenSrc ? frozenSrc : url;

  return (
    <div
      key={`img-${track.id}`}
      className="absolute inset-0"
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
        getTopElementAtPoint={getTopElementAtPoint}
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
            ref={imgRef}
            src={displaySrc}
            alt={track.name}
            className="w-full h-full object-contain"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
            draggable={false}
          />
        </div>
      </ImageTransformBoundary>
    </div>
  );
};

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
  onTransformUpdate: (
    id: string,
    t: any,
    options?: { skipRecord?: boolean },
  ) => void,
  onSelect: (id: string) => void,
  onTextUpdate: (id: string, text: string) => void,
  onRotationStateChange: (r: boolean) => void,
  onDragStateChange: (d: boolean, p?: any) => void,
  onEditModeChange: (e: boolean) => void,
  pendingEditTextId?: string | null,
  onEditStarted?: () => void,
  onRequestTextEdit?: (trackId: string) => void,
  getTopElementAtPoint?: (screenX: number, screenY: number) => string | null,
) {
  const style = getTextStyleForTextClip(track);
  const scale = track.textTransform?.scale || 1;
  const fontSize = (parseFloat(style.fontSize) || 40) * renderScale * scale;
  const effScale = renderScale * scale;
  const padV = TEXT_CLIP_PADDING_VERTICAL * effScale;
  const padH = TEXT_CLIP_PADDING_HORIZONTAL * effScale;
  const shadow = scaleTextShadow(style.textShadow, effScale);
  const hasBackground = hasActualBackground(style.backgroundColor);

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

  // Render text content with optional glow effect
  // Glow uses a multi-layer approach to match FFmpeg export:
  // Layer 0: Glow layer (blurred, expanded text behind everything)
  // Layer 1: Background layer (if background color is set)
  // Layer 2: Text layer (main text with stroke/shadow)
  //
  // We use CSS Grid with grid-area to stack all layers perfectly on top of each other.
  // This ensures layers remain aligned at all zoom levels (unlike position: absolute).
  const renderTextContent = () => {
    if (!style.hasGlow) {
      // No glow - render simple single layer
      return <div style={complete}>{track.textContent}</div>;
    }

    // Glow effect enabled - render multi-layer
    // Scale glow parameters with the effective scale (renderScale * clipScale)
    const glowBlurAmount = GLOW_BLUR_MULTIPLIER * effScale;
    const glowSpread = GLOW_SPREAD_MULTIPLIER * effScale;

    // Common layer style - all layers use the same grid cell to stack perfectly
    const layerStyle: React.CSSProperties = {
      gridArea: '1 / 1 / 2 / 2', // All layers occupy the same grid cell
    };

    if (hasBackground) {
      // Triple-layer: glow + background + text
      return (
        <div style={{ display: 'inline-grid' }}>
          {/* Glow Layer - furthest back (rendered first = lowest z-order) */}
          <div
            style={{
              ...base,
              ...layerStyle,
              color: style.glowColor,
              backgroundColor: style.backgroundColor,
              opacity: 0.75,
              filter: `blur(${glowBlurAmount}px)`,
              boxShadow: `0 0 ${glowSpread}px ${style.glowColor}, 0 0 ${glowSpread * 1.5}px ${style.glowColor}`,
            }}
            aria-hidden="true"
          >
            {track.textContent}
          </div>
          {/* Background Layer */}
          <div
            style={{
              ...base,
              ...layerStyle,
              color: 'transparent',
              backgroundColor: style.backgroundColor,
              opacity: style.opacity,
            }}
            aria-hidden="true"
          >
            {track.textContent}
          </div>
          {/* Text Layer - topmost (rendered last = highest z-order) */}
          <div
            style={{
              ...base,
              ...layerStyle,
              color: style.color,
              backgroundColor: 'transparent',
              opacity: style.opacity,
              textShadow: shadow,
            }}
          >
            {track.textContent}
          </div>
        </div>
      );
    }

    // Double-layer: glow + text (no background)
    return (
      <div style={{ display: 'inline-grid' }}>
        {/* Glow Layer - furthest back (rendered first = lowest z-order) */}
        <div
          style={{
            ...base,
            ...layerStyle,
            color: style.glowColor,
            backgroundColor: 'transparent',
            opacity: 0.75,
            filter: `blur(${glowBlurAmount}px)`,
            textShadow: `0 0 ${glowSpread}px ${style.glowColor}, 0 0 ${glowSpread * 1.5}px ${style.glowColor}`,
            WebkitTextStroke: `${glowSpread * 0.75}px ${style.glowColor}`,
          }}
          aria-hidden="true"
        >
          {track.textContent}
        </div>
        {/* Text Layer - topmost (rendered last = highest z-order) */}
        <div
          style={{
            ...base,
            ...layerStyle,
            color: style.color,
            backgroundColor: 'transparent',
            opacity: style.opacity,
            textShadow: shadow,
          }}
        >
          {track.textContent}
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        key={`txt-${track.id}-content`}
        className="absolute inset-0"
        style={{
          width: actualWidth,
          height: actualHeight,
          left: `calc(50% + ${panX}px)`,
          top: `calc(50% + ${panY}px)`,
          transform: 'translate(-50%, -50%)',
          overflow: 'visible',
          zIndex,
          pointerEvents: 'none',
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
          getTopElementAtPoint={getTopElementAtPoint}
          contentOnly={isSelected}
        >
          {renderTextContent()}
        </TextTransformBoundary>
      </div>

      {isSelected && (
        <div
          key={`txt-${track.id}-boundary`}
          className="absolute inset-0"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: `calc(50% + ${panX}px)`,
            top: `calc(50% + ${panY}px)`,
            transform: 'translate(-50%, -50%)',
            overflow: 'visible',
            zIndex: 9500,
            pointerEvents: 'none',
          }}
        >
          <TextTransformBoundary
            track={track}
            isSelected={true}
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
            disableScaleTransform={true}
            getTopElementAtPoint={getTopElementAtPoint}
            boundaryOnly={true}
            disableAutoSizeUpdates={true}
            onRequestEditMode={onRequestTextEdit}
          >
            <div
              style={{ visibility: 'hidden', pointerEvents: 'none' }}
              aria-hidden="true"
            >
              {renderTextContent()}
            </div>
          </TextTransformBoundary>
        </div>
      )}
    </>
  );
}
