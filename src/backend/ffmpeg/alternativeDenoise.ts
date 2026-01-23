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

  return ['-i', inputFile, '-af', `arnndn=m=${modelFilePath}`, outputFile];
}

export function ffmpegDenoise(
  inputFile: string,
  outputFile: string,
  modelPath?: string,
): string {
  const args = buildArnnDenCommand(inputFile, outputFile, modelPath);
  return `ffmpeg ${args.join(' ')}`;
}
