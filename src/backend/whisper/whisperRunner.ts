import { spawn } from 'child_process';
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let whisperPath: string | null = null;
let currentWhisperProcess: ReturnType<typeof spawn> | null = null;

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
  duration: number;
  text: string; // Full transcription text
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
  | 'large-v3';

// ============================================================================
// Path Resolution & Initialization
// ============================================================================

/**
 * Initialize Whisper binary path
 * Resolves the path to the Whisper.cpp binary based on whether the app is packaged
 */
export const initializeWhisperPath = async (): Promise<void> => {
  console.log('🔍 Initializing Whisper.cpp paths...');
  console.log('📦 Is packaged:', app.isPackaged);
  console.log('🖥️ Platform:', process.platform);

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const whisperBinary = isWindows ? 'whisper-cli.exe' : 'main';

  if (app.isPackaged) {
    // Production mode - binary is in resources
    const resourcesPath = process.resourcesPath;
    const platformName = isWindows ? 'win32' : isMac ? 'darwin' : 'linux';

    const possiblePaths = [
      // Primary: resources/whisper-bin/platform/binary
      path.join(resourcesPath, 'whisper-bin', platformName, whisperBinary),
      // Fallback: resources/whisper-bin/binary
      path.join(resourcesPath, 'whisper-bin', whisperBinary),
      // Fallback: app path relative
      path.join(
        app.getAppPath(),
        '..',
        'whisper-bin',
        platformName,
        whisperBinary,
      ),
      path.join(app.getAppPath(), 'whisper-bin', platformName, whisperBinary),
    ];

    for (const testPath of possiblePaths) {
      console.log('🔍 Checking Whisper path:', testPath);
      if (fs.existsSync(testPath)) {
        whisperPath = testPath;
        console.log('✅ Whisper.cpp found at:', testPath);
        break;
      } else {
        console.log('❌ Not found at:', testPath);
      }
    }
  } else {
    // Development mode - binary is in project root
    const platformName = isWindows ? 'win32' : isMac ? 'darwin' : 'linux';
    const devPath = path.join(
      process.cwd(),
      'whisper-bin',
      platformName,
      whisperBinary,
    );

    console.log('🔍 Checking Whisper path (dev mode):', devPath);
    if (fs.existsSync(devPath)) {
      whisperPath = devPath;
      console.log('✅ Whisper.cpp found (dev mode):', devPath);
    } else {
      console.log('❌ Not found at:', devPath);
    }
  }

  if (!whisperPath || !fs.existsSync(whisperPath)) {
    console.error('❌ Whisper.cpp binary not found!');
    console.error(
      '📋 Please ensure whisper-bin/ directory contains the binary for your platform',
    );
    throw new Error('Whisper.cpp binary not available');
  }

  console.log('🎯 Whisper.cpp initialization complete:', whisperPath);
};

/**
 * Get model file path
 * Resolves the path to a Whisper model based on whether the app is packaged
 */
const getModelPath = (modelName: WhisperModel): string => {
  // Support both standard and quantized models
  const modelFile = `ggml-${modelName}.bin`;
  const quantizedModelFile = `ggml-${modelName}.en-q8_0.bin`;

  if (app.isPackaged) {
    const resourcesPath = process.resourcesPath;
    const standardPath = path.join(resourcesPath, 'whisper-models', modelFile);
    const quantizedPath = path.join(
      resourcesPath,
      'whisper-models',
      quantizedModelFile,
    );

    // Prefer quantized model if available (smaller, faster)
    if (fs.existsSync(quantizedPath)) {
      return quantizedPath;
    }
    return standardPath;
  } else {
    const standardPath = path.join(process.cwd(), 'whisper-models', modelFile);
    const quantizedPath = path.join(
      process.cwd(),
      'whisper-models',
      quantizedModelFile,
    );

    // Prefer quantized model if available
    if (fs.existsSync(quantizedPath)) {
      return quantizedPath;
    }
    return standardPath;
  }
};

/**
 * Check if a specific model is available
 */
export const isModelAvailable = (modelName: WhisperModel): boolean => {
  const modelPath = getModelPath(modelName);
  return fs.existsSync(modelPath);
};

/**
 * Get list of available models
 */
export const getAvailableModels = (): WhisperModel[] => {
  const models: WhisperModel[] = [
    'tiny',
    'base',
    'small',
    'medium',
    'large',
    'large-v3',
  ];
  return models.filter((model) => isModelAvailable(model));
};

// ============================================================================
// Input Validation & Security
// ============================================================================

/**
 * Validate audio file path to prevent injection attacks
 */
