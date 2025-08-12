/**
 * Main application component for the Video Editor.
 * This component serves as the entry point for the video editing interface.
 */
import { useState } from 'react';
import { VideoEditJob } from "../src/Schema/ffmpegConfig";
import { VideoEditPlayer } from "./Components/Main/VideoPlayer";
import TimelineSample from "./Components/Sub/Sample/callTimeline";


interface ProgressData {
  frame?: number;
  fps?: number;
  bitrate?: string;
  totalSize?: string;
  outTime?: string;
  speed?: string;
  progress?: string;
  percentage?: number;
}

const App = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressData>({});
  const [status, setStatus] = useState<string>('Ready');
  const [logs, setLogs] = useState<string[]>([]);

  const videoInfo: VideoEditJob = {
    inputs: ["saan.mp4","Off.mp4"],
    output: "mix2.mp4",
    operations: {
      concat: true,
      normalizeFrameRate: true, // Fix frame rate mismatch
      targetFrameRate: 30, // Normalize to 30fps
      trim: { start: "00:00:00", duration: "89" },
      aspect: "16:9"
    }
  };
  /*
  // Enhanced function with real-time progress
  async function doEditWithProgress() {
    const job: VideoEditJob = {
      inputs: ["saan.mp4","Off.mp4"],
      output: "mix2.mp4",
      operations: {
        concat: true,
        normalizeFrameRate: true, // Fix frame rate mismatch
        targetFrameRate: 30, // Normalize to 30fps
        trim: { start: "00:00:00", duration: "50" },
        aspect: "16:9"
      }
    };

    setIsProcessing(true);
    setProgress({});
    setStatus('Initializing...');
    setLogs([]);

    try {
      const response = await window.electronAPI.runFfmpegWithProgress(job, {
        onProgress: (progressData) => {
          setProgress(progressData);
          console.log('📊 Progress:', progressData);
        },
        onStatus: (statusUpdate) => {
          setStatus(statusUpdate);
          console.log('📡 Status:', statusUpdate);
        },
        onLog: (logData) => {
          setLogs(prev => [...prev.slice(-50), `[${logData.type}] ${logData.log}`]); // Keep last 50 logs
          console.log(`📝 Log [${logData.type}]:`, logData.log);
        },
        onComplete: (result) => {
          setIsProcessing(false);
          if (result.success) {
            setStatus('✅ Video processed successfully!');
            console.log("✅ Video processed successfully!", result.result);
          } else {
            setStatus(`❌ Failed: ${result.error}`);
            console.error("❌ Failed to process video:", result.error);
          }
        }
      });
    } catch (err) {
      setIsProcessing(false);
      setStatus(`❌ Error: ${err}`);
      console.error("❌ Failed to process video:", err);
    }
  }
 */
  // Smart concatenation with auto frame rate detection
  async function doSmartConcat() {
    const inputs = ["saan.mp4"];
    
    setIsProcessing(true);
    setProgress({});
    setStatus('🔍 Analyzing videos for optimal frame rate...');
    setLogs([]);

    try {
      // For now, use a smart default (can be enhanced later with actual detection)
      const optimalFps = 30; // You can adjust this based on your video characteristics
      console.log(`🎯 Using frame rate: ${optimalFps}fps`);
      

      setStatus(`🚀 Processing with ${optimalFps}fps normalization...`);

      const response = await window.electronAPI.runFfmpegWithProgress(videoInfo, {
        onProgress: (progressData) => {
          setProgress(progressData);
          console.log('📊 Progress:', progressData);
        },
        onStatus: (statusUpdate) => {
          setStatus(statusUpdate);
          console.log('📡 Status:', statusUpdate);
        },
        onLog: (logData) => {
          setLogs(prev => [...prev.slice(-50), `[${logData.type}] ${logData.log}`]);
          console.log(`📝 Log [${logData.type}]:`, logData.log);
        },
        onComplete: (result) => {
          setIsProcessing(false);
          if (result.success) {
            setStatus(`✅ Smart concat completed! (${optimalFps}fps)`);
            console.log("✅ Smart concat completed!", result.result);
          } else {
            setStatus(`❌ Failed: ${result.error}`);
            console.error("❌ Failed to process video:", result.error);
          }
        }
      });
    } catch (err) {
      setIsProcessing(false);
      setStatus(`❌ Error: ${err}`);
      console.error("❌ Failed to process video:", err);
    }
  }

  async function cancelOperation() {
    try {
      setStatus('🛑 Cancelling operation...');
      const response = await window.electronAPI.cancelFfmpeg();
      console.log('🛑 Cancel request:', response);
      
      if (response.success) {
        setStatus('❌ Operation cancelled successfully');
        setIsProcessing(false);
      } else {
        setStatus(`⚠️ Cancel failed: ${response.message}`);
        console.warn('Cancel failed:', response.message);
      }
    } catch (err) {
      setStatus(`❌ Cancel error: ${err}`);
      console.error('❌ Failed to cancel:', err);
    }
  }

  return (
    <div className=" w-screen overflow-hidden bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">🎬 Video Editor - FFmpeg Progress Demo</h1>
      
      {/* Control Buttons */}
      <div className="mb-6 space-x-4">
        <button 
          onClick={doSmartConcat}
          disabled={isProcessing}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded text-white font-medium"
        >
          Export
        </button>
        
        
        {isProcessing && (
          <button 
            onClick={cancelOperation}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white font-medium"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Video Preview Player */}
      <div className="mb-6">
        <VideoEditPlayer
          videoSrc={videoInfo.inputs[0]}
          editJob={videoInfo}
          width="100%"
          height={400}
          showPreviewEffects={true}
          callbacks={{
            onError: (error) => {
              console.error('Video load error:', error);
              alert('Cannot load video: ' + error.message);
            },
            onLoadedMetadata: (duration, width, height) => console.log(`Video loaded: ${duration}s, ${width}x${height}`)
          }}
          className="rounded-lg shadow-lg"
          errorFallback={(error) => (
            <div className="flex items-center justify-center h-full bg-red-900/50 text-red-200 p-4">
              <div className="text-center">
                <h3 className="font-bold mb-2">Video Load Error</h3>
                <p className="text-sm mb-2">{error.message}</p>
                <p className="text-xs opacity-75">
                  Path: Concat mode - /Me.mp4 + /Mys.mp4
                </p>
              </div>
            </div>
          )}
        />
      </div>

      {/* Status Display 
        <h2 className="text-xl font-semibold mb-2">📡 Status</h2>
        <div className="bg-gray-800 p-3 rounded">
          <span className={`font-medium ${isProcessing ? 'text-yellow-400' : 'text-green-400'}`}>
            {status}
          </span>
        </div>
      </div>
*/}
{/* 
      <div className="mb-6"></div>
     
      {Object.keys(progress).length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">📊 Progress</h2>
          <div className="bg-gray-800 p-4 rounded grid grid-cols-2 md:grid-cols-3 gap-4">
            {progress.frame && (
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{progress.frame}</div>
                <div className="text-sm text-gray-400">Frames</div>
              </div>
            )}
            {progress.fps && (
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{progress.fps}</div>
                <div className="text-sm text-gray-400">FPS</div>
              </div>
            )}
            {progress.speed && (
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{progress.speed}</div>
                <div className="text-sm text-gray-400">Speed</div>
              </div>
            )}
            {progress.outTime && (
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{progress.outTime}</div>
                <div className="text-sm text-gray-400">Time</div>
              </div>
            )}
            {progress.totalSize && (
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{progress.totalSize}</div>
                <div className="text-sm text-gray-400">Size</div>
              </div>
            )}
            {progress.bitrate && (
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-400">{progress.bitrate}</div>
                <div className="text-sm text-gray-400">Bitrate</div>
              </div>
            )}
          </div>
        </div>
      )}
*/}
      {/* Logs Display */}
      {logs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">📝 Logs</h2>
          <div className="bg-gray-800 p-4 rounded h-64 overflow-y-auto">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap">
              {logs.join('\n')}
            </pre>
          </div>
        </div>
      )}
      <div>
        <TimelineSample/>
      </div>
    </div>
  );
};

export default App;
