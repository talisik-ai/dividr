/**
 * Filename Sanitization Utility
 * Sanitizes filenames for safe use with FFmpeg and filesystem operations
 * Handles special characters, non-ASCII characters, and edge cases
 */

/**
 * Sanitizes a filename for safe use with FFmpeg and filesystem operations
 *
 * Rules:
 * - Removes/replaces characters unsafe for FFmpeg or filesystems: @ # % & ? * " < > | : / \
 * - Converts spaces to underscores for better compatibility
 * - Transliterates common accented characters to ASCII equivalents
 * - Removes other non-ASCII characters
 * - Collapses multiple consecutive underscores/hyphens
 * - Trims leading/trailing underscores and hyphens
 * - Ensures the result is not empty (returns default if needed)
 * - Preserves readability while ensuring FFmpeg compatibility
 *
 * @param filename - The filename to sanitize (without extension)
 * @param fallback - Fallback name if sanitization results in empty string
 * @returns Sanitized filename safe for FFmpeg and filesystem use
 *
 * @example
 * sanitizeFilename("My Video @ 2024") // "My_Video_2024"
 * sanitizeFilename("Project #1 & #2") // "Project_1_2"
 * sanitizeFilename("Café Français") // "Cafe_Francais"
 * sanitizeFilename("???") // "Untitled_Project"
 */
export function sanitizeFilename(
  filename: string,
  fallback = 'Untitled_Project',
): string {
  if (!filename || typeof filename !== 'string') {
    return fallback;
  }

  let sanitized = filename.trim();

  // Step 1: Transliterate common accented characters to ASCII
  sanitized = transliterateToAscii(sanitized);

  // Step 2: Replace unsafe characters with underscores or remove them
  // Characters unsafe for FFmpeg or common filesystems:
  // @ # % & ? * " < > | : / \ and other special symbols
  sanitized = sanitized.replace(/[@#%&?*"<>|:/\\[\]{}();!+=]/g, '_');

  // Step 3: Convert spaces to underscores for better CLI compatibility
  sanitized = sanitized.replace(/\s+/g, '_');

  // Step 4: Remove any remaining non-ASCII characters (anything outside printable ASCII range)
  // Keep alphanumeric, underscore, hyphen, period, and common safe punctuation
  sanitized = sanitized.replace(/[^\x20-\x7E]/g, '');

  // Step 5: Remove additional unsafe characters that passed through
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Step 6: Collapse multiple consecutive underscores or hyphens
  sanitized = sanitized.replace(/_{2,}/g, '_');
  sanitized = sanitized.replace(/-{2,}/g, '-');

  // Step 7: Remove leading/trailing underscores, hyphens, and periods
  sanitized = sanitized.replace(/^[._-]+|[._-]+$/g, '');

  // Step 8: If result is empty or too short, use fallback
  if (!sanitized || sanitized.length === 0) {
    return fallback;
  }

  // Step 9: Truncate if too long (most filesystems support 255 chars, leave room for extension)
  const maxLength = 200;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).replace(/[._-]+$/, '');
  }

  return sanitized;
}

/**
 * Transliterates common accented and special characters to ASCII equivalents
 * This preserves readability while ensuring ASCII-only output
 */
