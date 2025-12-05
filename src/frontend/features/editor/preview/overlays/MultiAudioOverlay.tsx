import React, { useCallback, useEffect, useRef } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';

export interface MultiAudioPlayerProps {
  audioTracks: VideoTrack[];
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  playbackRate: number;
}

interface AudioElementState {
  element: HTMLAudioElement;
  trackId: string;
  previewUrl: string;
  isPlaying: boolean;
}

export const MultiAudioPlayer: React.FC<MultiAudioPlayerProps> = ({
  audioTracks,
  currentFrame,
  fps,
  isPlaying,
  isMuted,
  volume,
  playbackRate,
}) => {
  // Map of audio elements by previewUrl (NOT track ID) to prevent duplicates
  // Using previewUrl as key ensures we don't create multiple elements for the same source
  const audioElementsRef = useRef<Map<string, AudioElementState>>(new Map());

  // Track which track IDs are using which previewUrls
  const trackToUrlRef = useRef<Map<string, string>>(new Map());
  // Track which primary track is currently controlling a given previewUrl
  const activeUrlTrackRef = useRef<Map<string, string>>(new Map());

  // Track previous frame for detecting seeks vs continuous playback
  const prevFrameRef = useRef<number>(currentFrame);
  const prevIsPlayingRef = useRef<boolean>(isPlaying);

  // Debounce ref to prevent rapid re-creation
  const lastUpdateRef = useRef<number>(0);

  // Get or create audio element for a URL (deduplicated by URL, not track)
  const getOrCreateAudioElement = useCallback(
    (previewUrl: string, trackId: string): HTMLAudioElement | null => {
      if (!previewUrl) return null;

      // Check if we already have an element for this URL
      const existing = audioElementsRef.current.get(previewUrl);

      if (existing) {
        // Update track mapping
        trackToUrlRef.current.set(trackId, previewUrl);
        return existing.element;
      }

      // Create new audio element
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = previewUrl;

      audioElementsRef.current.set(previewUrl, {
        element: audio,
        trackId,
        previewUrl,
        isPlaying: false,
      });

      trackToUrlRef.current.set(trackId, previewUrl);

      return audio;
    },
    [],
  );

  const stopAllAudio = useCallback(() => {
    audioElementsRef.current.forEach((state) => {
      if (!state.element.paused) {
        state.element.pause();
      }
      state.isPlaying = false;
    });
  }, []);

  // Clean up audio elements that are no longer needed
  useEffect(() => {
    const now = Date.now();

    // Debounce cleanup to prevent rapid recreation
    if (now - lastUpdateRef.current < 100) {
      return;
    }
    lastUpdateRef.current = now;

    // Get all previewUrls currently in use
    const activeUrls = new Set<string>();
    audioTracks.forEach((track) => {
      if (track.previewUrl) {
        activeUrls.add(track.previewUrl);
      }
    });

    // Clean up elements for URLs no longer in use
    audioElementsRef.current.forEach((state, url) => {
      if (!activeUrls.has(url)) {
        state.element.pause();
        state.element.src = '';
        state.element.load();
        audioElementsRef.current.delete(url);
      }
    });

    // Clean up track mappings
    trackToUrlRef.current.forEach((url, trackId) => {
      const trackStillExists = audioTracks.some((t) => t.id === trackId);
      if (!trackStillExists) {
        trackToUrlRef.current.delete(trackId);
      }
    });
  }, [audioTracks]);

  // Main sync effect - handles play/pause/seek for all audio
  useEffect(() => {
    const frameDelta = Math.abs(currentFrame - prevFrameRef.current);
    const playStateChanged = isPlaying !== prevIsPlayingRef.current;

    prevFrameRef.current = currentFrame;
    prevIsPlayingRef.current = isPlaying;

    // Determine if this is a seek (large frame jump or paused scrubbing)
    const seekFrameThreshold = Math.max(5, Math.floor(fps * 0.5));
    const isSeekJump = frameDelta > seekFrameThreshold;
    const isPausedScrub = !isPlaying;
    const isSeek = isSeekJump || isPausedScrub;

    if (isSeek && (isPausedScrub || frameDelta > seekFrameThreshold * 2)) {
      stopAllAudio();
    }

    // Deduplicate by previewUrl so a single element controls each source.
    // If multiple tracks use the same preview, prefer the one on the highest row,
    // and if rows match, the one that starts later (assumes it's "on top").
    const primaryTracksByUrl = new Map<string, VideoTrack>();
    audioTracks.forEach((track) => {
      if (!track.previewUrl) return;
      const existing = primaryTracksByUrl.get(track.previewUrl);
      if (!existing) {
        primaryTracksByUrl.set(track.previewUrl, track);
        return;
      }

      const existingRow = existing.trackRowIndex ?? 0;
      const trackRow = track.trackRowIndex ?? 0;
      const existingStartsLater = existing.startFrame >= track.startFrame;

      const shouldReplace =
        trackRow > existingRow ||
        (trackRow === existingRow && !existingStartsLater);

      if (shouldReplace) {
        primaryTracksByUrl.set(track.previewUrl, track);
      }
    });

    const activeUrls = new Set<string>();

    primaryTracksByUrl.forEach((track) => {
      if (!track.previewUrl) return;
      activeUrls.add(track.previewUrl);

      const audio = getOrCreateAudioElement(track.previewUrl, track.id);
      if (!audio) return;

      // Check if current frame is within this track's range
      const isWithinRange =
        currentFrame >= track.startFrame && currentFrame < track.endFrame;

      // Calculate target time
      const relativeFrame = Math.max(0, currentFrame - track.startFrame);
      const trackTime = relativeFrame / fps;
      const targetTime = (track.sourceStartTime || 0) + trackTime;

      // If the controlling track for this URL changed, force a retime and pause
      const previousController = activeUrlTrackRef.current.get(
        track.previewUrl,
      );
      const controllerChanged = previousController !== track.id;
      if (controllerChanged) {
        activeUrlTrackRef.current.set(track.previewUrl, track.id);
        audio.pause();
        const state = audioElementsRef.current.get(track.previewUrl);
        if (state) state.isPlaying = false;
        if (audio.readyState >= 1) {
          audio.currentTime = targetTime;
        }
      }

      // Set volume and playback rate
      const shouldMute = isMuted || track.muted;
      audio.muted = shouldMute;
      audio.volume = shouldMute ? 0 : Math.min(volume, 1);
      audio.playbackRate = Math.max(0.25, Math.min(playbackRate, 4));

      if (!isWithinRange) {
        // Outside track range - pause this audio
        if (!audio.paused) {
          audio.pause();
          const state = audioElementsRef.current.get(track.previewUrl);
          if (state) state.isPlaying = false;
        }
        return;
      }

      // Handle seeking / retime
      const needsRetime =
        isSeek || playStateChanged || controllerChanged || !isWithinRange;
      if (needsRetime) {
        const tolerance = 0.12; // relaxed tolerance to avoid thrash
        const diff = Math.abs(audio.currentTime - targetTime);

        if (diff > tolerance || controllerChanged) {
          // For small retimes, avoid pausing to reduce audible glitches
          if (diff > tolerance * 2 || controllerChanged) {
            audio.pause();
            const state = audioElementsRef.current.get(track.previewUrl);
            if (state) state.isPlaying = false;
          }
          if (audio.readyState >= 1) {
            audio.currentTime = targetTime;
          }
        }
      }

      // Handle play/pause
      if (isPlaying) {
        const state = audioElementsRef.current.get(track.previewUrl);

        if (audio.paused && audio.readyState >= 2) {
          // Only play if not already marked as playing (prevents double-play)
          if (!state?.isPlaying) {
            if (state) state.isPlaying = true;

            audio.play().catch((err) => {
              console.warn(
                `[MultiAudioPlayer] Play failed for ${track.id}:`,
                err,
              );
              if (state) state.isPlaying = false;
            });
          }
        }
      } else {
        if (!audio.paused) {
          audio.pause();
          const state = audioElementsRef.current.get(track.previewUrl);
          if (state) state.isPlaying = false;
        }
      }
    });

    // Pause any audio elements whose URLs are no longer primary for this frame
    audioElementsRef.current.forEach((state, url) => {
      if (activeUrls.has(url)) return;
      if (!state.element.paused) {
        state.element.pause();
      }
      state.isPlaying = false;
      activeUrlTrackRef.current.delete(url);
    });
  }, [
    audioTracks,
    currentFrame,
    fps,
    isPlaying,
    isMuted,
    volume,
    playbackRate,
    getOrCreateAudioElement,
    stopAllAudio,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioElementsRef.current.forEach((state) => {
        state.element.pause();
        state.element.src = '';
        state.element.load();
      });
      audioElementsRef.current.clear();
      trackToUrlRef.current.clear();
    };
  }, []);

  return null;
};

export default MultiAudioPlayer;
