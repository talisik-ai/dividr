# FFmpeg Real-Time Progress Tracking

This document explains how to use the enhanced FFmpeg functionality with real-time progress updates, status monitoring, and log streaming.

## 🎯 Features

- **Real-time Progress Updates**: Frame count, FPS, bitrate, processing time, file size, and speed
- **Status Monitoring**: Processing states (starting, running, complete, error)
- **Live Log Streaming**: Both stdout and stderr outputs
- **Event-Driven Architecture**: Clean separation between progress data and completion events
- **Backward Compatibility**: Original API remains unchanged

## 📊 Basic Usage

### Enhanced API with Progress Tracking

```typescript
import { VideoEditJob } from "./Schema/ffmpegConfig";

const job: VideoEditJob = {
  inputs: ["input.mp4"],
  output: "output.mp4",
  operations: {
    trim: { start: "00:00:05", duration: "10" },
    aspect: "16:9"
  }
};

// Use the progress-enabled API
await window.electronAPI.runFfmpegWithProgress(job, {
  onProgress: (progress) => {
    console.log(`Frame: ${progress.frame}, FPS: ${progress.fps}`);
    console.log(`Time: ${progress.outTime}, Speed: ${progress.speed}`);
  },
  
  onStatus: (status) => {
    console.log(`Status: ${status}`);
  },
  
  onLog: (logData) => {
    console.log(`[${logData.type}] ${logData.log}`);
  },
  
  onComplete: (result) => {
    if (result.success) {
      console.log("✅ Processing complete!");
    } else {
      console.error("❌ Processing failed:", result.error);
    }
  }
});
```

### Progress Data Structure

```typescript
interface FfmpegProgress {
  frame: number;        // Current frame number
  fps: number;          // Frames per second
  bitrate: string;      // Current bitrate (e.g., "1702.4kbits/s")
  totalSize: string;    // Output file size (e.g., "1024kB")
  outTime: string;      // Processing time (e.g., "00:00:04.92")
  speed: string;        // Processing speed (e.g., "1.04x")
  progress: string;     // Processing state ("continue" or "end")
  percentage?: number;  // Completion percentage (if calculable)
}
```

## 🚀 React Component Integration

### Complete Example with UI

```typescript
import React, { useState } from 'react';

const VideoProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({});
  const [status, setStatus] = useState('Ready');
  const [logs, setLogs] = useState([]);

  const processVideo = async () => {
    const job = {
      inputs: ["input.mp4"],
      output: "output.mp4",
      operations: { trim: { duration: "30" } }
    };

    setIsProcessing(true);
    
    await window.electronAPI.runFfmpegWithProgress(job, {
      onProgress: setProgress,
      onStatus: setStatus,
      onLog: (logData) => setLogs(prev => [...prev, logData]),
      onComplete: (result) => {
        setIsProcessing(false);
        setStatus(result.success ? 'Complete!' : `Error: ${result.error}`);
      }
    });
  };

  return (
    <div>
      <button onClick={processVideo} disabled={isProcessing}>
        {isProcessing ? 'Processing...' : 'Start Processing'}
      </button>
      
      <div>Status: {status}</div>
      
      {progress.frame && (
        <div>
          Frame: {progress.frame} | 
          FPS: {progress.fps} | 
          Speed: {progress.speed}
        </div>
      )}
    </div>
  );
};
```

## 🔧 Technical Implementation

### Architecture Overview

1. **Main Process** (`src/main.ts`): 
   - Handles IPC communication
   - Manages FFmpeg process
   - Sends real-time events to renderer

2. **FFmpeg Runner** (`src/Utility/ffmpegRunner.ts`):
   - Spawns FFmpeg with progress output
   - Parses progress data from stdout
   - Provides callback-based API

3. **Preload Script** (`src/preload.ts`):
   - Exposes secure API to renderer
   - Manages event listeners
   - Provides TypeScript definitions

### Event Flow

```
FFmpeg Process → stdout/stderr → Parse Progress → IPC Events → Renderer Callbacks
```

## 📈 Progress Parsing

The system parses FFmpeg's progress output format:

```
frame=  123 fps= 25 q=28.0 size=1024kB time=00:00:04.92 bitrate=1702.4kbits/s speed=1.04x
```

Into structured data:

```typescript
{
  frame: 123,
  fps: 25,
  totalSize: "1024kB",
  outTime: "00:00:04.92",
  bitrate: "1702.4kbits/s",
  speed: "1.04x"
}
```

## 🛡️ Error Handling

### Comprehensive Error Coverage

```typescript
await window.electronAPI.runFfmpegWithProgress(job, {
  onStatus: (status) => {
    if (status.startsWith('Error:')) {
      // Handle error status
      console.error('Processing error:', status);
    }
  },
  
  onComplete: (result) => {
    if (!result.success) {
      // Handle completion errors
      console.error('Final error:', result.error);
    }
  }
});
```

### Common Error Scenarios

- **File not found**: Input files don't exist
- **Permission errors**: Cannot write to output location
- **Invalid parameters**: Malformed video operations
- **FFmpeg crashes**: Process termination errors

## 🎛️ Advanced Features

### Cancel Operations (Future Enhancement)

```typescript
// Cancel current operation
await window.electronAPI.cancelFfmpeg();
```

### Custom Progress Calculations

```typescript
onProgress: (progress) => {
  // Calculate percentage if total duration is known
  if (totalDurationSeconds && progress.outTime) {
    const currentSeconds = timeToSeconds(progress.outTime);
    const percentage = (currentSeconds / totalDurationSeconds) * 100;
    updateProgressBar(percentage);
  }
}
```

## 🔄 Migration Guide

### From Basic API to Progress API

**Before:**
```typescript
const result = await window.electronAPI.runFfmpeg(job);
```

**After:**
```typescript
const result = await window.electronAPI.runFfmpegWithProgress(job, {
  onProgress: (progress) => { /* handle progress */ },
  onComplete: (result) => { /* handle completion */ }
});
```

## 📊 Performance Considerations

- **Event Throttling**: Progress events fire frequently; consider throttling UI updates
- **Memory Management**: Log arrays can grow large; implement circular buffers
- **Background Processing**: Long operations should show non-blocking progress
- **Error Recovery**: Implement retry mechanisms for failed operations

## 💡 Best Practices

1. **Always handle onComplete**: Don't rely solely on promise resolution
2. **Throttle UI updates**: Progress events can fire very frequently
3. **Provide cancel functionality**: Allow users to stop long operations
4. **Show meaningful status**: Use status updates to inform users
5. **Log important events**: Keep logs for debugging but limit display
6. **Handle edge cases**: Empty files, very short videos, format issues

## 🧪 Testing Recommendations

- Test with various video formats and durations
- Verify progress accuracy with known file lengths
- Test error scenarios (missing files, invalid operations)
- Validate memory usage during long operations
- Check event cleanup after completion/cancellation

This implementation follows the Kaizen philosophy of continuous improvement through small, measurable enhancements that compound over time. The progress tracking system provides immediate user feedback while maintaining backward compatibility and clean architecture. 