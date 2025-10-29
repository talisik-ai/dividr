import { ChildProcess, execSync, spawn } from 'child_process';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface WhisperWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
  confidence: number;
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
}

export interface WhisperResult {
  segments: WhisperSegment[];
  language: string;
  language_probability: number;
  duration: number;
  text: string; // Full transcription text
  processing_time: number;
  model: string;
  device: string;
  segment_count: number;
  real_time_factor?: number;
  faster_than_realtime?: boolean;
}

export interface WhisperProgress {
  stage: 'loading' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  message?: string;
}

export type WhisperModel =
  | 'tiny'
  | 'base'
  | 'small'
  | 'medium'
  | 'large'
  | 'large-v2'
  | 'large-v3';

export interface TranscriptionOptions {
  model?: WhisperModel;
  language?: string;
  translate?: boolean;
  device?: 'cpu' | 'cuda';
  computeType?: 'int8' | 'int16' | 'float16' | 'float32';
  beamSize?: number;
  vad?: boolean;
  onProgress?: (progress: WhisperProgress) => void;
}

// ============================================================================
// Python Environment Detection
// ============================================================================

let pythonPath: string | null = null;
let pythonArgs: string[] = [];
let pythonScriptPath: string | null = null;
let currentTranscriptionProcess: ChildProcess | null = null;

/**
 * Detect transcribe executable path
 * In production: use bundled standalone executable
 * In development: use Python script with system Python
 */
