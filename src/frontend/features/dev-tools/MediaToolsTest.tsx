import { Button } from '@/frontend/components/ui/button';
import { Progress } from '@/frontend/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/frontend/components/ui/tabs';
import { useState } from 'react';

// ============================================================================
// Types
// ============================================================================

interface MediaToolsStatus {
  available: boolean;
  mode: 'standalone' | 'python' | 'unavailable';
  mediaToolsPath: string | null;
  pythonPath: string | null;
  mainPyScriptPath: string | null;
  isProcessing: boolean;
}

interface WhisperResult {
  segments: Array<{
    start: number;
    end: number;
    text: string;
    words?: Array<{
      word: string;
      start: number;
      end: number;
      confidence: number;
    }>;
  }>;
  language: string;
  language_probability: number;
  duration: number;
  text: string;
  processing_time: number;
  model: string;
  device: string;
  segment_count: number;
  real_time_factor?: number;
  faster_than_realtime?: boolean;
}

interface NoiseReductionResult {
  success: boolean;
  outputPath: string;
  message?: string;
}

type WhisperModel =
  | 'tiny'
  | 'base'
  | 'small'
  | 'medium'
  | 'large'
  | 'large-v2'
  | 'large-v3';

// ============================================================================
// Main Component
// ============================================================================

