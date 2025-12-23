/**
 * Runtime Download Manager
 *
 * Handles on-demand download and installation of the dividr-tools runtime
 * from GitHub Releases. The runtime provides Transcription and Noise Reduction
 * features using Python-based libraries (faster-whisper, noisereduce).
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { app } from 'electron';
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { IncomingMessage } from 'http';
import { get as httpsGet } from 'https';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface RuntimeStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  needsUpdate: boolean;
  requiredVersion: string;
}

export interface DownloadProgress {
  stage:
    | 'fetching'
    | 'downloading'
    | 'extracting'
    | 'verifying'
    | 'complete'
    | 'error';
  progress: number; // 0-100
  bytesDownloaded?: number;
  totalBytes?: number;
  speed?: number; // bytes/sec
  message?: string;
  error?: string;
}

interface VersionMetadata {
  version: string;
  installedAt: string;
  platform: string;
  checksum: string;
  requiredByApp: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  assets: GitHubAsset[];
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

type ProgressCallback = (progress: DownloadProgress) => void;

// ============================================================================
// Constants
// ============================================================================

// The required runtime version - update this when releasing new app versions
const REQUIRED_VERSION = '1.0.0';

// GitHub repository for dividr-tools releases
// Format: owner/repo
const GITHUB_REPO = 'talisik-ai/dividr-binary';

// Installation paths
const RUNTIME_DIR_NAME = 'dividr-tools';
const VERSION_FILE_NAME = 'version.json';

// Platform-specific executable names
const EXECUTABLE_NAMES: Record<string, string> = {
  win32: 'dividr-tools.exe',
  darwin: 'dividr-tools',
  linux: 'dividr-tools',
};

// ============================================================================
// State
// ============================================================================

let currentDownloadController: AbortController | null = null;
let isDownloading = false;

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get the installation directory for the runtime
 */
const getInstallDir = (): string => {
  return path.join(app.getPath('userData'), RUNTIME_DIR_NAME);
};

/**
 * Get platform-specific subdirectory
 */
const getPlatformDir = (): string => {
  return path.join(getInstallDir(), process.platform);
};

/**
 * Get the path to the runtime executable
 */
export const getRuntimeExecutablePath = (): string | null => {
  const platform = process.platform;
  const exeName = EXECUTABLE_NAMES[platform];

  if (!exeName) {
    console.error(`Unsupported platform: ${platform}`);
    return null;
  }

  const exePath = path.join(getPlatformDir(), exeName);

  if (existsSync(exePath)) {
    return exePath;
  }

  return null;
};

/**
 * Get the path to the version metadata file
 */
const getVersionFilePath = (): string => {
  return path.join(getInstallDir(), VERSION_FILE_NAME);
};

// ============================================================================
// Version Management
// ============================================================================

/**
 * Read installed version metadata
 */
const readVersionMetadata = (): VersionMetadata | null => {
  const versionFile = getVersionFilePath();

  if (!existsSync(versionFile)) {
    return null;
  }

  try {
    const content = readFileSync(versionFile, 'utf8');
    return JSON.parse(content) as VersionMetadata;
  } catch (error) {
    console.error('Failed to read version metadata:', error);
    return null;
  }
};

/**
 * Write version metadata after installation
 */
const writeVersionMetadata = (version: string, checksum: string): void => {
  const metadata: VersionMetadata = {
    version,
    installedAt: new Date().toISOString(),
    platform: process.platform,
    checksum,
    requiredByApp: REQUIRED_VERSION,
  };

  const versionFile = getVersionFilePath();
  writeFileSync(versionFile, JSON.stringify(metadata, null, 2), 'utf8');
};

/**
 * Compare versions (semver-like comparison)
 */
const compareVersions = (a: string, b: string): number => {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
};

// ============================================================================
// Status Check
// ============================================================================

/**
 * Check the current runtime installation status
 */
export const checkRuntimeStatus = async (): Promise<RuntimeStatus> => {
  const exePath = getRuntimeExecutablePath();
  const metadata = readVersionMetadata();

  if (!exePath || !metadata) {
    return {
      installed: false,
      version: null,
      path: null,
      needsUpdate: false,
      requiredVersion: REQUIRED_VERSION,
    };
  }

  // Check if the installed version meets requirements
  const needsUpdate = compareVersions(metadata.version, REQUIRED_VERSION) < 0;

  return {
    installed: true,
    version: metadata.version,
    path: exePath,
    needsUpdate,
    requiredVersion: REQUIRED_VERSION,
  };
};

// ============================================================================
// GitHub API
// ============================================================================

/**
 * Fetch release information from GitHub
 */
const fetchGitHubRelease = async (
  version?: string,
): Promise<{ release: GitHubRelease; asset: GitHubAsset }> => {
  const platform = process.platform;
  const apiUrl = version
    ? `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v${version}`
    : `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': `DiviDr/${app.getVersion()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    };

    httpsGet(apiUrl, options, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          httpsGet(redirectUrl, options, (redirectResponse) => {
            handleGitHubResponse(redirectResponse, platform, resolve, reject);
          }).on('error', reject);
          return;
        }
      }

      handleGitHubResponse(response, platform, resolve, reject);
    }).on('error', reject);
  });
};