const detectTranscribeExecutable = (): {
  executable: string;
  executableArgs: string[];
  isPythonScript: boolean;
} | null => {
  const isWindows = process.platform === 'win32';
  const platform = process.platform;

  // In packaged app, try bundled standalone executable first
  if (app.isPackaged) {
    const exeName = isWindows ? 'transcribe.exe' : 'transcribe';
    const bundledExePaths = [
      path.join(process.resourcesPath, 'transcribe-bin', platform, exeName),
      path.join(process.resourcesPath, 'transcribe-bin', exeName),
    ];

    for (const exePath of bundledExePaths) {
      if (fs.existsSync(exePath)) {
        console.log(`✅ Found bundled transcribe executable at: ${exePath}`);
        return {
          executable: exePath,
          executableArgs: [],
          isPythonScript: false,
        };
      }
    }

    console.log('⚠️ Bundled executable not found, trying system Python');
  }

  // Fall back to system Python (development mode)
  // Format: [command, args[]]
  const pythonCommands: Array<[string, string[]]> = isWindows
    ? [
        ['py', ['-3.13']],
        ['py', ['-3.11']],
        ['python', []],
        ['python3', []],
        ['py', []],
      ]
    : [
        ['python3', []],
        ['python', []],
      ];

  for (const [cmd, cmdArgs] of pythonCommands) {
    try {
      const fullArgs = [...cmdArgs, '--version'];
      const result = execSync(`${cmd} ${fullArgs.join(' ')}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const versionMatch = result.match(/Python (\d+)\.(\d+)/);
      if (versionMatch) {
        const major = parseInt(versionMatch[1], 10);
        const minor = parseInt(versionMatch[2], 10);

        if (major === 3 && minor >= 9) {
          console.log(
            `✅ Found system Python ${major}.${minor} at: ${cmd} ${cmdArgs.join(' ')}`,
          );
          return {
            executable: cmd,
            executableArgs: cmdArgs,
            isPythonScript: true,
          };
        }
      }
    } catch (error) {
      continue;
    }
  }

  return null;
};

/**
 * Initialize Python environment and script paths
 */
export const initializePythonWhisper = async (): Promise<void> => {
  console.log('🐍 Initializing transcription environment...');
  console.log('📦 Is packaged:', app.isPackaged);
  console.log('🖥️ Platform:', process.platform);

  // Detect transcribe executable or Python
  const transcribeInfo = detectTranscribeExecutable();

  if (!transcribeInfo) {
    console.error('❌ Transcribe executable or Python 3.9+ not found!');
    console.error(
      '📋 Please install Python 3.9+ and faster-whisper from https://www.python.org/',
    );
    throw new Error(
      'Transcription unavailable: Python 3.9+ required or bundled executable missing',
    );
  }

  pythonPath = transcribeInfo.executable;
  pythonArgs = transcribeInfo.executableArgs;

  // If using standalone executable, no script path or dependency check needed
  if (!transcribeInfo.isPythonScript) {
    pythonScriptPath = null;
    console.log(
      '✅ Using standalone transcribe executable - no dependencies needed',
    );
  } else {
    // Resolve script path for Python mode
    if (app.isPackaged) {
      const resourcesPath = process.resourcesPath;
      const possiblePaths = [
        path.join(resourcesPath, 'backend', 'scripts', 'transcribe.py'),
        path.join(resourcesPath, 'scripts', 'transcribe.py'),
      ];

      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          pythonScriptPath = possiblePath;
          break;
        }
      }

      if (!pythonScriptPath) {
        throw new Error(
          'Python transcription script not found in production build',
        );
      }
    } else {
      pythonScriptPath = path.join(
        process.cwd(),
        'src',
        'backend',
        'scripts',
        'transcribe.py',
      );

      if (!fs.existsSync(pythonScriptPath)) {
        throw new Error('Python transcription script not found');
      }
    }

    // Verify Python dependencies (only for Python mode)
    try {
      const checkCmd = `${pythonPath} ${pythonArgs.join(' ')} -c "import faster_whisper"`;
      execSync(checkCmd, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log('✅ faster-whisper package found');
    } catch (error) {
      console.error('❌ faster-whisper package not installed!');
      throw new Error(
        'faster-whisper not installed. Run: pip install faster-whisper',
      );
    }
  }

  console.log('🎯 Python Whisper initialization complete');
  console.log('   Python:', pythonPath, pythonArgs.join(' '));
  console.log('   Script:', pythonScriptPath);
};

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate audio file path
 */
const validateAudioPath = (audioPath: string): void => {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const stats = fs.statSync(audioPath);
  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${audioPath}`);
  }

  const ext = path.extname(audioPath).toLowerCase();
  const allowedExtensions = [
    '.wav',
    '.mp3',
    '.m4a',
    '.aac',
    '.ogg',
    '.flac',
    '.opus',
    '.webm',
    '.mp4',
    '.mkv',
  ];

  if (!allowedExtensions.includes(ext)) {
    console.warn(
      `⚠️ Audio file has unusual extension: ${ext}. Whisper may still process it.`,
    );
  }
};

// ============================================================================
// Main Transcription Function
// ============================================================================

/**
 * Transcribe audio file using Python Faster-Whisper
 */
export const transcribeAudio = async (
  audioPath: string,
  options: TranscriptionOptions = {},
): Promise<WhisperResult> => {
  if (!pythonPath) {
    throw new Error(
      'Transcription not initialized. Call initializePythonWhisper() first.',
    );
  }

  validateAudioPath(audioPath);

  const {
    model = 'large-v3',
    language = null,
    translate = false,
    device = 'cpu',
    computeType = 'int8',
    beamSize = 5,
    vad = true,
    onProgress,
  } = options;

  // Build command arguments
  const isStandalone = !pythonScriptPath;
  const args: string[] = [...pythonArgs]; // Start with python args (e.g., ['-3.13'])

  if (!isStandalone) {
    // Python mode: add the script path
    args.push(pythonScriptPath);
  }

  // Common arguments
  args.push(
    audioPath,
    '--model',
    model,
    '--device',
    device,
    '--compute-type',
    computeType,
    '--beam-size',
    beamSize.toString(),
  );

  if (language) {
    args.push('--language', language);
  }

  if (translate) {
    args.push('--translate');
  }

  if (!vad) {
    args.push('--no-vad');
  }

  console.log('🎤 Running transcription:');
  console.log('   Executable:', pythonPath);
  console.log('   Mode:', isStandalone ? 'Standalone' : 'Python Script');
  console.log('   Audio:', audioPath);
  console.log('   Model:', model);
  console.log('   Command:', [pythonPath, ...args].join(' '));

  if (onProgress) {
    onProgress({
      stage: 'loading',
      progress: 0,
      message: `Initializing ${model} model...`,
    });
  }

  return new Promise((resolve, reject) => {
    // pythonPath is guaranteed to be non-null at this point due to check above
    const pythonProcess = spawn(pythonPath as string, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1', // Ensure real-time output
      },
    });

    currentTranscriptionProcess = pythonProcess;

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let result: WhisperResult | null = null;

    // Handle stdout (progress updates and result)
    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutBuffer += text;

      // Process line by line
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        // Parse progress updates: PROGRESS|{json}
        if (line.startsWith('PROGRESS|')) {
          try {
            const progressJson = line.substring(9);
            const progressData = JSON.parse(progressJson);

            if (onProgress) {
              onProgress({
                stage: progressData.stage,
                progress: progressData.progress,
                message: progressData.message,
              });
            }

            console.log(
              `[Python Progress] ${progressData.stage}: ${progressData.progress}% - ${progressData.message}`,
            );
          } catch (err) {
            console.warn('Failed to parse progress:', line);
          }
        }
        // Parse result: RESULT|{json}
        else if (line.startsWith('RESULT|')) {
          try {
            const resultJson = line.substring(7);
            result = JSON.parse(resultJson);
            console.log('✅ Received transcription result');
          } catch (err) {
            console.error('Failed to parse result:', err);
          }
        }
        // Parse result saved notification
        else if (line.startsWith('RESULT_SAVED|')) {
          const filePath = line.substring(13);
          console.log('📁 Result saved to:', filePath);
        }
        // Handle error messages
        else if (line.trim().startsWith('{') && line.includes('"error"')) {
          try {
            const errorData = JSON.parse(line);
            console.error('❌ Python error:', errorData);
          } catch (err) {
            // Not JSON, ignore
          }
        }
      }
    });

    // Handle stderr (errors and warnings)
    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderrBuffer += text;
      console.error('[Python stderr]', text.trim());
    });

    // Handle process completion
    pythonProcess.on('close', (code) => {
      currentTranscriptionProcess = null;

      if (code !== 0) {
        console.error('❌ Python process exited with code:', code);

        // Try to parse error from stdout buffer
        if (stdoutBuffer.trim()) {
          try {
            const errorData = JSON.parse(stdoutBuffer.trim());
            if (errorData.error) {
              return reject(
                new Error(
                  `Transcription failed: ${errorData.message}\n${errorData.details || ''}`,
                ),
              );
            }
          } catch (err) {
            // Not JSON
          }
        }

        return reject(
          new Error(
            `Python process exited with code ${code}\nStderr: ${stderrBuffer.slice(-500)}`,
          ),
        );
      }

      if (!result) {
        return reject(
          new Error(
            'Transcription completed but no result was received.\nStderr: ' +
              stderrBuffer.slice(-500),
          ),
        );
      }

      if (onProgress) {
        onProgress({
          stage: 'complete',
          progress: 100,
          message: 'Transcription complete!',
        });
      }

      console.log('✅ Transcription successful:', {
        segments: result.segment_count,
        duration: result.duration,
        language: result.language,
        processing_time: result.processing_time,
      });

      resolve(result);
    });

    // Handle process errors
    pythonProcess.on('error', (error) => {
      currentTranscriptionProcess = null;
      reject(new Error(`Python process spawn error: ${error.message}`));
    });
  });
};

