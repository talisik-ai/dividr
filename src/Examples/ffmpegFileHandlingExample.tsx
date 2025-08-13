/**
 * Example component demonstrating proper file handling for FFmpeg operations
 * This shows how to convert File objects to temporary paths that FFmpeg can access
 */

import React, { useState } from 'react';
import { VideoEditJob } from '../Schema/ffmpegConfig';
import { runFfmpegWithProgress } from '../Utility/ffmpegRunner';

interface FileHandlingExampleProps {
  className?: string;
}

export const FfmpegFileHandlingExample: React.FC<FileHandlingExampleProps> = ({ className }) => {
  const [selectedFiles, setSelectedFiles] = useState<Array<{
    path: string;
    name: string;
    size: number;
    type: 'video' | 'audio' | 'image';
  }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);

  const handleFileSelect = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        title: 'Select Media Files for FFmpeg Processing',
        properties: ['openFile', 'multiSelections']
      });

      if (result.success && result.files) {
        setSelectedFiles(result.files);
        setLogs([`Selected ${result.files.length} file(s)`]);
      }
    } catch (error) {
      setLogs(prev => [...prev, `Error selecting files: ${error.message}`]);
    }
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
    setLogs([]);
    setProgress('');
  };

  const handleProcessFiles = async () => {
    if (selectedFiles.length === 0) {
      setLogs(prev => [...prev, 'No files selected']);
      return;
    }

    setIsProcessing(true);
    setProgress('Starting...');
    setLogs(prev => [...prev, 'Starting FFmpeg processing...']);

    try {
      // Get file paths directly from the native dialog result
      const filePaths = selectedFiles.map(file => file.path);
      
      setProgress('Creating FFmpeg job...');
      
      // Create VideoEditJob directly with file paths
      const job: VideoEditJob = {
        inputs: filePaths,
        output: 'output.mp4',
        operations: {
          // Example operations - concatenate multiple videos
          concat: selectedFiles.length > 1,
          normalizeFrameRate: true,
          targetFrameRate: 30
        }
      };

      setProgress('Running FFmpeg...');
      setLogs(prev => [...prev, `Created job with ${job.inputs.length} inputs`]);

      // Run FFmpeg with progress tracking
      const result = await runFfmpegWithProgress(job, {
        onProgress: (progressData) => {
          setProgress(`Processing: ${progressData.frame || 0} frames processed`);
        },
        onStatus: (status) => {
          setProgress(status);
        },
        onLog: (log, type) => {
          setLogs(prev => [...prev, `[${type}] ${log}`]);
        }
      });

      setProgress('Complete!');
      setLogs(prev => [...prev, 'Processing completed successfully!', `Output: ${result.command}`]);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setProgress(`Error: ${errorMessage}`);
      setLogs(prev => [...prev, `Error: ${errorMessage}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`ffmpeg-file-handling-example ${className || ''}`}>
      <h2>FFmpeg File Handling Example</h2>
      
      <div className="file-selection">
        <button onClick={handleFileSelect} disabled={isProcessing}>
          Select Media Files
        </button>
        <button onClick={handleClearFiles} disabled={isProcessing}>
          Clear Files
        </button>
      </div>

      {selectedFiles.length > 0 && (
        <div className="selected-files">
          <h3>Selected Files:</h3>
          <ul>
            {selectedFiles.map((file, index) => (
              <li key={index}>
                <strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB) - {file.type}
                <br />
                <small style={{ color: '#666' }}>Path: {file.path}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="controls">
        <button 
          onClick={handleProcessFiles} 
          disabled={isProcessing || selectedFiles.length === 0}
        >
          {isProcessing ? 'Processing...' : 'Process with FFmpeg'}
        </button>
      </div>

      {progress && (
        <div className="progress">
          <strong>Status:</strong> {progress}
        </div>
      )}

      {logs.length > 0 && (
        <div className="logs">
          <h3>Processing Logs:</h3>
          <div className="log-container" style={{ maxHeight: '200px', overflow: 'auto', backgroundColor: '#f5f5f5', padding: '10px', fontFamily: 'monospace' }}>
            {logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        </div>
      )}

      <div className="instructions" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e8f4fd', borderRadius: '5px' }}>
        <h3>📝 How This Works:</h3>
        <ol>
          <li><strong>Native File Dialog:</strong> Uses Electron's native file dialog to get actual file paths</li>
          <li><strong>Direct File Paths:</strong> FFmpeg receives real file system paths, not blob URLs</li>
          <li><strong>Progress Tracking:</strong> Real-time updates show processing status</li>
          <li><strong>No Temporary Files:</strong> No need for file conversion or cleanup</li>
        </ol>
        
        <h3>🔧 Key Difference:</h3>
        <p>This example uses <code>window.electronAPI.openFileDialog()</code> which provides actual file paths that FFmpeg can directly access, unlike web file inputs that only provide blob URLs.</p>
      </div>
    </div>
  );
};

export default FfmpegFileHandlingExample; 