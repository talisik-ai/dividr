/**
 * Text Wrapping Utilities
 * Handles text normalization and wrapping for export
 *
 * This module provides:
 * 1. Line break normalization (CRLF → LF)
 * 2. Text wrapping based on width constraints (converts visual CSS wrapping to explicit \n)
 */

interface TextWrapOptions {
  /** Font family (e.g., 'Inter', 'Arial') */
  fontFamily: string;
  /** Font size in pixels */
  fontSize: number;
  /** Font weight (e.g., '400', '700', 'bold') */
  fontWeight?: string | number;
  /** Font style (e.g., 'normal', 'italic') */
  fontStyle?: string;
  /** Letter spacing in pixels */
  letterSpacing?: number;
  /** Maximum width in pixels for wrapping */
  maxWidth: number;
}

interface WrapResult {
  /** Text with explicit line breaks inserted */
  wrappedText: string;
  /** Array of individual lines */
  lines: string[];
  /** Whether any wrapping occurred */
  wasWrapped: boolean;
}

// Cache canvas context for performance
let measureCanvas: HTMLCanvasElement | null = null;
let measureContext: CanvasRenderingContext2D | null = null;

/**
 * Normalize line breaks in text content
 * Converts CRLF and CR to LF for consistent handling
 *
 * This is the single source of truth for line break normalization
 * Used by both textLayerUtils and subtitleUtils
 *
 * @param text - Raw text content
 * @returns Text with normalized line breaks (\n only)
 */
