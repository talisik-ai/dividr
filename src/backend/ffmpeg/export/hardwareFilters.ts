import type { HardwareAcceleration } from '../hardwareAccelerationDetector';

/**
 * Hardware-accelerated filter helpers for FFmpeg
 * Provides GPU-accelerated scaling and overlay operations for NVENC/CUDA
 * Falls back to CPU operations with fast_bilinear for other hardware or when unavailable
 */

/**
 * Checks if NVENC/CUDA hardware acceleration is available
 */
export function isNVENCAvailable(hwAccel: HardwareAcceleration | null): boolean {
  return hwAccel?.type === 'nvenc';
}

/**
 * Builds a scale filter with GPU acceleration if available (NVENC/CUDA only)
 * Falls back to CPU scaling with fast_bilinear for other cases
 * 
 * @param inputRef - Input stream reference (e.g., "[input]")
 * @param outputRef - Output stream reference (e.g., "[output]")
 * @param width - Target width
 * @param height - Target height
 * @param hwAccel - Hardware acceleration info (null for CPU)
 * @param options - Optional scaling parameters
 * @returns FFmpeg filter string
 * 
 * @example
 * // GPU scaling (NVENC):
 * "[input]hwupload_cuda,scale_cuda=1920:1080,hwdownload,format=nv12[output]"
 * 
 * // CPU scaling (fallback):
 * "[input]scale=1920:1080:flags=fast_bilinear[output]"
 */
export function buildScaleFilter(
  inputRef: string,
  outputRef: string,
  width: number,
  height: number,
  hwAccel: HardwareAcceleration | null,
  options?: {
    forceOriginalAspectRatio?: 'decrease' | 'increase';
    pad?: boolean;
    padColor?: string;
  },
): string {
  const forceAspect = options?.forceOriginalAspectRatio 
    ? `:force_original_aspect_ratio=${options.forceOriginalAspectRatio}` 
    : '';
  
  if (isNVENCAvailable(hwAccel)) {
    // GPU-accelerated scaling with CUDA
    console.log(`🎮 Using CUDA hardware scaling: ${width}x${height}`);
    
    // Upload to GPU, scale on GPU, download back to CPU
    let filter = `${inputRef}hwupload_cuda,scale_cuda=${width}:${height}${forceAspect}`;
    
    if (options?.pad) {
      const padColor = options.padColor || 'black';
      // Download from GPU for padding (pad filter doesn't have CUDA version)
      filter += `,hwdownload,format=nv12,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${padColor}`;
    } else {
      // Download from GPU
      filter += ',hwdownload,format=nv12';
    }
    
    filter += outputRef;
    return filter;
  } else {
    // CPU scaling with fast_bilinear for speed
    console.log(`💻 Using CPU scaling (fast_bilinear): ${width}x${height}`);
    
    let filter = `${inputRef}scale=${width}:${height}${forceAspect}:flags=fast_bilinear`;
    
    if (options?.pad) {
      const padColor = options.padColor || 'black';
      filter += `,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${padColor}`;
    }
    
    filter += outputRef;
    return filter;
  }
}

/**
 * Builds an overlay filter with GPU acceleration if available (NVENC/CUDA only)
 * Falls back to CPU overlay for other cases
 * 
 * @param baseRef - Base video stream reference (e.g., "[base]")
 * @param overlayRef - Overlay stream reference (e.g., "[overlay]")
 * @param outputRef - Output stream reference (e.g., "[output]")
 * @param x - X position expression (e.g., "(W-w)/2" for center)
 * @param y - Y position expression (e.g., "(H-h)/2" for center)
 * @param hwAccel - Hardware acceleration info (null for CPU)
 * @param options - Optional overlay parameters
 * @returns FFmpeg filter string
 * 
 * @example
 * // GPU overlay (NVENC):
 * "[base]hwupload_cuda[base_cu];[overlay]hwupload_cuda[overlay_cu];[base_cu][overlay_cu]overlay_cuda=x=(W-w)/2:y=(H-h)/2,hwdownload,format=nv12[output]"
 * 
 * // CPU overlay (fallback):
 * "[base][overlay]overlay=(W-w)/2:(H-h)/2[output]"
 */
