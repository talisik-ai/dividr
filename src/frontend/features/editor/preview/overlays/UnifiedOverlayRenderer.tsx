/* eslint-disable @typescript-eslint/no-explicit-any */

import React, {
  useCallback,
  useEffect,
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
  onTextTransformUpdate: (trackId: string, transform: any) => void;
  onTextSelect: (trackId: string) => void;
  onTextUpdate: (trackId: string, newText: string) => void;
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

  const activeSubtitles = useMemo(
    () =>
      sortedVisualTracks.filter((t) => t.type === 'subtitle' && t.subtitleText),
    [sortedVisualTracks],
  );

  const videoRenderInfos = useMemo(() => {
    const videoTracksToRender = activeVideoTracks?.length
      ? activeVideoTracks
      : activeVideoTrack
        ? [activeVideoTrack]
        : [];

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
          getTopElementAtPoint,
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
        // When selected, z-index must be above SelectionHitTestLayer (9000)
        // to allow drag boundary to receive pointer events.
        zIndexOverlay={hasSelected ? 9500 : subtitleZIndex}
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
        getTopElementAtPoint={getTopElementAtPoint}
      >
        {activeSubtitles.map((track) =>
          renderSubtitleContent(
            track,
            getTextStyleForSubtitle,
            activeStyle,
            renderScale,
            globalSubtitlePosition.scale ?? 1,
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
    getTopElementAtPoint,
  ]);

  return (
    <>
      {/* VIDEO LAYERS */}
      {USE_FRAME_DRIVEN_PLAYBACK ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: `calc(50% + ${panX}px)`,
            top: `calc(50% + ${panY}px)`,
            transform: 'translate(-50%, -50%)',
            overflow: 'visible',
            zIndex: 1,
          }}
        >
          <FrameDrivenCompositor
            ref={compositorRef}
            tracks={allTracks}
            currentFrame={currentFrame}
            fps={fps}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            width={actualWidth}
            height={actualHeight}
            baseVideoWidth={baseVideoWidth}
            baseVideoHeight={baseVideoHeight}
          />
        </div>
      ) : (
        videoRenderInfos.map((info, index) => (
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
        ))
      )}

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

// Helper render functions

function renderSubtitleContent(
  track: VideoTrack,
  getStyle: (style: any, seg?: any) => any,
  activeStyle: any,
  renderScale: number,
  userScale: number,
  onSelect: (id: string) => void,
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
  getTopElementAtPoint?: (screenX: number, screenY: number) => string | null,
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
    <div
      key={`txt-${track.id}`}
      className="absolute inset-0"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'visible',
        // When selected, z-index must be above SelectionHitTestLayer (9000)
        // to allow transform handles to receive pointer events.
        // Use 9500 to be above SelectionHitTestLayer but below TransformBoundaryLayer (10000).
        zIndex: isSelected ? 9500 : zIndex,
        // CRITICAL: pointer-events: none allows clicks to pass through
        // the wrapper to lower z-index elements (like SelectionHitTestLayer).
        // TextTransformBoundary's content and handles have pointer-events: auto
        // so they can still receive events when clicked directly.
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
      >
        {renderTextContent()}
      </TextTransformBoundary>
    </div>
  );
}
