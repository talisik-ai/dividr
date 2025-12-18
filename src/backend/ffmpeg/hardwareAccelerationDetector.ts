/* eslint-disable @typescript-eslint/no-var-requires */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface HardwareAcceleration {
  type: 'nvenc' | 'qsv' | 'amf' | 'videotoolbox' | 'vaapi' | 'none';
  available: boolean;
  videoCodec: string;
  hevcCodec?: string;
  hwaccel?: string;
  hwaccelDevice?: string;
  hwaccelOutputFormat?: string;
  decoderFlags?: string[];
  encoderFlags?: string[];
  description: string;
}

export interface HardwareDetectionResult {
  primary?: HardwareAcceleration;
  all: HardwareAcceleration[];
  fallback: HardwareAcceleration;
}

/**
 * Detects NVIDIA NVENC hardware acceleration
 */
async function detectNVENC(
  encodersOutput: string,
  ffmpegPath: string,
): Promise<HardwareAcceleration | null> {
  const hasH264 = encodersOutput.includes('h264_nvenc');
  const hasHEVC = encodersOutput.includes('hevc_nvenc');

  if (!hasH264 && !hasHEVC) {
    return null;
  }

  // Test if the encoder actually works
  try {
    await execAsync(
      `"${ffmpegPath}" -f lavfi -i testsrc=duration=0.1:size=320x240:rate=1 -c:v h264_nvenc -f null - 2>&1`,
    );
    console.log('✅ NVENC encoder test successful');
  } catch (error) {
    console.warn('⚠️ NVENC detected in encoder list but test encoding failed:');
    return null; // Encoder listed but doesn't work
  }

  return {
    type: 'nvenc',
    available: true,
    videoCodec: 'h264_nvenc',
    hevcCodec: hasHEVC ? 'hevc_nvenc' : undefined,
    hwaccel: 'cuda',
    hwaccelDevice: '0',
    hwaccelOutputFormat: 'cuda',
    decoderFlags: ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'],
    encoderFlags: [
      '-preset',
      'p6', // NVENC preset p6 (medium quality/speed balance)
      '-cq',
      '32', // Higher CQ for smaller files (was 28)
      '-maxrate',
      '3M', // Lower maximum bitrate cap
      '-bufsize',
      '6M', // Buffer size
    ],
    description: 'NVIDIA NVENC (CUDA) - Hardware encoding via NVIDIA GPU',
  };
}

/**
 * Detects Intel Quick Sync Video (QSV) hardware acceleration
 */
async function detectQSV(
  encodersOutput: string,
  ffmpegPath: string,
): Promise<HardwareAcceleration | null> {
  const hasH264 = encodersOutput.includes('h264_qsv');
  const hasHEVC = encodersOutput.includes('hevc_qsv');

  if (!hasH264 && !hasHEVC) {
    return null;
  }

  // Test if the encoder actually works
  try {
    await execAsync(
      `"${ffmpegPath}" -f lavfi -i testsrc=duration=0.1:size=320x240:rate=1 -c:v h264_qsv -f null - 2>&1`,
    );
    console.log('✅ QSV encoder test successful');
  } catch (error) {
    console.warn('⚠️ QSV detected in encoder list but test encoding failed');
    console.warn(
      '   This usually means Intel iGPU drivers are not properly installed',
    );
    return null; // Encoder listed but doesn't work
  }

  return {
    type: 'qsv',
    available: true,
    videoCodec: 'h264_qsv',
    hevcCodec: hasHEVC ? 'hevc_qsv' : undefined,
    hwaccel: 'qsv',
    hwaccelDevice: 'auto',
    hwaccelOutputFormat: 'qsv',
    decoderFlags: ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv'],
    encoderFlags: [
      '-preset',
      'medium', // QSV preset
      '-b:v',
      '2M', // Lower bitrate for smaller file size
    ],
    description:
      'Intel Quick Sync Video - Hardware encoding via Intel integrated GPU',
  };
}

/**
 * Detects AMD AMF hardware acceleration
 */
async function detectAMF(
  encodersOutput: string,
  ffmpegPath: string,
): Promise<HardwareAcceleration | null> {
  const hasH264 = encodersOutput.includes('h264_amf');
  const hasHEVC = encodersOutput.includes('hevc_amf');

  if (!hasH264 && !hasHEVC) {
    return null;
  }

  // Test if the encoder actually works
  try {
    await execAsync(
      `"${ffmpegPath}" -f lavfi -i testsrc=duration=0.1:size=320x240:rate=1 -c:v h264_amf -f null - 2>&1`,
    );
    console.log('✅ AMF encoder test successful');
  } catch (error) {
    console.warn('⚠️ AMF detected in encoder list but test encoding failed');
    console.warn(
      '   This usually means AMD GPU drivers (Adrenalin) are not properly installed',
    );
    return null; // Encoder listed but doesn't work
  }

  return {
    type: 'amf',
    available: true,
    videoCodec: 'h264_amf',
    hevcCodec: hasHEVC ? 'hevc_amf' : undefined,
    hwaccel: 'auto',
    encoderFlags: [
      '-quality',
      'balanced', // AMF quality preset
      '-b:v',
      '2M', // Lower bitrate for smaller file size
    ],
    description: 'AMD AMF - Hardware encoding via AMD GPU',
  };
}

