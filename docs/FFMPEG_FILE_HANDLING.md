# FFmpeg File Handling Solution (Simplified)

## 🎯 Problem: Blob URLs vs File Paths

The original issue occurred because:

1. **Frontend File Selection**: When users select files, the browser creates `File` objects
2. **Blob URL Creation**: These were converted to blob URLs like `blob:http://localhost:5173/abc123...`
3. **FFmpeg Incompatibility**: FFmpeg (running in the main process) cannot access blob URLs
4. **Error**: `Protocol not found` error when FFmpeg tries to read blob URLs

## ✅ Solution: Direct File Paths

The simplified solution:

1. **Use Electron File Paths**: In Electron, File objects have a `.path` property with the actual file path
2. **Direct Path Usage**: Use these paths directly in VideoEditJob instead of blob URLs
3. **No Temporary Files**: Eliminates the need for temporary file conversion
4. **Simple & Efficient**: Much simpler implementation with better performance

## 🔧 Implementation

### 1. Updated Video Editor Store (src/store/videoEditorStore.ts)
```typescript
importMedia: async (files) => {
  const newTracks = await Promise.all(
    files.map(async (file, index) => {
      // In Electron, File objects have a 'path' property with the actual file path
      const filePath = (file as any).path || file.name;
      const type = file.type.startsWith('video/') ? 'video' as const : 
                  file.type.startsWith('audio/') ? 'audio' as const : 'image' as const;
      
      return {
        type,
        name: file.name,
        source: filePath, // Use actual file path instead of blob URL
        originalFile: file, // Keep for reference if needed
        duration: estimatedDuration,
        startFrame: index * 150,
        endFrame: index * 150 + estimatedDuration,
        visible: true,
        locked: false,
        color: getTrackColor(get().tracks.length + index),
      };
    })
  );
  
  newTracks.forEach(track => get().addTrack(track));
}
```

### 2. Simplified FFmpeg Runner (src/Utility/ffmpegRunner.ts)
```typescript
// No complex preprocessing needed - just run FFmpeg directly
export async function runFfmpegWithProgress(
  job: VideoEditJob,
  callbacks?: FfmpegCallbacks
): Promise<{ command: string; logs: string }> {
  if (!isElectron()) {
    throw new Error('FFmpeg operations require Electron main process');
  }

  return new Promise((resolve, reject) => {
    // Set up progress listener
    const handleProgress = (event: any, data: { type: string; data: string }) => {
      // Handle progress updates
    };

    window.electronAPI.on('ffmpeg:progress', handleProgress);

    // Start FFmpeg process directly with file paths
    window.electronAPI.invoke('ffmpegRun', job)
      .then((result: any) => {
        window.electronAPI.removeListener('ffmpeg:progress', handleProgress);
        resolve({ command: 'ffmpeg-via-ipc', logs: result.logs });
      })
      .catch((error: any) => {
        window.electronAPI.removeListener('ffmpeg:progress', handleProgress);
        reject(error);
      });
  });
}
```

## 📝 Usage Examples

### Simple File Processing
```typescript
import { VideoEditJob } from './Schema/ffmpegConfig';
import { runFfmpegWithProgress } from './Utility/ffmpegRunner';

// Get file paths directly from File objects
const filePaths = selectedFiles.map(file => (file as any).path || file.name);

// Create VideoEditJob directly
const job: VideoEditJob = {
  inputs: filePaths,
  output: 'output.mp4',
  operations: {
    concat: filePaths.length > 1,
    normalizeFrameRate: true,
    targetFrameRate: 30
  }
};

// Run FFmpeg
const result = await runFfmpegWithProgress(job, {
  onProgress: (progress) => console.log('Progress:', progress),
  onStatus: (status) => console.log('Status:', status)
});
```

### Using with Video Editor Store
```typescript
// Files are automatically stored with correct paths
const tracks = useVideoEditorStore(state => state.tracks);

// Create job from track sources (now file paths)
const job: VideoEditJob = {
  inputs: tracks.map(track => track.source), // These are now file paths
  output: 'output.mp4',
  operations: { /* your operations */ }
};

await runFfmpegWithProgress(job);
```

## 🔄 Migration Guide

### Before (Problematic)
```typescript
// Old approach - blob URLs that FFmpeg can't access
const url = URL.createObjectURL(file); // ❌ Blob URL
const job: VideoEditJob = {
  inputs: [url], // ❌ FFmpeg can't access blob URLs
  output: 'output.mp4'
};
```

### After (Fixed & Simplified)
```typescript
// New approach - direct file paths
const filePath = (file as any).path; // ✅ Actual file path from Electron
const job: VideoEditJob = {
  inputs: [filePath], // ✅ FFmpeg can access file paths
  output: 'output.mp4'
};
```

## 🎯 Key Benefits

1. **✅ Simple**: No complex temporary file management
2. **✅ Fast**: No file copying or conversion needed
3. **✅ Reliable**: Direct file system access
4. **✅ Memory Efficient**: No temporary files taking up space
5. **✅ Clean**: No cleanup required

## 🚨 Important Note

This solution works specifically in **Electron** because:
- Electron File objects have a `.path` property with the actual file system path
- Regular web browsers don't expose file paths for security reasons
- This is why the original blob URL approach was attempted

The `.path` property contains the full file system path that FFmpeg can directly access, eliminating the need for any temporary file conversion. 