import { ScrollTabs } from '@/Components/ui/scroll-tab';
import React, { useCallback, useRef, useState } from 'react';
import { useVideoEditorStore } from '../../../../Store/videoEditorStore';
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
  const { importMediaFromDialog } = useVideoEditorStore();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FilePreview[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
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

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    }
  }, []);

  const handleFiles = useCallback((files: File[]) => {
    const newPreviews: FilePreview[] = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
    }));

    setSelectedFiles((prev) => [...prev, ...newPreviews]);

    // Simulate upload progress
    newPreviews.forEach((preview) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 30;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
        }
        setUploadProgress((prev) => ({
          ...prev,
          [preview.id]: Math.min(progress, 100),
        }));
      }, 200);
    });
  }, []);

  const handleFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files);
        handleFiles(files);
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

  const getFileIcon = (type: string): string => {
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.startsWith('image/')) return '🖼️';
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
              onClick={handleFileInput}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-xs font-medium transition-colors duration-200"
            >
              Upload Files
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,audio/*,image/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );

  // File List Component
  const fileListContent = (files: FilePreview[]) => (
    <div className="flex-1 overflow-auto">
      <div className="p-4 pt-0">
        <h4 className="text-xs font-semibold text-gray-300 mb-3">
          Uploaded Files ({files.length})
        </h4>

        <div className="space-y-2">
          {files.map((file) => {
            const progress = uploadProgress[file.id] || 0;
            const isComplete = progress >= 100;

            return (
              <div
                key={file.id}
                className="bg-gray-800 rounded-lg p-3 border border-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="text-2xl">{getFileIcon(file.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(file.size)}
                      </p>

                      {!isComplete && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span>Uploading...</span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-1">
                            <div
                              className="bg-blue-500 h-1 rounded-full transition-all duration-200"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

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

  const getFilteredFiles = (type: 'all' | 'videos' | 'audio' | 'images') => {
    return selectedFiles.filter((file) => {
      switch (type) {
        case 'videos':
          return file.type.startsWith('video/');
        case 'audio':
          return file.type.startsWith('audio/');
        case 'images':
          return file.type.startsWith('image/');
        default:
          return true;
      }
    });
  };

  const tabs = [
    {
      value: 'all',
      label: 'All',
      content:
        selectedFiles.length > 0
          ? fileListContent(getFilteredFiles('all'))
          : uploadArea,
    },
    {
      value: 'videos',
      label: 'Videos',
      content:
        selectedFiles.length > 0
          ? fileListContent(getFilteredFiles('videos'))
          : uploadArea,
    },
    {
      value: 'audio',
      label: 'Audio',
      content:
        selectedFiles.length > 0
          ? fileListContent(getFilteredFiles('audio'))
          : uploadArea,
    },
    {
      value: 'images',
      label: 'Images',
      content:
        selectedFiles.length > 0
          ? fileListContent(getFilteredFiles('images'))
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
          onClick={importMediaFromDialog}
          className="w-full bg-black hover:bg-gray-600 text-white p-2 rounded-lg text-xs lg:text-sm font-medium transition-colors duration-200"
        >
          Upload
        </button>
      </div>
      {/* Tab Navigation and Content */}
      <div className="flex-1 flex flex-col">
        <ScrollTabs tabs={tabs} />
      </div>
    </div>
  );
};
