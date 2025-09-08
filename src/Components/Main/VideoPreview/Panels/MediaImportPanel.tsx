import { ScrollTabs } from '@/Components/sub/ui/Scroll-Tab';
import React, { useCallback, useRef, useState } from 'react';
import { useVideoEditorStore } from '../../../../store/videoEditorStore';
import { CustomPanelProps } from './PanelRegistry';

interface FilePreview {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  thumbnail?: string;
}

export const MediaImportPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
  const { importMediaFromDialog, importMediaFromDrop } = useVideoEditorStore();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FilePreview[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [, setActiveTab] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      try {
        console.log(
          '🎯 MediaImportPanel handleFiles called with',
          files.length,
          'files:',
          files.map((f) => f.name),
        );

        // Create initial previews for immediate UI feedback
        const initialPreviews: FilePreview[] = files.map((file) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          size: file.size,
          type: file.type,
          url: URL.createObjectURL(file), // Temporary preview URL
        }));

        setSelectedFiles((prev) => [...prev, ...initialPreviews]);

        // Start upload progress simulation
        initialPreviews.forEach((preview) => {
          setUploadProgress((prev) => ({ ...prev, [preview.id]: 0 }));
        });

        // Actually import the files using the proper Electron method
        console.log('🚀 Calling importMediaFromDrop...');
        const result = await importMediaFromDrop(files);
        console.log('📦 importMediaFromDrop result:', result);

        if (result.success) {
          // Update the previews with the actual imported file data
          const updatedPreviews = initialPreviews.map((initial, index) => {
            const imported = result.importedFiles[index];
            if (imported) {
              return {
                ...initial,
                id: imported.id,
                url: imported.url, // Use the proper preview URL from Electron
                thumbnail: imported.thumbnail,
              };
            }
            return initial;
          });

          setSelectedFiles((prev) => {
            // Replace the initial previews with updated ones
            const filteredPrev = prev.filter(
              (p) => !initialPreviews.some((ip) => ip.id === p.id),
            );
            return [...filteredPrev, ...updatedPreviews];
          });

          // Complete the progress for all files
          initialPreviews.forEach((preview) => {
            setUploadProgress((prev) => ({ ...prev, [preview.id]: 100 }));
          });
        } else {
          // If import failed, still show progress completion but mark as error
          console.error('Failed to import dropped files');
          initialPreviews.forEach((preview) => {
            setUploadProgress((prev) => ({ ...prev, [preview.id]: 100 }));
          });
        }
      } catch (error) {
        console.error('Error handling files:', error);
        // Still complete progress to avoid stuck UI
        files.forEach(() => {
          const id = Math.random().toString(36).substr(2, 9);
          setUploadProgress((prev) => ({ ...prev, [id]: 100 }));
        });
      }
    },
    [importMediaFromDrop],
  );

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        await handleFiles(files);
      }
    },
    [handleFiles],
  );

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files);
        await handleFiles(files);
      }
    },
    [handleFiles],
  );

  const removeFile = useCallback((id: string) => {
    setSelectedFiles((prev) => prev.filter((file) => file.id !== id));
    setUploadProgress((prev) => {
      const newProgress = { ...prev };
      delete newProgress[id];
      return newProgress;
    });
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isSubtitleFile = (fileName: string): boolean => {
    const subtitleExtensions = [
      '.srt',
      '.vtt',
      '.ass',
      '.ssa',
      '.sub',
      '.sbv',
      '.lrc',
    ];
    return subtitleExtensions.some((ext) =>
      fileName.toLowerCase().endsWith(ext),
    );
  };

  const getFileIcon = (type: string, fileName?: string): string => {
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.startsWith('image/')) return '🖼️';
    if (fileName && isSubtitleFile(fileName)) return '💬';
    return '📄';
  };

  // Upload Area Component
  const uploadArea = (
    <div className="p-4">
      <div
        className={`relative border-2 border-dashed rounded-lg p-4 lg:p-8 text-center transition-all duration-200 ${
          dragActive
            ? 'border-blue-400 bg-blue-400/10'
            : 'border-gray-600 hover:border-gray-500'
        }`}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="space-y-4">
          <div className="mx-auto w-12 h-12 lg:w-16 lg:h-16 bg-gray-700 rounded-full flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 lg:w-8 lg:h-8 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              preserveAspectRatio="xMidYMid meet"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          <div className="hidden lg:block">
            <p className="text-sm font-medium text-white mb-2">
              Drag & drop media files here
            </p>
            <p className="text-xs text-gray-400 mb-4">
              or browse to upload from your device
            </p>

            <button
              onClick={async () => {
                const result = await importMediaFromDialog();
                if (result.success && result.importedFiles.length > 0) {
                  // Add the imported files to the panel state
                  setSelectedFiles((prev) => [
                    ...prev,
                    ...result.importedFiles,
                  ]);
                  // Mark them as completed (100% progress)
                  result.importedFiles.forEach((file) => {
                    setUploadProgress((prev) => ({ ...prev, [file.id]: 100 }));
                  });
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-xs font-medium transition-colors duration-200"
            >
              Upload Files
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,audio/*,image/*,.srt,.vtt,.ass,.ssa,.sub,.sbv,.lrc"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Subtitle File Display Component
  const renderSubtitleFile = (file: FilePreview) => (
    <div className="flex items-center space-x-3 flex-1 min-w-0">
      <div className="text-2xl">💬</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{file.name}</p>
        <p className="text-xs text-purple-400">
          Subtitle • {formatFileSize(file.size)}
        </p>
        <p className="text-xs text-gray-500">
          {file.name.split('.').pop()?.toUpperCase()} format
        </p>
      </div>
    </div>
  );

  // Media File Display Component
  const renderMediaFile = (file: FilePreview) => (
    <div className="flex items-center space-x-3 flex-1 min-w-0">
      <div className="text-2xl">{getFileIcon(file.type, file.name)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{file.name}</p>
        <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
      </div>
    </div>
  );

  // File List Component
  const fileListContent = (files: FilePreview[], tabType: string) => (
    <div className="flex-1 overflow-auto">
      <div className="p-4 pt-0">
        <h4 className="text-xs font-semibold text-gray-300 mb-3">
          {getTabLabel(tabType, files.length)}
        </h4>

        <div className="space-y-2">
          {files.map((file) => {
            const isSubtitle = isSubtitleFile(file.name);

            return (
              <div
                key={file.id}
                className={`rounded-lg p-3 border transition-colors duration-200 ${
                  isSubtitle
                    ? 'bg-purple-900/20 border-purple-600/30 hover:bg-purple-900/30'
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                }`}
              >
                <div className="flex items-start justify-between">
                  {isSubtitle
                    ? renderSubtitleFile(file)
                    : renderMediaFile(file)}

                  <button
                    onClick={() => removeFile(file.id)}
                    className="text-gray-400 hover:text-red-400 transition-colors duration-200 ml-2"
                    title="Remove file"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const getFilteredFiles = (
    type: 'all' | 'videos' | 'audio' | 'images' | 'subtitles',
  ) => {
    return selectedFiles.filter((file) => {
      switch (type) {
        case 'videos':
          return file.type.startsWith('video/');
        case 'audio':
          return file.type.startsWith('audio/');
        case 'images':
          return file.type.startsWith('image/');
        case 'subtitles':
          return isSubtitleFile(file.name);
        default:
          return true;
      }
    });
  };

  const getTabLabel = (tabType: string, count: number) => {
    switch (tabType) {
      case 'videos':
        return `Video Files (${count})`;
      case 'audio':
        return `Audio Files (${count})`;
      case 'images':
        return `Image Files (${count})`;
      case 'subtitles':
        return `Subtitle Files (${count})`;
      default:
        return `Uploaded Files (${count})`;
    }
  };

  const tabs = [
    {
      value: 'all',
      label: 'All',
      content:
        selectedFiles.length > 0
          ? fileListContent(getFilteredFiles('all'), 'all')
          : uploadArea,
    },
    {
      value: 'videos',
      label: 'Videos',
      content:
        selectedFiles.length > 0
          ? fileListContent(getFilteredFiles('videos'), 'videos')
          : uploadArea,
    },
    {
      value: 'audio',
      label: 'Audio',
      content:
        selectedFiles.length > 0
          ? fileListContent(getFilteredFiles('audio'), 'audio')
          : uploadArea,
    },
    {
      value: 'images',
      label: 'Images',
      content:
        selectedFiles.length > 0
          ? fileListContent(getFilteredFiles('images'), 'images')
          : uploadArea,
    },
    {
      value: 'subtitles',
      label: 'Subtitles',
      content:
        selectedFiles.length > 0
          ? fileListContent(getFilteredFiles('subtitles'), 'subtitles')
          : uploadArea,
    },
  ];

  return (
    <div className={` ${className}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Your uploads</h3>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors duration-200 text-lg leading-none"
              title="Close panel"
            >
              ×
            </button>
          )}
        </div>
        <button
          onClick={async () => {
            const result = await importMediaFromDialog();
            if (result.success && result.importedFiles.length > 0) {
              // Add the imported files to the panel state
              setSelectedFiles((prev) => [...prev, ...result.importedFiles]);
              // Mark them as completed (100% progress)
              result.importedFiles.forEach((file) => {
                setUploadProgress((prev) => ({ ...prev, [file.id]: 100 }));
              });
            }
          }}
          className="w-full bg-primary hover:bg-gray-600 text-white p-2 rounded-lg text-xs lg:text-sm font-medium transition-colors duration-200"
        >
          Upload
        </button>
      </div>
      {/* Tab Navigation and Content */}
      <div className="flex-1 flex flex-col">
        <ScrollTabs
          tabs={tabs}
          defaultValue="all"
          onValueChange={setActiveTab}
        />
      </div>
    </div>
  );
};
