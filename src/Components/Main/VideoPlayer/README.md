# VideoEditPlayer Component

A React video player component built with Remotion's design principles, specifically designed to preview how FFmpeg video edits will look before processing.

## Features

### 🎥 Core Video Playback
- Full video player controls (play, pause, seek, volume, fullscreen)
- Keyboard shortcuts and mouse interactions
- Auto-hide controls with customizable timeout
- Loading and error states with custom fallbacks

### ✂️ Edit Preview Capabilities
- **Trim Preview**: Respects start/end times and duration limits
- **Crop Preview**: Visual cropping simulation using CSS clip-path
- **Aspect Ratio Preview**: Applies aspect ratio constraints
- **Complex Edits**: Combines multiple operations for comprehensive preview

### 🎛️ Advanced Controls
- Programmatic API via ref
- Real-time callbacks for all player events
- Customizable UI and interaction behaviors
- Fullscreen support with proper event handling

## Basic Usage

```tsx
import VideoEditPlayer, { VideoPlayerRef } from './VideoEditPlayer';
import { VideoEditJob } from '../../../Schema/ffmpegConfig';

function MyComponent() {
  const playerRef = useRef<VideoPlayerRef>(null);
  
  const editJob: VideoEditJob = {
    inputs: ["input.mp4"],
    output: "output.mp4",
    operations: {
      trim: { start: "00:00:10", duration: "30" },
      crop: { width: 720, height: 480, x: 100, y: 60 }
    }
  };

  return (
    <VideoEditPlayer
      ref={playerRef}
      videoSrc="./path/to/video.mp4"
      editJob={editJob}
      width={800}
      height={450}
      controls={true}
      showPreviewEffects={true}
    />
  );
}
```

## Props Reference

### Core Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `videoSrc` | `string` | **required** | Path to the video file |
| `editJob` | `VideoEditJob` | `undefined` | Edit configuration to preview |

### Control Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `controls` | `boolean` | `true` | Show player controls |
| `autoPlay` | `boolean` | `false` | Auto-start playback |
| `loop` | `boolean` | `false` | Loop playback |
| `muted` | `boolean` | `false` | Start muted |
| `volume` | `number` | `1` | Initial volume (0-1) |
| `playbackRate` | `number` | `1` | Playback speed |

### UI Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number \| string` | `"100%"` | Player width |
| `height` | `number \| string` | `"auto"` | Player height |
| `style` | `React.CSSProperties` | `{}` | Custom styles |
| `className` | `string` | `""` | CSS class name |

### Interaction Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `clickToPlay` | `boolean` | `true` | Click video to play/pause |
| `doubleClickToFullscreen` | `boolean` | `true` | Double-click for fullscreen |
| `showVolumeControls` | `boolean` | `true` | Show volume slider |
| `alwaysShowControls` | `boolean` | `false` | Never hide controls |
| `hideControlsWhenPointerDoesntMove` | `boolean \| number` | `true` | Auto-hide timeout (ms) |

### Preview Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showPreviewEffects` | `boolean` | `true` | Apply visual edit previews |
| `previewQuality` | `'low' \| 'medium' \| 'high'` | `'medium'` | Preview quality |

## Callbacks

```tsx
const callbacks: VideoPlayerCallbacks = {
  onTimeUpdate: (currentTime, duration) => {
    console.log(`Progress: ${currentTime}s / ${duration}s`);
  },
  onPlay: () => console.log('Started playing'),
  onPause: () => console.log('Paused'),
  onEnded: () => console.log('Playback ended'),
  onLoadedMetadata: (duration, width, height) => {
    console.log(`Video: ${width}x${height}, ${duration}s`);
  },
  onError: (error) => console.error('Player error:', error),
  onVolumeChange: (volume, muted) => {
    console.log(`Volume: ${muted ? 'muted' : volume}`);
  },
  onFullscreenChange: (isFullscreen) => {
    console.log(`Fullscreen: ${isFullscreen}`);
  }
};

<VideoEditPlayer callbacks={callbacks} />
```

## Programmatic API

```tsx
const playerRef = useRef<VideoPlayerRef>(null);

// Playback control
playerRef.current?.play();
playerRef.current?.pause();
playerRef.current?.toggle();

// Seeking
playerRef.current?.seekTo(30); // Seek to 30 seconds
const currentTime = playerRef.current?.getCurrentTime();

// Volume control
playerRef.current?.setVolume(0.8);
playerRef.current?.mute();
playerRef.current?.unmute();
const volume = playerRef.current?.getVolume();
const isMuted = playerRef.current?.isMuted();

// Fullscreen
playerRef.current?.requestFullscreen();
playerRef.current?.exitFullscreen();
const isFullscreen = playerRef.current?.isFullscreen();

// State queries
const isPlaying = playerRef.current?.isPlaying();
```

## Edit Job Integration

The player automatically previews different types of edits:

### Trim Operations
```tsx
const trimJob: VideoEditJob = {
  inputs: ["video.mp4"],
  output: "trimmed.mp4",
  operations: {
    trim: { 
      start: "00:01:30",  // Start at 1m 30s
      duration: "60"      // Play for 60 seconds
    }
  }
};
```

