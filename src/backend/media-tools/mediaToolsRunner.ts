/**
 * Media Tools Runner - Unified binary runner for DiviDr
 * Handles both transcription (faster-whisper) and noise reduction (noisereduce)
 *
 * Binary: dividr-tools(.exe)
 * Commands:
 *   dividr-tools transcribe --input <file> --output <file> [options]
 *   dividr-tools noise-reduce --input <file> --output <file> [options]
 */

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

export interface MediaToolsProgress {
  stage: 'loading' | 'processing' | 'saving' | 'complete' | 'error';
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
  onProgress?: (progress: MediaToolsProgress) => void;
}

export interface NoiseReductionOptions {
  stationary?: boolean;
  propDecrease?: number;
  nFft?: number;
  onProgress?: (progress: MediaToolsProgress) => void;
}

export interface NoiseReductionResult {
  success: boolean;
  outputPath: string;
  message?: string;
}

type MediaToolsCommand = 'transcribe' | 'noise-reduce';

// ============================================================================
// State
// ============================================================================

let mediaToolsPath: string | null = null;
let pythonPath: string | null = null;
let pythonArgs: string[] = [];
let mainPyScriptPath: string | null = null;
let currentProcess: ChildProcess | null = null;

// ============================================================================
// Binary Detection
// ============================================================================

/**
 * Detect dividr-tools executable or Python fallback
 */
const detectMediaToolsExecutable = (): {
  executable: string;
  executableArgs: string[];
  isPythonScript: boolean;
} | null => {
  const isWindows = process.platform === 'win32';
  const platform = process.platform;

  // In packaged app, try bundled standalone executable first
  if (app.isPackaged) {
    const exeName = isWindows ? 'dividr-tools.exe' : 'dividr-tools';
    const bundledExePaths = [
      path.join(process.resourcesPath, 'dividr-tools-bin', platform, exeName),
      path.join(process.resourcesPath, 'dividr-tools-bin', exeName),
    ];

    for (const exePath of bundledExePaths) {
      if (fs.existsSync(exePath)) {
        console.log(`✅ Found bundled dividr-tools at: ${exePath}`);
        return {
          executable: exePath,
          executableArgs: [],
          isPythonScript: false,
        };
      }
    }

    // DEPRECATION WARNING: Check for old transcribe-bin path
    const oldExeName = isWindows ? 'transcribe.exe' : 'transcribe';
    const oldPaths = [
      path.join(process.resourcesPath, 'transcribe-bin', platform, oldExeName),
      path.join(process.resourcesPath, 'transcribe-bin', oldExeName),
    ];

    for (const oldPath of oldPaths) {
      if (fs.existsSync(oldPath)) {
        console.warn('='.repeat(60));
        console.warn(
          '⚠️ DEPRECATION WARNING: Found old transcribe-bin directory',
        );
        console.warn(`   Path: ${oldPath}`);
        console.warn('   Please migrate to dividr-tools-bin structure');
        console.warn(
          '   The transcribe-bin directory will be removed in a future version',
        );
        console.warn('='.repeat(60));
        // Don't use the old binary - force Python fallback for consistency
        break;
      }
    }

    console.log('⚠️ Bundled dividr-tools not found, trying system Python');
  }

  // Fall back to system Python (development mode)
  return detectPythonEnvironment();
};

/**
 * Detect system Python installation
 */
const detectPythonEnvironment = (): {
  executable: string;
  executableArgs: string[];
  isPythonScript: boolean;
} | null => {
  const isWindows = process.platform === 'win32';

  const pythonCommands: Array<[string, string[]]> = isWindows
    ? [
        ['py', ['-3.13']],
        ['py', ['-3.12']],
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
    } catch {
      continue;
    }
  }

  return null;
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize media tools environment
 */
export const initializeMediaTools = async (): Promise<void> => {
  console.log('🛠️ Initializing media-tools environment...');
  console.log('📦 Is packaged:', app.isPackaged);
  console.log('🖥️ Platform:', process.platform);

  const toolsInfo = detectMediaToolsExecutable();

  if (!toolsInfo) {
    console.error('❌ dividr-tools executable or Python 3.9+ not found!');
    throw new Error(
      'Media tools unavailable: Python 3.9+ required or bundled executable missing',
    );
  }

  if (!toolsInfo.isPythonScript) {
    // Standalone binary mode
    mediaToolsPath = toolsInfo.executable;
    pythonPath = null;
    mainPyScriptPath = null;
    console.log('✅ Using standalone dividr-tools executable');
  } else {
    // Python script mode
    pythonPath = toolsInfo.executable;
    pythonArgs = toolsInfo.executableArgs;
    mediaToolsPath = null;

    // Resolve main.py script path
    if (app.isPackaged) {
      const resourcesPath = process.resourcesPath;
      const possiblePaths = [
        path.join(resourcesPath, 'backend', 'python', 'main.py'),
        path.join(resourcesPath, 'scripts', 'main.py'),
      ];

      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          mainPyScriptPath = possiblePath;
          break;
        }
      }

      if (!mainPyScriptPath) {
        throw new Error('Python main.py script not found in production build');
      }
    } else {
      mainPyScriptPath = path.join(
        process.cwd(),
        'src',
        'backend',
        'python',
        'main.py',
      );

      if (!fs.existsSync(mainPyScriptPath)) {
        throw new Error('Python main.py script not found');
      }
    }

    // Verify Python dependencies
    await verifyPythonDependencies();
  }

  console.log('🎯 Media-tools initialization complete');
  console.log(
    '   Mode:',
    mediaToolsPath ? 'Standalone binary' : 'Python script',
  );
  if (mediaToolsPath) {
    console.log('   Binary:', mediaToolsPath);
  } else {
    console.log('   Python:', pythonPath, pythonArgs.join(' '));
    console.log('   Script:', mainPyScriptPath);
  }
};

