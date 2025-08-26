/* eslint-disable prettier/prettier */
/**
 * Export Configuration Modal
 * Modal for configuring video export settings including filename and format
 */
import React, { useState } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Input } from './input';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger } from './select';

interface ExportConfig {
  filename: string;
  format: string;
  outputPath: string;
  subtitles?: {
    enabled: boolean;
    type: 'hardcoded' | 'embedded';
  };
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (config: ExportConfig) => void;
  defaultFilename?: string;
}

const videoFormats = [
  { value: 'mp4', label: 'MP4 (H.264)', extension: '.mp4' },
  { value: 'avi', label: 'AVI', extension: '.avi' },
  { value: 'mov', label: 'QuickTime (MOV)', extension: '.mov' },
  { value: 'mkv', label: 'Matroska (MKV)', extension: '.mkv' },
  // { value: 'webm', label: 'WebM', extension: '.webm' },
  { value: 'wmv', label: 'Windows Media Video', extension: '.wmv' },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  defaultFilename = 'final_video',
}) => {
  const [filename, setFilename] = useState(defaultFilename);
  const [format, setFormat] = useState('mp4');
  const [outputPath, setOutputPath] = useState('');
  const [isLoadingDefaultPath, setIsLoadingDefaultPath] = useState(false);

  // Subtitle options
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitleType, setSubtitleType] = useState<'hardcoded' | 'embedded'>(
    'hardcoded',
  );

  // Reset form when modal opens and load default path
  React.useEffect(() => {
    if (isOpen) {
      setFilename(defaultFilename);
      setFormat('mp4');
      setSubtitlesEnabled(false);
      setSubtitleType('hardcoded');
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

    const selectedFormat = videoFormats.find((f) => f.value === format);
    const finalFilename =
      filename.trim() + (selectedFormat?.extension || '.mp4');

    onExport({
      filename: finalFilename,
      format,
      outputPath: outputPath.trim(),
      subtitles: subtitlesEnabled
        ? {
            enabled: true,
            type: subtitleType,
          }
        : {
            enabled: false,
            type: 'hardcoded',
          },
    });
  };

  const handleCancel = () => {
    onClose();
  };

  const selectedFormat = videoFormats.find((f) => f.value === format);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} className="text-white bg-black">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Video</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filename Input */}
          <div className="space-y-2">
            <Label htmlFor="filename">Filename</Label>
            <Input
              id="filename"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Enter filename (without extension)"
              className="w-full text-white"
            />
            <p className="text-xs text-muted-foreground">
              Extension will be added automatically:{' '}
              {filename.trim() || 'filename'}
              {selectedFormat?.extension || '.mp4'}
            </p>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <Label htmlFor="format">Video Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger>
                <span className="block truncate">
                  {selectedFormat?.label || 'Select format'}
                </span>
              </SelectTrigger>
              <SelectContent className="bg-black">
                {videoFormats.map((fmt) => (
                  <SelectItem key={fmt.value} value={fmt.value}>
                    {fmt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                className="flex-1 text-white"
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
                ? `${outputPath}/${filename.trim() || 'filename'}${selectedFormat?.extension || '.mp4'}`
                : 'No folder selected'}
            </p>
          </div>

          {/* Subtitle Options */}
          <div className="space-y-3 border-t border-gray-700 pt-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="subtitles"
                checked={subtitlesEnabled}
                onChange={(e) => setSubtitlesEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <Label htmlFor="subtitles" className="text-sm font-medium">
                Include Subtitles
              </Label>
            </div>

            {subtitlesEnabled && (
              <div className="ml-6 space-y-2">
                <Label className="text-sm">Subtitle Type</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="hardcoded"
                      name="subtitleType"
                      value="hardcoded"
                      checked={subtitleType === 'hardcoded'}
                      onChange={(e) =>
                        setSubtitleType(
                          e.target.value as 'hardcoded' | 'embedded',
                        )
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                    />
                    <Label htmlFor="hardcoded" className="text-sm">
                      Hardcoded (burned-in)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="embedded"
                      name="subtitleType"
                      value="embedded"
                      checked={subtitleType === 'embedded'}
                      onChange={(e) =>
                        setSubtitleType(
                          e.target.value as 'hardcoded' | 'embedded',
                        )
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                    />
                    <Label htmlFor="embedded" className="text-sm">
                      Embedded (selectable)
                    </Label>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {subtitleType === 'hardcoded'
                    ? 'Subtitles will be permanently burned into the video and cannot be turned off'
                    : 'Subtitles will be embedded as a separate track that can be turned on/off in video players'}
                </div>
              </div>
            )}
          </div>

          {/* Format Description */}
          <div className="text-xs text-muted-foreground bg-muted p-2 rounded text-white">
            <strong>Selected format:</strong>{' '}
            {selectedFormat?.label || 'MP4 (H.264)'}
            <br />
            {format === 'mp4' && 'Best compatibility, widely supported'}
            {format === 'avi' && 'Uncompressed, larger file size'}
            {format === 'mov' && 'Apple QuickTime format'}
            {format === 'mkv' &&
              'Open source container, supports multiple codecs'}
            {format === 'webm' && 'Web optimized, smaller file size'}
            {format === 'wmv' && 'Windows Media format'}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} className="mr-2">
            Cancel
          </Button>
          <Button
            onClick={handleExport}
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
