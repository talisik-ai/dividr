/**
 * Unit tests for filename sanitization utility
 * Tests various edge cases and special character handling
 */
import { describe, expect, it } from 'vitest';
import {
  isFilenameSafe,
  previewSanitizedFilename,
  sanitizeFilename,
  sanitizeFilenameWithExtension,
} from './filenameSanitizer';

describe('sanitizeFilename', () => {
  describe('Special characters removal', () => {
    it('should replace @ symbol with underscore', () => {
      expect(sanitizeFilename('My Video @ 2024')).toBe('My_Video_2024');
    });

    it('should replace # symbol with underscore', () => {
      expect(sanitizeFilename('Project #1')).toBe('Project_1');
    });

    it('should replace % symbol with underscore', () => {
      expect(sanitizeFilename('Progress 50%')).toBe('Progress_50');
    });

    it('should replace & symbol with underscore', () => {
      expect(sanitizeFilename('Tom & Jerry')).toBe('Tom_Jerry');
    });

    it('should replace ? symbol with underscore', () => {
      expect(sanitizeFilename('What? Why?')).toBe('What_Why');
    });

    it('should replace * symbol with underscore', () => {
      expect(sanitizeFilename('File*Name')).toBe('File_Name');
    });

    it('should replace multiple special characters', () => {
      expect(sanitizeFilename('Project @#% 2024')).toBe('Project_2024');
    });

    it('should handle quotes and brackets', () => {
      expect(sanitizeFilename('My "Video" [2024]')).toBe('My_Video_2024');
    });

    it('should handle slashes and backslashes', () => {
      expect(sanitizeFilename('Path/To\\File')).toBe('Path_To_File');
    });

    it('should handle pipe and angle brackets', () => {
      expect(sanitizeFilename('Input|Output <test>')).toBe('Input_Output_test');
    });
  });

  describe('Space handling', () => {
    it('should convert single spaces to underscores', () => {
      expect(sanitizeFilename('My Video File')).toBe('My_Video_File');
    });

    it('should convert multiple spaces to single underscore', () => {
      expect(sanitizeFilename('My    Video    File')).toBe('My_Video_File');
    });

    it('should handle tabs and newlines', () => {
      expect(sanitizeFilename('My\tVideo\nFile')).toBe('My_Video_File');
    });
  });

  describe('Accented characters', () => {
    it('should transliterate French accents', () => {
      expect(sanitizeFilename('Café François')).toBe('Cafe_Francois');
    });

    it('should transliterate German umlauts', () => {
      expect(sanitizeFilename('Über München')).toBe('Uber_Munchen');
    });

    it('should transliterate Spanish characters', () => {
      expect(sanitizeFilename('Niño Español')).toBe('Nino_Espanol');
    });

    it('should transliterate various Latin characters', () => {
      expect(sanitizeFilename('ÀÁÂÃÄÅ àáâãäå')).toBe('AAAAAA_aaaaaa');
    });

    it('should handle mixed accents and special chars', () => {
      expect(sanitizeFilename('Café @ München #1')).toBe('Cafe_Munchen_1');
    });
  });

  describe('Non-ASCII characters', () => {
    it('should remove emoji characters', () => {
      expect(sanitizeFilename('My Video 🎬 2024')).toBe('My_Video_2024');
    });

    it('should remove Chinese characters', () => {
      expect(sanitizeFilename('Video 视频 2024')).toBe('Video_2024');
    });

    it('should remove Japanese characters', () => {
      expect(sanitizeFilename('Video ビデオ 2024')).toBe('Video_2024');
    });

    it('should remove Arabic characters', () => {
      expect(sanitizeFilename('Video فيديو 2024')).toBe('Video_2024');
    });

    it('should remove Cyrillic characters', () => {
      expect(sanitizeFilename('Video видео 2024')).toBe('Video_2024');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(sanitizeFilename('')).toBe('Untitled_Project');
    });

    it('should handle whitespace-only string', () => {
      expect(sanitizeFilename('   ')).toBe('Untitled_Project');
    });

    it('should handle string with only special characters', () => {
      expect(sanitizeFilename('@#$%^&*()')).toBe('Untitled_Project');
    });

    it('should handle custom fallback', () => {
      expect(sanitizeFilename('', 'Custom_Name')).toBe('Custom_Name');
    });

    it('should trim leading underscores', () => {
      expect(sanitizeFilename('___Video')).toBe('Video');
    });

    it('should trim trailing underscores', () => {
      expect(sanitizeFilename('Video___')).toBe('Video');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(sanitizeFilename('---Video---')).toBe('Video');
    });

    it('should collapse consecutive underscores', () => {
      expect(sanitizeFilename('My____Video')).toBe('My_Video');
    });

    it('should collapse consecutive hyphens', () => {
      expect(sanitizeFilename('My----Video')).toBe('My-Video');
    });
  });

  describe('Safe characters preservation', () => {
    it('should preserve alphanumeric characters', () => {
      expect(sanitizeFilename('Video123ABC')).toBe('Video123ABC');
    });

    it('should preserve hyphens', () => {
      expect(sanitizeFilename('My-Video-File')).toBe('My-Video-File');
    });

    it('should preserve underscores', () => {
      expect(sanitizeFilename('My_Video_File')).toBe('My_Video_File');
    });

    it('should preserve periods', () => {
      expect(sanitizeFilename('My.Video.File')).toBe('My.Video.File');
    });

    it('should handle mixed safe characters', () => {
      expect(sanitizeFilename('My_Video-2024.final')).toBe(
        'My_Video-2024.final',
      );
    });
  });

  describe('Length handling', () => {
    it('should truncate very long filenames', () => {
      const longName = 'a'.repeat(250);
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should handle normal length filenames', () => {
      const normalName = 'My Video Project 2024';
      expect(sanitizeFilename(normalName)).toBe('My_Video_Project_2024');
    });
  });

  describe('Real-world examples', () => {
    it('should handle typical project name', () => {
      expect(sanitizeFilename('My Awesome Video Project')).toBe(
        'My_Awesome_Video_Project',
      );
    });

    it('should handle project with date and special chars', () => {
      expect(sanitizeFilename('Client Video @ 2024/01/15')).toBe(
        'Client_Video_2024_01_15',
      );
    });

    it('should handle project with version', () => {
      expect(sanitizeFilename('Project v1.2.3 (final)')).toBe(
        'Project_v1.2.3_final',
      );
    });

    it('should handle project with multiple metadata', () => {
      expect(sanitizeFilename('Café - Summer 2024 - Client #42')).toBe(
        'Cafe_-_Summer_2024_-_Client_42',
      );
    });
  });
});

