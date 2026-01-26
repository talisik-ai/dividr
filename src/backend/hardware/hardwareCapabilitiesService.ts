/**
 * Hardware Capabilities Service
 *
 * Centralized service for detecting and caching hardware capabilities
 * including GPU encoders, CPU cores, and RAM for proxy generation optimization.
 */

import os from 'node:os';
import {
  clearHardwareAccelerationCache,
  getHardwareAcceleration,
  HardwareDetectionResult,
} from '../ffmpeg/export/hardwareAccelerationDetector';

// ============================================================================
// Types
// ============================================================================

export interface HardwareCapabilities {
  /** Encoder detection results from hardwareAccelerationDetector */
  encoder: HardwareDetectionResult;

  /** Number of CPU cores available */
  cpuCores: number;

  /** Total system RAM in bytes */
  totalRamBytes: number;

  /** Free system RAM in bytes at detection time */
  freeRamBytes: number;

  /** True if RAM <= 8GB AND no hardware encoder available */
  isLowHardware: boolean;

  /** True if any hardware encoder is available */
  hasHardwareEncoder: boolean;

  /** Timestamp when capabilities were detected */
  detectedAt: number;
}

export type ProxyEncoderType =
  | 'nvenc'
  | 'qsv'
  | 'videotoolbox'
  | 'amf'
  | 'vaapi'
  | 'software';

export interface ProxyEncoderConfig {
  /** Encoder type identifier */
  type: ProxyEncoderType;

  /** FFmpeg video codec name */
  codec: string;

  /** FFmpeg arguments for this encoder (video codec args only) */
  args: string[];

  /** Human-readable description */
  description: string;
}

// ============================================================================
// Encoder Configurations for 480p Proxy Generation
// ============================================================================

/**
 * Encoder-specific FFmpeg arguments optimized for 480p proxy generation.
 * All configs target consistent visual quality suitable for timeline preview.
 *
 * Quality targets:
 * - Resolution: 480p (scale=-2:480)
 * - Bitrate: ~1-2 Mbps effective
 * - Speed: Prioritize encoding speed over file size
 */
const PROXY_ENCODER_CONFIGS: Record<ProxyEncoderType, ProxyEncoderConfig> = {
  nvenc: {
    type: 'nvenc',
    codec: 'h264_nvenc',
    args: [
      '-c:v',
      'h264_nvenc',
      '-preset',
      'p4', // Fast preset (p1=fastest, p7=slowest)
      '-tune',
      'hq', // High quality tuning
      '-rc',
      'constqp', // Constant QP mode for consistent quality
      '-qp',
      '30', // Quality parameter (lower = better quality, larger file)
      '-spatial-aq',
      '1', // Adaptive quantization for better visual quality
    ],
    description: 'NVIDIA NVENC (GPU)',
  },

  qsv: {
    type: 'qsv',
    codec: 'h264_qsv',
    args: [
      '-c:v',
      'h264_qsv',
      '-preset',
      'fast', // Fast preset
      '-global_quality',
      '30', // ICQ mode quality (1-51, lower = better)
      '-look_ahead',
      '0', // Disable lookahead for speed
    ],
    description: 'Intel Quick Sync (GPU)',
  },

  videotoolbox: {
    type: 'videotoolbox',
    codec: 'h264_videotoolbox',
    args: [
      '-c:v',
      'h264_videotoolbox',
      '-q:v',
      '60', // Quality 0-100 (higher = better)
      '-realtime',
      '0', // Non-realtime for better quality
      '-allow_sw',
      '0', // Don't fall back to software
    ],
    description: 'Apple VideoToolbox (GPU)',
  },

  amf: {
    type: 'amf',
    codec: 'h264_amf',
    args: [
      '-c:v',
      'h264_amf',
      '-quality',
      'speed', // Speed preset for proxy
      '-rc',
      'cqp', // Constant QP mode
      '-qp_i',
      '28', // I-frame QP
      '-qp_p',
      '30', // P-frame QP
    ],
    description: 'AMD AMF (GPU)',
  },

  vaapi: {
    type: 'vaapi',
    codec: 'h264_vaapi',
    args: [
      '-c:v',
      'h264_vaapi',
      '-qp',
      '30', // Quality parameter
      '-compression_level',
      '2', // Lower = faster
    ],
    description: 'VAAPI (Linux GPU)',
  },

  software: {
    type: 'software',
    codec: 'libx264',
    args: [
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast', // Fastest preset
      '-crf',
      '28', // Constant Rate Factor (18-28 typical, higher = smaller)
      '-threads',
      '2', // Limit threads to not starve UI
    ],
    description: 'Software (CPU)',
  },
};

// ============================================================================
// Cache
// ============================================================================

let cachedCapabilities: HardwareCapabilities | null = null;
let cachedFfmpegPath: string | null = null;

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detects hardware capabilities including GPU encoders, CPU cores, and RAM.
 * Results are cached for the session to avoid repeated detection overhead.
 *
 * @param ffmpegPath - Path to FFmpeg binary
 * @returns Hardware capabilities object
 */