### Crop Operations
```tsx
const cropJob: VideoEditJob = {
  inputs: ["video.mp4"],
  output: "cropped.mp4",
  operations: {
    crop: {
      width: 800,    // Crop width
      height: 600,   // Crop height
      x: 100,        // X offset
      y: 50          // Y offset
    }
  }
};
```

### Aspect Ratio Changes
```tsx
const aspectJob: VideoEditJob = {
  inputs: ["video.mp4"],
  output: "aspect.mp4",
  operations: {
    aspect: "16:9"  // Target aspect ratio
  }
};
```

### Complex Multi-Operation Edits
```tsx
const complexJob: VideoEditJob = {
  inputs: ["video.mp4"],
  output: "complex.mp4",
  operations: {
    trim: { start: "00:00:10", duration: "120" },
    crop: { width: 1280, height: 720, x: 0, y: 140 },
    aspect: "16:9"
  }
};
```

## Integration with Your App

### 1. Add to Existing Video Editor

```tsx
// In your main App.tsx or editor component
import VideoEditPlayer from './Components/Main/VideoPlayer/VideoEditPlayer';

function VideoEditor() {
  const [currentJob, setCurrentJob] = useState<VideoEditJob>();
  const [videoSrc, setVideoSrc] = useState<string>();

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Edit Controls */}
      <div>
        {/* Your existing edit controls */}
      </div>
      
      {/* Preview Player */}
      <div>
        <VideoEditPlayer
          videoSrc={videoSrc}
          editJob={currentJob}
          width="100%"
          height={400}
          showPreviewEffects={true}
        />
      </div>
    </div>
  );
}
```

### 2. Timeline Integration

```tsx
// Sync with your timeline component
import { Timeline } from './Components/Main/Timeline/Timeline';

function EditorWithTimeline() {
  const [currentFrame, setCurrentFrame] = useState(0);
  const playerRef = useRef<VideoPlayerRef>(null);

  const handleTimelineFrameChange = (frame: number) => {
    setCurrentFrame(frame);
    // Convert frame to time and seek player
    const timeInSeconds = frame / 30; // Assuming 30 FPS
    playerRef.current?.seekTo(timeInSeconds);
  };

  const handlePlayerTimeUpdate = (currentTime: number) => {
    // Convert time to frame and update timeline
    const frame = Math.round(currentTime * 30); // Assuming 30 FPS
    setCurrentFrame(frame);
  };

  return (
    <div>
      <VideoEditPlayer
        ref={playerRef}
        callbacks={{
          onTimeUpdate: handlePlayerTimeUpdate
        }}
      />
      <Timeline
        currentFrame={currentFrame}
        onCurrentFrameChange={handleTimelineFrameChange}
      />
    </div>
  );
}
```

### 3. Before/After Comparison

```tsx
function BeforeAfterComparison() {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h3>Original</h3>
        <VideoEditPlayer
          videoSrc="original.mp4"
          showPreviewEffects={false}
        />
      </div>
      <div>
        <h3>With Edits</h3>
        <VideoEditPlayer
          videoSrc="original.mp4"
          editJob={editJob}
          showPreviewEffects={true}
        />
      </div>
    </div>
  );
}
```

## Styling and Customization

### Custom Error Fallback
```tsx
<VideoEditPlayer
  errorFallback={(error) => (
    <div className="custom-error-container">
      <h3>Oops! Something went wrong</h3>
      <p>{error.message}</p>
      <button onClick={retry}>Try Again</button>
    </div>
  )}
/>
```

### Custom Loading Indicator
```tsx
<VideoEditPlayer
  loadingFallback={() => (
    <div className="custom-loading">
      <div className="spinner" />
      <p>Preparing video preview...</p>
    </div>
  )}
/>
```

### Custom Styling
```tsx
<VideoEditPlayer
  className="my-custom-player"
  style={{
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
  }}
/>
```

## Performance Considerations

1. **Video Loading**: Use `preload="metadata"` for faster initial load
2. **Preview Effects**: Disable `showPreviewEffects` for better performance on lower-end devices
3. **Memory Management**: The component properly cleans up event listeners and timeouts
4. **Responsive Design**: Use percentage-based dimensions for responsive layouts

## Browser Support

- Modern browsers with HTML5 video support
- Fullscreen API support (Chrome, Firefox, Safari, Edge)
- CSS clip-path support for crop previews
- Tested on Chrome 90+, Firefox 88+, Safari 14+

## Troubleshooting

### Video Not Loading
- Ensure video file is accessible from the web server
- Check CORS settings for external video URLs
- Verify video format is supported by the browser

### Preview Effects Not Working
- Ensure `showPreviewEffects={true}`
- Check that `editJob` is properly formatted
- Verify browser supports CSS clip-path (for crop previews)

### Performance Issues
- Reduce `previewQuality` setting
- Disable unnecessary callbacks
- Use smaller video files for testing

## Future Enhancements

- [ ] Real-time effects rendering using WebGL/Canvas
- [ ] Subtitle preview overlay
- [ ] Audio waveform visualization
- [ ] Multi-track preview support
- [ ] Export preview as thumbnail/GIF
- [ ] HDR and advanced color space support 