export function normalizeLineBreaks(text: string): string {
  if (!text) return '';
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Get or create a canvas context for text measurement
 */
function getMeasureContext(): CanvasRenderingContext2D {
  if (!measureContext) {
    measureCanvas = document.createElement('canvas');
    measureContext = measureCanvas.getContext('2d');
    if (!measureContext) {
      throw new Error(
        'Failed to create canvas 2D context for text measurement',
      );
    }
  }
  return measureContext;
}

/**
 * Clean font family string for canvas context
 * Removes extra quotes that may be present in CSS font-family values
 */
function cleanFontFamily(fontFamily: string): string {
  if (!fontFamily) return 'sans-serif';

  let cleaned = fontFamily.trim();

  // Handle CSS font-family format like '"Arial", sans-serif' or "'Arial', sans-serif"
  // Extract the first font name (with or without quotes)
  if (cleaned.startsWith('"') || cleaned.startsWith("'")) {
    const match = cleaned.match(/^["']([^"']+)["']/);
    if (match) {
      cleaned = match[1];
    }
  } else {
    // No quotes - might be "Arial, sans-serif", take first part
    const commaIndex = cleaned.indexOf(',');
    if (commaIndex > 0) {
      cleaned = cleaned.substring(0, commaIndex).trim();
    }
  }

  return cleaned || 'sans-serif';
}

/**
 * Build a CSS font string for canvas context
 */
function buildFontString(options: TextWrapOptions): string {
  const style = options.fontStyle || 'normal';
  const weight = String(options.fontWeight || '400');
  const size = `${options.fontSize}px`;
  const family = cleanFontFamily(options.fontFamily);

  // CSS font format: font-style font-weight font-size font-family
  // Font family should be quoted if it contains spaces
  const quotedFamily = family.includes(' ') ? `"${family}"` : family;
  return `${style} ${weight} ${size} ${quotedFamily}`;
}

/**
 * Measure text width using canvas
 */
function measureTextWidth(
  text: string,
  options: TextWrapOptions,
  ctx: CanvasRenderingContext2D,
): number {
  const fontString = buildFontString(options);
  ctx.font = fontString;

  const baseWidth = ctx.measureText(text).width;

  // Add letter spacing for each character except the last
  const letterSpacing = options.letterSpacing || 0;
  if (letterSpacing !== 0 && text.length > 1) {
    return baseWidth + letterSpacing * (text.length - 1);
  }

  return baseWidth;
}

/**
 * Wrap text to fit within a maximum width, preserving existing line breaks
 *
 * This function:
 * 1. Preserves existing manual line breaks (\n)
 * 2. Adds new line breaks where text would visually wrap
 * 3. Uses word-level wrapping (doesn't break words unless necessary)
 */
export function wrapTextToWidth(
  text: string,
  options: TextWrapOptions,
): WrapResult {
  // Validate inputs
  if (!text || options.maxWidth <= 0) {
    return {
      wrappedText: text || '',
      lines: text ? text.split('\n') : [],
      wasWrapped: false,
    };
  }

  const ctx = getMeasureContext();
  const maxWidth = options.maxWidth;
  const resultLines: string[] = [];
  let wasWrapped = false;

  // Debug: Log the font being used and test measurement
  const fontString = buildFontString(options);
  ctx.font = fontString;
  const testWidth = ctx.measureText('MMMMMMMMMM').width; // 10 Ms as a sanity check
  console.log(
    `📐 [TextWrap] Font: "${fontString}", 10 M's width: ${testWidth.toFixed(1)}px, maxWidth: ${maxWidth.toFixed(1)}px`,
  );

  // If font measurement seems broken (10 M's should be roughly fontSize * 8-10)
  // Just return the text with normalized line breaks
  const expectedMinWidth = options.fontSize * 5; // Very conservative minimum
  if (testWidth < expectedMinWidth) {
    console.warn(
      `📐 [TextWrap] Font measurement seems unreliable (${testWidth.toFixed(1)}px < ${expectedMinWidth}px). Skipping auto-wrap.`,
    );
    return {
      wrappedText: text,
      lines: text.split('\n'),
      wasWrapped: false,
    };
  }

  // Split by existing line breaks first (preserve manual breaks)
  const existingLines = text.split('\n');

  for (const line of existingLines) {
    // Preserve empty lines
    if (line === '') {
      resultLines.push('');
      continue;
    }

    // Check if this line needs wrapping
    const lineWidth = measureTextWidth(line, options, ctx);
    if (lineWidth <= maxWidth) {
      // Line fits, no wrapping needed
      resultLines.push(line);
      continue;
    }

    // Line needs wrapping - split by words
    wasWrapped = true;
    const words = line.split(/(\s+)/); // Split but keep whitespace
    let currentLine = '';

    for (const word of words) {
      // Skip empty strings from split
      if (word === '') continue;

      if (currentLine === '') {
        // First word on line
        const wordWidth = measureTextWidth(word, options, ctx);
        if (wordWidth > maxWidth && !word.match(/^\s+$/)) {
          // Word itself is too long - need to break it character by character
          const brokenLines = breakLongWord(word, options, ctx, maxWidth);
          // Add all but the last line to results
          for (let i = 0; i < brokenLines.length - 1; i++) {
            resultLines.push(brokenLines[i]);
          }
          // Keep the last part as current line
          currentLine = brokenLines[brokenLines.length - 1] || '';
        } else {
          currentLine = word;
        }
      } else {
        // Check if word fits on current line
        const testLine = currentLine + word;
        const testWidth = measureTextWidth(testLine, options, ctx);

        if (testWidth <= maxWidth) {
          // Word fits
          currentLine = testLine;
        } else {
          // Word doesn't fit - push current line and start new one
          if (currentLine.trim()) {
            resultLines.push(currentLine.trimEnd());
          }

          const wordWidth = measureTextWidth(word, options, ctx);
          if (wordWidth > maxWidth && !word.match(/^\s+$/)) {
            // Word is too long, break it
            const brokenLines = breakLongWord(word, options, ctx, maxWidth);
            for (let i = 0; i < brokenLines.length - 1; i++) {
              resultLines.push(brokenLines[i]);
            }
            currentLine = brokenLines[brokenLines.length - 1] || '';
          } else {
            // Start new line with this word
            currentLine = word.trimStart();
          }
        }
      }
    }

    // Add remaining content
    if (currentLine.trim()) {
      resultLines.push(currentLine.trimEnd());
    }
  }

  return {
    wrappedText: resultLines.join('\n'),
    lines: resultLines,
    wasWrapped,
  };
}

/**
 * Break a long word into multiple lines (character-level breaking)
 */
function breakLongWord(
  word: string,
  options: TextWrapOptions,
  ctx: CanvasRenderingContext2D,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let currentLine = '';

  for (const char of word) {
    const testLine = currentLine + char;
    const testWidth = measureTextWidth(testLine, options, ctx);

    if (testWidth <= maxWidth || currentLine === '') {
      // Fits, or first char (must include at least one char per line)
      currentLine = testLine;
    } else {
      // Doesn't fit, push current and start new
      lines.push(currentLine);
      currentLine = char;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [word];
}

/**
 * Apply text wrapping to content based on track transform dimensions
 *
 * Main entry point for the export pipeline.
 * - Normalizes line breaks (CRLF → LF)
 * - If width constraint exists, calculates where visual wrapping would occur
 *
 * @param text - Raw text content
 * @param trackWidth - Width from track transform (in video space pixels), 0 = auto/no constraint
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family name
 * @param fontWeight - Font weight
 * @param fontStyle - Font style (normal/italic)
 * @param letterSpacing - Letter spacing in pixels
 * @param scale - Scale factor applied to the text (default 1)
 * @returns Text with normalized and wrapped line breaks
 */
export function applyTextWrapping(
  text: string,
  trackWidth: number,
  fontSize: number,
  fontFamily: string,
  fontWeight?: string | number,
  fontStyle?: string,
  letterSpacing?: number,
  scale?: number,
): string {
  // First, normalize line breaks (this is always done)
  const normalizedText = normalizeLineBreaks(text);

  // If no width constraint, just return normalized text
  if (!trackWidth || trackWidth <= 0) {
    return normalizedText;
  }

  // Validate fontSize - must be a positive number
  const validFontSize =
    typeof fontSize === 'number' && fontSize > 0 ? fontSize : 40;

  // Account for scale - the width is in video space, but text renders at scale
  const effectiveScale = scale || 1;
  const effectiveWidth = trackWidth / effectiveScale;

  // Debug: show raw input text with visible line breaks
  const debugText = text.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  console.log(`📐 [TextWrap] Input text (raw): "${debugText}"`);
  console.log(
    `📐 [TextWrap] Wrapping at width: ${trackWidth}px (effective: ${effectiveWidth.toFixed(0)}px), Font: ${validFontSize}px "${fontFamily}"`,
  );

  // Perform wrapping
  const result = wrapTextToWidth(normalizedText, {
    fontFamily,
    fontSize: validFontSize,
    fontWeight,
    fontStyle,
    letterSpacing,
    maxWidth: effectiveWidth,
  });

  console.log(
    `📐 [TextWrap] Result: "${normalizedText.substring(0, 30)}${normalizedText.length > 30 ? '...' : ''}" → ${result.lines.length} lines (wasWrapped: ${result.wasWrapped})`,
  );

  return result.wrappedText;
}
