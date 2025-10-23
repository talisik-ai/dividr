import { Button } from '@/frontend/components/ui/button';
import { Progress } from '@/frontend/components/ui/progress';
import { useState } from 'react';

interface WhisperStatus {
  available: boolean;
  whisperPath: string | null;
  modelsAvailable: string[];
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
  duration: number;
  text: string;
}

/**
 * Test component for Whisper.cpp transcription
 * This is a development/testing component to verify the Whisper integration
 */
export const WhisperTest = () => {
  const [status, setStatus] = useState<WhisperStatus | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<WhisperResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Check Whisper status
  const handleCheckStatus = async () => {
    try {
      const statusResult = await window.electronAPI.whisperStatus();
      setStatus(statusResult);
      console.log('Whisper Status:', statusResult);
    } catch (err) {
      console.error('Failed to get status:', err);
      setError(err instanceof Error ? err.message : 'Failed to get status');
    }
  };

  // Select audio file
  const handleSelectFile = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        title: 'Select Audio File',
        filters: [
          {
            name: 'Audio Files',
            extensions: ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'opus'],
          },
          {
            name: 'Video Files (audio will be extracted)',
            extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'],
          },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.success && result.files && result.files.length > 0) {
        setSelectedFile(result.files[0].path);
        setError(null);
        console.log('Selected file:', result.files[0].path);
      }
    } catch (err) {
      console.error('Failed to select file:', err);
      setError(err instanceof Error ? err.message : 'Failed to select file');
    }
  };

  // Start transcription
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

    // Set up progress listener
    window.electronAPI.onWhisperProgress((progressData) => {
      setProgress(progressData.progress);
      setProgressMessage(progressData.message || '');
      console.log('Progress:', progressData);
    });

    try {
      const transcriptionResult = await window.electronAPI.whisperTranscribe(
        selectedFile,
        {
          model: 'base', // Use 'tiny' for faster testing
          language: 'en', // or omit for auto-detect
          wordTimestamps: true,
        },
      );

      if (transcriptionResult.success && transcriptionResult.result) {
        setResult(transcriptionResult.result);
        console.log('Transcription Result:', transcriptionResult.result);
      } else {
        setError(transcriptionResult.error || 'Transcription failed');
      }
    } catch (err) {
      console.error('Transcription error:', err);
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setIsTranscribing(false);
      window.electronAPI.removeWhisperProgressListener();
    }
  };

  // Cancel transcription
  const handleCancel = async () => {
    try {
      const cancelResult = await window.electronAPI.whisperCancel();
      console.log('Cancel result:', cancelResult);
      setIsTranscribing(false);
      setProgressMessage('Cancelled');
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto min-h-0 flex-1 overflow-y-auto">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="space-y-2 mb-6">
          <h2 className="text-2xl font-bold">Whisper.cpp Test Interface</h2>
          <p className="text-sm text-muted-foreground">
            Test audio transcription with word-level timestamps
          </p>
        </div>

        <div className="space-y-6">
          {/* Status Check */}
          <div className="space-y-3">
            <Button onClick={handleCheckStatus} variant="outline">
              Check Whisper Status
            </Button>
            {status && (
              <div className="rounded-md border border-border bg-muted/50 p-4">
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>Available:</strong>{' '}
                    {status.available ? '✅ Yes' : '❌ No'}
                  </div>
                  <div>
                    <strong>Binary Path:</strong>{' '}
                    {status.whisperPath || 'Not found'}
                  </div>
                  <div>
                    <strong>Models Available:</strong>{' '}
                    {status.modelsAvailable?.length > 0
                      ? status.modelsAvailable.join(', ')
                      : 'None'}
                  </div>
                  <div>
                    <strong>Processing:</strong>{' '}
                    {status.isProcessing ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* File Selection */}
          <div className="space-y-3">
            <Button onClick={handleSelectFile} variant="outline">
              Select Audio File
            </Button>
            {selectedFile && (
              <div className="text-sm text-muted-foreground break-all">
                <strong>Selected:</strong> {selectedFile}
              </div>
            )}
          </div>

          {/* Transcription Controls */}
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

          {/* Error Display */}
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Results Display */}
          {result && (
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h3 className="text-xl font-semibold">Transcription Result</h3>

              <div className="space-y-2">
                <div className="text-sm">
                  <strong>Language:</strong> {result.language}
                </div>
                <div className="text-sm">
                  <strong>Duration:</strong> {result.duration.toFixed(2)}s
                </div>
                <div className="text-sm">
                  <strong>Segments:</strong> {result.segments?.length || 0}
                </div>
              </div>

              {/* Full Text */}
              <div className="space-y-2">
                <h4 className="font-semibold">Full Transcription:</h4>
                <div className="p-4 bg-muted rounded-md text-sm">
                  {result.text}
                </div>
              </div>

              {/* Segments with Word-Level Timestamps */}
              <div className="space-y-2">
                <h4 className="font-semibold">
                  Segments (with word timestamps):
                </h4>
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {result.segments?.map((segment, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-muted rounded-md space-y-2"
                    >
                      <div className="text-xs text-muted-foreground">
                        {segment.start.toFixed(2)}s - {segment.end.toFixed(2)}s
                      </div>
                      <div className="text-sm">{segment.text}</div>
                      {segment.words && segment.words.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t">
                          {segment.words.map((word, widx) => (
                            <span
                              key={widx}
                              className="text-xs px-2 py-1 bg-background rounded"
                              title={`${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s (confidence: ${(word.confidence * 100).toFixed(0)}%)`}
                            >
                              {word.word}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw JSON (for debugging) */}
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
      </div>
    </div>
  );
};
