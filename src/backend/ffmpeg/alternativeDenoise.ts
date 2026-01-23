import { app } from 'electron';
import * as path from 'path';

/**
 * Get the path to the RNNoise model directory
 * In production: resources/ffmpeg-model
 * In development: src/backend/ffmpeg/ffmpeg-model
 */
function getModelDirectory(): string {
  if (process.env.NODE_ENV === 'production') {
    return path.join(process.resourcesPath, 'ffmpeg-model');
  } else {
    return path.join(
      app.getAppPath(),
      'src',
      'backend',
      'ffmpeg',
      'ffmpeg-model',
    );
  }
}

/**
 * Get the absolute path to the std.rnnn model file
 */
function getDefaultModelPath(): string {
  return path.join(getModelDirectory(), 'std.rnnn');
}

export function buildArnnDenCommand(
  inputFile: string,
  outputFile: string,
  modelPath?: string,
): string[] {
  // Use provided model path or default to std.rnnn in ffmpeg-model folder
  const modelFilePath = modelPath || getDefaultModelPath();

  // Fix path for FFmpeg filter on Windows
  // 1. Replace backslashes with forward slashes
  // 2. Escape colon in drive letter (e.g. C:/ -> C\:/)
  const escapedModelPath = modelFilePath
    .replace(/\\/g, '/')
    .replace(/^([a-zA-Z]):/, '$1\\:');

  // Also enable single-quote escaping if path contains spaces (though spawn usually handles args,
  // the filter string is parsed internally by ffmpeg)
  // For simplicity, we just rely on standard path sanitization above which usually works.
  // Using single quotes inside the filter string is safer: arnndn=m='PATH'
  const finalModelPath = `'${escapedModelPath}'`;

  return ['-i', inputFile, '-af', `arnndn=m=${finalModelPath}`, outputFile];
}

export function ffmpegDenoise(
  inputFile: string,
  outputFile: string,
  modelPath?: string,
): string {
  const args = buildArnnDenCommand(inputFile, outputFile, modelPath);
  return `ffmpeg ${args.join(' ')}`;
}