/**
 * Verify Python dependencies are installed
 */
const verifyPythonDependencies = async (): Promise<void> => {
  if (!pythonPath) return;

  const dependencies = ['faster_whisper', 'noisereduce'];
  const missing: string[] = [];

  for (const dep of dependencies) {
    try {
      const checkCmd = `${pythonPath} ${pythonArgs.join(' ')} -c "import ${dep}"`;
      execSync(checkCmd, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(`✅ ${dep} package found`);
    } catch {
      console.warn(`⚠️ ${dep} package not installed`);
      missing.push(dep);
    }
  }

  if (missing.length === dependencies.length) {
    throw new Error(
      `Required packages not installed: ${missing.join(', ')}\nRun: pip install faster-whisper noisereduce`,
    );
  }
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
};

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Run a media-tools command
 */
const runMediaToolsCommand = async <T>(
  command: MediaToolsCommand,
  args: string[],
  onProgress?: (progress: MediaToolsProgress) => void,
): Promise<T> => {
  const isStandalone = mediaToolsPath !== null;

  let executable: string;
  let fullArgs: string[];

  if (isStandalone) {
    executable = mediaToolsPath;
    fullArgs = [command, ...args];
  } else {
    if (!pythonPath || !mainPyScriptPath) {
      throw new Error('Media tools not initialized');
    }
    executable = pythonPath;
    fullArgs = [...pythonArgs, mainPyScriptPath, command, ...args];
  }

  console.log(`🔧 Running media-tools ${command}:`);
  console.log('   Executable:', executable);
  console.log('   Mode:', isStandalone ? 'Standalone' : 'Python Script');
  console.log('   Command:', [executable, ...fullArgs].join(' '));

  return new Promise((resolve, reject) => {
    const proc = spawn(executable, fullArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    currentProcess = proc;

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let result: T | null = null;

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutBuffer += text;

      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

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
              `[${command}] ${progressData.stage}: ${progressData.progress}% - ${progressData.message || ''}`,
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
            console.log(`✅ Received ${command} result`);
          } catch (err) {
            console.error('Failed to parse result:', err);
          }
        }
        // Parse result saved notification
        else if (line.startsWith('RESULT_SAVED|')) {
          const filePath = line.substring(13);
          console.log('📁 Result saved to:', filePath);
          // For noise reduction, construct a result
          if (command === 'noise-reduce' && !result) {
            result = {
              success: true,
              outputPath: filePath,
              message: 'Noise reduction complete',
            } as T;
          }
        }
        // Handle error messages
        else if (line.trim().startsWith('{') && line.includes('"error"')) {
          try {
            const errorData = JSON.parse(line);
            console.error(`❌ ${command} error:`, errorData);
          } catch {
            // Not JSON, ignore
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderrBuffer += text;
      console.error(`[${command} stderr]`, text.trim());
    });

    proc.on('close', (code) => {
      currentProcess = null;

      if (code !== 0) {
        console.error(`❌ ${command} exited with code:`, code);

        // Try to parse error from stderr
        if (stderrBuffer.includes('ERROR|')) {
          const errorMatch = stderrBuffer.match(/ERROR\|(.+)/);
          if (errorMatch) {
            return reject(new Error(`${command} failed: ${errorMatch[1]}`));
          }
        }

        return reject(
          new Error(
            `${command} failed with code ${code}\nStderr: ${stderrBuffer.slice(-500)}`,
          ),
        );
      }

      if (!result) {
        return reject(
          new Error(
            `${command} completed but no result was received.\nStderr: ${stderrBuffer.slice(-500)}`,
          ),
        );
      }

      if (onProgress) {
        onProgress({
          stage: 'complete',
          progress: 100,
          message: `${command} complete!`,
        });
      }

      resolve(result);
    });

    proc.on('error', (error) => {
      currentProcess = null;
      reject(new Error(`${command} spawn error: ${error.message}`));
    });
  });
};

