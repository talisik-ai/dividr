/**
 * MultiAudioPlayer - Audio playback for timeline tracks.
 *
 * Supports two modes:
 * - Legacy mode: Audio elements keyed by source URL
 * - Frame-driven mode: Audio elements keyed by clip ID (handles same-source overlaps)
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { resolveAudioFrameRequests } from '../services/FrameResolver';
import { USE_FRAME_DRIVEN_PLAYBACK } from './UnifiedOverlayRenderer';

export interface MultiAudioPlayerProps {
  audioTracks: VideoTrack[];
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  playbackRate: number;
  useSourceRegistry?: boolean;
}

interface AudioElementState {
  element: HTMLAudioElement;
  trackId: string;
  previewUrl: string;
  isPlaying: boolean;
}

const calculateAudioSourceTime = (
  track: VideoTrack,
  currentFrame: number,
  fps: number,
): number => {
  const relativeFrame = Math.max(0, currentFrame - track.startFrame);
  const relativeTime = relativeFrame / fps;
  return (track.sourceStartTime || 0) + relativeTime;
};

export const MultiAudioPlayer: React.FC<MultiAudioPlayerProps> = ({
  audioTracks,
  currentFrame,
  fps,
  isPlaying,
  isMuted,
  volume,
  playbackRate,
  useSourceRegistry = USE_FRAME_DRIVEN_PLAYBACK,
}) => {
  const audioElementsRef = useRef<Map<string, AudioElementState>>(new Map());
  const trackToUrlRef = useRef<Map<string, string>>(new Map());
  const activeUrlTrackRef = useRef<Map<string, string>>(new Map());
  const lastActiveSegmentRef = useRef<
    Map<string, { trackId: string; startFrame: number; endFrame: number }>
  >(new Map());
  const prevFrameRef = useRef<number>(currentFrame);
  const prevIsPlayingRef = useRef<boolean>(isPlaying);
  const lastUpdateRef = useRef<number>(0);

  const getOrCreateAudioElement = useCallback(
    (previewUrl: string, trackId: string): HTMLAudioElement | null => {
      if (!previewUrl) return null;

      const existing = audioElementsRef.current.get(previewUrl);
      if (existing) {
        trackToUrlRef.current.set(trackId, previewUrl);
        return existing.element;
      }

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

  // Cleanup unused audio elements
  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current < 100) return;
    lastUpdateRef.current = now;

    const activeUrls = new Set<string>();
    audioTracks.forEach((track) => {
      if (track.previewUrl) activeUrls.add(track.previewUrl);
    });

    audioElementsRef.current.forEach((state, url) => {
      if (!activeUrls.has(url)) {
        state.element.pause();
        state.element.src = '';
        state.element.load();
        audioElementsRef.current.delete(url);
      }
    });

    trackToUrlRef.current.forEach((_, trackId) => {
      if (!audioTracks.some((t) => t.id === trackId)) {
        trackToUrlRef.current.delete(trackId);
      }
    });
  }, [audioTracks]);

  // Legacy mode: audio sync by URL
  useEffect(() => {
    if (useSourceRegistry) return;

    const frameDelta = Math.abs(currentFrame - prevFrameRef.current);
    const playStateChanged = isPlaying !== prevIsPlayingRef.current;

    prevFrameRef.current = currentFrame;
    prevIsPlayingRef.current = isPlaying;

    const seekFrameThreshold = Math.max(5, Math.floor(fps * 0.5));
    const isSeekJump = frameDelta > seekFrameThreshold;
    const isPausedScrub = !isPlaying;
    const isSeek = isSeekJump || isPausedScrub;

    if (isSeek && (isPausedScrub || frameDelta > seekFrameThreshold * 2)) {
      stopAllAudio();
    }

    const activeSegmentsByUrl = new Map<string, VideoTrack>();

    audioTracks.forEach((track) => {
      if (!track.previewUrl) return;

      const isActiveAtFrame =
        currentFrame >= track.startFrame && currentFrame < track.endFrame;
      if (!isActiveAtFrame) return;

      const existing = activeSegmentsByUrl.get(track.previewUrl);
      if (!existing) {
        activeSegmentsByUrl.set(track.previewUrl, track);
        return;
      }

      const existingRow = existing.trackRowIndex ?? 0;
      const trackRow = track.trackRowIndex ?? 0;
      if (
        trackRow > existingRow ||
        (trackRow === existingRow && existing.startFrame < track.startFrame)
      ) {
        activeSegmentsByUrl.set(track.previewUrl, track);
      }
    });

    const activeUrls = new Set<string>();

    activeSegmentsByUrl.forEach((track) => {
      if (!track.previewUrl) return;
      activeUrls.add(track.previewUrl);

      const audio = getOrCreateAudioElement(track.previewUrl, track.id);
      if (!audio) return;

      const targetTime = calculateAudioSourceTime(track, currentFrame, fps);

      const lastSegment = lastActiveSegmentRef.current.get(track.previewUrl);
      const isNewSegment =
        !lastSegment ||
        lastSegment.trackId !== track.id ||
        lastSegment.startFrame !== track.startFrame;

      lastActiveSegmentRef.current.set(track.previewUrl, {
        trackId: track.id,
        startFrame: track.startFrame,
        endFrame: track.endFrame,
      });

      if (isNewSegment) {
        audio.pause();
        const state = audioElementsRef.current.get(track.previewUrl);
        if (state) state.isPlaying = false;
        if (audio.readyState >= 1) audio.currentTime = targetTime;
        activeUrlTrackRef.current.set(track.previewUrl, track.id);
      }

      const shouldMute = isMuted || track.muted;
      audio.muted = shouldMute;
      audio.volume = shouldMute ? 0 : Math.min(volume, 1);
      audio.playbackRate = Math.max(0.25, Math.min(playbackRate, 4));

      const diff = Math.abs(audio.currentTime - targetTime);
      const tolerance = isPlaying ? 0.2 : 0.1;

      if ((isSeek || playStateChanged || diff > tolerance) && !isNewSegment) {
        if (diff > tolerance) {
          if (diff > tolerance * 2) {
            audio.pause();
            const state = audioElementsRef.current.get(track.previewUrl);
            if (state) state.isPlaying = false;
          }
          if (audio.readyState >= 1) audio.currentTime = targetTime;
        }
      }

      if (isPlaying) {
        const state = audioElementsRef.current.get(track.previewUrl);
        if (audio.paused && audio.readyState >= 2 && !state?.isPlaying) {
          if (state) state.isPlaying = true;
          audio.play().catch(() => {
            if (state) state.isPlaying = false;
          });
        }
      } else {
        if (!audio.paused) {
          audio.pause();
          const state = audioElementsRef.current.get(track.previewUrl);
          if (state) state.isPlaying = false;
        }
      }
    });

    audioElementsRef.current.forEach((state, url) => {
      if (activeUrls.has(url)) return;
      if (!state.element.paused) state.element.pause();
      state.isPlaying = false;
      activeUrlTrackRef.current.delete(url);
      lastActiveSegmentRef.current.delete(url);
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
    useSourceRegistry,
  ]);

  // Cleanup on unmount (legacy mode)
  useEffect(() => {
    return () => {
      audioElementsRef.current.forEach((state) => {
        state.element.pause();
        state.element.src = '';
        state.element.load();
      });
      audioElementsRef.current.clear();
      trackToUrlRef.current.clear();
      lastActiveSegmentRef.current.clear();
    };
  }, []);

  // Frame-driven mode: audio elements per clip ID
  const clipAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const lastAudioSyncRef = useRef<
    Map<string, { time: number; isPlaying: boolean }>
  >(new Map());

  useEffect(() => {
    if (!useSourceRegistry) return;

    const frameDelta = Math.abs(currentFrame - prevFrameRef.current);
    const playStateChanged = isPlaying !== prevIsPlayingRef.current;
    const seekFrameThreshold = Math.max(5, Math.floor(fps * 0.5));
    const isSeek = frameDelta > seekFrameThreshold || !isPlaying;

    const audioRequests = resolveAudioFrameRequests(
      currentFrame,
      audioTracks,
      fps,
    );

    const activeClipIds = new Set<string>();

    for (const request of audioRequests) {
      activeClipIds.add(request.clipId);

      let audio = clipAudioElementsRef.current.get(request.clipId);
      if (!audio) {
        audio = new Audio();
        audio.preload = 'auto';
        audio.src = request.sourceUrl;
        clipAudioElementsRef.current.set(request.clipId, audio);
      }

      const shouldMute = isMuted || request.muted;
      audio.muted = shouldMute;
      audio.volume = shouldMute ? 0 : Math.min(volume * request.volume, 1);
      audio.playbackRate = Math.max(0.25, Math.min(playbackRate, 4));

      const lastSync = lastAudioSyncRef.current.get(request.clipId);
      const diff = Math.abs(audio.currentTime - request.sourceTime);
      const tolerance = isPlaying && !isSeek ? 0.5 : 0.1;

      if (
        (isSeek || playStateChanged || diff > tolerance || !lastSync) &&
        audio.readyState >= 1 &&
        diff > tolerance
      ) {
        audio.currentTime = request.sourceTime;
      }

      if (isPlaying) {
        if (audio.paused && audio.readyState >= 2) {
          audio.play().catch(() => {
            // Ignore autoplay errors
          });
        }
      } else {
        if (!audio.paused) audio.pause();
      }

      lastAudioSyncRef.current.set(request.clipId, {
        time: request.sourceTime,
        isPlaying,
      });
    }

    clipAudioElementsRef.current.forEach((audio, clipId) => {
      if (activeClipIds.has(clipId)) return;
      if (!audio.paused) audio.pause();
      lastAudioSyncRef.current.delete(clipId);
    });
  }, [
    audioTracks,
    currentFrame,
    fps,
    isPlaying,
    isMuted,
    volume,
    playbackRate,
    useSourceRegistry,
  ]);

  // Cleanup clip audio when tracks change
  useEffect(() => {
    if (!useSourceRegistry) return;

    const currentClipIds = new Set(audioTracks.map((t) => t.id));
    clipAudioElementsRef.current.forEach((audio, clipId) => {
      if (!currentClipIds.has(clipId)) {
        audio.pause();
        audio.src = '';
        audio.load();
        clipAudioElementsRef.current.delete(clipId);
      }
    });
  }, [audioTracks, useSourceRegistry]);

  // Cleanup on unmount (frame-driven mode)
  useEffect(() => {
    return () => {
      clipAudioElementsRef.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
        audio.load();
      });
      clipAudioElementsRef.current.clear();
    };
  }, []);

  return null;
};

export default MultiAudioPlayer;