describe('sanitizeFilenameWithExtension', () => {
  it('should sanitize filename and preserve extension', () => {
    expect(sanitizeFilenameWithExtension('My Video @ 2024.mp4')).toBe(
      'My_Video_2024.mp4',
    );
  });

  it('should handle multiple dots in filename', () => {
    expect(sanitizeFilenameWithExtension('My.Video.Final.mp4')).toBe(
      'My.Video.Final.mp4',
    );
  });

  it('should sanitize filename with special chars in extension', () => {
    expect(sanitizeFilenameWithExtension('Video.mp4!')).toBe('Video.mp4');
  });

  it('should handle filename without extension', () => {
    expect(sanitizeFilenameWithExtension('My Video')).toBe('My_Video');
  });

  it('should handle empty filename', () => {
    expect(sanitizeFilenameWithExtension('')).toBe('Untitled_Project.mp4');
  });

  it('should handle various video formats', () => {
    expect(sanitizeFilenameWithExtension('Café.mov')).toBe('Cafe.mov');
    expect(sanitizeFilenameWithExtension('Video @ 2024.avi')).toBe(
      'Video_2024.avi',
    );
    expect(sanitizeFilenameWithExtension('Project #1.mkv')).toBe(
      'Project_1.mkv',
    );
  });
});

