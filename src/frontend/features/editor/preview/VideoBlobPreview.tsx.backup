/* eslint-disable @typescript-eslint/no-explicit-any */
import NewDark from '@/frontend/assets/logo/New-Dark.svg';
import New from '@/frontend/assets/logo/New-Light.svg';
import { useTheme } from '@/frontend/providers/ThemeProvider';
import { cn } from '@/frontend/utils/utils';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePreviewShortcuts } from '../stores/videoEditor/hooks/usePreviewShortcuts';
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';
import { AlignmentGuide, DragGuides } from './components/DragGuides';
import { TextTransformBoundary } from './components/TextTransformBoundary';

interface VideoBlobPreviewProps {
  className?: string;
}

export const VideoBlobPreview: React.FC<VideoBlobPreviewProps> = ({
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragActive, setDragActive] = useState(false);
  const [isPreviewFocused, setIsPreviewFocused] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [isDraggingText, setIsDraggingText] = useState(false);

  // Initialize preview shortcuts
  usePreviewShortcuts(isPreviewFocused);

  // Pan/drag state
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  // Pinch zoom state
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialScale: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  // Track previous trim state to detect actual trim changes (not just playback progression)
  const prevVideoTrimRef = useRef<{
    trackId: string;
    startFrame: number;
    endFrame: number;
    sourceStartTime: number;
  } | null>(null);
  const prevAudioTrimRef = useRef<{
    trackId: string;
    startFrame: number;
    endFrame: number;
    sourceStartTime: number;
  } | null>(null);

  const { theme } = useTheme();
  const {
    tracks,
    timeline,
    playback,
    preview,
    textStyle,
    getTextStyleForSubtitle,
    importMediaFromDialog,
    importMediaToTimeline,
    setCurrentFrame,
    setPreviewPan,
    setPreviewScale,
    setPreviewInteractionMode,
    updateTrack,
    setSelectedTracks,
    currentTranscribingTrackId,
    transcriptionProgress,
  } = useVideoEditorStore();

  // Active video track for visual display (must be visible)
  const activeVideoTrack = React.useMemo(() => {
    try {
      return tracks.find(
        (track) =>
          track.type === 'video' &&
          track.visible &&
          track.previewUrl &&
          timeline.currentFrame >= track.startFrame &&
          timeline.currentFrame < track.endFrame,
      );
    } catch {
      return undefined;
    }
  }, [tracks, timeline.currentFrame]);

  // Helper function to check if a linked audio track has a position gap from its video counterpart
  const hasPositionGap = useCallback(
    (audioTrack: VideoTrack) => {
      if (!audioTrack.isLinked || !audioTrack.linkedTrackId) return false;

      const linkedVideoTrack = tracks.find(
        (t) => t.id === audioTrack.linkedTrackId,
      );
      if (!linkedVideoTrack) return false;

      // Check if there's a significant gap between the linked tracks
      const gap = Math.abs(audioTrack.startFrame - linkedVideoTrack.startFrame);
      return gap > 0; // Any gap means they should be treated independently for preview
    },
    [tracks],
  );

  // Helper function to check if a linked video track has a position gap from its audio counterpart
  const hasPositionGapForVideo = useCallback(
    (videoTrack: VideoTrack) => {
      if (!videoTrack.isLinked || !videoTrack.linkedTrackId) return false;

      const linkedAudioTrack = tracks.find(
        (t) => t.id === videoTrack.linkedTrackId,
      );
      if (!linkedAudioTrack) return false;

      // Check if there's a significant gap between the linked tracks
      const gap = Math.abs(videoTrack.startFrame - linkedAudioTrack.startFrame);
      return gap > 0; // Any gap means they should be treated independently for preview
    },
    [tracks],
  );

  // Independent audio track for audio-only playback (separate from video)
  // Consider audio tracks that are either unlinked OR have their own extracted audio
  // OR are linked but have different positions (gaps) from their video counterpart
  const independentAudioTrack = React.useMemo(() => {
    try {
      const audioTrack = tracks.find(
        (track) =>
          track.type === 'audio' &&
          (!track.isLinked || track.previewUrl || hasPositionGap(track)) && // Unlinked OR has extracted audio OR has position gap
          !track.muted &&
          timeline.currentFrame >= track.startFrame &&
          timeline.currentFrame < track.endFrame,
      );

      if (audioTrack) {
        // If audio track has its own previewUrl (extracted audio), use it directly
        if (audioTrack.previewUrl) {
          return audioTrack;
        }

        // Fallback: Find a video track with the same source to get the previewUrl
        const matchingVideoTrack = tracks.find(
          (track) =>
            track.type === 'video' &&
            track.source === audioTrack.source &&
            track.previewUrl,
        );

        // Return audio track with borrowed previewUrl if available
        return {
          ...audioTrack,
          previewUrl: matchingVideoTrack?.previewUrl || audioTrack.previewUrl,
        };
      }

      return undefined;
    } catch {
      return undefined;
    }
  }, [tracks, timeline.currentFrame]);

  // Video track that provides audio when no independent audio track exists
  const videoTrackWithAudio = React.useMemo(() => {
    try {
      // Use video track for audio if:
      // 1. There's no independent (unlinked) audio track, AND
      // 2. The video track itself is not muted, AND
      // 3. The video track is linked (has a linked audio track) OR there's no corresponding audio track
      // 4. The linked audio track doesn't have a position gap (should be synchronized)
      if (independentAudioTrack) return undefined;

      return tracks.find((track) => {
        if (track.type !== 'video' || !track.previewUrl || !track.isLinked)
          return false;

        // Check if the linked audio track is muted
        const linkedAudioTrack = tracks.find(
          (t) => t.id === track.linkedTrackId,
        );
        const isLinkedAudioMuted = linkedAudioTrack
          ? linkedAudioTrack.muted
          : false;

        return (
          !isLinkedAudioMuted && // Don't use video audio if linked audio is muted
          !hasPositionGapForVideo(track) && // Don't use video audio if linked audio has a gap
          timeline.currentFrame >= track.startFrame &&
          timeline.currentFrame < track.endFrame
        );
      });
    } catch {
      return undefined;
    }
  }, [tracks, timeline.currentFrame, independentAudioTrack]);

  // Combined audio track reference for compatibility with existing code
  const activeAudioTrack = independentAudioTrack || videoTrackWithAudio;

  // Reset pan when video track changes or when there's no video
  useEffect(() => {
    // Reset pan to center when switching videos or when no video is present
    if (preview.panX !== 0 || preview.panY !== 0) {
      setPreviewPan(0, 0);
    }
  }, [activeVideoTrack?.id]);

  // Auto-reset pan and mode when zooming out
  useEffect(() => {
    if (preview.previewScale <= 1) {
      // When zooming to 100% or below, reset pan to center
      if (preview.panX !== 0 || preview.panY !== 0) {
        setPreviewPan(0, 0);
      }

      // Auto-switch to select mode when zooming out
      if (preview.interactionMode === 'pan') {
        setPreviewInteractionMode('select');
      }
    }
  }, [
    preview.previewScale,
    preview.panX,
    preview.panY,
    preview.interactionMode,
    setPreviewPan,
    setPreviewInteractionMode,
  ]);

  // Add effect to pause playback at the end of ALL tracks (not just video)
  useEffect(() => {
    if (!playback.isPlaying) return;

    // Find the last track of ANY type (video, audio, subtitle, image)
    const allTracks = tracks
      .filter((track) => track.visible) // Only consider visible tracks
      .sort((a, b) => a.endFrame - b.endFrame);
    const lastTrack = allTracks[allTracks.length - 1];

    if (lastTrack && timeline.currentFrame >= lastTrack.endFrame) {
      // Pause playback if we've reached or passed the end of the last track
      playback.isPlaying = false;
      // If you have a setPlayback or similar action, use that instead:
      // setPlayback((prev) => ({ ...prev, isPlaying: false }));
      // Or dispatch an action to pause playback
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }, [timeline.currentFrame, tracks, playback, videoRef, audioRef]);

  // Resize observer
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Content scale - calculates the preview size to fill the container while maintaining aspect ratio
  const calculateContentScale = useCallback(() => {
    // Use actual video dimensions if available, otherwise fall back to canvas dimensions
    const videoWidth = activeVideoTrack?.width || preview.canvasWidth;
    const videoHeight = activeVideoTrack?.height || preview.canvasHeight;

    const containerAspect = containerSize.width / containerSize.height;
    const videoAspect = videoWidth / videoHeight;

    let actualWidth = videoWidth;
    let actualHeight = videoHeight;

    if (containerSize.width > 0 && containerSize.height > 0) {
      // Calculate the maximum size that fits the container while maintaining aspect ratio
      if (containerAspect > videoAspect) {
        // Container is wider than video - fit to height
        const scale = containerSize.height / videoHeight;
        actualWidth = videoWidth * scale;
        actualHeight = containerSize.height;
      } else {
        // Container is taller than video - fit to width
        const scale = containerSize.width / videoWidth;
        actualWidth = containerSize.width;
        actualHeight = videoHeight * scale;
      }

      // Apply previewScale as a zoom multiplier on the fitted size
      // previewScale = 1 means fill the container (default behavior)
      // previewScale > 1 means zoom in
      // previewScale < 1 means zoom out
      actualWidth *= preview.previewScale;
      actualHeight *= preview.previewScale;
    }
    return { actualWidth, actualHeight };
  }, [
    containerSize,
    activeVideoTrack?.width,
    activeVideoTrack?.height,
    preview.canvasWidth,
    preview.canvasHeight,
    preview.previewScale,
  ]);

  // Subtitle tracks - with timeline-based alignment
  const getActiveSubtitleTracks = useCallback(() => {
    const currentFrame = timeline.currentFrame;
    const activeSubtitles = tracks.filter((track) => {
      if (track.type !== 'subtitle' || !track.visible || !track.subtitleText) {
        return false;
      }

      // Check if current frame is within the track's timeline range
      // Use exclusive end check to prevent overlap at boundaries
      const isInTrackRange =
        currentFrame >= track.startFrame && currentFrame < track.endFrame;

      if (!isInTrackRange) {
        return false;
      }
      return true;
    });

    return activeSubtitles;
  }, [tracks, timeline.currentFrame, timeline.fps]);

  // Text tracks (heading and body)
  const getActiveTextTracks = useCallback(() => {
    const currentFrame = timeline.currentFrame;
    const activeTexts = tracks.filter(
      (track) =>
        track.type === 'text' &&
        track.visible &&
        currentFrame >= track.startFrame &&
        currentFrame < track.endFrame &&
        track.textContent,
    );

    return activeTexts;
  }, [tracks, timeline.currentFrame]);

  // Image tracks
  const getActiveImageTracks = useCallback(() => {
    const currentFrame = timeline.currentFrame;
    const activeImages = tracks.filter(
      (track) =>
        track.type === 'image' &&
        track.visible &&
        currentFrame >= track.startFrame &&
        currentFrame < track.endFrame &&
        (track.previewUrl || track.source),
    );

    return activeImages;
  }, [tracks, timeline.currentFrame]);

  // Helper function to get z-index based on timeline track row positioning
  // Timeline visual order (top to bottom): Text → Subtitle → Image → Video → Audio
  // Rendering order (bottom to top): Audio → Video → Image → Subtitle → Text
  // Topmost tracks should have HIGHEST z-index to render on top
  const getTrackZIndex = useCallback(
    (track: VideoTrack): number => {
      // Timeline row order defines visual stacking (from TRACK_ROWS definition)
      // Index 0 (text) should be highest z-index, index 4 (audio) should be lowest
      const TRACK_ROW_ORDER: Record<VideoTrack['type'], number> = {
        text: 4, // Top row in timeline → Highest z-index
        subtitle: 3,
        image: 2,
        video: 1,
        audio: 0, // Bottom row in timeline → Lowest z-index
      };

      // Base z-index for each track type (500 units apart for fine-grained control)
      const baseZIndex = TRACK_ROW_ORDER[track.type] * 500;

      // Find track position within all tracks of the same type
      // Later tracks in the array (imported later) should render on top
      const sameTypeTracks = tracks.filter((t) => t.type === track.type);
      const indexWithinType = sameTypeTracks.findIndex(
        (t) => t.id === track.id,
      );

      // Add the within-type index for fine-grained ordering
      // This ensures tracks imported later appear on top of earlier tracks of the same type
      return baseZIndex + (indexWithinType !== -1 ? indexWithinType : 0);
    },
    [tracks],
  );

  // Helper function to convert text track style to CSS
  const getTextStyleForTextClip = useCallback((track: VideoTrack) => {
    const style = track.textStyle || {};

    // Build text shadow for stroke outline
    const strokeShadows: string[] = [];
    const strokeColor = style.strokeColor || '#000000';
    const strokeWidth = 2;

    // Create 8-direction outline for smooth stroke effect
    for (let angle = 0; angle < 360; angle += 45) {
      const radian = (angle * Math.PI) / 180;
      const x = Math.cos(radian) * strokeWidth;
      const y = Math.sin(radian) * strokeWidth;
      strokeShadows.push(
        `${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${strokeColor}`,
      );
    }

    // Add shadow if enabled
    const shadowEffects: string[] = [...strokeShadows];
    if (style.hasShadow) {
      shadowEffects.push(`2px 2px 4px rgba(0, 0, 0, 0.8)`);
    }

    // Apply bold/italic overrides
    let fontWeight = style.fontWeight || '400';
    let fontStyle = style.fontStyle || 'normal';

    if (style.isBold) {
      fontWeight = '700';
    }
    if (style.isItalic) {
      fontStyle = 'italic';
    }

    return {
      fontFamily: style.fontFamily || '"Arial", sans-serif',
      fontWeight,
      fontStyle,
      textTransform: style.textTransform || 'none',
      textAlign: style.textAlign || 'center',
      fontSize: `${style.fontSize || 18}px`,
      color: style.fillColor || '#FFFFFF',
      backgroundColor: style.backgroundColor || 'rgba(0, 0, 0, 0.5)',
      textDecoration: style.isUnderline ? 'underline' : 'none',
      textShadow: shadowEffects.join(', '),
      letterSpacing: `${style.letterSpacing || 0}px`,
      lineHeight: style.lineSpacing || 1.2,
      opacity: (style.opacity || 100) / 100,
      hasGlow: style.hasGlow || false,
    };
  }, []);

  // Handle text transform updates
  const handleTextTransformUpdate = useCallback(
    (
      trackId: string,
      transform: {
        x?: number;
        y?: number;
        scale?: number;
        rotation?: number;
        width?: number;
        height?: number;
      },
    ) => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.type !== 'text') return;

      const currentTransform = track.textTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: 0,
        height: 0,
      };

      updateTrack(trackId, {
        textTransform: {
          ...currentTransform,
          ...transform,
        },
      });
    },
    [tracks, updateTrack],
  );

  // Handle text selection
  const handleTextSelect = useCallback(
    (trackId: string) => {
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks],
  );

  // Handle text content updates
  const handleTextUpdate = useCallback(
    (trackId: string, newText: string) => {
      updateTrack(trackId, { textContent: newText });
    },
    [updateTrack],
  );

  // Handle drag state changes for guide rendering
  const handleDragStateChange = useCallback(
    (
      isDragging: boolean,
      position?: { x: number; y: number; width: number; height: number },
    ) => {
      setIsDraggingText(isDragging);

      if (!isDragging || !position) {
        setAlignmentGuides([]);
        return;
      }

      const guides: AlignmentGuide[] = [];
      const centerTolerance = 1; // Strict tolerance for center alignment (±1px)

      // Use ORIGINAL video dimensions (not scaled)
      const baseVideoWidth = activeVideoTrack?.width || preview.canvasWidth;
      const baseVideoHeight = activeVideoTrack?.height || preview.canvasHeight;

      // Calculate element center in video pixel coordinates (centered at 0,0)
      // position.x and position.y represent the CENTER of the text element
      const elementCenterX = position.x;
      const elementCenterY = position.y;

      // Video frame center (in video pixel coordinates, centered at 0,0)
      const frameCenterX = 0; // Video center X in our coordinate system
      const frameCenterY = 0; // Video center Y in our coordinate system

      // CENTER ALIGNMENT - Check if element's CENTER aligns with video frame's CENTER
      // Horizontal center guide (appears when text's Y center aligns with video's Y center)
      const isHorizontallyCentered =
        Math.abs(elementCenterY - frameCenterY) < centerTolerance;
      if (isHorizontallyCentered) {
        guides.push({
          type: 'horizontal',
          position: baseVideoHeight / 2, // Convert from centered coords (0) to top-left coords
          label: 'Center',
        });
      }

      // Vertical center guide (appears when text's X center aligns with video's X center)
      const isVerticallyCentered =
        Math.abs(elementCenterX - frameCenterX) < centerTolerance;
      if (isVerticallyCentered) {
        guides.push({
          type: 'vertical',
          position: baseVideoWidth / 2, // Convert from centered coords (0) to top-left coords
          label: 'Center',
        });
      }

      // Debug logging (development mode only)
      if (process.env.NODE_ENV === 'development') {
        console.log('[Drag Guides Debug]', {
          textCenter: { x: elementCenterX, y: elementCenterY },
          videoCenter: { x: frameCenterX, y: frameCenterY },
          alignment: {
            horizontallyCentered: isHorizontallyCentered,
            verticallyCentered: isVerticallyCentered,
            deltaX: Math.abs(elementCenterX - frameCenterX),
            deltaY: Math.abs(elementCenterY - frameCenterY),
          },
          tolerance: centerTolerance,
          guidesActive: guides.map((g) => `${g.type}-${g.label}`),
        });
      }

      setAlignmentGuides(guides);
    },
    [
      activeVideoTrack?.width,
      activeVideoTrack?.height,
      preview.canvasWidth,
      preview.canvasHeight,
    ],
  );

  // Handle click outside to deselect
  const handlePreviewClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if clicking directly on the container background
      // Don't deselect if clicking on video or other elements
      const target = e.target as HTMLElement;

      // Check if we clicked on the background or video area (not text elements)
      if (
        target === containerRef.current ||
        target.classList.contains('preview-background') ||
        target.tagName === 'VIDEO'
      ) {
        // Only deselect if we have text tracks selected
        const hasTextSelected = timeline.selectedTrackIds.some((id) => {
          const track = tracks.find((t) => t.id === id);
          return track?.type === 'text';
        });

        if (hasTextSelected) {
          setSelectedTracks([]);
        }
      }
    },
    [setSelectedTracks, timeline.selectedTrackIds, tracks],
  );

  // Add handler for video loadedmetadata
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    // Seek to correct position based on the video track
    const relativeFrame = Math.max(
      0,
      timeline.currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / timeline.fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    // Calculate the trimmed end time based on track duration
    const trackDurationSeconds =
      (activeVideoTrack.endFrame - activeVideoTrack.startFrame) / timeline.fps;
    const trimmedEndTime =
      (activeVideoTrack.sourceStartTime || 0) + trackDurationSeconds;

    // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, video.duration || 0)),
    );

    video.currentTime = clampedTargetTime;

    // Auto play if timeline is playing
    if (playback.isPlaying && video.paused) {
      video.muted = playback.muted || !!independentAudioTrack; // mute video if independent audio
      video.play().catch(() => {
        /* hello */
      });
    }
  }, [
    activeVideoTrack,
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    playback.muted,
    independentAudioTrack,
  ]);

  // Add handler for audio loadedmetadata
  const handleAudioLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;

    // Only seek audio if timeline position is within the audio track's range
    const isWithinAudioRange =
      timeline.currentFrame >= independentAudioTrack.startFrame &&
      timeline.currentFrame < independentAudioTrack.endFrame;

    if (isWithinAudioRange) {
      // Seek to correct position based on the audio track
      const relativeFrame =
        timeline.currentFrame - independentAudioTrack.startFrame;
      const trackTime = relativeFrame / timeline.fps;
      const targetTime =
        (independentAudioTrack.sourceStartTime || 0) + trackTime;

      // Calculate the trimmed end time based on track duration
      const trackDurationSeconds =
        (independentAudioTrack.endFrame - independentAudioTrack.startFrame) /
        timeline.fps;
      const trimmedEndTime =
        (independentAudioTrack.sourceStartTime || 0) + trackDurationSeconds;

      // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
      audio.currentTime = Math.max(
        independentAudioTrack.sourceStartTime || 0,
        Math.min(targetTime, Math.min(trimmedEndTime, audio.duration || 0)),
      );
    } else {
      console.log(
        '[DirectPreview] Audio metadata loaded - timeline outside audio range, not seeking',
      );
    }

    // Auto play if timeline is playing
    if (playback.isPlaying && audio.paused) {
      audio.muted = playback.muted || independentAudioTrack.muted;
      audio.play().catch(() => {
        /* hello */
      });
    }
  }, [
    independentAudioTrack,
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    playback.muted,
  ]);

  // Keep the simplified canplay effect for auto-play only
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handleAutoPlay() {
      if (playback.isPlaying && video.paused) {
        video.muted = playback.muted;
        video.play().catch(() => {
          /* hello */
        });
      }
    }

    video.addEventListener('canplay', handleAutoPlay);
    return () => video.removeEventListener('canplay', handleAutoPlay);
  }, [playback.isPlaying, playback.muted]);

  // Sync play/pause & volume for video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (playback.isPlaying) {
        if (video.paused && video.readyState >= 3) {
          video.play().catch(console.warn);
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
      }

      // Handle video volume
      // Mute video if:
      // 1. Global playback is muted, OR
      // 2. There's an independent (unlinked) audio track playing, OR
      // 3. The video track itself is muted, OR
      // 4. There's no audio track at all (neither independent nor video-based)
      const shouldMuteVideo =
        playback.muted ||
        !!independentAudioTrack ||
        (activeVideoTrack?.muted ?? false) ||
        (!independentAudioTrack && !videoTrackWithAudio); // Mute when no audio source

      video.volume = shouldMuteVideo ? 0 : Math.min(playback.volume, 1);
      video.playbackRate = Math.max(0.25, Math.min(playback.playbackRate, 4));
    } catch (err) {
      console.warn('Video sync error:', err);
    }
  }, [
    playback.isPlaying,
    playback.volume,
    playback.muted,
    playback.playbackRate,
    activeVideoTrack?.id,
    activeVideoTrack?.previewUrl,
    activeVideoTrack?.muted,
    independentAudioTrack,
  ]);

  // Sync play/pause & volume for independent audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;

    // Check if timeline position is within the audio track's range
    const isWithinAudioRange =
      timeline.currentFrame >= independentAudioTrack.startFrame &&
      timeline.currentFrame < independentAudioTrack.endFrame;

    try {
      if (playback.isPlaying) {
        // Only play audio if timeline position is within audio track's range
        if (isWithinAudioRange && audio.paused && audio.readyState >= 3) {
          audio.play().catch(console.warn);
        } else if (!isWithinAudioRange && !audio.paused) {
          audio.pause();
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }

      // Handle audio volume
      const shouldMute = playback.muted || independentAudioTrack.muted;
      audio.volume = shouldMute ? 0 : Math.min(playback.volume, 1);
      audio.playbackRate = Math.max(0.25, Math.min(playback.playbackRate, 4));
    } catch (err) {
      console.warn('Audio sync error:', err);
    }
  }, [
    playback.isPlaying,
    playback.volume,
    playback.muted,
    playback.playbackRate,
    independentAudioTrack?.id,
    independentAudioTrack?.muted,
    timeline.currentFrame, // Added to check range on timeline changes
  ]);

  // Sync timeline to video frames - DISABLED during timeline-controlled playback
  useEffect(() => {
    const video = videoRef.current;
    const trackForSync = activeVideoTrack || activeAudioTrack;
    if (!video || !trackForSync || playback.isPlaying) return; // Don't sync during playback

    let handle: number;
    const fps = timeline.fps;

    const step = (
      _now: DOMHighResTimeStamp,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      // Only sync when video is playing but timeline playback is NOT active
      if (!video.paused && !playback.isPlaying) {
        const elapsedFrames =
          (metadata.mediaTime - (trackForSync.sourceStartTime || 0)) * fps +
          trackForSync.startFrame;
        setCurrentFrame(Math.floor(elapsedFrames));
      }
      handle = video.requestVideoFrameCallback(step);
    };

    handle = video.requestVideoFrameCallback(step);
    return () => video.cancelVideoFrameCallback(handle);
  }, [
    activeVideoTrack?.id,
    activeAudioTrack?.id,
    playback.isPlaying,
    timeline.fps,
    setCurrentFrame,
  ]);

  // Sync video element on scrubbing/seek (user interaction and track changes)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    // Detect if trim boundaries actually changed (not just playback progression)
    const currentTrimState = {
      trackId: activeVideoTrack.id,
      startFrame: activeVideoTrack.startFrame,
      endFrame: activeVideoTrack.endFrame,
      sourceStartTime: activeVideoTrack.sourceStartTime || 0,
    };

    const trimChanged =
      !prevVideoTrimRef.current ||
      prevVideoTrimRef.current.trackId !== currentTrimState.trackId ||
      prevVideoTrimRef.current.startFrame !== currentTrimState.startFrame ||
      prevVideoTrimRef.current.endFrame !== currentTrimState.endFrame ||
      prevVideoTrimRef.current.sourceStartTime !==
        currentTrimState.sourceStartTime;

    // Update the ref for next comparison
    prevVideoTrimRef.current = currentTrimState;

    const relativeFrame = Math.max(
      0,
      timeline.currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / timeline.fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    // Calculate the trimmed end time based on track duration
    const trackDurationSeconds =
      (activeVideoTrack.endFrame - activeVideoTrack.startFrame) / timeline.fps;
    const trimmedEndTime =
      (activeVideoTrack.sourceStartTime || 0) + trackDurationSeconds;

    // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, video.duration || 0)),
    );

    const diff = Math.abs(video.currentTime - clampedTargetTime);
    const tolerance = 1 / timeline.fps; // One frame tolerance

    // Seek logic:
    // 1. If trim boundaries changed: ALWAYS seek (even during playback)
    // 2. If NOT playing (scrubbing): Seek if position differs
    // 3. If playing normally: Let the video play naturally (don't seek on every frame)
    const shouldSeek = trimChanged || (!playback.isPlaying && diff > tolerance);

    if (shouldSeek && diff > tolerance) {
      video.currentTime = clampedTargetTime;
    }
  }, [
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    activeVideoTrack,
  ]);

  // Sync independent audio element on scrubbing/seek (user interaction and track changes)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;

    // Only seek audio if timeline position is within the audio track's range
    const isWithinAudioRange =
      timeline.currentFrame >= independentAudioTrack.startFrame &&
      timeline.currentFrame < independentAudioTrack.endFrame;

    if (!isWithinAudioRange) {
      return; // Don't seek audio when timeline is outside its range
    }

    // Detect if trim boundaries actually changed (not just playback progression)
    const currentTrimState = {
      trackId: independentAudioTrack.id,
      startFrame: independentAudioTrack.startFrame,
      endFrame: independentAudioTrack.endFrame,
      sourceStartTime: independentAudioTrack.sourceStartTime || 0,
    };

    const trimChanged =
      !prevAudioTrimRef.current ||
      prevAudioTrimRef.current.trackId !== currentTrimState.trackId ||
      prevAudioTrimRef.current.startFrame !== currentTrimState.startFrame ||
      prevAudioTrimRef.current.endFrame !== currentTrimState.endFrame ||
      prevAudioTrimRef.current.sourceStartTime !==
        currentTrimState.sourceStartTime;

    // Update the ref for next comparison
    prevAudioTrimRef.current = currentTrimState;

    const relativeFrame =
      timeline.currentFrame - independentAudioTrack.startFrame;
    const trackTime = relativeFrame / timeline.fps;
    const targetTime = (independentAudioTrack.sourceStartTime || 0) + trackTime;

    // Calculate the trimmed end time based on track duration
    const trackDurationSeconds =
      (independentAudioTrack.endFrame - independentAudioTrack.startFrame) /
      timeline.fps;
    const trimmedEndTime =
      (independentAudioTrack.sourceStartTime || 0) + trackDurationSeconds;

    // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
    const clampedTargetTime = Math.max(
      independentAudioTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, audio.duration || 0)),
    );

    const diff = Math.abs(audio.currentTime - clampedTargetTime);
    const tolerance = 1 / timeline.fps; // One frame tolerance

    // Seek logic:
    // 1. If trim boundaries changed: ALWAYS seek (even during playback)
    // 2. If NOT playing (scrubbing): Seek if position differs
    // 3. If playing normally: Let the audio play naturally (don't seek on every frame)
    const shouldSeek = trimChanged || (!playback.isPlaying && diff > tolerance);

    if (shouldSeek && diff > tolerance) {
      audio.currentTime = clampedTargetTime;
    }
  }, [
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    independentAudioTrack?.id,
    independentAudioTrack?.startFrame,
    independentAudioTrack?.endFrame,
    independentAudioTrack?.sourceStartTime,
    independentAudioTrack?.sourceDuration,
  ]);

  // Drag/drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if this is an external file drag (not internal media)
    const hasMediaId = e.dataTransfer.types.includes('text/plain');
    const hasFiles = e.dataTransfer.types.includes('Files');

    if (e.type === 'dragenter' || e.type === 'dragover') {
      // Only activate for external file drops
      if (hasFiles && !hasMediaId) {
        setDragActive(true);
      }
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      // Check if this is an internal media drag (not a file drop)
      const mediaId = e.dataTransfer.getData('text/plain');
      if (mediaId) {
        // This is an internal drag from media library, ignore it
        return;
      }

      // Handle external file drops with validation
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        // Show immediate loading toast with promise
        const importPromise = importMediaToTimeline(files);

        toast.promise(importPromise, {
          loading: `Adding ${files.length} ${files.length === 1 ? 'file' : 'files'} to timeline...`,
          success: (result) => {
            const importedCount = result.importedFiles.length;
            const rejectedCount = result.rejectedFiles?.length || 0;

            // Return success message
            if (importedCount > 0) {
              return (
                `Added ${importedCount} ${importedCount === 1 ? 'file' : 'files'} to timeline` +
                (rejectedCount > 0 ? ` (${rejectedCount} rejected)` : '')
              );
            } else {
              throw new Error(
                'All files were rejected due to corruption or invalid format',
              );
            }
          },
          error: (error) => {
            // Use the actual error message from validation results
            const errorMessage =
              error?.error ||
              'All files were rejected due to corruption or invalid format';
            return errorMessage;
          },
        });

        try {
          await importPromise;
        } catch (error) {
          console.error('❌ Error importing files to preview:', error);
        }
      }
    },
    [importMediaToTimeline],
  );

  // Pan/drag handlers for zoomed preview
  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      // Only enable panning when in pan mode and zoomed in
      if (preview.interactionMode !== 'pan') return;
      if (preview.previewScale <= 1) return;

      // Don't start panning if clicking on the placeholder
      if (!activeVideoTrack && !activeAudioTrack) return;

      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: preview.panX,
        panY: preview.panY,
      };
    },
    [
      preview.interactionMode,
      preview.previewScale,
      preview.panX,
      preview.panY,
      activeVideoTrack,
      activeAudioTrack,
    ],
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStartRef.current) return;

      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;

      const newPanX = panStartRef.current.panX + deltaX;
      const newPanY = panStartRef.current.panY + deltaY;

      setPreviewPan(newPanX, newPanY);
    },
    [isPanning, setPreviewPan],
  );

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Wheel zoom handler with cursor-based pivot
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Support both Ctrl+Scroll and Alt+Scroll for zooming
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      // Get cursor position relative to container
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Calculate cursor position in preview space (accounting for current pan)
      const previewCenterX = rect.width / 2;
      const previewCenterY = rect.height / 2;

      // Position relative to center, accounting for current pan
      const relativeX = cursorX - previewCenterX - preview.panX;
      const relativeY = cursorY - previewCenterY - preview.panY;

      // Determine zoom direction and factor
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      const oldScale = preview.previewScale;
      const newScale = Math.max(0.1, Math.min(oldScale * zoomFactor, 8));

      // If scale didn't actually change (hit limits), don't adjust pan
      if (newScale === oldScale) return;

      // Calculate new pan to keep cursor point stationary
      // The point under the cursor should remain in the same visual position
      const scaleDelta = newScale / oldScale - 1;
      const newPanX = preview.panX - relativeX * scaleDelta;
      const newPanY = preview.panY - relativeY * scaleDelta;

      // Apply zoom and adjust pan
      setPreviewScale(newScale);
      setPreviewPan(newPanX, newPanY);
    },
    [
      preview.previewScale,
      preview.panX,
      preview.panY,
      setPreviewScale,
      setPreviewPan,
    ],
  );

  // Pinch zoom handlers for touchpad/touchscreen
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Start pinch gesture
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY,
        );

        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;

        pinchStateRef.current = {
          initialDistance: distance,
          initialScale: preview.previewScale,
          centerX,
          centerY,
        };
      }
    },
    [preview.previewScale],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStateRef.current) {
        e.preventDefault();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY,
        );

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;

        // Calculate scale change
        const scaleChange = distance / pinchStateRef.current.initialDistance;
        const newScale = Math.max(
          0.1,
          Math.min(pinchStateRef.current.initialScale * scaleChange, 8),
        );

        // Calculate cursor position relative to container
        const cursorX = centerX - rect.left;
        const cursorY = centerY - rect.top;

        // Position relative to center
        const previewCenterX = rect.width / 2;
        const previewCenterY = rect.height / 2;
        const relativeX = cursorX - previewCenterX - preview.panX;
        const relativeY = cursorY - previewCenterY - preview.panY;

        // Calculate new pan to keep pinch center stationary
        const oldScale = preview.previewScale;
        if (newScale !== oldScale) {
          const scaleDelta = newScale / oldScale - 1;
          const newPanX = preview.panX - relativeX * scaleDelta;
          const newPanY = preview.panY - relativeY * scaleDelta;

          setPreviewScale(newScale);
          setPreviewPan(newPanX, newPanY);
        }
      }
    },
    [
      preview.previewScale,
      preview.panX,
      preview.panY,
      setPreviewScale,
      setPreviewPan,
    ],
  );

  const handleTouchEnd = useCallback(() => {
    pinchStateRef.current = null;
  }, []);

  // Add global mouse up listener for panning
  useEffect(() => {
    if (!isPanning) return;

    const handleGlobalMouseUp = () => {
      handlePanEnd();
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isPanning, handlePanEnd]);

  const { actualWidth, actualHeight } = calculateContentScale();

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-lg preview-background',
        className,
        'bg-zinc-100 dark:bg-zinc-900',
        // Change cursor based on interaction mode and state
        (() => {
          if (!activeVideoTrack && !activeAudioTrack) return 'cursor-default';

          // Pan mode cursor
          if (preview.interactionMode === 'pan' && preview.previewScale > 1) {
            return isPanning ? 'cursor-grabbing' : 'cursor-grab';
          }

          // Select mode or zoomed out
          return 'cursor-default';
        })(),
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onMouseDown={(e) => {
        // Handle pan mode first
        if (preview.interactionMode === 'pan' && preview.previewScale > 1) {
          handlePanStart(e);
        } else {
          // In select mode, handle text deselection
          handlePreviewClick(e);
        }
      }}
      onMouseMove={handlePanMove}
      onMouseUp={handlePanEnd}
      onMouseLeave={() => {
        handlePanEnd();
        setIsPreviewFocused(false);
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onFocus={() => setIsPreviewFocused(true)}
      onBlur={() => setIsPreviewFocused(false)}
      onMouseEnter={() => setIsPreviewFocused(true)}
      tabIndex={0}
    >
      {/* Video */}
      {(activeVideoTrack || activeAudioTrack) && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: `calc(50% + ${preview.panX}px)`,
            top: `calc(50% + ${preview.panY}px)`,
            transform: 'translate(-50%, -50%)',
            // Hide video visually if track is not visible, but keep element for audio
            opacity: activeVideoTrack ? 1 : 0,
            pointerEvents: activeVideoTrack ? 'auto' : 'none',
            zIndex: activeVideoTrack ? getTrackZIndex(activeVideoTrack) : 0,
          }}
        >
          <video
            ref={videoRef}
            key={`video-${activeVideoTrack?.previewUrl || 'no-video'}`}
            className="w-full h-full object-contain"
            playsInline
            controls={false}
            preload="metadata"
            src={activeVideoTrack?.previewUrl}
            onLoadedMetadata={handleLoadedMetadata}
          />
        </div>
      )}

      {/* Independent Audio Element */}
      {independentAudioTrack && independentAudioTrack.previewUrl && (
        <audio
          ref={audioRef}
          key={`audio-${independentAudioTrack.previewUrl}-${independentAudioTrack.startFrame}`}
          preload="metadata"
          src={independentAudioTrack.previewUrl}
          onLoadedMetadata={handleAudioLoadedMetadata}
          style={{ display: 'none' }}
        />
      )}

      {/* Subtitles */}
      {(() => {
        const activeSubs = getActiveSubtitleTracks();
        if (activeSubs.length === 0) return null;

        // Use actual video height for subtitle sizing
        const videoHeight = activeVideoTrack?.height || preview.canvasHeight;

        // Get applied style for container alignment
        const appliedStyle = getTextStyleForSubtitle(textStyle.activeStyle);

        // Calculate responsive font size based on zoom level
        // Base size scales with video height, then multiply by preview scale for zoom responsiveness
        const baseFontSize = Math.max(24, videoHeight * 0.02);
        const responsiveFontSize = baseFontSize * preview.previewScale;

        // Scale padding and effects with zoom level
        const scaledPaddingVertical = 7 * preview.previewScale;
        const scaledPaddingHorizontal = 9 * preview.previewScale;

        // Calculate responsive horizontal padding based on actual width (5% of actual width)
        const videoWidth = activeVideoTrack?.width || preview.canvasWidth;
        const scaledHorizontalPadding =
          videoWidth * 0.01 * preview.previewScale;

        // Render each subtitle track independently with proper z-indexing
        return activeSubs.map((track) => {
          return (
            <div
              key={`subtitle-container-${track.id}`}
              className="absolute inset-0 pointer-events-none"
              style={{
                width: actualWidth,
                height: actualHeight,
                left: `calc(50% + ${preview.panX}px)`,
                top: `calc(50% + ${preview.panY}px)`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems:
                  appliedStyle.textAlign === 'left'
                    ? 'flex-start'
                    : appliedStyle.textAlign === 'right'
                      ? 'flex-end'
                      : 'center',
                justifyContent: 'flex-end',
                paddingBottom: `${20 * preview.previewScale}px`,
                paddingLeft: `${scaledHorizontalPadding}px`,
                paddingRight: `${scaledHorizontalPadding}px`,
                zIndex: getTrackZIndex(track), // Each subtitle gets its own z-index
              }}
            >
              {(() => {
                // Scale text shadow with zoom level if present
                let scaledTextShadow = appliedStyle.textShadow;
                if (scaledTextShadow && preview.previewScale !== 1) {
                  // Parse and scale text shadow values
                  scaledTextShadow = scaledTextShadow.replace(
                    /(\d+\.?\d*)px/g,
                    (match: string, value: string) => {
                      return `${parseFloat(value) * preview.previewScale}px`;
                    },
                  );
                }

                // Check if has actual background (not transparent)
                const hasActualBackground =
                  appliedStyle.backgroundColor &&
                  appliedStyle.backgroundColor !== 'transparent' &&
                  appliedStyle.backgroundColor !== 'rgba(0,0,0,0)' &&
                  appliedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)';

                // Base text style shared across all layers
                const baseTextStyle: React.CSSProperties = {
                  fontSize: `${responsiveFontSize}px`,
                  fontFamily: appliedStyle.fontFamily,
                  fontWeight: appliedStyle.fontWeight,
                  fontStyle: appliedStyle.fontStyle,
                  textTransform: appliedStyle.textTransform as any,
                  textDecoration: appliedStyle.textDecoration,
                  textAlign: appliedStyle.textAlign as any,
                  lineHeight: appliedStyle.lineHeight,
                  letterSpacing: appliedStyle.letterSpacing
                    ? `${parseFloat(String(appliedStyle.letterSpacing)) * preview.previewScale}px`
                    : appliedStyle.letterSpacing,
                  whiteSpace: 'pre-line',
                  wordBreak: 'keep-all',
                  overflowWrap: 'normal',
                  padding: `${scaledPaddingVertical}px ${scaledPaddingHorizontal}px`,
                };

                // Multi-layer rendering for glow effect (matching export implementation)
                if ((appliedStyle as any).hasGlow) {
                  // Calculate glow parameters - balanced for spread and subtlety
                  const glowBlurAmount = 8 * preview.previewScale; // Moderate blur for soft spread
                  const glowSpread = 8 * preview.previewScale; // Good spread distance

                  if (hasActualBackground) {
                    // Triple-layer mode: glow + background box + text
                    return (
                      <div
                        key={track.id}
                        style={{
                          position: 'relative',
                          display: 'inline-block',
                        }}
                      >
                        {/* Layer 0: Blurred glow layer behind background box */}
                        <div
                          style={{
                            ...baseTextStyle,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            color: appliedStyle.color, // Glow uses text color
                            backgroundColor: hasActualBackground
                              ? appliedStyle.backgroundColor
                              : 'transparent',
                            opacity: 0.75,
                            filter: `blur(${glowBlurAmount}px)`,
                            boxShadow: `0 0 ${glowSpread}px ${appliedStyle.color}, 0 0 ${glowSpread * 1.5}px ${appliedStyle.color}`,
                            zIndex: 0,
                          }}
                          aria-hidden="true"
                        >
                          {track.subtitleText}
                        </div>

                        {/* Layer 1: Background box (crisp, no blur) */}
                        <div
                          style={{
                            ...baseTextStyle,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            color: 'transparent', // Invisible text, just the box
                            backgroundColor: appliedStyle.backgroundColor,
                            opacity: appliedStyle.opacity,
                            zIndex: 1,
                          }}
                          aria-hidden="true"
                        >
                          {track.subtitleText}
                        </div>

                        {/* Layer 2: Text with outline on top (crisp, no blur) */}
                        <div
                          style={{
                            ...baseTextStyle,
                            position: 'relative',
                            color: appliedStyle.color,
                            backgroundColor: 'transparent',
                            opacity: appliedStyle.opacity,
                            textShadow: scaledTextShadow,
                            zIndex: 2,
                          }}
                        >
                          {track.subtitleText}
                        </div>
                      </div>
                    );
                  }

                  // Double-layer mode: glow + text (no background)
                  return (
                    <div
                      key={track.id}
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                      }}
                    >
                      {/* Layer 0: Blurred glow layer (furthest back) */}
                      <div
                        style={{
                          ...baseTextStyle,
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          color: appliedStyle.color, // Glow uses text color
                          backgroundColor: 'transparent',
                          opacity: 0.75, // Slightly more visible for better spread
                          filter: `blur(${glowBlurAmount}px)`,
                          textShadow: `0 0 ${glowSpread}px ${appliedStyle.color}, 0 0 ${glowSpread * 1.5}px ${appliedStyle.color}`,
                          WebkitTextStroke: `${glowSpread * 0.75}px ${appliedStyle.color}`,
                          zIndex: 0,
                        }}
                        aria-hidden="true"
                      >
                        {track.subtitleText}
                      </div>

                      {/* Layer 1: Main text with outline */}
                      <div
                        style={{
                          ...baseTextStyle,
                          position: 'relative',
                          color: appliedStyle.color,
                          backgroundColor: 'transparent',
                          opacity: appliedStyle.opacity,
                          textShadow: scaledTextShadow,
                          zIndex: 1,
                        }}
                      >
                        {track.subtitleText}
                      </div>
                    </div>
                  );
                }

                // No glow - simple single layer rendering
                return (
                  <div
                    key={track.id}
                    style={{
                      ...baseTextStyle,
                      textShadow: scaledTextShadow,
                      color: appliedStyle.color,
                      backgroundColor: appliedStyle.backgroundColor,
                      opacity: appliedStyle.opacity,
                    }}
                  >
                    {track.subtitleText}
                  </div>
                );
              })()}
            </div>
          );
        });
      })()}

      {/* Image Tracks */}
      {(() => {
        const activeImages = getActiveImageTracks();
        if (activeImages.length === 0) return null;

        // Use ORIGINAL video dimensions (not scaled) for coordinate normalization
        const baseVideoHeight =
          activeVideoTrack?.height || preview.canvasHeight;
        const baseVideoWidth = activeVideoTrack?.width || preview.canvasWidth;

        // Sort images by their index in the tracks array to maintain layer order
        // Lower index = rendered first = appears behind higher index tracks
        const sortedImages = [...activeImages].sort((a, b) => {
          const indexA = tracks.findIndex((t) => t.id === a.id);
          const indexB = tracks.findIndex((t) => t.id === b.id);
          return indexA - indexB;
        });

        return (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              width: actualWidth,
              height: actualHeight,
              left: `calc(50% + ${preview.panX}px)`,
              top: `calc(50% + ${preview.panY}px)`,
              transform: 'translate(-50%, -50%)',
              overflow: 'hidden', // Clip images that go outside video canvas
              zIndex:
                sortedImages.length > 0
                  ? Math.max(...sortedImages.map((t) => getTrackZIndex(t)))
                  : 200,
            }}
          >
            {sortedImages.map((track) => {
              const imageUrl = track.previewUrl || track.source;

              // Calculate adaptive image dimensions that fit canvas while preserving aspect ratio
              // Priority: preserve width, adjust height to maintain aspect ratio
              let defaultWidth = baseVideoWidth;
              let defaultHeight = baseVideoHeight;

              if (track.width && track.height) {
                const imageAspectRatio = track.width / track.height;
                const canvasAspectRatio = baseVideoWidth / baseVideoHeight;

                if (imageAspectRatio > canvasAspectRatio) {
                  // Image is wider than canvas - fit to width
                  defaultWidth = baseVideoWidth;
                  defaultHeight = baseVideoWidth / imageAspectRatio;
                } else {
                  // Image is taller than canvas - fit to height
                  defaultHeight = baseVideoHeight;
                  defaultWidth = baseVideoHeight * imageAspectRatio;
                }
              }

              // Get image transform properties (default to centered, adaptive-fit if not set)
              const imageTransform = track.textTransform || {
                x: 0, // Centered
                y: 0, // Centered
                scale: 1, // 100% scale
                rotation: 0, // No rotation
                width: defaultWidth, // Adaptive width
                height: defaultHeight, // Adaptive height
              };

              // Calculate position in pixels (from normalized coordinates)
              // x and y are normalized (-1 to 1, where 0 is center)
              const pixelX = imageTransform.x * (baseVideoWidth / 2);
              const pixelY = imageTransform.y * (baseVideoHeight / 2);

              // Calculate scaled dimensions
              const scaledWidth =
                (imageTransform.width || defaultWidth) * imageTransform.scale;
              const scaledHeight =
                (imageTransform.height || defaultHeight) * imageTransform.scale;

              // Apply preview scale for zoom responsiveness
              const displayWidth = scaledWidth * preview.previewScale;
              const displayHeight = scaledHeight * preview.previewScale;
              const displayX = pixelX * preview.previewScale;
              const displayY = pixelY * preview.previewScale;

              return (
                <div
                  key={track.id}
                  className="absolute pointer-events-auto"
                  style={{
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) translate(${displayX}px, ${displayY}px) rotate(${imageTransform.rotation}deg)`,
                    width: `${displayWidth}px`,
                    height: `${displayHeight}px`,
                    opacity:
                      track.textStyle?.opacity !== undefined
                        ? track.textStyle.opacity / 100
                        : 1,
                    zIndex: getTrackZIndex(track), // Use timeline-based z-index
                  }}
                >
                  <img
                    src={imageUrl}
                    alt={track.name}
                    className="w-full h-full object-contain"
                    style={{
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                    draggable={false}
                  />
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Text Clips (Heading and Body) with Transform Controls */}
      {(() => {
        const activeTexts = getActiveTextTracks();
        if (activeTexts.length === 0) return null;

        // Use ORIGINAL video dimensions (not scaled) for coordinate normalization
        // This ensures normalized coordinates remain consistent regardless of zoom level
        const baseVideoHeight =
          activeVideoTrack?.height || preview.canvasHeight;
        const baseVideoWidth = activeVideoTrack?.width || preview.canvasWidth;

        return (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              width: actualWidth,
              height: actualHeight,
              left: `calc(50% + ${preview.panX}px)`,
              top: `calc(50% + ${preview.panY}px)`,
              transform: 'translate(-50%, -50%)',
              overflow: 'hidden', // Clip text elements that go outside video canvas
              zIndex:
                activeTexts.length > 0
                  ? Math.max(...activeTexts.map((t) => getTrackZIndex(t)))
                  : 400,
            }}
          >
            {activeTexts.map((track) => {
              const appliedStyle = getTextStyleForTextClip(track);
              const isSelected = timeline.selectedTrackIds.includes(track.id);

              // Calculate responsive font size based on zoom level
              const baseFontSize = Math.max(24, baseVideoHeight * 0.02);
              const responsiveFontSize = baseFontSize * preview.previewScale;

              // Scale padding and effects with zoom level
              const scaledPaddingVertical = 2 * preview.previewScale;
              const scaledPaddingHorizontal = 8 * preview.previewScale;

              // Scale text shadow with zoom level
              let scaledTextShadow = appliedStyle.textShadow;
              if (scaledTextShadow && preview.previewScale !== 1) {
                scaledTextShadow = scaledTextShadow.replace(
                  /(\d+\.?\d*)px/g,
                  (match: string, value: string) => {
                    return `${parseFloat(value) * preview.previewScale}px`;
                  },
                );
              }

              // Check if has actual background (not transparent)
              const hasActualBackground =
                appliedStyle.backgroundColor &&
                appliedStyle.backgroundColor !== 'transparent' &&
                appliedStyle.backgroundColor !== 'rgba(0,0,0,0)' &&
                appliedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)';

              // Base text style shared across all layers
              const baseTextStyle: React.CSSProperties = {
                fontSize: `${responsiveFontSize}px`,
                fontFamily: appliedStyle.fontFamily,
                fontWeight: appliedStyle.fontWeight,
                fontStyle: appliedStyle.fontStyle,
                textTransform: appliedStyle.textTransform as any,
                textDecoration: appliedStyle.textDecoration,
                textAlign: appliedStyle.textAlign as any,
                lineHeight: appliedStyle.lineHeight,
                letterSpacing: appliedStyle.letterSpacing
                  ? `${parseFloat(String(appliedStyle.letterSpacing)) * preview.previewScale}px`
                  : appliedStyle.letterSpacing,
                whiteSpace: 'pre-line',
                wordBreak: 'keep-all',
                overflowWrap: 'normal',
                padding: `${scaledPaddingVertical}px ${scaledPaddingHorizontal}px`,
              };

              // Multi-layer rendering for glow effect (matching export implementation)
              if (appliedStyle.hasGlow) {
                // Calculate glow parameters - balanced for spread and subtlety
                const glowBlurAmount = 8 * preview.previewScale; // Moderate blur for soft spread
                const glowSpread = 8 * preview.previewScale; // Good spread distance

                // Create the complete style for the boundary wrapper
                const completeStyle: React.CSSProperties = {
                  ...baseTextStyle,
                  color: appliedStyle.color,
                  backgroundColor: hasActualBackground
                    ? appliedStyle.backgroundColor
                    : 'transparent',
                  opacity: appliedStyle.opacity,
                  textShadow: scaledTextShadow,
                };

                if (hasActualBackground) {
                  // Triple-layer mode: glow + background box + text
                  return (
                    <TextTransformBoundary
                      key={track.id}
                      track={track}
                      isSelected={isSelected}
                      previewScale={preview.previewScale}
                      videoWidth={baseVideoWidth}
                      videoHeight={baseVideoHeight}
                      onTransformUpdate={handleTextTransformUpdate}
                      onSelect={handleTextSelect}
                      onTextUpdate={handleTextUpdate}
                      onRotationStateChange={setIsRotating}
                      onDragStateChange={handleDragStateChange}
                      appliedStyle={completeStyle}
                    >
                      <div
                        style={{
                          position: 'relative',
                          display: 'inline-block',
                        }}
                      >
                        {/* Layer 0: Blurred glow layer behind background box */}
                        <div
                          style={{
                            ...baseTextStyle,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            color: appliedStyle.color, // Glow uses text color
                            backgroundColor: appliedStyle.backgroundColor,
                            opacity: 0.75,
                            filter: `blur(${glowBlurAmount}px)`,
                            boxShadow: `0 0 ${glowSpread}px ${appliedStyle.color}, 0 0 ${glowSpread * 1.5}px ${appliedStyle.color}`,
                            zIndex: 0,
                          }}
                          aria-hidden="true"
                        >
                          {track.textContent}
                        </div>

                        {/* Layer 1: Background box (crisp, no blur) */}
                        <div
                          style={{
                            ...baseTextStyle,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            color: 'transparent', // Invisible text, just the box
                            backgroundColor: appliedStyle.backgroundColor,
                            opacity: appliedStyle.opacity,
                            zIndex: 1,
                          }}
                          aria-hidden="true"
                        >
                          {track.textContent}
                        </div>

                        {/* Layer 2: Text with outline on top (crisp, no blur) */}
                        <div
                          style={{
                            ...baseTextStyle,
                            position: 'relative',
                            color: appliedStyle.color,
                            backgroundColor: 'transparent',
                            opacity: appliedStyle.opacity,
                            textShadow: scaledTextShadow,
                            zIndex: 2,
                          }}
                        >
                          {track.textContent}
                        </div>
                      </div>
                    </TextTransformBoundary>
                  );
                }

                // Double-layer mode: glow + text (no background)
                return (
                  <TextTransformBoundary
                    key={track.id}
                    track={track}
                    isSelected={isSelected}
                    previewScale={preview.previewScale}
                    videoWidth={baseVideoWidth}
                    videoHeight={baseVideoHeight}
                    onTransformUpdate={handleTextTransformUpdate}
                    onSelect={handleTextSelect}
                    onTextUpdate={handleTextUpdate}
                    onRotationStateChange={setIsRotating}
                    onDragStateChange={handleDragStateChange}
                    appliedStyle={completeStyle}
                  >
                    <div
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                      }}
                    >
                      {/* Layer 0: Blurred glow layer (furthest back) */}
                      <div
                        style={{
                          ...baseTextStyle,
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          color: appliedStyle.color, // Glow uses text color
                          backgroundColor: 'transparent',
                          opacity: 0.75, // Slightly more visible for better spread
                          filter: `blur(${glowBlurAmount}px)`,
                          textShadow: `0 0 ${glowSpread}px ${appliedStyle.color}, 0 0 ${glowSpread * 1.5}px ${appliedStyle.color}`,
                          WebkitTextStroke: `${glowSpread * 0.75}px ${appliedStyle.color}`,
                          zIndex: 0,
                        }}
                        aria-hidden="true"
                      >
                        {track.textContent}
                      </div>

                      {/* Layer 1: Main text with outline */}
                      <div
                        style={{
                          ...baseTextStyle,
                          position: 'relative',
                          color: appliedStyle.color,
                          backgroundColor: 'transparent',
                          opacity: appliedStyle.opacity,
                          textShadow: scaledTextShadow,
                          zIndex: 1,
                        }}
                      >
                        {track.textContent}
                      </div>
                    </div>
                  </TextTransformBoundary>
                );
              }

              // No glow - simple single layer rendering
              const completeStyle: React.CSSProperties = {
                ...baseTextStyle,
                textShadow: scaledTextShadow,
                color: appliedStyle.color,
                backgroundColor: appliedStyle.backgroundColor,
                opacity: appliedStyle.opacity,
              };

              return (
                <TextTransformBoundary
                  key={track.id}
                  track={track}
                  isSelected={isSelected}
                  previewScale={preview.previewScale}
                  videoWidth={baseVideoWidth}
                  videoHeight={baseVideoHeight}
                  onTransformUpdate={handleTextTransformUpdate}
                  onSelect={handleTextSelect}
                  onTextUpdate={handleTextUpdate}
                  onRotationStateChange={setIsRotating}
                  onDragStateChange={handleDragStateChange}
                  appliedStyle={completeStyle}
                >
                  <div style={completeStyle}>{track.textContent}</div>
                </TextTransformBoundary>
              );
            })}

            {/* Drag Alignment Guides */}
            {isDraggingText && alignmentGuides.length > 0 && (
              <DragGuides
                guides={alignmentGuides}
                videoWidth={activeVideoTrack?.width || preview.canvasWidth}
                videoHeight={activeVideoTrack?.height || preview.canvasHeight}
                previewScale={preview.previewScale}
                panX={preview.panX}
                panY={preview.panY}
                isBoundaryWarning={false}
              />
            )}
          </div>
        );
      })()}

      {/* Transcription Progress Loader - Only show when transcribing from timeline */}
      {currentTranscribingTrackId && transcriptionProgress && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1001]">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
            <circle
              cx="20"
              cy="20"
              r="16"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              className="text-white/20"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 16}`}
              strokeDashoffset={`${2 * Math.PI * 16 * (1 - transcriptionProgress.progress / 100)}`}
              className="text-white transition-all duration-300"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}

      {/* Rotation Info Badge - Only show during rotation */}
      {(() => {
        if (!isRotating) return null;

        const selectedTextTrack = tracks.find(
          (t) => t.type === 'text' && timeline.selectedTrackIds.includes(t.id),
        );

        if (!selectedTextTrack) return null;

        const rotation = selectedTextTrack.textTransform?.rotation || 0;
        const fullRotations = Math.floor(rotation / 360);
        const normalizedDegrees = ((rotation % 360) + 360) % 360;
        const displayDegrees =
          normalizedDegrees > 180 ? normalizedDegrees - 360 : normalizedDegrees;

        return (
          <div className="absolute top-4 left-4 dark:bg-black/80 bg-white/80 dark:text-white backdrop-blur-sm text-black px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 z-[1002]">
            <span className="text-[#F45513]">Rotation:</span>
            {fullRotations !== 0 && (
              <span className="font-bold">
                {fullRotations > 0 ? '+' : ''}
                {fullRotations}
              </span>
            )}
            <span>
              {displayDegrees > 0 ? '+' : displayDegrees < 0 ? '' : ''}
              {displayDegrees.toFixed(0)}°
            </span>
          </div>
        );
      })()}

      {/* Placeholder */}
      {!activeAudioTrack && tracks.length === 0 && (
        <div
          className={cn(
            'absolute inset-0 flex flex-col gap-2 items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200',
            dragActive
              ? 'border-secondary bg-secondary/10'
              : 'border-accent hover:!border-secondary hover:bg-secondary/10',
          )}
          onClick={async () => {
            const result = await importMediaFromDialog();
            if (!result || (!result.success && !result.error)) return;

            if (result.success && result.importedFiles.length > 0) {
              console.log(
                `✅ Successfully imported ${result.importedFiles.length} files via upload button`,
              );
            } else {
              // Use the actual error message from validation results
              const errorMessage =
                result.error ||
                'All files were rejected due to corruption or invalid format';
              toast.error(errorMessage);
            }
          }}
        >
          <img src={theme === 'dark' ? NewDark : New} alt="New Project" />
          <p className="text-sm text-muted-foreground">
            Click to browse or drag and drop files here
          </p>
        </div>
      )}
    </div>
  );
};
