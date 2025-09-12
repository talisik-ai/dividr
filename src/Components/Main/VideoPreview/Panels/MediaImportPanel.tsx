import { Badge } from '@/Components/sub/ui/Badge';
import { Button } from '@/Components/sub/ui/Button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/Components/sub/ui/Tabs';
import { cn } from '@/Lib/utils';
import {
  Clock,
  ClosedCaption,
  Download,
  File,
  Image,
  MoreHorizontal,
  Music,
  Video,
  X,
} from 'lucide-react';
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

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return remainingSeconds > 0
        ? `${minutes}m ${remainingSeconds}s`
        : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
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

  const getFileIcon = (type: string, fileName?: string) => {
    if (type.startsWith('video/'))
      return <Video className="size-6 text-black" />;
    if (type.startsWith('audio/'))
      return <Music className="size-6 text-black" />;
    if (type.startsWith('image/'))
      return <Image className="size-6 text-black" />;
    if (fileName && isSubtitleFile(fileName))
      return <ClosedCaption className="size-6 text-black" />;
    return <File className="size-6 text-black" />;
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

  // Media Cover Component
  const MediaCover: React.FC<{ file: MediaItem }> = ({ file }) => {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const [hasError, setHasError] = useState(false);

    if (isImage || isVideo) {
      if (hasError) {
        // Show fallback gradient with icon if media failed to load
        return (
          <div className="w-full h-full bg-gradient-to-br from-secondary via-blue-300/50 to-secondary rounded-md flex items-center justify-center text-muted-foreground relative">
            {getFileIcon(file.type, file.name)}
            {/* Duration badge for fallback state */}
            {file.duration && (
              <Badge className="absolute bottom-2 left-2 bg-black/50 text-white group-hover:opacity-0 transition-opacity duration-200">
                <Clock
                  className="-ms-0.5 opacity-60"
                  size={12}
                  aria-hidden="true"
                />
                {formatDuration(file.duration)}
              </Badge>
            )}
          </div>
        );
      }

      return (
        <div className="w-full h-full bg-muted rounded-md overflow-hidden relative">
          {isImage ? (
            <img
              src={file.url}
              alt={file.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setHasError(true)}
            />
          ) : (
            // For videos, create a video element to show first frame as thumbnail
            <video
              src={file.url}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
              onError={() => setHasError(true)}
              onLoadedMetadata={(e) => {
                // Seek to 1 second to get a better thumbnail frame
                const video = e.target as HTMLVideoElement;
                video.currentTime = 1;
              }}
            />
          )}

          {/* Duration badge - only show for media with duration (videos/audio) */}
          {file.duration && (
            <Badge className="absolute bottom-2 left-2 bg-black/50 text-white group-hover:opacity-0 transition-opacity duration-200">
              <Clock
                className="-ms-0.5 opacity-60"
                size={12}
                aria-hidden="true"
              />
              {formatDuration(file.duration)}
            </Badge>
          )}
        </div>
      );
    }

    // Gradient cover for audio and subtitle files
    return (
      <div className="w-full h-full bg-gradient-to-br from-secondary via-blue-300/50 to-secondary rounded-md flex items-center justify-center text-muted-foreground relative">
        {getFileIcon(file.type, file.name)}
        {/* Duration badge for audio files */}
        {file.duration && (
          <Badge className="absolute bottom-2 left-2 bg-black/50 text-white group-hover:opacity-0 transition-opacity duration-200">
            <Clock
              className="-ms-0.5 opacity-60"
              size={12}
              aria-hidden="true"
            />
            {formatDuration(file.duration)}
          </Badge>
        )}
      </div>
    );
  };

  // File List Component with Card Layout
  const fileListContent = (files: MediaItem[], tabType: string) => (
    <div className="flex-1 overflow-auto">
      <div className="">
        <h4 className="text-xs font-semibold text-muted-foreground mb-3">
          {getTabLabel(tabType, files.length)}
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {files.map((file) => {
            return (
              <div key={file.id} className="flex flex-col space-y-2">
                {/* Card Container */}
                <div
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
                    'group relative h-[98px] rounded-md transition-all duration-200 overflow-hidden',
                    !file.isOnTimeline && 'cursor-grab active:cursor-grabbing',
                    file.isOnTimeline && 'cursor-default',
                    draggedMediaId === file.id && 'opacity-50',
                  )}
                  onClick={async () => {
                    if (!file.isOnTimeline) {
                      // Add to timeline at current playhead position
                      await addTrackFromMediaLibrary(
                        file.id,
                        timeline.currentFrame,
                      );
                    }
                  }}
                  title={
                    file.isOnTimeline
                      ? 'Already on timeline'
                      : 'Click to add to timeline or drag to timeline position'
                  }
                >
                  {/* Media Cover/Thumbnail */}
                  <MediaCover file={file} />

                  {/* Hover overlay with actions only */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="absolute top-2 right-2 flex items-center space-x-1">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Additional actions can be added here
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-white/80 hover:text-white hover:bg-white/20"
                        title="More options"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(file.id);
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-white/80 hover:text-red-400 hover:bg-red-500/20"
                        title="Remove from media library"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Status info on hover */}
                    <div className="absolute bottom-2 left-2">
                      <p className="text-xs text-white/80">
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

                  {/* Status indicator */}
                  {file.isOnTimeline && (
                    <div className="absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full"></div>
                  )}
                </div>

                {/* Title at bottom */}
                <div className="px-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {file.name}
                  </p>
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