export function buildOverlayFilter(
  baseRef: string,
  overlayRef: string,
  outputRef: string,
  x: string,
  y: string,
  hwAccel: HardwareAcceleration | null,
  options?: {
    enable?: string;
  },
): string {
  const enableParam = options?.enable ? `:enable='${options.enable}'` : '';
  
  if (isNVENCAvailable(hwAccel)) {
    // GPU-accelerated overlay with CUDA
    console.log(`🎮 Using CUDA hardware overlay`);
    
    // Upload both streams to GPU, overlay on GPU, download result
    // Note: overlay_cuda requires both inputs to be in CUDA format
    return `${baseRef}hwupload_cuda${baseRef}_cu];${overlayRef}hwupload_cuda${overlayRef}_cu];${baseRef}_cu]${overlayRef}_cu]overlay_cuda=x=${x}:y=${y}${enableParam},hwdownload,format=nv12${outputRef}`;
  } else {
    // CPU overlay
    return `${baseRef}${overlayRef}overlay=${x}:${y}${enableParam}${outputRef}`;
  }
}

/**
 * Builds a scale filter for aspect ratio conversion with GPU acceleration
 * Optimized for aspect ratio changes (e.g., 16:9 to 9:16)
 * 
 * @param inputRef - Input stream reference
 * @param outputRef - Output stream reference
 * @param width - Target width
 * @param height - Target height
 * @param hwAccel - Hardware acceleration info
 * @returns FFmpeg filter string
 */
export function buildAspectRatioScaleFilter(
  inputRef: string,
  outputRef: string,
  width: number,
  height: number,
  hwAccel: HardwareAcceleration | null,
): string {
  return buildScaleFilter(
    inputRef,
    outputRef,
    width,
    height,
    hwAccel,
    { 
      forceOriginalAspectRatio: 'decrease', 
      pad: true, 
      padColor: 'black' 
    },
  );
}

/**
 * Builds a crop filter (CPU only - no GPU version available)
 * 
 * @param inputRef - Input stream reference
 * @param outputRef - Output stream reference
 * @param width - Crop width
 * @param height - Crop height
 * @param x - Crop X position
 * @param y - Crop Y position
 * @returns FFmpeg filter string
 */
export function buildCropFilter(
  inputRef: string,
  outputRef: string,
  width: number,
  height: number,
  x: number,
  y: number,
): string {
  return `${inputRef}crop=${width}:${height}:${x}:${y},setsar=1${outputRef}`;
}

/**
 * Builds a combined crop + scale filter for aspect ratio conversion
 * Uses CPU for both operations (crop has no GPU version)
 * 
 * @param inputRef - Input stream reference
 * @param outputRef - Output stream reference
 * @param cropWidth - Crop width
 * @param cropHeight - Crop height
 * @param cropX - Crop X position
 * @param cropY - Crop Y position
 * @param scaleWidth - Final scale width
 * @param scaleHeight - Final scale height
 * @param hwAccel - Hardware acceleration info (used for scale only)
 * @returns FFmpeg filter string
 */
export function buildCropAndScaleFilter(
  inputRef: string,
  outputRef: string,
  cropWidth: number,
  cropHeight: number,
  cropX: number,
  cropY: number,
  scaleWidth: number,
  scaleHeight: number,
  hwAccel: HardwareAcceleration | null,
): string {
  // Crop is CPU-only, but we can use GPU for the scale afterwards
  if (isNVENCAvailable(hwAccel)) {
    console.log(`🎮 Using crop (CPU) + scale_cuda (GPU): crop ${cropWidth}x${cropHeight} → scale ${scaleWidth}x${scaleHeight}`);
    return `${inputRef}crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},hwupload_cuda,scale_cuda=${scaleWidth}:${scaleHeight},hwdownload,format=nv12,setsar=1${outputRef}`;
  } else {
    console.log(`💻 Using crop + scale (CPU, fast_bilinear): crop ${cropWidth}x${cropHeight} → scale ${scaleWidth}x${scaleHeight}`);
    return `${inputRef}crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},scale=${scaleWidth}:${scaleHeight}:flags=fast_bilinear,setsar=1${outputRef}`;
  }
}

/**
 * Gets the scaling algorithm name for logging
 */
export function getScalingAlgorithmName(hwAccel: HardwareAcceleration | null): string {
  if (isNVENCAvailable(hwAccel)) {
    return 'CUDA (GPU)';
  }
  return 'fast_bilinear (CPU)';
}