export const MediaToolsTest = () => {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto min-h-0 flex-1 overflow-y-auto">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="space-y-2 mb-6">
          <h2 className="text-2xl font-bold">Media Tools Test Interface</h2>
          <p className="text-sm text-muted-foreground">
            Test transcription and noise reduction using the unified
            dividr-tools binary
          </p>
        </div>

        <Tabs defaultValue="transcribe" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="transcribe">Transcription</TabsTrigger>
            <TabsTrigger value="noise-reduce">Noise Reduction</TabsTrigger>
          </TabsList>

          <TabsContent value="status">
            <StatusPanel />
          </TabsContent>

          <TabsContent value="transcribe">
            <TranscriptionPanel />
          </TabsContent>

          <TabsContent value="noise-reduce">
            <NoiseReductionPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ============================================================================
// Status Panel
// ============================================================================

const StatusPanel = () => {
  const [status, setStatus] = useState<MediaToolsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckStatus = async () => {
    try {
      setError(null);
      const statusResult = await window.electronAPI.mediaToolsStatus();
      setStatus(statusResult);
      console.log('Media Tools Status:', statusResult);
    } catch (err) {
      console.error('Failed to get status:', err);
      setError(err instanceof Error ? err.message : 'Failed to get status');
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={handleCheckStatus} variant="outline">
        Check Media Tools Status
      </Button>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {status && (
        <div className="rounded-md border border-border bg-muted/50 p-4">
          <div className="space-y-2 text-sm">
            <div>
              <strong>Available:</strong> {status.available ? 'Yes' : 'No'}
            </div>
            <div>
              <strong>Mode:</strong>{' '}
              <span className="capitalize">{status.mode}</span>
            </div>
            {status.mediaToolsPath && (
              <div>
                <strong>Binary Path:</strong>{' '}
                <span className="break-all">{status.mediaToolsPath}</span>
              </div>
            )}
            {status.pythonPath && (
              <div>
                <strong>Python Path:</strong> {status.pythonPath}
              </div>
            )}
            {status.mainPyScriptPath && (
              <div>
                <strong>Script Path:</strong>{' '}
                <span className="break-all">{status.mainPyScriptPath}</span>
              </div>
            )}
            <div>
              <strong>Processing:</strong> {status.isProcessing ? 'Yes' : 'No'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Transcription Panel
// ============================================================================

const TranscriptionPanel = () => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<WhisperResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<WhisperModel>('base');

  const handleSelectFile = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        title: 'Select Audio/Video File',
        filters: [
          {
            name: 'Audio Files',
            extensions: ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'opus'],
          },
          {
            name: 'Video Files',
            extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'],
          },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.success && result.files && result.files.length > 0) {
        setSelectedFile(result.files[0].path);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select file');
    }
  };

  const handleTranscribe = async () => {
    if (!selectedFile) {
      setError('Please select an audio file first');
      return;
    }

    setIsTranscribing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setProgressMessage('Starting...');

    window.electronAPI.onWhisperProgress((progressData) => {
      setProgress(progressData.progress);
      setProgressMessage(progressData.message || '');
    });

    try {
      const transcriptionResult = await window.electronAPI.whisperTranscribe(
        selectedFile,
        {
          model: selectedModel,
          device: 'cpu',
          computeType: 'int8',
          beamSize: 5,
          vad: true,
        },
      );

      if (transcriptionResult.success && transcriptionResult.result) {
        setResult(transcriptionResult.result);
      } else {
        setError(transcriptionResult.error || 'Transcription failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setIsTranscribing(false);
      window.electronAPI.removeWhisperProgressListener();
    }
  };

  const handleCancel = async () => {
    try {
      await window.electronAPI.whisperCancel();
      setIsTranscribing(false);
      setProgressMessage('Cancelled');
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* File Selection */}
      <div className="space-y-3">
        <Button onClick={handleSelectFile} variant="outline">
          Select Audio/Video File
        </Button>
        {selectedFile && (
          <div className="text-sm text-muted-foreground break-all">
            <strong>Selected:</strong> {selectedFile}
          </div>
        )}
      </div>

      {/* Model Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Whisper Model</label>
        <Select
          value={selectedModel}
          onValueChange={(value) => setSelectedModel(value as WhisperModel)}
          disabled={isTranscribing}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tiny">Tiny (fastest)</SelectItem>
            <SelectItem value="base">Base (recommended)</SelectItem>
            <SelectItem value="small">Small</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="large">Large</SelectItem>
            <SelectItem value="large-v2">Large v2</SelectItem>
            <SelectItem value="large-v3">Large v3 (most accurate)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button
          onClick={handleTranscribe}
          disabled={!selectedFile || isTranscribing}
        >
          {isTranscribing ? 'Transcribing...' : 'Start Transcription'}
        </Button>
        {isTranscribing && (
          <Button onClick={handleCancel} variant="destructive">
            Cancel
          </Button>
        )}
      </div>

      {/* Progress */}
      {isTranscribing && (
        <div className="space-y-2">
          <Progress value={progress} className="w-full" />
          <div className="text-sm text-muted-foreground">
            {progressMessage} ({progress}%)
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h3 className="text-xl font-semibold">Transcription Result</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="text-sm">
              <strong>Language:</strong> {result.language}
            </div>
            <div className="text-sm">
              <strong>Confidence:</strong>{' '}
              {(result.language_probability * 100).toFixed(1)}%
            </div>
            <div className="text-sm">
              <strong>Duration:</strong> {result.duration.toFixed(2)}s
            </div>
            <div className="text-sm">
              <strong>Processing:</strong> {result.processing_time.toFixed(2)}s
            </div>
            <div className="text-sm">
              <strong>Segments:</strong> {result.segment_count}
            </div>
            <div className="text-sm">
              <strong>Model:</strong> {result.model}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">Full Transcription:</h4>
            <div className="p-4 bg-muted rounded-md text-sm">{result.text}</div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">
              View Raw JSON
            </summary>
            <pre className="mt-2 p-4 bg-muted rounded-md overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Noise Reduction Panel
// ============================================================================

const NoiseReductionPanel = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<NoiseReductionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputFile, setInputFile] = useState<string | null>(null);
  const [outputFile, setOutputFile] = useState<string | null>(null);
  const [propDecrease, setPropDecrease] = useState(0.8);

  const handleSelectInput = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        title: 'Select Input Audio File',
        filters: [
          { name: 'WAV Files', extensions: ['wav'] },
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'ogg'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.success && result.files && result.files.length > 0) {
        const inputPath = result.files[0].path;
        setInputFile(inputPath);
        // Auto-generate output path
        const outputPath = inputPath.replace(/(\.[^.]+)$/, '_clean$1');
        setOutputFile(outputPath);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select file');
    }
  };

  const handleSelectOutput = async () => {
    try {
      const result = await window.electronAPI.showSaveDialog({
        title: 'Save Cleaned Audio',
        defaultPath: outputFile || 'cleaned_audio.wav',
        filters: [
          { name: 'WAV Files', extensions: ['wav'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.success && result.filePath) {
        setOutputFile(result.filePath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select output');
    }
  };

  const handleNoiseReduce = async () => {
    if (!inputFile || !outputFile) {
      setError('Please select input and output files');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setProgressMessage('Starting...');

    window.electronAPI.onMediaToolsProgress((progressData) => {
      setProgress(progressData.progress);
      setProgressMessage(progressData.message || '');
    });

    try {
      const noiseResult = await window.electronAPI.mediaToolsNoiseReduce(
        inputFile,
        outputFile,
        {
          stationary: true,
          propDecrease,
        },
      );

      if (noiseResult.success && noiseResult.result) {
        setResult(noiseResult.result);
      } else {
        setError(noiseResult.error || 'Noise reduction failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noise reduction failed');
    } finally {
      setIsProcessing(false);
      window.electronAPI.removeMediaToolsProgressListener();
    }
  };

  const handleCancel = async () => {
    try {
      await window.electronAPI.mediaToolsCancel();
      setIsProcessing(false);
      setProgressMessage('Cancelled');
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input File Selection */}
      <div className="space-y-3">
        <Button onClick={handleSelectInput} variant="outline">
          Select Input Audio File
        </Button>
        {inputFile && (
          <div className="text-sm text-muted-foreground break-all">
            <strong>Input:</strong> {inputFile}
          </div>
        )}
      </div>

      {/* Output File Selection */}
      <div className="space-y-3">
        <Button
          onClick={handleSelectOutput}
          variant="outline"
          disabled={!inputFile}
        >
          Select Output Location
        </Button>
        {outputFile && (
          <div className="text-sm text-muted-foreground break-all">
            <strong>Output:</strong> {outputFile}
          </div>
        )}
      </div>

      {/* Noise Reduction Strength */}
      <div className="space-y-3">
        <label className="text-sm font-medium">
          Noise Reduction Strength: {(propDecrease * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={propDecrease * 100}
          onChange={(e) => setPropDecrease(Number(e.target.value) / 100)}
          className="w-full"
          disabled={isProcessing}
        />
        <p className="text-xs text-muted-foreground">
          Higher values remove more noise but may affect audio quality
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button
          onClick={handleNoiseReduce}
          disabled={!inputFile || !outputFile || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Start Noise Reduction'}
        </Button>
        {isProcessing && (
          <Button onClick={handleCancel} variant="destructive">
            Cancel
          </Button>
        )}
      </div>

      {/* Progress */}
      {isProcessing && (
        <div className="space-y-2">
          <Progress value={progress} className="w-full" />
          <div className="text-sm text-muted-foreground">
            {progressMessage} ({progress}%)
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h3 className="text-xl font-semibold">Noise Reduction Complete</h3>
          <div className="space-y-2 text-sm">
            <div>
              <strong>Status:</strong> {result.success ? 'Success' : 'Failed'}
            </div>
            <div className="break-all">
              <strong>Output:</strong> {result.outputPath}
            </div>
            {result.message && (
              <div>
                <strong>Message:</strong> {result.message}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaToolsTest;
