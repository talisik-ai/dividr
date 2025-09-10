import { Button } from '@/Components/sub/ui/Button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/Components/sub/ui/Tabs';
import { cn } from '@/Lib/utils';
import { Download, X } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { useVideoEditorStore } from '../../../../Store/VideoEditorStore';
import { BasePanel } from './BasePanel';
import { CustomPanelProps } from './PanelRegistry';

interface FilePreview {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  thumbnail?: string;
}

export const MediaImportPanel: React.FC<CustomPanelProps> = ({ className }) => {
  const { importMediaFromDialog, importMediaFromDrop } = useVideoEditorStore();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FilePreview[]>([]);
  const [, setUploadProgress] = useState<Record<string, number>>({});
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
    <div
      className={cn(
        'cursor-pointer hover:!border-secondary hover:bg-secondary/10 relative border-2 border-dashed border-accent h-full flex items-center justify-center rounded-lg lg:p-8 text-center transition-all duration-200',
        dragActive
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-border/80',
      )}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
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
    >
      <div className="hidden lg:block text-xs text-muted-foreground space-y-2">
        <p>There's nothing here yet</p>
        <p>Drag & drop media your files here</p>

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
  );

  // Subtitle File Display Component
  const renderSubtitleFile = (file: FilePreview) => (
    <div className="flex items-center space-x-3 flex-1 min-w-0">
      <div className="text-2xl">💬</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {file.name}
        </p>
        <p className="text-xs text-purple-400">
          Subtitle • {formatFileSize(file.size)}
        </p>
        <p className="text-xs text-muted-foreground">
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
        <p className="text-xs font-medium text-foreground truncate">
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </p>
      </div>
    </div>
  );

  // File List Component
  const fileListContent = (files: FilePreview[], tabType: string) => (
    <div className="flex-1 overflow-auto">
      <div className="">
        <h4 className="text-xs font-semibold text-muted-foreground mb-3">
          {getTabLabel(tabType, files.length)}
        </h4>

        <div className="space-y-2">
          {files.map((file) => {
            const isSubtitle = isSubtitleFile(file.name);

            return (
              <div
                key={file.id}
                className={cn(
                  'rounded-lg p-3 border transition-colors duration-200',
                  isSubtitle
                    ? 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20'
                    : 'bg-muted/50 border-border hover:bg-muted',
                )}
              >
                <div className="flex items-start justify-between">
                  {isSubtitle
                    ? renderSubtitleFile(file)
                    : renderMediaFile(file)}

                  <Button
                    onClick={() => removeFile(file.id)}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive ml-2"
                    title="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
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

  const getTabContent = (
    type: 'all' | 'videos' | 'audio' | 'images' | 'subtitles',
  ) => {
    return selectedFiles.length > 0
      ? fileListContent(getFilteredFiles(type), type)
      : uploadArea;
  };

  return (
    <BasePanel
      title="Your uploads"
      description="Import and manage media files"
      className={className}
    >
      <div className="flex flex-col h-full gap-4">
        {/* Upload Button */}
        <Button
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
          className="w-full"
        >
          Upload Files
          <Download />
        </Button>

        {/* Tab Navigation and Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs defaultValue="all" className="flex-1 gap-4 flex flex-col">
            <TabsList variant="text" className="w-full justify-start">
              <TabsTrigger value="all" variant="text">
                All
              </TabsTrigger>
              <TabsTrigger value="videos" variant="text">
                Videos
              </TabsTrigger>
              <TabsTrigger value="audio" variant="text">
                Audio
              </TabsTrigger>
              <TabsTrigger value="images" variant="text">
                Images
              </TabsTrigger>
              <TabsTrigger value="subtitles" variant="text">
                Subtitles
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="flex-1 overflow-hidden">
              {getTabContent('all')}
            </TabsContent>
            <TabsContent value="videos" className="flex-1 overflow-hidden">
              {getTabContent('videos')}
            </TabsContent>
            <TabsContent value="audio" className="flex-1 overflow-hidden">
              {getTabContent('audio')}
            </TabsContent>
            <TabsContent value="images" className="flex-1 overflow-hidden">
              {getTabContent('images')}
            </TabsContent>
            <TabsContent value="subtitles" className="flex-1 overflow-hidden">
              {getTabContent('subtitles')}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </BasePanel>
  );
};
