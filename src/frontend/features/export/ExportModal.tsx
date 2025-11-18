/* eslint-disable prettier/prettier */
/**
 * Export Configuration Modal
 * Modal for configuring video export settings including filename and format
 */
import { Button } from '@/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/frontend/components/ui/select';
import {
  previewSanitizedFilename,
  sanitizeFilename,
} from '@/frontend/utils/filenameSanitizer';
import React, { useMemo, useState } from 'react';

interface ExportConfig {
  filename: string;
  format: string;
  outputPath: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (config: ExportConfig) => void;
  defaultFilename?: string;
}

const videoFormats = [
  {
    value: 'mp4',
    label: 'MP4 (H.264)',
    extension: '.mp4',
    description: 'Best compatibility, Widely supported',
  },
  {
    value: 'avi',
    label: 'AVI',
    extension: '.avi',
    description: 'Legacy format, Good for Windows systems',
  },
  {
    value: 'mov',
    label: 'QuickTime (MOV)',
    extension: '.mov',
    description: 'Apple ecosystem, Optimized for macOS, iOS',
  },
  {
    value: 'mkv',
    label: 'Matroska (MKV)',
    extension: '.mkv',
    description: 'High quality, Supports advanced features',
  },
  // { value: 'webm', label: 'WebM', extension: '.webm', description: 'Web optimized, Best for web browsers and online streaming' },
  {
    value: 'wmv',
    label: 'Windows Media Video',
    extension: '.wmv',
    description: 'Windows native, Designed for Windows Media Player',
  },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  defaultFilename = 'Untitled_Project',
}) => {
  const [filename, setFilename] = useState(defaultFilename);
  const [format, setFormat] = useState('mp4');
  const [outputPath, setOutputPath] = useState('');
  const [isLoadingDefaultPath, setIsLoadingDefaultPath] = useState(false);

  // Calculate sanitized filename preview
  const selectedFormat = videoFormats.find((f) => f.value === format);
  const sanitizationPreview = useMemo(() => {
    return previewSanitizedFilename(
      filename.trim(),
      selectedFormat?.extension || '.mp4',
    );
  }, [filename, selectedFormat]);

  // Removed subtitle options - subtitles are automatically included from timeline

  // Reset form when modal opens and load default path
  React.useEffect(() => {
    if (isOpen) {
      setFilename(defaultFilename);
      setFormat('mp4');
      loadDefaultPath();
    }
  }, [isOpen, defaultFilename]);

  // Load default downloads directory
  const loadDefaultPath = async () => {
    setIsLoadingDefaultPath(true);
    try {
      const result = await window.electronAPI.getDownloadsDirectory();
      if (result.success && result.path) {
        setOutputPath(result.path);
      } else {
        // Fallback if API call fails
        setOutputPath('');
      }
    } catch (error) {
      console.error('Failed to get downloads directory:', error);
      setOutputPath('');
    } finally {
      setIsLoadingDefaultPath(false);
    }
  };

  // Handle folder selection
  const handleBrowseFolder = async () => {
    try {
      const selectedFormat = videoFormats.find((f) => f.value === format);
      const defaultFilePath = outputPath
        ? `${outputPath}/${filename.trim()}${selectedFormat?.extension || '.mp4'}`
        : `${filename.trim()}${selectedFormat?.extension || '.mp4'}`;

      const result = await window.electronAPI.showSaveDialog({
        title: 'Save Video As',
        defaultPath: defaultFilePath,
        filters: [
          {
            name: `${selectedFormat?.label || 'MP4'} Files`,
            extensions: [selectedFormat?.value || 'mp4'],
          },
          {
            name: 'All Files',
            extensions: ['*'],
          },
        ],
      });

      if (result.success && result.directory) {
        setOutputPath(result.directory);
        if (result.filename) {
          // Extract filename without extension if user provided one
          const nameWithoutExt = result.filename.replace(/\.[^/.]+$/, '');
          setFilename(nameWithoutExt);
        }
      }
    } catch (error) {
      console.error('Failed to open save dialog:', error);
      alert('Failed to open folder selection dialog');
    }
  };

  const handleExport = () => {
    if (!filename.trim()) {
      alert('Please enter a filename');
      return;
    }

    if (!outputPath.trim()) {
      alert('Please select an output folder');
      return;
    }

    // Sanitize the filename before export
    const sanitizedBaseName = sanitizeFilename(
      filename.trim(),
      'Untitled_Project',
    );
    const finalFilename =
      sanitizedBaseName + (selectedFormat?.extension || '.mp4');

    console.log('🧹 Filename sanitization:', {
      original: filename.trim(),
      sanitized: sanitizedBaseName,
      final: finalFilename,
    });

    onExport({
      filename: finalFilename,
      format,
      outputPath: outputPath.trim(),
    });
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Video</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filename Input */}
          <div className="space-y-1">
            <div className="space-y-2">
              <Label htmlFor="filename">Filename</Label>
              <Input
                id="filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="Enter filename (without extension)"
                className="w-full"
              />
            </div>
            {sanitizationPreview.changed ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Exported as:{' '}
                  <span className="font-mono italic">
                    {sanitizationPreview.fullSanitized}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Extension will be added automatically:{' '}
                <span className="font-mono italic">
                  {sanitizationPreview.fullSanitized || 'filename.mp4'}
                </span>
              </p>
            )}
          </div>

          {/* Format Selection */}
          <div className="space-y-1">
            <div className="space-y-2">
              <Label htmlFor="format">Video Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger>
                  <span className="block truncate">
                    {selectedFormat?.label || 'Select format'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {videoFormats.map((fmt) => (
                    <SelectItem key={fmt.value} value={fmt.value}>
                      {fmt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              <p>
                Selected format:{' '}
                <span className="italic">
                  {selectedFormat?.label || 'Select format'}
                </span>
              </p>
              {selectedFormat?.description && (
                <p>{selectedFormat.description}</p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Subtitles from timeline will be automatically included
          </p>

          {/* Output Folder Selection */}
          <div className="space-y-2">
            <Label htmlFor="outputPath">Save Location</Label>
            <div className="flex space-x-2">
              <Input
                id="outputPath"
                type="text"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                placeholder={
                  isLoadingDefaultPath ? 'Loading...' : 'Select output folder'
                }
                className="flex-1"
                disabled={isLoadingDefaultPath}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleBrowseFolder}
                disabled={isLoadingDefaultPath}
                className="px-3"
              >
                Browse
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Full path:{' '}
              {outputPath
                ? `${outputPath}\\${sanitizationPreview.fullSanitized}`
                : 'No folder selected'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            variant="secondary"
            disabled={
              !filename.trim() || !outputPath.trim() || isLoadingDefaultPath
            }
          >
            Export Video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
