import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/frontend/components/ui/alert-dialog';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/frontend/components/ui/tabs';
import { cn } from '@/frontend/utils/utils';
import {
  Clock,
  ClosedCaption,
  Download,
  File,
  Image,
  Loader2,
  MoreHorizontal,
  Music,
  Video,
  X,
} from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BasePanel } from '../../../components/panels/basePanel';
import { CustomPanelProps } from '../../../components/panels/panelRegistry';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';

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
  isGeneratingSprites?: boolean;
  isGeneratingWaveform?: boolean;
}

// Stable utility function outside component to prevent re-renders
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

export const MediaImportPanel: React.FC<CustomPanelProps> = ({ className }) => {
  // Selective store subscriptions - completely isolated from timeline state
  const importMediaFromDialog = useVideoEditorStore(
    (state) => state.importMediaFromDialog,
  );
  const importMediaFromDrop = useVideoEditorStore(
    (state) => state.importMediaFromDrop,
  );
  const mediaLibrary = useVideoEditorStore((state) => state.mediaLibrary);
  const tracks = useVideoEditorStore((state) => state.tracks);
  const addTrackFromMediaLibrary = useVideoEditorStore(
    (state) => state.addTrackFromMediaLibrary,
  );
  const removeFromMediaLibrary = useVideoEditorStore(
    (state) => state.removeFromMediaLibrary,
  );
  const isGeneratingSpriteSheet = useVideoEditorStore(
    (state) => state.isGeneratingSpriteSheet,
  );
  const isGeneratingWaveform = useVideoEditorStore(
    (state) => state.isGeneratingWaveform,
  );
  // Access store directly when needed (non-reactive)
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0); // Track nested drag enter/leave events
  // Removed setUploadProgress as it's no longer needed
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Confirmation dialog state for media deletion
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    show: boolean;
    mediaId: string | null;
    mediaName: string;
    affectedTracksCount: number;
  }>({
    show: false,
    mediaId: null,
    mediaName: '',
    affectedTracksCount: 0,
  });

  // Handle drag events with counter-based tracking
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Increment counter for nested elements
      dragCounter.current++;

      // Check if we have files being dragged (not internal media items)
      // Exclude internal drags by checking for our custom data type
      const hasMediaId = e.dataTransfer.types.includes('text/plain');
      const hasFiles = e.dataTransfer.types.includes('Files');

      // Only activate drag state for external file drops, not internal media drags
      if (hasFiles && !hasMediaId) {
        if (!dragActive) {
          setDragActive(true);
        }
      }
    },
    [dragActive],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      try {
        // Show loading toast
        const loadingToast = toast.loading(
          `Validating and importing ${files.length} ${files.length === 1 ? 'file' : 'files'}...`,
        );

        // Import files
        const result = await importMediaFromDrop(files);
        if (!result || (!result.success && !result.error)) return;

        // Dismiss loading toast
        toast.dismiss(loadingToast);

        // Handle results
        const importedCount = result.importedFiles.length;
        const rejectedCount = result.rejectedFiles?.length || 0;

        // Show final status message
        if (importedCount > 0) {
          toast.success(
            `Successfully imported ${importedCount} ${importedCount === 1 ? 'file' : 'files'}` +
              (rejectedCount > 0 ? ` (${rejectedCount} rejected)` : ''),
          );
        } else if (rejectedCount > 0) {
          // Use the actual error message from validation results
          const errorMessage =
            result.error ||
            'All files were rejected due to corruption or invalid format';
          toast.error(errorMessage);
        } else {
          toast.error('No files to import');
        }
      } catch (error: unknown) {
        console.error('Error handling files:', error);
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to import files. Please try again.',
        );
      }
    },
    [importMediaFromDrop],
  );

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Decrement counter
    dragCounter.current--;

    // Only deactivate when counter reaches 0
    if (dragCounter.current === 0) {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Reset counter and state
      dragCounter.current = 0;
      setDragActive(false);

      // Check if this is an internal media drag (not a file drop)
      const mediaId = e.dataTransfer.getData('text/plain');
      if (mediaId) {
        // This is an internal drag from media library, ignore it
        return;
      }

      // Handle external file drops
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

  // Remove file handler - not memoized to ensure fresh mediaLibrary and tracks references
  const removeFile = (id: string) => {
    // Find the media item to get its details
    const mediaItem = mediaLibrary.find((item) => item.id === id);
    if (!mediaItem) {
      console.warn(`Media item ${id} not found`);
      return;
    }

    // Count affected tracks
    const affectedTracks = tracks.filter(
      (track) =>
        track.source === mediaItem.source ||
        track.source === mediaItem.tempFilePath ||
        (mediaItem.extractedAudio &&
          track.source === mediaItem.extractedAudio.audioPath),
    );

    if (affectedTracks.length === 0) {
      removeFromMediaLibrary(id, true);
      return;
    }

    // Show confirmation dialog
    setDeleteConfirmation({
      show: affectedTracks.length > 0,
      mediaId: id,
      mediaName: mediaItem.name,
      affectedTracksCount: affectedTracks.length,
    });
  };

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirmation.mediaId) return;

    try {
      // Force delete: removes media and all associated tracks
      removeFromMediaLibrary(deleteConfirmation.mediaId, true);

      console.log(
        `✅ Successfully deleted media "${deleteConfirmation.mediaName}" and ${deleteConfirmation.affectedTracksCount} associated track(s)`,
      );
    } catch (error) {
      console.error('Failed to remove media:', error);
    }
    // Note: Dialog state will be reset by onOpenChange
  }, [deleteConfirmation, removeFromMediaLibrary]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      // Reset dialog state when closing (whether by cancel, confirm, ESC, or outside click)
      setDeleteConfirmation({
        show: false,
        mediaId: null,
        mediaName: '',
        affectedTracksCount: 0,
      });
    }
  }, []);

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

  // Upload Area Component - memoized
  const uploadArea = useMemo(
    () => (
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
          if (!result || (!result.success && !result.error)) return;

          if (result.success && result.importedFiles.length > 0) {
            console.log(
              `✅ Successfully imported ${result.importedFiles.length} files via dialog`,
            );
          } else {
            // Use the actual error message from validation results
            const errorMessage =
              result.error ||
              'All files were rejected due to corruption or invalid format';
            toast.error(errorMessage);
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
    ),
    [dragActive, importMediaFromDialog, handleFileInputChange],
  );

  // These render functions are now integrated into the fileListContent

  // Media Cover Component - memoized
  const MediaCover: React.FC<{ file: MediaItem }> = React.memo(({ file }) => {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const [hasError, setHasError] = useState(false);

    // For videos, check if we have a generated thumbnail first
    if (isVideo) {
      const mediaLibraryItem = mediaLibrary.find((item) => item.id === file.id);
      const hasGeneratedThumbnail = mediaLibraryItem?.thumbnail;

      if (hasGeneratedThumbnail && !hasError) {
        return (
          <div className="w-full h-full bg-muted rounded-md overflow-hidden relative">
            <img
              src={mediaLibraryItem.thumbnail}
              alt={file.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setHasError(true)}
            />
            {/* Duration badge */}
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
    }

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
  });

  // Individual File Item Component - memoized to prevent unnecessary re-renders
  const FileItem: React.FC<{ file: MediaItem }> = React.memo(
    ({ file }) => (
      <div className="flex flex-col space-y-2">
        {/* Card Container */}
        <div
          draggable={
            !file.isOnTimeline &&
            !file.isGeneratingSprites &&
            !file.isGeneratingWaveform
          }
          onDragStart={(e) => {
            if (
              !file.isOnTimeline &&
              !file.isGeneratingSprites &&
              !file.isGeneratingWaveform
            ) {
              handleMediaDragStart(e, file.id);
            } else {
              e.preventDefault();
            }
          }}
          onDragEnd={handleMediaDragEnd}
          className={cn(
            'group relative h-[98px] rounded-md transition-all duration-200 overflow-hidden',
            !file.isOnTimeline &&
              !file.isGeneratingSprites &&
              !file.isGeneratingWaveform &&
              'cursor-grab active:cursor-grabbing',
            (file.isOnTimeline ||
              file.isGeneratingSprites ||
              file.isGeneratingWaveform) &&
              'cursor-default',
            draggedMediaId === file.id && 'opacity-50',
            (file.isGeneratingSprites || file.isGeneratingWaveform) &&
              'opacity-60 pointer-events-none',
          )}
          onClick={async () => {
            if (
              !file.isOnTimeline &&
              !file.isGeneratingSprites &&
              !file.isGeneratingWaveform
            ) {
              // Add to timeline at frame 0 - consistent with drag and drop behavior
              await addTrackFromMediaLibrary(file.id, 0);
            }
          }}
          title={
            file.isGeneratingSprites
              ? 'Generating sprite sheets...'
              : file.isGeneratingWaveform
                ? 'Generating waveform...'
                : file.isOnTimeline
                  ? 'Already on timeline'
                  : 'Click or drag to add to timeline (starts at frame 0)'
          }
        >
          {/* Media Cover/Thumbnail */}
          <MediaCover file={file} />

          {/* Loading overlay for sprite and waveform generation */}
          {(file.isGeneratingSprites || file.isGeneratingWaveform) && (
            <div className="absolute bottom-0 p-2 left-0 right-0 h-8 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-end">
              <Loader2 className="w-5 h-5 animate-spin text-white drop-shadow-lg" />
            </div>
          )}

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
                  On Timeline
                </p>
              ) : (
                <p className="text-xs text-blue-400 font-medium">
                  Drag to Timeline
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
    ),
    (prevProps, nextProps) => {
      // Custom equality check for FileItem - only re-render if file data actually changes
      return (
        prevProps.file.id === nextProps.file.id &&
        prevProps.file.name === nextProps.file.name &&
        prevProps.file.isOnTimeline === nextProps.file.isOnTimeline &&
        prevProps.file.size === nextProps.file.size &&
        prevProps.file.duration === nextProps.file.duration &&
        prevProps.file.isGeneratingSprites ===
          nextProps.file.isGeneratingSprites &&
        prevProps.file.isGeneratingWaveform ===
          nextProps.file.isGeneratingWaveform
      );
    },
  );

  // File List Component with Card Layout - not memoized to ensure fresh renders
  const fileListContent = (files: MediaItem[], tabType: string) => (
    <div
      className="w-full h-full overflow-y-auto relative"
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="w-full">
        <h4 className="text-xs font-semibold text-muted-foreground mb-3">
          {getTabLabel(tabType, files.length)}
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {files.map((file) => (
            <FileItem key={file.id} file={file} />
          ))}
        </div>
      </div>

      {/* Drag overlay - shows when dragging EXTERNAL files over existing content */}
      {/* Only show for external file drops, not internal media drags */}
      {dragActive && (
        <div className="absolute inset-0 border-2 border-dashed flex items-center justify-center border-secondary bg-secondary/10 rounded-lg pointer-events-none z-10">
          <p className="text-sm text-muted-foreground">Drop files to import</p>
        </div>
      )}
    </div>
  );

  // Create a stable mapping of sources to track IDs - only changes when tracks are added/removed
  const sourceToTrackMap = useMemo(() => {
    const map = new Map<string, string>();
    tracks.forEach((track) => {
      map.set(track.source, track.id);
    });
    return map;
  }, [
    tracks
      .map((track) => `${track.source}:${track.id}`)
      .sort()
      .join('|'),
  ]);

  // Convert media library items to MediaItem format - memoized
  const getMediaItems = useMemo((): MediaItem[] => {
    return mediaLibrary.map((item) => {
      // Check if this media is used in any track using the stable map
      const trackId = sourceToTrackMap.get(item.source);
      const isUsed = !!trackId;

      return {
        id: item.id,
        name: item.name,
        type: item.mimeType,
        size: item.size,
        url: item.previewUrl || item.source,
        duration: item.duration,
        isOnTimeline: isUsed,
        trackId: trackId,
        isGeneratingSprites:
          item.type === 'video' ? isGeneratingSpriteSheet(item.id) : false,
        isGeneratingWaveform:
          item.type === 'audio' || item.type === 'video'
            ? isGeneratingWaveform(item.id)
            : false,
      };
    });
  }, [
    mediaLibrary,
    sourceToTrackMap,
    isGeneratingSpriteSheet,
    isGeneratingWaveform,
  ]);

  const getFilteredFiles = useCallback(
    (type: 'all' | 'videos' | 'audio' | 'images' | 'subtitles') => {
      return getMediaItems.filter((item) => {
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
    },
    [getMediaItems],
  );

  const getTabContent = useCallback(
    (type: 'all' | 'videos' | 'audio' | 'images' | 'subtitles') => {
      const filteredFiles = getFilteredFiles(type);
      return filteredFiles.length > 0
        ? fileListContent(filteredFiles, type)
        : uploadArea;
    },
    [
      getMediaItems,
      getFilteredFiles,
      uploadArea,
      dragActive,
      handleDragIn,
      handleDragOut,
      handleDrag,
      handleDrop,
    ],
  );

  return (
    <>
      <BasePanel
        title="Your uploads"
        description="Import and manage media files"
        className={className}
      >
        <div className="flex flex-col flex-1 min-h-0 gap-4">
          {/* Upload Button */}
          <Button
            onClick={async () => {
              const result = await importMediaFromDialog();
              if (!result || (!result.success && !result.error)) return;

              if (result.success && result.importedFiles.length > 0) {
                console.log(
                  `✅ Successfully imported ${result.importedFiles.length} files via upload button`,
                );
              } else {
                // Use the actual error message from validation results
                const errorMessage =
                  result.error ||
                  'All files were rejected due to corruption or invalid format';
                toast.error(errorMessage);
              }
            }}
            className="w-full"
          >
            Upload Files
            <Download />
          </Button>

          {/* Tab Navigation and Content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <Tabs
              defaultValue="all"
              className="flex-1 min-h-0 gap-4 flex flex-col"
            >
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

              <TabsContent value="all" className="flex-1 min-h-0">
                {getTabContent('all')}
              </TabsContent>
              <TabsContent value="videos" className="flex-1 min-h-0">
                {getTabContent('videos')}
              </TabsContent>
              <TabsContent value="audio" className="flex-1 min-h-0">
                {getTabContent('audio')}
              </TabsContent>
              <TabsContent value="images" className="flex-1 min-h-0">
                {getTabContent('images')}
              </TabsContent>
              <TabsContent value="subtitles" className="flex-1 min-h-0">
                {getTabContent('subtitles')}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </BasePanel>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmation.show}
        onOpenChange={handleDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Media</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete{' '}
                <span className="font-semibold text-foreground">
                  "{deleteConfirmation.mediaName}"
                </span>
                ?
              </p>
              {deleteConfirmation.affectedTracksCount > 0 && (
                <p className="text-destructive font-medium">
                  This will also remove {deleteConfirmation.affectedTracksCount}{' '}
                  track
                  {deleteConfirmation.affectedTracksCount !== 1 ? 's' : ''} from
                  the timeline that use this media.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