function transliterateToAscii(text: string): string {
  const transliterationMap: Record<string, string> = {
    // Latin extended characters
    À: 'A',
    Á: 'A',
    Â: 'A',
    Ã: 'A',
    Ä: 'A',
    Å: 'A',
    à: 'a',
    á: 'a',
    â: 'a',
    ã: 'a',
    ä: 'a',
    å: 'a',
    È: 'E',
    É: 'E',
    Ê: 'E',
    Ë: 'E',
    è: 'e',
    é: 'e',
    ê: 'e',
    ë: 'e',
    Ì: 'I',
    Í: 'I',
    Î: 'I',
    Ï: 'I',
    ì: 'i',
    í: 'i',
    î: 'i',
    ï: 'i',
    Ò: 'O',
    Ó: 'O',
    Ô: 'O',
    Õ: 'O',
    Ö: 'O',
    Ø: 'O',
    ò: 'o',
    ó: 'o',
    ô: 'o',
    õ: 'o',
    ö: 'o',
    ø: 'o',
    Ù: 'U',
    Ú: 'U',
    Û: 'U',
    Ü: 'U',
    ù: 'u',
    ú: 'u',
    û: 'u',
    ü: 'u',
    Ý: 'Y',
    ý: 'y',
    ÿ: 'y',
    Ñ: 'N',
    ñ: 'n',
    Ç: 'C',
    ç: 'c',
    Æ: 'AE',
    æ: 'ae',
    Œ: 'OE',
    œ: 'oe',
    ß: 'ss',
    // Common quotation marks
    "'": "'",
    '"': '"',
    '«': '"',
    '»': '"',
    '‹': "'",
    '›': "'",
    // Dashes
    '–': '-',
    '—': '-',
    '―': '-',
    // Other common symbols
    '©': '(c)',
    '®': '(r)',
    '™': '(tm)',
    '°': 'deg',
    '±': '+/-',
    '×': 'x',
    '÷': '/',
  };

  let result = text;
  for (const [char, replacement] of Object.entries(transliterationMap)) {
    result = result.replace(new RegExp(char, 'g'), replacement);
  }
  return result;
}

/**
 * Sanitizes a full file path including extension
 * Separates the extension and sanitizes only the base filename
 *
 * @param fullFilename - Filename with extension (e.g., "My Video.mp4")
 * @param fallback - Fallback name if sanitization results in empty string
 * @returns Sanitized filename with original extension preserved
 *
 * @example
 * sanitizeFilenameWithExtension("My Video @ 2024.mp4") // "My_Video_2024.mp4"
 * sanitizeFilenameWithExtension("Café.mov") // "Cafe.mov"
 */
export function sanitizeFilenameWithExtension(
  fullFilename: string,
  fallback = 'Untitled_Project',
): string {
  if (!fullFilename || typeof fullFilename !== 'string') {
    return `${fallback}.mp4`;
  }

  // Extract extension (everything after the last dot)
  const lastDotIndex = fullFilename.lastIndexOf('.');
  let baseName: string;
  let extension: string;

  if (lastDotIndex > 0 && lastDotIndex < fullFilename.length - 1) {
    baseName = fullFilename.substring(0, lastDotIndex);
    extension = fullFilename.substring(lastDotIndex); // Includes the dot
  } else {
    baseName = fullFilename;
    extension = '';
  }

  // Sanitize the base filename
  const sanitizedBase = sanitizeFilename(baseName, fallback);

  // Sanitize the extension (remove any special characters, keep only alphanumeric)
  const sanitizedExtension = extension
    .replace(/[^a-zA-Z0-9.]/g, '')
    .toLowerCase();

  return sanitizedBase + sanitizedExtension;
}

/**
 * Validates if a filename is safe for FFmpeg without modification
 * Useful for checking if sanitization is needed
 *
 * @param filename - The filename to validate
 * @returns true if filename is already safe, false if it needs sanitization
 */
export function isFilenameSafe(filename: string): boolean {
  if (
    !filename ||
    typeof filename !== 'string' ||
    filename.trim().length === 0
  ) {
    return false;
  }

  // Check for any unsafe characters
  const unsafePattern = /[@#%&?*"<>|:/\\[\]{}();!+=\s]|[^\x20-\x7E]/;
  return !unsafePattern.test(filename);
}

/**
 * Preview what a sanitized filename will look like
 * Useful for showing users what the exported filename will be
 *
 * @param filename - The original filename
 * @param extension - Optional file extension to append
 * @returns Object with original and sanitized filenames, plus a flag if changed
 */
export function previewSanitizedFilename(
  filename: string,
  extension = '.mp4',
): {
  original: string;
  sanitized: string;
  changed: boolean;
  fullSanitized: string;
} {
  const original = filename;
  const sanitized = sanitizeFilename(filename);
  const fullSanitized = sanitized + extension;
  const changed = original !== sanitized;

  return {
    original,
    sanitized,
    changed,
    fullSanitized,
  };
}