/**
 * Handle GitHub API response
 */
const handleGitHubResponse = (
  response: IncomingMessage,
  platform: string,
  resolve: (value: { release: GitHubRelease; asset: GitHubAsset }) => void,
  reject: (reason: Error) => void,
): void => {
  if (response.statusCode !== 200) {
    reject(new Error(`GitHub API returned status ${response.statusCode}`));
    return;
  }

  let data = '';
  response.on('data', (chunk) => (data += chunk));
  response.on('end', () => {
    try {
      const release = JSON.parse(data) as GitHubRelease;

      // Find the asset for the current platform
      const assetName = `dividr-tools-v${release.tag_name.replace(/^v/, '')}-${platform}.zip`;
      const asset = release.assets.find((a) => a.name === assetName);

      if (!asset) {
        // Try alternative naming
        const altAssetName = `dividr-tools-${platform}.zip`;
        const altAsset = release.assets.find((a) => a.name === altAssetName);

        if (!altAsset) {
          reject(
            new Error(
              `No asset found for platform ${platform}. Expected: ${assetName}`,
            ),
          );
          return;
        }

        resolve({ release, asset: altAsset });
        return;
      }

      resolve({ release, asset });
    } catch (error) {
      reject(new Error(`Failed to parse GitHub response: ${error}`));
    }
  });
};

// ============================================================================
// Download
// ============================================================================

/**
 * Download a file with progress reporting
 */
const downloadFile = async (
  url: string,
  destPath: string,
  totalSize: number,
  onProgress: ProgressCallback,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    currentDownloadController = new AbortController();

    const file = createWriteStream(destPath);
    let downloadedBytes = 0;
    let lastProgressTime = Date.now();
    let lastDownloadedBytes = 0;

    const handleResponse = (response: IncomingMessage) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          httpsGet(redirectUrl, handleResponse).on('error', (err) => {
            file.close();
            reject(err);
          });
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      // Use content-length from response if available
      const contentLength = parseInt(
        response.headers['content-length'] || '0',
        10,
      );
      const actualTotalSize = contentLength || totalSize;

      response.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;

        // Calculate speed every 500ms
        const now = Date.now();
        const timeDiff = now - lastProgressTime;

        let speed = 0;
        if (timeDiff >= 500) {
          const bytesDiff = downloadedBytes - lastDownloadedBytes;
          speed = (bytesDiff / timeDiff) * 1000;
          lastProgressTime = now;
          lastDownloadedBytes = downloadedBytes;
        }

        const progress =
          actualTotalSize > 0
            ? Math.round((downloadedBytes / actualTotalSize) * 100)
            : 0;

        onProgress({
          stage: 'downloading',
          progress,
          bytesDownloaded: downloadedBytes,
          totalBytes: actualTotalSize,
          speed: speed > 0 ? speed : undefined,
          message: `Downloading... ${formatBytes(downloadedBytes)} / ${formatBytes(actualTotalSize)}`,
        });
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });

      file.on('error', (err) => {
        file.close();
        unlinkSync(destPath);
        reject(err);
      });
    };

    httpsGet(url, handleResponse).on('error', (err) => {
      file.close();
      if (existsSync(destPath)) {
        unlinkSync(destPath);
      }
      reject(err);
    });
  });
};

/**
 * Format bytes to human-readable string
 */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ============================================================================
// Extraction
// ============================================================================

/**
 * Extract ZIP file to destination directory
 */
const extractZip = async (
  zipPath: string,
  destDir: string,
  onProgress: ProgressCallback,
): Promise<void> => {
  onProgress({
    stage: 'extracting',
    progress: 0,
    message: 'Extracting files...',
  });

  // Ensure destination directory exists
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const platform = process.platform;

  try {
    if (platform === 'win32') {
      // Use tar on Windows 10+ (built-in, more reliable than PowerShell)
      // tar -xf extracts files from archive, -C specifies destination
      execSync(`tar -xf "${zipPath}" -C "${destDir}"`, {
        windowsHide: true,
        stdio: 'pipe',
      });
    } else {
      // Use unzip on macOS/Linux
      execSync(`unzip -o "${zipPath}" -d "${destDir}"`, {
        stdio: 'pipe',
      });
    }

    onProgress({
      stage: 'extracting',
      progress: 100,
      message: 'Extraction complete',
    });
  } catch (error) {
    throw new Error(
      `Failed to extract ZIP file: ${error instanceof Error ? error.message : error}`,
    );
  }
};

// ============================================================================
// Verification
// ============================================================================

/**
 * Calculate SHA256 checksum of a file
 */
const calculateChecksum = (filePath: string): string => {
  const fileBuffer = readFileSync(filePath);
  const hash = createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
};

/**
 * Verify the installation is complete and executable
 */