const validateAudioPath = (audioPath: string): void => {
  // Check if path exists
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // Check if it's a file (not directory)
  const stats = fs.statSync(audioPath);
  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${audioPath}`);
  }

  // Check file extension (basic validation)
  const ext = path.extname(audioPath).toLowerCase();
  const allowedExtensions = [
    '.wav',
    '.mp3',
    '.m4a',
    '.aac',
    '.ogg',
    '.flac',
    '.opus',
  ];
  if (!allowedExtensions.includes(ext)) {
    console.warn(
      `⚠️ Audio file has unusual extension: ${ext}. Whisper may still process it.`,
    );
  }

  // Prevent path traversal
  const resolvedPath = path.resolve(audioPath);
  if (resolvedPath !== audioPath && !path.isAbsolute(audioPath)) {
    console.warn('⚠️ Path was normalized:', {
      original: audioPath,
      resolved: resolvedPath,
    });
  }
};

// ============================================================================
// Main Transcription Function
// ============================================================================

/**
 * Transcribe audio file using Whisper.cpp
 * @param audioPath - Path to audio file
 * @param options - Transcription options
 * @returns Transcription result with word-level timestamps
 */
export const transcribeAudio = async (
  audioPath: string,
  options: {
    model?: WhisperModel;
    language?: string;
    translate?: boolean; // Translate to English
    wordTimestamps?: boolean; // Enable word-level timestamps (default: true)
    onProgress?: (progress: WhisperProgress) => void;
  } = {},
): Promise<WhisperResult> => {
  if (!whisperPath) {
    throw new Error(
      'Whisper.cpp not initialized. Call initializeWhisperPath() first.',
    );
  }

  validateAudioPath(audioPath);

  const modelName = options.model || 'base';
  const modelPath = getModelPath(modelName);

  if (!fs.existsSync(modelPath)) {
    const availableModels = getAvailableModels();
    throw new Error(
      `Model "${modelName}" not found at: ${modelPath}. Available models: ${
        availableModels.length > 0 ? availableModels.join(', ') : 'none'
      }`,
    );
  }

  const tempDir = path.join(os.tmpdir(), 'dividr-whisper');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const timestamp = Date.now();
  const outputPrefix = path.join(tempDir, `transcript_${timestamp}`);

  // ✅ OPTIMIZED ARGS FOR TIMESTAMP ACCURACY
  const args: string[] = [
    '-m',
    modelPath,
    '-f',
    audioPath,
    '-oj', // Output JSON
    '-of',
    outputPrefix,

    // Thread optimization
    '-t',
    Math.max(1, os.cpus().length - 1).toString(),

    // ✅ CRITICAL: Small context window prevents timestamp drift
    '-c',
    '256', // Reduced from 512 - smaller context = better alignment

    // ✅ Beam search for better accuracy
    '-bs',
    '5',

    // ✅ CRITICAL: Zero temperature for deterministic, accurate timestamps
    '--temperature',
    '0.0',
    '--temperature-inc',
    '0.0', // No temperature fallback

    // ✅ CRITICAL: Shorter segments = more accurate timestamps
    '--max-len',
    '0', // Let Whisper decide based on natural pauses (better than forcing '1')
    '--max-segment-length',
    '20', // Reduced from 25 - shorter segments minimize drift

    // ✅ Word-level splitting and alignment
    '--split-on-word',
    'true',

    // ✅ Multiple decode paths for accuracy
    '--best-of',
    '5',

    // ✅ CRITICAL: Enable token-level timestamps (required for word timestamps)
    '--token-timestamps',
    'true',

    // ✅ Disable initial prompt (can cause timestamp issues)
    '--no-context',
    'true',

    // ✅ Enable precise timing
    '--no-timestamps',
    'false',

    // ✅ Entropy threshold helps with silence detection
    '--entropy-thold',
    '2.4',

    // ✅ Logprob threshold for better word boundary detection
    '--logprob-thold',
    '-1.0',
  ];

  // ✅ Enable word timestamps (critical for accuracy)
  if (options.wordTimestamps !== false) {
    args.push('--word-timestamps', 'true');
    args.push('--max-tokens', '0'); // No token limit for better word detection
  }

  // ✅ Add language if specified (helps with alignment)
  if (options.language) {
    args.push('-l', options.language);
  }

  // ✅ Add translation if needed
  if (options.translate) {
    args.push('--translate');
  }

  args.push('-pp'); // print progress

  console.log('🎤 Running Whisper.cpp transcription:');
  console.log('   Binary:', whisperPath);
  console.log('   Model:', modelPath);
  console.log('   Audio:', audioPath);
  console.log('   Command:', [path.basename(whisperPath), ...args].join(' '));

  if (options.onProgress) {
    options.onProgress({
      stage: 'loading',
      progress: 0,
      message: `Loading ${modelName} model...`,
    });
  }

  return new Promise((resolve, reject) => {
    const whisper = spawn(whisperPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    currentWhisperProcess = whisper;

    let stderr = '';
    let lastProgress = 0;

    whisper.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) console.log('[Whisper stdout]', text);
    });

    whisper.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;

      const match = text.match(/progress\s*=\s*(\d+)%/);
      if (match && options.onProgress) {
        const progress = parseInt(match[1], 10);
        if (progress > lastProgress) {
          lastProgress = progress;
          options.onProgress({
            stage: 'processing',
            progress,
            message: `Transcribing... ${progress}%`,
          });
        }
      }
    });

    whisper.on('close', (code) => {
      currentWhisperProcess = null;

      if (code !== 0) {
        console.error('❌ Whisper.cpp exited with code:', code);
        return reject(
          new Error(
            `Whisper.cpp exited with code ${code}\nStderr: ${stderr.slice(-500)}`,
          ),
        );
      }

      const jsonPath = `${outputPrefix}.json`;
      if (!fs.existsSync(jsonPath)) {
        return reject(
          new Error('Whisper completed but no output file was created.'),
        );
      }

      try {
        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        const jsonData = JSON.parse(jsonContent);
        const result = parseWhisperOutput(jsonData);

        fs.unlinkSync(jsonPath); // cleanup

        options.onProgress?.({
          stage: 'complete',
          progress: 100,
          message: 'Transcription complete!',
        });

        console.log('✅ Transcription successful:', {
          segments: result.segments.length,
          duration: result.duration,
          language: result.language,
        });

        resolve(result);
      } catch (err) {
        reject(
          new Error(
            `Failed to parse Whisper output: ${(err as Error).message}`,
          ),
        );
      }
    });

    whisper.on('error', (error) => {
      currentWhisperProcess = null;
      reject(new Error(`Whisper.cpp spawn error: ${error.message}`));
    });
  });
};

// ============================================================================
// Output Parsing
// ============================================================================

/**
 * Parse Whisper JSON output to structured result
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseWhisperOutput = (jsonData: any): WhisperResult => {
  if (!jsonData || !jsonData.transcription) {
    throw new Error('Invalid Whisper output format');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segments: WhisperSegment[] = (jsonData.transcription || []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (seg: any) => {
      const segment: WhisperSegment = {
        start: (seg.offsets?.from || 0) / 100, // Convert centiseconds to seconds
        end: (seg.offsets?.to || 0) / 100,
        text: (seg.text || '').trim(),
      };

      // Parse word-level timestamps if available
      if (seg.tokens && Array.isArray(seg.tokens)) {
        segment.words = seg.tokens
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((token: any) => token.text && token.text.trim())
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((token: any) => ({
            word: token.text.trim(),
            start: (token.offsets?.from || 0) / 100,
            end: (token.offsets?.to || 0) / 100,
            confidence: token.p || 1.0,
          }));
      }

      return segment;
    },
  );

  // Build full text
  const fullText = segments
    .map((s) => s.text)
    .join(' ')
    .trim();

  return {
    segments,
    language: jsonData.result?.language || 'unknown',
    duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
    text: fullText,
  };
};

// ============================================================================
// Process Management
// ============================================================================

/**
 * Cancel current transcription
 */
export const cancelTranscription = (): boolean => {
  if (currentWhisperProcess && !currentWhisperProcess.killed) {
    console.log('🛑 Cancelling Whisper.cpp process...');

    // Send SIGTERM for graceful termination
    currentWhisperProcess.kill('SIGTERM');

    // Force kill after 2 seconds if still running
    setTimeout(() => {
      if (currentWhisperProcess && !currentWhisperProcess.killed) {
        console.log('⚠️ Force killing Whisper.cpp process...');
        currentWhisperProcess.kill('SIGKILL');
      }
    }, 2000);

    currentWhisperProcess = null;
    return true;
  }
  return false;
};

/**
 * Get Whisper status and available models
 */
export const getWhisperStatus = () => {
  const availableModels = getAvailableModels();

  return {
    available: whisperPath !== null,
    whisperPath,
    modelsAvailable: availableModels,
    isProcessing:
      currentWhisperProcess !== null && !currentWhisperProcess.killed,
  };
};
