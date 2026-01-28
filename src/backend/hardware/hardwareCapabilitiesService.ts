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
 * All configs prioritize MAXIMUM ENCODING SPEED for fastest proxy generation.
 *
 * Optimization targets:
 * - Resolution: 480p (scale=-2:480)
 * - Speed: FASTEST encoding possible (all quality/compression optimizations disabled)
 * - Quality: Acceptable for timeline preview (higher QP values, minimal processing)
 * - File size: Not a priority (speed is everything)
 */
const PROXY_ENCODER_CONFIGS: Record<ProxyEncoderType, ProxyEncoderConfig> = {
  nvenc: {
    type: 'nvenc',
    codec: 'h264_nvenc',
    args: [
      '-c:v',
      'h264_nvenc',
      '-preset',
      'p1', // Fastest preset (p1=fastest, p7=slowest)
      '-tune',
      'ull', // Ultra-low latency (fastest encoding)
      '-rc',
      'constqp', // Constant QP mode for consistent quality
      '-qp',
      '32', // Higher QP = faster encode (30->32)
      '-spatial-aq',
      '0', // Disable AQ for speed
      '-temporal-aq',
      '0', // Disable temporal AQ for speed
      '-b_ref_mode',
      '0', // Disable B-frame reference for speed
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
      'ultrafast', // Fastest preset available
      '-global_quality',
      '32', // Higher = faster encode (30->32)
      '-look_ahead',
      '0', // Disable lookahead for speed
      '-look_ahead_depth',
      '0', // Disable lookahead depth
      '-async_depth',
      '1', // Minimize async queue depth for speed
    ],
    description: 'Intel Quick Sync (GPU)',
  },

  videotoolbox: {
    type: 'videotoolbox',
    codec: 'h264_videotoolbox',
    args: [
      '-c:v',
      'h264_videotoolbox',
      '-b:v',
      '1500k', // Use bitrate mode for faster encoding than quality mode
      '-realtime',
      '1', // Realtime mode for maximum speed
      '-allow_sw',
      '0', // Don't fall back to software
      '-prio_speed',
      '1', // Prioritize speed over quality
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
      '32', // Higher I-frame QP for speed (28->32)
      '-qp_p',
      '34', // Higher P-frame QP for speed (30->34)
      '-preanalysis',
      '0', // Disable pre-analysis for speed
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
      '32', // Higher QP for faster encode (30->32)
      '-compression_level',
      '1', // Lowest compression level for maximum speed (2->1)
      '-quality',
      '1', // Speed quality mode
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
      '-tune',
      'fastdecode', // Optimize for fast decoding (also speeds up encoding)
      '-crf',
      '30', // Higher CRF = smaller file, faster encode (28->30 for speed)
      '-threads',
      '0', // Use all available threads (0 = auto-detect optimal)
      '-x264-params',
      'ref=1:bframes=0:me=dia:subme=0:rc-lookahead=0:trellis=0:weightp=0:8x8dct=0', // Aggressive speed optimizations
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
    // Video filter: scale to 480p with fast bilinear interpolation, ensure yuv420p for compatibility
    '-vf',
    'scale=-2:480:flags=fast_bilinear,format=yuv420p',
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
    'scale=-2:480:flags=fast_bilinear,format=nv12,hwupload',
    '-c:v',
    'h264_vaapi',
    '-qp',
    '32',
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