export const verifyInstallation = async (): Promise<boolean> => {
  const exePath = getRuntimeExecutablePath();

  if (!exePath || !existsSync(exePath)) {
    console.error('Runtime executable not found');
    return false;
  }

  try {
    const stats = statSync(exePath);

    // Check file has reasonable size (at least 1MB for a PyInstaller bundle)
    if (stats.size < 1024 * 1024) {
      console.error('Runtime executable too small, likely corrupted');
      return false;
    }

    // On Unix, check/set executable permission
    if (process.platform !== 'win32') {
      const isExecutable = (stats.mode & 0o111) !== 0;
      if (!isExecutable) {
        chmodSync(exePath, 0o755);
      }
    }

    console.log(
      `Runtime verified: ${exePath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`,
    );
    return true;
  } catch (error) {
    console.error('Runtime verification failed:', error);
    return false;
  }
};

/**
 * Helper to remove directory with retry for locked files
 */
const rmSyncWithRetry = (dirPath: string, maxRetries = 3): void => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const isEBUSY =
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'EBUSY';
      if (isEBUSY && i < maxRetries - 1) {
        // Wait a bit and retry
        console.log(
          `Directory locked, retrying in 1s... (${i + 1}/${maxRetries})`,
        );
        execSync('timeout /t 1 /nobreak >nul 2>&1 || sleep 1', {
          stdio: 'ignore',
        });
      } else {
        throw error;
      }
    }
  }
};

// ============================================================================
// Installation
// ============================================================================

/**
 * Download and install the runtime
 */
export const downloadRuntime = async (
  onProgress: ProgressCallback,
): Promise<{ success: boolean; error?: string }> => {
  if (isDownloading) {
    return {
      success: false,
      error: 'Download already in progress',
    };
  }

  isDownloading = true;

  try {
    // Step 1: Fetch release info
    onProgress({
      stage: 'fetching',
      progress: 0,
      message: 'Fetching release information...',
    });

    const { release, asset } = await fetchGitHubRelease(REQUIRED_VERSION);
    const version = release.tag_name.replace(/^v/, '');

    console.log(`Found release: ${release.name}, asset: ${asset.name}`);

    onProgress({
      stage: 'fetching',
      progress: 100,
      message: `Found version ${version}`,
    });

    // Step 2: Prepare directories
    const installDir = getInstallDir();
    const platformDir = getPlatformDir();
    const tempDir = path.join(installDir, 'temp');

    // Create temp directory if it doesn't exist
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    // Step 3: Download (skip if ZIP already exists with correct size)
    const zipPath = path.join(tempDir, asset.name);
    let skipDownload = false;

    if (existsSync(zipPath)) {
      const existingSize = statSync(zipPath).size;
      if (existingSize === asset.size) {
        console.log('ZIP already downloaded, skipping download...');
        skipDownload = true;
        onProgress({
          stage: 'downloading',
          progress: 100,
          bytesDownloaded: existingSize,
          totalBytes: asset.size,
          message: 'Using cached download...',
        });
      } else {
        // Partial/corrupted download, remove it
        unlinkSync(zipPath);
      }
    }

    if (!skipDownload) {
      await downloadFile(
        asset.browser_download_url,
        zipPath,
        asset.size,
        onProgress,
      );
    }

    // Step 4: Calculate checksum before extraction
    const checksum = calculateChecksum(zipPath);
    console.log(`Downloaded file checksum: ${checksum}`);

    // Step 5: Extract
    // Clean up existing platform directory (with retry for locked files)
    if (existsSync(platformDir)) {
      rmSyncWithRetry(platformDir);
    }

    await extractZip(zipPath, platformDir, onProgress);

    // Step 6: Verify
    onProgress({
      stage: 'verifying',
      progress: 50,
      message: 'Verifying installation...',
    });

    const isValid = await verifyInstallation();

    if (!isValid) {
      throw new Error('Installation verification failed');
    }

    // Step 7: Write version metadata
    writeVersionMetadata(version, checksum);

    // Step 8: Cleanup
    rmSync(tempDir, { recursive: true, force: true });

    onProgress({
      stage: 'complete',
      progress: 100,
      message: 'Installation complete!',
    });

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    console.error('Runtime download failed:', error);

    onProgress({
      stage: 'error',
      progress: 0,
      message: errorMessage,
      error: errorMessage,
    });

    // Don't cleanup temp files on error - allows retry without re-downloading
    // Temp files are cleaned up on successful install or manual cancel

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    isDownloading = false;
    currentDownloadController = null;
  }
};

/**
 * Cancel an in-progress download
 */
export const cancelDownload = async (): Promise<{ success: boolean }> => {
  if (currentDownloadController) {
    currentDownloadController.abort();
    currentDownloadController = null;
  }

  isDownloading = false;

  // Cleanup temp files
  try {
    const tempDir = path.join(getInstallDir(), 'temp');
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }

  return { success: true };
};

/**
 * Remove the installed runtime
 */
export const removeRuntime = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    const installDir = getInstallDir();

    if (existsSync(installDir)) {
      rmSync(installDir, { recursive: true, force: true });
    }

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Check if a download is in progress
 */
export const isDownloadInProgress = (): boolean => {
  return isDownloading;
};