// ============================================================================
// Process Management
// ============================================================================

/**
 * Cancel current transcription
 */
export const cancelTranscription = (): boolean => {
  if (currentTranscriptionProcess && !currentTranscriptionProcess.killed) {
    console.log('🛑 Cancelling Python transcription process...');

    // Send SIGTERM for graceful termination
    currentTranscriptionProcess.kill('SIGTERM');

    // Force kill after 2 seconds if still running
    setTimeout(() => {
      if (currentTranscriptionProcess && !currentTranscriptionProcess.killed) {
        console.log('⚠️ Force killing Python process...');
        currentTranscriptionProcess.kill('SIGKILL');
      }
    }, 2000);

    currentTranscriptionProcess = null;
    return true;
  }
  return false;
};

/**
 * Get Python Whisper status
 */
export const getPythonWhisperStatus = () => {
  return {
    available: pythonPath !== null,
    pythonPath,
    pythonScriptPath,
    isProcessing:
      currentTranscriptionProcess !== null &&
      !currentTranscriptionProcess.killed,
  };
};

/**
 * Check if faster-whisper is installed
 */
export const checkFasterWhisperInstalled = async (): Promise<boolean> => {
  if (!pythonPath) return false;

  try {
    const checkCmd = `${pythonPath} ${pythonArgs.join(' ')} -c "import faster_whisper"`;
    execSync(checkCmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch (error) {
    return false;
  }
};
