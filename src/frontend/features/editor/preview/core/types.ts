import { VideoTrack } from '../../stores/videoEditor/index';
import { FixedCoordinateSystem } from '../utils/coordinateSystem';

/**
 * Core types for the video preview system
 */

export interface PreviewDimensions {
  width: number;
  height: number;
  actualWidth: number;
  actualHeight: number;
}

export interface PreviewTransform {
  panX: number;
  panY: number;
  scale: number;
}

export interface TextTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  width: number;
  height: number;
}

export interface DragState {
  isDragging: boolean;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PanState {
  isPanning: boolean;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

export interface PinchState {
  initialDistance: number;
  initialScale: number;
  centerX: number;
  centerY: number;
}

export interface TrimState {
  trackId: string;
  startFrame: number;
  endFrame: number;
  sourceStartTime: number;
}

export interface VideoPlayerState {
  videoRef: React.RefObject<HTMLVideoElement>;
  audioRef: React.RefObject<HTMLAudioElement>;
  activeVideoTrack?: VideoTrack;
  activeAudioTrack?: VideoTrack;
  independentAudioTrack?: VideoTrack;
  videoTrackWithAudio?: VideoTrack;
}

export interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  position: number;
  label: string;
}

export interface OverlayRenderProps {
  previewScale: number;
  panX: number;
  panY: number;
  actualWidth: number;
  actualHeight: number;
  baseVideoWidth: number;
  baseVideoHeight: number;
  coordinateSystem: FixedCoordinateSystem; // Fixed coordinate system for consistent positioning
  interactionMode?: 'select' | 'pan' | 'text-edit'; // Current interaction mode
}