export async function detectHardwareCapabilities(
  ffmpegPath: string,
): Promise<HardwareCapabilities> {
  // Return cached result if available and ffmpegPath matches
  if (cachedCapabilities && cachedFfmpegPath === ffmpegPath) {
    console.log('🔧 Using cached hardware capabilities');
    return cachedCapabilities;
  }

  console.log('🔍 Detecting hardware capabilities...');
  const startTime = Date.now();

  // Detect GPU encoders using existing framework
  const encoder = await getHardwareAcceleration(ffmpegPath);

  // Get CPU info
  const cpuCores = os.cpus().length;

  // Get RAM info
  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();

  // Calculate derived flags
  const hasHardwareEncoder = encoder.primary !== undefined;
  const eightGBInBytes = 8 * 1024 * 1024 * 1024;
  const isLowHardware = totalRamBytes <= eightGBInBytes && !hasHardwareEncoder;

  const capabilities: HardwareCapabilities = {
    encoder,
    cpuCores,
    totalRamBytes,
    freeRamBytes,
    isLowHardware,
    hasHardwareEncoder,
    detectedAt: Date.now(),
  };

  // Cache results
  cachedCapabilities = capabilities;
  cachedFfmpegPath = ffmpegPath;

  const detectionTime = Date.now() - startTime;
  console.log(`✅ Hardware capabilities detected in ${detectionTime}ms:`);
  console.log(`   - CPU cores: ${cpuCores}`);
  console.log(
    `   - RAM: ${Math.round(totalRamBytes / (1024 * 1024 * 1024))}GB total, ${Math.round(freeRamBytes / (1024 * 1024 * 1024))}GB free`,
  );
  console.log(
    `   - Hardware encoder: ${hasHardwareEncoder ? encoder.primary?.type.toUpperCase() : 'None'}`,
  );
  console.log(`   - Low hardware mode: ${isLowHardware}`);

  return capabilities;
}

/**
 * Gets the optimal proxy encoder configuration based on detected hardware.
 *
 * Priority order:
 * 1. NVENC (NVIDIA)
 * 2. QSV (Intel)
 * 3. VideoToolbox (macOS)
 * 4. AMF (AMD)
 * 5. VAAPI (Linux)
 * 6. Software (CPU fallback)
 *
 * @param ffmpegPath - Path to FFmpeg binary
 * @returns Proxy encoder configuration
 */
export async function getProxyEncoderConfig(
  ffmpegPath: string,
): Promise<ProxyEncoderConfig> {
  const capabilities = await detectHardwareCapabilities(ffmpegPath);

  if (capabilities.encoder.primary) {
    const encoderType = capabilities.encoder.primary
      .type as keyof typeof PROXY_ENCODER_CONFIGS;

    if (PROXY_ENCODER_CONFIGS[encoderType]) {
      console.log(
        `🎮 Selected proxy encoder: ${PROXY_ENCODER_CONFIGS[encoderType].description}`,
      );
      return PROXY_ENCODER_CONFIGS[encoderType];
    }
  }

  // Fallback to software encoding
  console.log(`💻 Using software proxy encoder (no hardware acceleration)`);
  return PROXY_ENCODER_CONFIGS.software;
}

/**
 * Gets the software fallback encoder configuration.
 * Used when hardware encoding fails and we need to retry with CPU.
 */
export function getSoftwareEncoderConfig(): ProxyEncoderConfig {
  return PROXY_ENCODER_CONFIGS.software;
}

/**
 * Gets a specific encoder configuration by type.
 */
export function getEncoderConfigByType(
  type: ProxyEncoderType,
): ProxyEncoderConfig {
  return PROXY_ENCODER_CONFIGS[type];
}

/**
 * Clears the hardware capabilities cache.
 * Call this to force re-detection on next request.
 */
export function clearCapabilitiesCache(): void {
  cachedCapabilities = null;
  cachedFfmpegPath = null;
  clearHardwareAccelerationCache();
  console.log('🔄 Hardware capabilities cache cleared');
}

/**
 * Gets cached capabilities without triggering detection.
 * Returns null if not yet detected.
 */
export function getCachedCapabilities(): HardwareCapabilities | null {
  return cachedCapabilities;
}

/**
 * Checks if hardware capabilities have been detected.
 */
export function hasDetectedCapabilities(): boolean {
  return cachedCapabilities !== null;
}

/**
 * Builds complete FFmpeg arguments for proxy generation.
 *
 * @param inputPath - Input video file path
 * @param outputPath - Output proxy file path
 * @param encoderConfig - Encoder configuration to use
 * @returns Complete FFmpeg argument array
 */
export function buildProxyFFmpegArgs(
  inputPath: string,
  outputPath: string,
  encoderConfig: ProxyEncoderConfig,
): string[] {
  const args: string[] = [
    '-i',
    inputPath,
    // Video filter: scale to 480p, ensure yuv420p for compatibility
    '-vf',
    'scale=-2:480,format=yuv420p',
    // Encoder-specific video args
    ...encoderConfig.args,
    // Audio settings (consistent across all encoders)
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    // Output settings
    '-movflags',
    '+faststart',
    '-y', // Overwrite output
    '-f',
    'mp4',
    outputPath,
  ];

  return args;
}

/**
 * Builds VAAPI-specific FFmpeg arguments with hardware upload filter.
 * VAAPI requires special handling for the video filter chain.
 */
export function buildVaapiProxyFFmpegArgs(
  inputPath: string,
  outputPath: string,
  vaapiDevice = '/dev/dri/renderD128',
): string[] {
  return [
    '-init_hw_device',
    `vaapi=va:${vaapiDevice}`,
    '-filter_hw_device',
    'va',
    '-i',
    inputPath,
    '-vf',
    'scale=-2:480,format=nv12,hwupload',
    '-c:v',
    'h264_vaapi',
    '-qp',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    '-y',
    '-f',
    'mp4',
    outputPath,
  ];
}
