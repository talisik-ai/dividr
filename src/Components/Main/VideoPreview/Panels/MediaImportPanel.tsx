import { Button } from '@/Components/sub/ui/Button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/Components/sub/ui/Tabs';
import { cn } from '@/Lib/utils';
import { Download, GripVertical, X } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { useVideoEditorStore } from '../../../../Store/VideoEditorStore';
import { BasePanel } from './BasePanel';
import { CustomPanelProps } from './PanelRegistry';

// Keeping for potential future use
// interface FilePreview {
//   id: string;
//   name: string;
//   size: number;
//   type: string;
//   url: string;
//   thumbnail?: string;
// }

interface MediaItem {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  duration?: number;
  isOnTimeline?: boolean;
  trackId?: string;
}

export const MediaImportPanel: React.FC<CustomPanelProps> = ({ className }) => {
  const {
    importMediaFromDialog,
    importMediaFromDrop,
    mediaLibrary,
    tracks,
    addTrackFromMediaLibrary,
    removeFromMediaLibrary,
    timeline,
  } = useVideoEditorStore();
  const [dragActive, setDragActive] = useState(false);
  // Removed setUploadProgress as it's no longer needed
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
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

        // Actually import the files using the proper Electron method
        console.log('🚀 Calling importMediaFromDrop...');
        const result = await importMediaFromDrop(files);
        console.log('📦 importMediaFromDrop result:', result);

        if (result.success) {
          console.log(
            `✅ Successfully imported ${result.importedFiles.length} files to media library`,
          );
        } else {
          console.error('Failed to import dropped files');
        }
      } catch (error) {
        console.error('Error handling files:', error);
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

  const removeFile = useCallback(
    (id: string) => {
      // Remove from media library
      removeFromMediaLibrary(id);
    },
    [removeFromMediaLibrary],
  );

  // Drag and drop handlers for media items
  const handleMediaDragStart = useCallback(
    (e: React.DragEvent, mediaId: string) => {
      setDraggedMediaId(mediaId);
      e.dataTransfer.setData('text/plain', mediaId);
      e.dataTransfer.effectAllowed = 'copy';

      // Create a custom drag image
      const mediaItem = mediaLibrary.find((item) => item.id === mediaId);
      if (mediaItem) {
        const dragImage = document.createElement('div');
        dragImage.textContent = `🎬 ${mediaItem.name}`;
        dragImage.style.padding = '8px 12px';
        dragImage.style.backgroundColor = '#1f2937';
        dragImage.style.color = 'white';
        dragImage.style.borderRadius = '6px';
        dragImage.style.fontSize = '12px';
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        document.body.appendChild(dragImage);

        e.dataTransfer.setDragImage(dragImage, 10, 10);

        // Clean up the drag image after a short delay
        setTimeout(() => {
          document.body.removeChild(dragImage);
        }, 0);
      }
    },
    [mediaLibrary],
  );

  const handleMediaDragEnd = useCallback(() => {
    setDraggedMediaId(null);
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
          ? 'border-secondary bg-secondary/10'
          : 'border-border hover:border-border/80',
      )}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={async () => {
        const result = await importMediaFromDialog();
        if (result.success && result.importedFiles.length > 0) {
          console.log(
            `✅ Successfully imported ${result.importedFiles.length} files via dialog`,
          );
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

  // These render functions are now integrated into the fileListContent

  // File List Component
  const fileListContent = (files: MediaItem[], tabType: string) => (
    <div className="flex-1 overflow-auto">
      <div className="">
        <h4 className="text-xs font-semibold text-muted-foreground mb-3">
          {getTabLabel(tabType, files.length)}
        </h4>

        <div className="space-y-2">
          {files.map((file) => {
            const isSubtitle =
              file.type.startsWith('text/') || isSubtitleFile(file.name);

            return (
              <div
                key={file.id}
                draggable={!file.isOnTimeline}
                onDragStart={(e) => {
                  if (!file.isOnTimeline) {
                    handleMediaDragStart(e, file.id);
                  } else {
                    e.preventDefault();
                  }
                }}
                onDragEnd={handleMediaDragEnd}
                className={cn(
                  'rounded-lg p-3 border transition-colors duration-200',
                  !file.isOnTimeline && 'cursor-grab active:cursor-grabbing',
                  file.isOnTimeline && 'cursor-default',
                  isSubtitle
                    ? 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20'
                    : file.isOnTimeline
                      ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
                      : 'bg-muted/50 border-border hover:bg-muted',
                  draggedMediaId === file.id && 'opacity-50',
                )}
                onClick={() => {
                  if (!file.isOnTimeline) {
                    // Add to timeline at current playhead position
                    addTrackFromMediaLibrary(file.id, timeline.currentFrame);
                  }
                }}
                title={
                  file.isOnTimeline
                    ? 'Already on timeline'
                    : 'Click to add to timeline or drag to timeline position'
                }
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {!file.isOnTimeline && (
                      <div className="text-muted-foreground hover:text-foreground cursor-grab">
                        <GripVertical className="h-4 w-4" />
                      </div>
                    )}
                    <div className="text-2xl">
                      {getFileIcon(file.type, file.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                        {file.duration && ` • ${file.duration.toFixed(1)}s`}
                      </p>
                      {file.isOnTimeline ? (
                        <p className="text-xs text-green-400 font-medium">
                          ✓ On Timeline
                        </p>
                      ) : (
                        <p className="text-xs text-blue-400 font-medium">
                          📍 Drag to Timeline
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive ml-2"
                    title="Remove from media library"
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

  // Convert media library items to MediaItem format
  const getMediaItems = (): MediaItem[] => {
    return mediaLibrary.map((item) => {
      // Check if this media is used in any track
      const usedInTrack = tracks.find((track) => track.source === item.source);

      return {
        id: item.id,
        name: item.name,
        type: item.mimeType,
        size: item.size,
        url: item.previewUrl || item.source,
        duration: item.duration,
        isOnTimeline: !!usedInTrack,
        trackId: usedInTrack?.id,
      };
    });
  };

  const getFilteredFiles = (
    type: 'all' | 'videos' | 'audio' | 'images' | 'subtitles',
  ) => {
    const mediaItems = getMediaItems();
    return mediaItems.filter((item) => {
      switch (type) {
        case 'videos':
          return item.type.startsWith('video/');
        case 'audio':
          return item.type.startsWith('audio/');
        case 'images':
          return item.type.startsWith('image/');
        case 'subtitles':
          return item.type.startsWith('text/') || isSubtitleFile(item.name);
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
    const mediaItems = getMediaItems();
    return mediaItems.length > 0
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
              console.log(
                `✅ Successfully imported ${result.importedFiles.length} files via upload button`,
              );
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