// ============================================================================
// Public API - Transcription
// ============================================================================

/**
 * Transcribe audio file using Faster-Whisper
 */
export const transcribeAudio = async (
  audioPath: string,
  options: TranscriptionOptions = {},
): Promise<WhisperResult> => {
  if (!mediaToolsPath && !pythonPath) {
    throw new Error(
      'Media tools not initialized. Call initializeMediaTools() first.',
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
  const args: string[] = [
    '--input',
    audioPath,
    '--output',
    '-', // stdout
    '--model',
    model,
    '--device',
    device,
    '--compute-type',
    computeType,
    '--beam-size',
    beamSize.toString(),
  ];

  if (language) {
    args.push('--language', language);
  }

  if (translate) {
    args.push('--translate');
  }

  if (!vad) {
    args.push('--no-vad');
  }

  if (onProgress) {
    onProgress({
      stage: 'loading',
      progress: 0,
      message: `Initializing ${model} model...`,
    });
  }

  return runMediaToolsCommand<WhisperResult>('transcribe', args, onProgress);
};

// ============================================================================
// Public API - Noise Reduction
// ============================================================================

/**
 * Reduce noise from audio file
 */
export const reduceNoise = async (
  inputPath: string,
  outputPath: string,
  options: NoiseReductionOptions = {},
): Promise<NoiseReductionResult> => {
  if (!mediaToolsPath && !pythonPath) {
    throw new Error(
      'Media tools not initialized. Call initializeMediaTools() first.',
    );
  }

  validateAudioPath(inputPath);

  const {
    stationary = true,
    propDecrease = 0.8,
    nFft = 2048,
    onProgress,
  } = options;

  // Build command arguments
  const args: string[] = ['--input', inputPath, '--output', outputPath];

  if (stationary) {
    args.push('--stationary');
  } else {
    args.push('--non-stationary');
  }

  args.push('--prop-decrease', propDecrease.toString());
  args.push('--n-fft', nFft.toString());

  if (onProgress) {
    onProgress({
      stage: 'loading',
      progress: 0,
      message: 'Loading audio file...',
    });
  }

  return runMediaToolsCommand<NoiseReductionResult>(
    'noise-reduce',
    args,
    onProgress,
  );
};

// ============================================================================
// Process Management
// ============================================================================

/**
 * Cancel current operation
 */
export const cancelCurrentOperation = (): boolean => {
  if (currentProcess && !currentProcess.killed) {
    console.log('🛑 Cancelling media-tools operation...');

    // Send SIGTERM for graceful termination
    currentProcess.kill('SIGTERM');

    // Force kill after 2 seconds if still running
    const proc = currentProcess;
    setTimeout(() => {
      if (proc && !proc.killed) {
        console.log('⚠️ Force killing process...');
        proc.kill('SIGKILL');
      }
    }, 2000);

    currentProcess = null;
    return true;
  }
  return false;
};

/**
 * Get media tools status
 */
export const getMediaToolsStatus = () => {
  return {
    available: mediaToolsPath !== null || pythonPath !== null,
    mode: mediaToolsPath ? 'standalone' : pythonPath ? 'python' : 'unavailable',
    mediaToolsPath,
    pythonPath,
    mainPyScriptPath,
    isProcessing: currentProcess !== null && !currentProcess.killed,
  };
};

/**
 * Check if specific capability is available
 */
export const checkCapability = async (
  capability: 'transcribe' | 'noise-reduce',
): Promise<boolean> => {
  if (!pythonPath) {
    // Standalone binary has all capabilities
    return mediaToolsPath !== null;
  }

  // Check Python dependencies
  const depMap = {
    transcribe: 'faster_whisper',
    'noise-reduce': 'noisereduce',
  };

  const dep = depMap[capability];

  try {
    const checkCmd = `${pythonPath} ${pythonArgs.join(' ')} -c "import ${dep}"`;
    execSync(checkCmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
};

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

// These aliases maintain compatibility with code using the old pythonWhisperRunner

/** @deprecated Use initializeMediaTools instead */
export const initializePythonWhisper = initializeMediaTools;

/** @deprecated Use cancelCurrentOperation instead */
export const cancelTranscription = cancelCurrentOperation;

/** @deprecated Use getMediaToolsStatus instead */
export const getPythonWhisperStatus = () => {
  const status = getMediaToolsStatus();
  return {
    available: status.available,
    pythonPath: status.pythonPath,
    pythonScriptPath: status.mainPyScriptPath,
    isProcessing: status.isProcessing,
  };
};

/** @deprecated Use checkCapability('transcribe') instead */
export const checkFasterWhisperInstalled = async (): Promise<boolean> => {
  return checkCapability('transcribe');
};