/**
 * Detects Apple VideoToolbox hardware acceleration (macOS)
 */
async function detectVideoToolbox(
  encodersOutput: string,
  ffmpegPath: string,
): Promise<HardwareAcceleration | null> {
  const hasH264 = encodersOutput.includes('h264_videotoolbox');
  const hasHEVC = encodersOutput.includes('hevc_videotoolbox');

  if (!hasH264 && !hasHEVC) {
    return null;
  }

  // Test if the encoder actually works
  try {
    await execAsync(
      `"${ffmpegPath}" -f lavfi -i testsrc=duration=0.1:size=320x240:rate=1 -c:v h264_videotoolbox -f null - 2>&1`,
    );
    console.log('✅ VideoToolbox encoder test successful');
  } catch (error) {
    console.warn(
      '⚠️ VideoToolbox detected in encoder list but test encoding failed',
    );
    return null; // Encoder listed but doesn't work
  }

  return {
    type: 'videotoolbox',
    available: true,
    videoCodec: 'h264_videotoolbox',
    hevcCodec: hasHEVC ? 'hevc_videotoolbox' : undefined,
    hwaccel: 'videotoolbox',
    decoderFlags: ['-hwaccel', 'videotoolbox'],
    encoderFlags: [
      '-b:v',
      '5M', // Use bitrate for compatibility
    ],
    description:
      'Apple VideoToolbox - Hardware encoding via Apple Silicon/Intel GPU',
  };
}

/**
 * Detects VAAPI hardware acceleration (Linux)
 */
async function detectVAAPI(
  encodersOutput: string,
  ffmpegPath: string,
): Promise<HardwareAcceleration | null> {
  const hasH264 = encodersOutput.includes('h264_vaapi');
  const hasHEVC = encodersOutput.includes('hevc_vaapi');

  if (!hasH264 && !hasHEVC) {
    return null;
  }

  // Test if VAAPI device initialization actually works
  try {
    // First check if device exists
    const fs = require('fs');
    if (!fs.existsSync('/dev/dri/renderD128')) {
      console.warn(
        '⚠️ VAAPI encoder found but /dev/dri/renderD128 does not exist',
      );
      return null;
    }

    // Test device initialization (this is what actually fails in your case)
    const { stdout, stderr } = await execAsync(
      `"${ffmpegPath}" -hide_banner -init_hw_device vaapi=va:/dev/dri/renderD128 -f lavfi -i testsrc=duration=0.1:size=320x240:rate=1 -vf format=nv12,hwupload=derive_device=vaapi -c:v h264_vaapi -f null - 2>&1`,
      { timeout: 5000 },
    );

    // Check for device initialization errors
    const output = (stdout + stderr).toLowerCase();
    const errorPatterns = [
      'no va display',
      'device creation failed',
      'failed to set value',
      'error parsing global options',
      'impossible to convert',
      'error reinitializing',
      'function not implemented',
      'invalid argument',
    ];

    for (const pattern of errorPatterns) {
      if (output.includes(pattern)) {
        console.warn('⚠️ VAAPI device initialization failed');
        console.warn(`   Found error pattern: "${pattern}"`);
        console.warn(
          '   VAAPI hardware encoding is not properly supported on this system',
        );
        return null;
      }
    }

    console.log('✅ VAAPI device initialization and encoding test successful');
  } catch (error) {
    console.warn(
      '⚠️ VAAPI detected in encoder list but device initialization failed',
    );
    console.warn('   Error:', error.message || 'Unknown error');
    return null;
  }

  return {
    type: 'vaapi',
    available: true,
    videoCodec: 'h264_vaapi',
    hevcCodec: hasHEVC ? 'hevc_vaapi' : undefined,
    hwaccel: 'vaapi',
    hwaccelDevice: '/dev/dri/renderD128',
    hwaccelOutputFormat: 'vaapi',
    decoderFlags: [
      '-hwaccel',
      'vaapi',
      '-hwaccel_device',
      '/dev/dri/renderD128',
      '-hwaccel_output_format',
      'vaapi',
    ],
    encoderFlags: ['-compression_level', '2'],
    description: 'VAAPI - Hardware encoding via Intel/AMD GPU on Linux',
  };
}

/**
 * Software fallback (libx264)
 */
function getSoftwareFallback(): HardwareAcceleration {
  return {
    type: 'none',
    available: true,
    videoCodec: 'libx264',
    hevcCodec: 'libx265',
    description: 'Software encoding (libx264) - CPU-based encoding',
    encoderFlags: ['-preset', 'medium', '-crf', '23'],
  };
}

/**
 * Detects all available hardware acceleration methods
 */
