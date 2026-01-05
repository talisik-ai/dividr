/**
 * Content Signature Utility
 *
 * Generates partial file hashes for duplicate detection.
 * Uses first 64KB + last 64KB + file size for efficient large file handling.
 */

export interface ContentSignature {
  partialHash: string; // SHA-256 hash of first64KB + last64KB + fileSize
  fileSize: number;
  fileName: string;
  generatedAt: number;
}

const CHUNK_SIZE = 65536; // 64KB

/**
 * Reads a chunk of bytes from a File object
 */
async function readFileChunk(
  file: File,
  start: number,
  length: number,
): Promise<Uint8Array> {
  const end = Math.min(start + length, file.size);
  const slice = file.slice(start, end);
  return new Uint8Array(await slice.arrayBuffer());
}

/**
 * Generates a content signature for a File object.
 * Uses partial hashing (first 64KB + last 64KB + file size) for performance.
 */
export async function generateContentSignature(
  file: File,
): Promise<ContentSignature> {
  // Read first chunk
  const firstChunk = await readFileChunk(file, 0, CHUNK_SIZE);

  // Read last chunk (may overlap with first for small files)
  const lastStart = Math.max(0, file.size - CHUNK_SIZE);
  const lastChunk = await readFileChunk(file, lastStart, CHUNK_SIZE);

  // Combine chunks with file size for hashing
  // Format: [first64KB][last64KB][8-byte file size]
  const combined = new Uint8Array(firstChunk.length + lastChunk.length + 8);
  combined.set(firstChunk, 0);
  combined.set(lastChunk, firstChunk.length);

  // Append file size as 8 bytes (BigUint64)
  const sizeView = new DataView(combined.buffer);
  sizeView.setBigUint64(
    firstChunk.length + lastChunk.length,
    BigInt(file.size),
    false, // big-endian
  );

  // Generate SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const partialHash = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    partialHash,
    fileSize: file.size,
    fileName: file.name,
    generatedAt: Date.now(),
  };
}

/**
 * Converts a base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a content signature from a file path using Electron IPC.
 * Uses the backend to read file chunks for files not loaded as File objects.
 */
export async function generateContentSignatureFromPath(
  filePath: string,
): Promise<ContentSignature | null> {
  try {
    // Get file size using getFileStream with a minimal read (0 bytes)
    // The 'total' field in the response gives us the file size
    const sizeCheck = await window.electronAPI.getFileStream?.(filePath, 0, 1);
    if (!sizeCheck?.success || sizeCheck.total === undefined) {
      console.warn(`Could not get file size for: ${filePath}`);
      return null;
    }

    const fileSize = sizeCheck.total;
    const fileName = filePath.split(/[/\\]/).pop() || filePath;

    // Read first chunk (0 to CHUNK_SIZE)
    const firstChunkResult = await window.electronAPI.getFileStream?.(
      filePath,
      0,
      Math.min(CHUNK_SIZE, fileSize),
    );
    if (!firstChunkResult?.success || !firstChunkResult.data) {
      console.warn(`Could not read first chunk for: ${filePath}`);
      return null;
    }
    const firstChunk = base64ToUint8Array(firstChunkResult.data);

    // Read last chunk
    const lastStart = Math.max(0, fileSize - CHUNK_SIZE);
    const lastChunkResult = await window.electronAPI.getFileStream?.(
      filePath,
      lastStart,
      fileSize,
    );
    if (!lastChunkResult?.success || !lastChunkResult.data) {
      console.warn(`Could not read last chunk for: ${filePath}`);
      return null;
    }
    const lastChunk = base64ToUint8Array(lastChunkResult.data);

    // Combine chunks with file size for hashing
    const combined = new Uint8Array(firstChunk.length + lastChunk.length + 8);
    combined.set(firstChunk, 0);
    combined.set(lastChunk, firstChunk.length);

    // Append file size as 8 bytes
    const sizeView = new DataView(combined.buffer);
    sizeView.setBigUint64(
      firstChunk.length + lastChunk.length,
      BigInt(fileSize),
      false,
    );

    // Generate SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const partialHash = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      partialHash,
      fileSize,
      fileName,
      generatedAt: Date.now(),
    };
  } catch (error) {
    console.error(`Error generating content signature for ${filePath}:`, error);
    return null;
  }
}

/**
 * Compares two content signatures to check if they represent the same file.
 */
export function signaturesMatch(
  sig1: ContentSignature | undefined,
  sig2: ContentSignature | undefined,
): boolean {
  if (!sig1 || !sig2) return false;
  return (
    sig1.partialHash === sig2.partialHash && sig1.fileSize === sig2.fileSize
  );
}
