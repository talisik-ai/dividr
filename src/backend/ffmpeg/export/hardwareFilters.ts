import type { HardwareAcceleration } from './hardwareAccelerationDetector';

/**
 * Hardware-accelerated filter helpers for FFmpeg
 * 
 * Strategy for GPU acceleration (NVENC/CUDA):
 * - Upload to GPU once at the start
 * - Keep frames on GPU for all operations (scale_cuda, overlay_cuda, etc.)
 * - Download from GPU once at the end
 * - This minimizes expensive CPU↔GPU transfers
 * 
 * For CPU fallback:
 * - Uses fast_bilinear scaling algorithm (20-40% faster than default)
 * - Standard overlay operations
 */

/**
 * Checks if NVENC/CUDA hardware acceleration is available
 * NVENC uses CUDA for hardware-accelerated filters (scale_cuda, overlay_cuda)
 */
export function isNVENCAvailable(hwAccel: HardwareAcceleration | null): boolean {
  return hwAccel?.type === 'nvenc' && hwAccel?.hwaccel === 'cuda';
}

/**
 * Checks if CUDA filters are supported
 * Returns true if hardware acceleration supports CUDA-based filters
 */
export function supportsCUDAFilters(hwAccel: HardwareAcceleration | null): boolean {
  // Only NVENC supports CUDA filters (scale_cuda, overlay_cuda, etc.)
  return hwAccel?.type === 'nvenc' && hwAccel?.hwaccel === 'cuda';
}

/**
 * Builds a scale filter with GPU acceleration (CUDA) or CPU fallback
 * 
 * IMPORTANT: For GPU, this assumes input is ALREADY on GPU (uploaded via hwupload_cuda).
 * It does NOT download - caller must handle hwdownload at the end of the pipeline.
 * 
 * @param inputRef - Input stream reference (e.g., "[input]")
 * @param outputRef - Output stream reference (e.g., "[output]")
 * @param width - Target width
 * @param height - Target height
 * @param hwAccel - Hardware acceleration info
 * @param options - Optional scaling parameters
 * @returns FFmpeg filter string
 * 
 * @example
 * // GPU (assumes input already on GPU): "[input_gpu]scale_cuda=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black[output_gpu]"
 * // CPU: "[input]scale=1920:1080:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[output]"
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
  
  if (supportsCUDAFilters(hwAccel)) {
    // GPU scaling - assumes input is already on GPU
    console.log(`🎮 Using CUDA hardware scaling: ${width}x${height} (NVENC with CUDA filters)`);
    
    let filter = `${inputRef}scale_cuda=${width}:${height}${forceAspect}`;
    
    if (options?.pad) {
      const padColor = options.padColor || 'black';
      // scale_cuda supports padding directly
      filter += `,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`;
    }
    
    filter += outputRef;
    return filter;
  } else {
    // CPU scaling with fast_bilinear
    const hwType = hwAccel?.type || 'none';
    console.log(`💻 Using CPU scaling (fast_bilinear): ${width}x${height} (hardware: ${hwType})`);
    
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
 * Builds an overlay filter with GPU acceleration (CUDA) or CPU fallback
 * 
 * IMPORTANT: For GPU, this assumes BOTH inputs are ALREADY on GPU.
 * It does NOT download - caller must handle hwdownload at the end of the pipeline.
 * 
 * @param baseRef - Base video stream reference (e.g., "[base]")
 * @param overlayRef - Overlay stream reference (e.g., "[overlay]")
 * @param outputRef - Output stream reference (e.g., "[output]")
 * @param x - X position expression (e.g., "(W-w)/2" for center)
 * @param y - Y position expression (e.g., "(H-h)/2" for center)
 * @param hwAccel - Hardware acceleration info
 * @param options - Optional overlay parameters
 * @returns FFmpeg filter string
 * 
 * @example
 * // GPU (assumes both inputs on GPU): "[base_gpu][overlay_gpu]overlay_cuda=(W-w)/2:(H-h)/2[output_gpu]"
 * // CPU: "[base][overlay]overlay=(W-w)/2:(H-h)/2[output]"
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
  
  if (supportsCUDAFilters(hwAccel)) {
    // GPU overlay - assumes both inputs are already on GPU
    console.log(`🎮 Using CUDA hardware overlay (NVENC with CUDA filters)`);
    return `${baseRef}${overlayRef}overlay_cuda=${x}:${y}${enableParam}${outputRef}`;
  } else {
    // CPU overlay
    const hwType = hwAccel?.type || 'none';
    console.log(`💻 Using CPU overlay (hardware: ${hwType})`);
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
  // Always use CPU for crop + scale
  // GPU upload/download overhead negates any scaling benefit
  console.log(`💻 Using crop + scale (CPU, fast_bilinear): crop ${cropWidth}x${cropHeight} → scale ${scaleWidth}x${scaleHeight}`);
  return `${inputRef}crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},scale=${scaleWidth}:${scaleHeight}:flags=fast_bilinear,setsar=1${outputRef}`;
}

/**
 * Uploads a frame to GPU (CUDA)
 * Only call this once at the start of GPU pipeline
 * 
 * @param inputRef - Input stream reference (CPU frame)
 * @param outputRef - Output stream reference (GPU frame)
 * @returns FFmpeg filter string
 * 
 * @example
 * // "[input]hwupload_cuda[input_gpu]"
 */
export function buildGPUUpload(
  inputRef: string,
  outputRef: string,
): string {
  return `${inputRef}hwupload_cuda${outputRef}`;
}

/**
 * Downloads a frame from GPU (CUDA)
 * Only call this once at the end of GPU pipeline
 * 
 * @param inputRef - Input stream reference (GPU frame)
 * @param outputRef - Output stream reference (CPU frame)
 * @returns FFmpeg filter string
 * 
 * @example
 * // "[input_gpu]hwdownload,format=nv12[output]"
 */
export function buildGPUDownload(
  inputRef: string,
  outputRef: string,
): string {
  return `${inputRef}hwdownload,format=nv12${outputRef}`;
}

/**
 * Gets the scaling algorithm name for logging
 */
export function getScalingAlgorithmName(hwAccel: HardwareAcceleration | null): string {
  if (supportsCUDAFilters(hwAccel)) {
    return 'CUDA (GPU)';
  }
  return 'fast_bilinear (CPU)';
}

/**
 * Gets a description of the current hardware acceleration status
 */
export function getHardwareAccelerationStatus(hwAccel: HardwareAcceleration | null): string {
  if (!hwAccel || hwAccel.type === 'none') {
    return 'No hardware acceleration (CPU only)';
  }
  
  if (supportsCUDAFilters(hwAccel)) {
    return `NVENC with CUDA filters (GPU-accelerated encoding and filters)`;
  }
  
  return `${hwAccel.type.toUpperCase()} (GPU-accelerated encoding only, CPU filters)`;
}