describe('isFilenameSafe', () => {
  it('should return true for safe filenames', () => {
    expect(isFilenameSafe('MyVideo')).toBe(true);
    expect(isFilenameSafe('My_Video_2024')).toBe(true);
    expect(isFilenameSafe('My-Video-2024')).toBe(true);
    expect(isFilenameSafe('Video.final.v2')).toBe(true);
  });

  it('should return false for filenames with special characters', () => {
    expect(isFilenameSafe('My Video @ 2024')).toBe(false);
    expect(isFilenameSafe('Project #1')).toBe(false);
    expect(isFilenameSafe('Video & Audio')).toBe(false);
    expect(isFilenameSafe('What?')).toBe(false);
  });

  it('should return false for filenames with spaces', () => {
    expect(isFilenameSafe('My Video')).toBe(false);
  });

  it('should return false for filenames with non-ASCII characters', () => {
    expect(isFilenameSafe('Café')).toBe(false);
    expect(isFilenameSafe('Video 🎬')).toBe(false);
    expect(isFilenameSafe('视频')).toBe(false);
  });

  it('should return false for empty or whitespace strings', () => {
    expect(isFilenameSafe('')).toBe(false);
    expect(isFilenameSafe('   ')).toBe(false);
  });
});

describe('previewSanitizedFilename', () => {
  it('should show preview with changes detected', () => {
    const preview = previewSanitizedFilename('My Video @ 2024', '.mp4');
    expect(preview.original).toBe('My Video @ 2024');
    expect(preview.sanitized).toBe('My_Video_2024');
    expect(preview.fullSanitized).toBe('My_Video_2024.mp4');
    expect(preview.changed).toBe(true);
  });

  it('should show preview with no changes', () => {
    const preview = previewSanitizedFilename('My_Video_2024', '.mp4');
    expect(preview.original).toBe('My_Video_2024');
    expect(preview.sanitized).toBe('My_Video_2024');
    expect(preview.fullSanitized).toBe('My_Video_2024.mp4');
    expect(preview.changed).toBe(false);
  });

  it('should handle different extensions', () => {
    const preview1 = previewSanitizedFilename('Café', '.mov');
    expect(preview1.fullSanitized).toBe('Cafe.mov');

    const preview2 = previewSanitizedFilename('Video', '.avi');
    expect(preview2.fullSanitized).toBe('Video.avi');
  });

  it('should detect changes for accented characters', () => {
    const preview = previewSanitizedFilename('Café François', '.mp4');
    expect(preview.changed).toBe(true);
    expect(preview.sanitized).toBe('Cafe_Francois');
  });

  it('should detect no changes for safe filenames', () => {
    const preview = previewSanitizedFilename('SafeFilename123', '.mp4');
    expect(preview.changed).toBe(false);
  });
});

describe('FFmpeg compatibility scenarios', () => {
  it('should handle all problematic FFmpeg characters', () => {
    const problematicChars = '@#%&?*"<>|:/\\[]{}();!+=';
    const result = sanitizeFilename(`Video${problematicChars}2024`);
    expect(result).not.toContain('@');
    expect(result).not.toContain('#');
    expect(result).not.toContain('%');
    expect(result).not.toContain('&');
    expect(result).not.toContain('?');
    expect(result).not.toContain('*');
  });

  it('should produce CLI-safe filenames (no spaces)', () => {
    const result = sanitizeFilename('My Video With Spaces');
    expect(result).not.toContain(' ');
  });

  it('should produce cross-platform compatible filenames', () => {
    const windowsProblematic = 'File<>:"/\\|?*Name';
    const result = sanitizeFilename(windowsProblematic);
    expect(result).toBe('File_Name');
  });

  it('should handle paths that might be interpreted as commands', () => {
    const commandLike = 'video && rm -rf';
    const result = sanitizeFilename(commandLike);
    expect(result).not.toContain('&&');
    expect(result).toBe('video_rm_-rf');
  });
});

describe('Backwards compatibility', () => {
  it('should produce consistent results', () => {
    const input = 'My Video @ 2024';
    const result1 = sanitizeFilename(input);
    const result2 = sanitizeFilename(input);
    expect(result1).toBe(result2);
  });

  it('should be idempotent (sanitizing twice yields same result)', () => {
    const input = 'Café @ München #1';
    const once = sanitizeFilename(input);
    const twice = sanitizeFilename(once);
    expect(once).toBe(twice);
  });
});