export async function detectAllHardwareAcceleration(
  ffmpegPath = 'ffmpeg',
): Promise<HardwareDetectionResult> {
  try {
    console.log('🔍 Detecting hardware acceleration capabilities...');

    // Query FFmpeg for available encoders
    const { stdout } = await execAsync(
      `"${ffmpegPath}" -hide_banner -encoders 2>&1`,
    );

    const allAccelerations: HardwareAcceleration[] = [];

    // Check for each hardware acceleration type (in priority order)
    const nvenc = await detectNVENC(stdout, ffmpegPath);
    if (nvenc) {
      allAccelerations.push(nvenc);
      console.log('✅ NVIDIA NVENC detected');
    }

    const qsv = await detectQSV(stdout, ffmpegPath);
    if (qsv) {
      allAccelerations.push(qsv);
      console.log('✅ Intel Quick Sync detected');
    }

    const videotoolbox = await detectVideoToolbox(stdout, ffmpegPath);
    if (videotoolbox) {
      allAccelerations.push(videotoolbox);
      console.log('✅ Apple VideoToolbox detected');
    }

    const amf = await detectAMF(stdout, ffmpegPath);
    if (amf) {
      allAccelerations.push(amf);
      console.log('✅ AMD AMF detected');
    }

    const vaapi = await detectVAAPI(stdout, ffmpegPath);
    if (vaapi) {
      allAccelerations.push(vaapi);
      console.log('✅ VAAPI detected');
    }

    const fallback = getSoftwareFallback();

    // Primary acceleration is the first one found (highest priority)
    const primary =
      allAccelerations.length > 0 ? allAccelerations[0] : undefined;

    if (primary) {
      console.log(
        `🎮 Primary hardware acceleration: ${primary.type.toUpperCase()}`,
      );
    } else {
      console.log(
        '⚠️ No hardware acceleration available, using software encoding',
      );
    }

    return {
      primary,
      all: allAccelerations,
      fallback,
    };
  } catch (error) {
    console.error('❌ Hardware acceleration detection failed:', error);

    return {
      primary: undefined,
      all: [],
      fallback: getSoftwareFallback(),
    };
  }
}

/**
 * Gets the best available hardware acceleration (cached)
 */
let cachedDetection: HardwareDetectionResult | null = null;
let cachedFfmpegPath: string | null = null;

export async function getHardwareAcceleration(
  ffmpegPath = 'ffmpeg',
): Promise<HardwareDetectionResult> {
  if (!cachedDetection || cachedFfmpegPath !== ffmpegPath) {
    cachedDetection = await detectAllHardwareAcceleration(ffmpegPath);
    cachedFfmpegPath = ffmpegPath;
  }
  return cachedDetection;
}

/**
 * Clears the hardware acceleration cache (useful for re-detection)
 */
export function clearHardwareAccelerationCache(): void {
  cachedDetection = null;
  cachedFfmpegPath = null;
  console.log('🔄 Hardware acceleration cache cleared');
}

/**
 * Gets hardware acceleration for a specific type
 */
export async function getSpecificHardwareAcceleration(
  type: 'nvenc' | 'qsv' | 'amf' | 'videotoolbox' | 'vaapi',
  ffmpegPath = 'ffmpeg',
): Promise<HardwareAcceleration | null> {
  const detection = await getHardwareAcceleration(ffmpegPath);
  return detection.all.find((hw) => hw.type === type) || null;
}

/**
 * Checks if any hardware acceleration is available
 */
export async function hasHardwareAcceleration(
  ffmpegPath = 'ffmpeg',
): Promise<boolean> {
  const detection = await getHardwareAcceleration(ffmpegPath);
  return detection.primary !== undefined;
}

/**
 * Gets codec name for the best available hardware acceleration
 */
export async function getBestVideoCodec(
  preferHEVC = false,
  ffmpegPath = 'ffmpeg',
): Promise<string> {
  const detection = await getHardwareAcceleration(ffmpegPath);

  if (detection.primary) {
    if (preferHEVC && detection.primary.hevcCodec) {
      return detection.primary.hevcCodec;
    }
    return detection.primary.videoCodec;
  }

  return preferHEVC
    ? detection.fallback.hevcCodec!
    : detection.fallback.videoCodec;
}

/**
 * Prints a summary of available hardware acceleration
 */
export async function printHardwareAccelerationSummary(
  ffmpegPath = 'ffmpeg',
): Promise<void> {
  const detection = await getHardwareAcceleration(ffmpegPath);

  console.log('\n📊 Hardware Acceleration Summary:');
  console.log('═'.repeat(60));

  if (detection.primary) {
    console.log(`\n🎮 Primary: ${detection.primary.type.toUpperCase()}`);
    console.log(`   Codec: ${detection.primary.videoCodec}`);
    if (detection.primary.hevcCodec) {
      console.log(`   HEVC: ${detection.primary.hevcCodec}`);
    }
    console.log(`   Description: ${detection.primary.description}`);
  }

  if (detection.all.length > 1) {
    console.log(`\n📋 Other available options:`);
    detection.all.slice(1).forEach((hw) => {
      console.log(`   - ${hw.type.toUpperCase()}: ${hw.videoCodec}`);
    });
  }

  if (detection.all.length === 0) {
    console.log(`\n⚠️  Fallback: ${detection.fallback.description}`);
  }

  console.log('═'.repeat(60) + '\n');
}
