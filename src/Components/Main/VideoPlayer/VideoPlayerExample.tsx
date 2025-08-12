import React, { useRef, useState } from 'react';
import { VideoEditJob } from '../../../Schema/ffmpegConfig';
import VideoEditPlayer, { VideoPlayerCallbacks, VideoPlayerRef } from './VideoEditPlayer';

const VideoPlayerExample: React.FC = () => {
  const playerRef = useRef<VideoPlayerRef>(null);
  const [currentEditJob, setCurrentEditJob] = useState<VideoEditJob | undefined>();
  const [playerState, setPlayerState] = useState({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    volume: 1,
    muted: false,
  });

  // Example edit jobs for testing different scenarios
  const exampleEditJobs: { name: string; job: VideoEditJob }[] = [
    {
      name: "No Edit (Original)",
      job: {
        inputs: ["sample.mp4"],
        output: "output.mp4",
        operations: {}
      }
    },
    {
      name: "Trim (5s to 30s)",
      job: {
        inputs: ["sample.mp4"],
        output: "trimmed.mp4",
        operations: {
          trim: { start: "00:00:05", duration: "25" }
        }
      }
    },
    {
      name: "Crop (Center 720x480)",
      job: {
        inputs: ["sample.mp4"],
        output: "cropped.mp4",
        operations: {
          crop: { width: 720, height: 480, x: 100, y: 60 }
        }
      }
    },
    {
      name: "16:9 Aspect Ratio",
      job: {
        inputs: ["sample.mp4"],
        output: "aspect.mp4",
        operations: {
          aspect: "16:9"
        }
      }
    },
    {
      name: "Complex Edit (Trim + Crop + Aspect)",
      job: {
        inputs: ["sample.mp4"],
        output: "complex.mp4",
        operations: {
          trim: { start: "00:00:10", duration: "30" },
          crop: { width: 800, height: 600, x: 50, y: 50 },
          aspect: "4:3"
        }
      }
    }
  ];

  const callbacks: VideoPlayerCallbacks = {
    onTimeUpdate: (currentTime, duration) => {
      setPlayerState(prev => ({ ...prev, currentTime, duration }));
    },
    onPlay: () => {
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
    },
    onPause: () => {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    },
    onVolumeChange: (volume, muted) => {
      setPlayerState(prev => ({ ...prev, volume, muted }));
    },
    onLoadedMetadata: (duration, videoWidth, videoHeight) => {
      console.log(`Video loaded: ${duration}s, ${videoWidth}x${videoHeight}`);
    },
    onError: (error) => {
      console.error('Video player error:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-900 text-white">
      <h1 className="text-2xl font-bold mb-6">Video Edit Player Demo</h1>
      
      {/* Edit Job Selector */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Preview Mode:</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {exampleEditJobs.map((example, index) => (
            <button
              key={index}
              onClick={() => setCurrentEditJob(example.job)}
              className={`p-3 rounded-lg border transition-colors ${
                JSON.stringify(currentEditJob) === JSON.stringify(example.job)
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800'
              }`}
            >
              {example.name}
            </button>
          ))}
        </div>
      </div>

      {/* Video Player */}
      <div className="mb-6">
        <VideoEditPlayer
          ref={playerRef}
          videoSrc="./sample-video.mp4" // Replace with your video path
          editJob={currentEditJob}
          width="100%"
          height={400}
          controls={true}
          clickToPlay={true}
          doubleClickToFullscreen={true}
          showVolumeControls={true}
          showPreviewEffects={true}
          callbacks={callbacks}
          className="rounded-lg shadow-lg"
          errorFallback={(error) => (
            <div className="flex items-center justify-center h-full bg-red-900/50 text-red-200">
              <div className="text-center">
                <h3 className="font-bold mb-2">Video Error</h3>
                <p className="text-sm">{error.message}</p>
                <p className="text-xs mt-2 opacity-75">
                  Make sure to place a video file named "sample-video.mp4" in your public folder
                </p>
              </div>
            </div>
          )}
          loadingFallback={() => (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                <p>Loading video preview...</p>
              </div>
            </div>
          )}
        />
      </div>

      {/* Player Controls and Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Player State Info */}
        <div className="bg-gray-800 p-4 rounded-lg">
          <h3 className="font-semibold mb-3">Player State</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className={playerState.isPlaying ? 'text-green-400' : 'text-gray-400'}>
                {playerState.isPlaying ? 'Playing' : 'Paused'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Time:</span>
              <span>{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}</span>
            </div>
            <div className="flex justify-between">
              <span>Volume:</span>
              <span>{playerState.muted ? 'Muted' : `${Math.round(playerState.volume * 100)}%`}</span>
            </div>
          </div>
        </div>

        {/* Manual Controls */}
        <div className="bg-gray-800 p-4 rounded-lg">
          <h3 className="font-semibold mb-3">Manual Controls</h3>
          <div className="space-y-3">
            <div className="flex space-x-2">
              <button
                onClick={() => playerRef.current?.play()}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
              >
                Play
              </button>
              <button
                onClick={() => playerRef.current?.pause()}
                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-sm"
              >
                Pause
              </button>
              <button
                onClick={() => playerRef.current?.toggle()}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                Toggle
              </button>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={() => playerRef.current?.seekTo(10)}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm"
              >
                Seek to 10s
              </button>
              <button
                onClick={() => playerRef.current?.seekTo(playerState.duration / 2)}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm"
              >
                Seek to Middle
              </button>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => playerRef.current?.setVolume(0.5)}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
              >
                50% Volume
              </button>
              <button
                onClick={() => playerRef.current?.mute()}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
              >
                Mute
              </button>
              <button
                onClick={() => playerRef.current?.unmute()}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
              >
                Unmute
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Current Edit Job Preview */}
      {currentEditJob && (
        <div className="mt-6 bg-gray-800 p-4 rounded-lg">
          <h3 className="font-semibold mb-3">Current Edit Configuration</h3>
          <pre className="text-sm text-gray-300 overflow-auto">
            {JSON.stringify(currentEditJob, null, 2)}
          </pre>
        </div>
      )}

      {/* Usage Instructions */}
      <div className="mt-6 bg-blue-900/30 border border-blue-700 p-4 rounded-lg">
        <h3 className="font-semibold mb-2 text-blue-300">How to Use</h3>
        <ul className="text-sm text-blue-200 space-y-1">
          <li>• Select different preview modes to see how edits will affect the video</li>
          <li>• Click on the video to play/pause</li>
          <li>• Double-click for fullscreen mode</li>
          <li>• Use manual controls to test the programmatic API</li>
          <li>• The player respects trim ranges and shows visual previews of crops and aspect ratios</li>
        </ul>
      </div>
    </div>
  );
};

export default VideoPlayerExample; 