import { KaraokeIcon } from '@/frontend/assets/icons/karaoke';
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/frontend/components/ui/context-menu';
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
  PlusCircle,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BasePanel } from '../../../components/panels/basePanel';
import { CustomPanelProps } from '../../../components/panels/panelRegistry';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';

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
  isGeneratingSubtitles?: boolean;
  subtitleProgress?: number;
  hasGeneratedKaraoke?: boolean;
}

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
  const currentTranscribingMediaId = useVideoEditorStore(
    (state) => state.currentTranscribingMediaId,
  );
  const transcriptionProgress = useVideoEditorStore(
    (state) => state.transcriptionProgress,
  );

  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      const hasMediaId = e.dataTransfer.types.includes('text/plain');
      const hasFiles = e.dataTransfer.types.includes('Files');
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
        const loadingToast = toast.loading(
          `Validating and importing ${files.length} ${files.length === 1 ? 'file' : 'files'}...`,
        );
        const result = await importMediaFromDrop(files);
        if (!result || (!result.success && !result.error)) return;
        toast.dismiss(loadingToast);
        const importedCount = result.importedFiles.length;
        const rejectedCount = result.rejectedFiles?.length || 0;
        if (importedCount > 0) {
          toast.success(
            `Successfully imported ${importedCount} ${importedCount === 1 ? 'file' : 'files'}` +
              (rejectedCount > 0 ? ` (${rejectedCount} rejected)` : ''),
          );
        } else if (rejectedCount > 0) {
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
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragActive(false);
      const mediaId = e.dataTransfer.getData('text/plain');
      if (mediaId) {
        return;
      }
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

  const removeFile = (id: string) => {
    const mediaItem = mediaLibrary.find((item) => item.id === id);
    if (!mediaItem) {
      console.warn(`Media item ${id} not found`);
      return;
    }
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
      removeFromMediaLibrary(deleteConfirmation.mediaId, true);
      console.log(
        `✅ Successfully deleted media "${deleteConfirmation.mediaName}" and ${deleteConfirmation.affectedTracksCount} associated track(s)`,
      );
    } catch (error) {
      console.error('Failed to remove media:', error);
    }
  }, [deleteConfirmation, removeFromMediaLibrary]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDeleteConfirmation({
        show: false,
        mediaId: null,
        mediaName: '',
        affectedTracksCount: 0,
      });
    }
  }, []);

  const handleMediaDragStart = useCallback(
    (e: React.DragEvent, mediaId: string) => {
      setDraggedMediaId(mediaId);
      e.dataTransfer.setData('text/plain', mediaId);
      e.dataTransfer.effectAllowed = 'copy';
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

  const handleAddToTimeline = useCallback(
    async (fileId: string) => {
      await addTrackFromMediaLibrary(fileId, 0);
      toast.success('Added to timeline');
    },
    [addTrackFromMediaLibrary],
  );

  const generateKaraokeSubtitles = useVideoEditorStore(
    (state) => state.generateKaraokeSubtitles,
  );
  const removeTrack = useVideoEditorStore((state) => state.removeTrack);

  const [karaokeConfirmation, setKaraokeConfirmation] = useState<{
    show: boolean;
    mediaId: string | null;
    mediaName: string;
    existingSubtitleCount: number;
  }>({
    show: false,
    mediaId: null,
    mediaName: '',
    existingSubtitleCount: 0,
  });

  const handleGenerateKaraokeSubtitles = useCallback(
    (fileId: string) => {
      const mediaItem = mediaLibrary.find((item) => item.id === fileId);
      if (!mediaItem) {
        toast.error('Media item not found');
        return;
      }

      // Check if there are existing subtitle tracks
      const existingSubtitles = tracks.filter(
        (track) => track.type === 'subtitle',
      );

      if (existingSubtitles.length > 0) {
        // Show confirmation dialog
        setKaraokeConfirmation({
          show: true,
          mediaId: fileId,
          mediaName: mediaItem.name,
          existingSubtitleCount: existingSubtitles.length,
        });
      } else {
        // No existing subtitles, proceed directly
        handleConfirmKaraokeGeneration(fileId);
      }
    },
    [mediaLibrary, tracks],
  );

  const handleConfirmKaraokeGeneration = useCallback(
    async (fileId: string, deleteExisting = false) => {
      const mediaItem = mediaLibrary.find((item) => item.id === fileId);
      if (!mediaItem) {
        toast.error('Media item not found');
        return;
      }

      // Delete existing subtitles if requested
      if (deleteExisting) {
        const existingSubtitles = tracks.filter(
          (track) => track.type === 'subtitle',
        );
        console.log(
          `🗑️ Deleting ${existingSubtitles.length} existing subtitle tracks...`,
        );
        for (const track of existingSubtitles) {
          removeTrack(track.id);
        }
      }

      try {
        const result = await generateKaraokeSubtitles(fileId, {
          model: 'base',
          onProgress: (progress) => {
            console.log('📊 Transcription progress:', progress);
          },
        });

        console.log('🎤 Karaoke Generation Result:', result);

        // Log detailed transcription info if available
        if (result.transcriptionResult) {
          console.log('\n📝 Transcription Details:');
          console.log('   Language:', result.transcriptionResult.language);
          console.log(
            '   Confidence:',
            (result.transcriptionResult.language_probability * 100).toFixed(1) +
              '%',
          );
          console.log(
            '   Duration:',
            result.transcriptionResult.duration.toFixed(2) + 's',
          );
          console.log(
            '   Processing Time:',
            result.transcriptionResult.processing_time.toFixed(2) + 's',
          );
          console.log('   Model:', result.transcriptionResult.model);
          console.log('   Device:', result.transcriptionResult.device);
          console.log('   Segments:', result.transcriptionResult.segment_count);
          if (result.transcriptionResult.real_time_factor) {
            console.log(
              '   Speed:',
              result.transcriptionResult.real_time_factor.toFixed(2) + 'x',
              result.transcriptionResult.faster_than_realtime ? '🚀' : '',
            );
          }
          console.log('\n📄 Full Text:', result.transcriptionResult.text);
          console.log('\n🎯 Word Timestamps:');
          result.transcriptionResult.segments.forEach((segment, idx) => {
            console.log(
              `\n  Segment ${idx + 1} [${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s]:`,
              segment.text,
            );
            if (segment.words) {
              segment.words.forEach((word) => {
                console.log(
                  `    [${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s] "${word.word}" (confidence: ${(word.confidence * 100).toFixed(1)}%)`,
                );
              });
            }
          });
        }

        if (result.success && result.trackIds) {
          toast.success(
            `Successfully generated ${result.trackIds.length} karaoke subtitle tracks!`,
          );
        } else {
          toast.error(result.error || 'Failed to generate karaoke subtitles');
        }
      } catch (error) {
        console.error('Error generating karaoke subtitles:', error);
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to generate karaoke subtitles',
        );
      }
    },
    [mediaLibrary, tracks, generateKaraokeSubtitles, removeTrack],
  );

  const handleKaraokeDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setKaraokeConfirmation({
        show: false,
        mediaId: null,
        mediaName: '',
        existingSubtitleCount: 0,
      });
    }
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

  const MediaCover: React.FC<{ file: MediaItem }> = React.memo(({ file }) => {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const [hasError, setHasError] = useState(false);

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
            {file.duration && (
              <Badge className="absolute bottom-2 left-2 bg-black/20 text-white group-hover:opacity-0 transition-opacity duration-200">
                <Clock
                  className="-ms-0.5 opacity-60"
                  size={12}
                  aria-hidden="true"
                />
                {formatDuration(file.duration)}
              </Badge>
            )}
            {file.hasGeneratedKaraoke && (
              <Badge className="p-[5px] absolute top-2 right-2 bg-black/20 text-white group-hover:opacity-0 transition-opacity duration-200">
                <KaraokeIcon />
              </Badge>
            )}
          </div>
        );
      }
    }

    if (isImage || isVideo) {
      if (hasError) {
        return (
          <div className="w-full h-full bg-gradient-to-br from-secondary via-blue-300/50 to-secondary rounded-md flex items-center justify-center text-muted-foreground relative">
            {getFileIcon(file.type, file.name)}
            {file.duration && (
              <Badge className="absolute bottom-2 left-2 bg-black/20 text-white group-hover:opacity-0 transition-opacity duration-200">
                <Clock
                  className="-ms-0.5 opacity-60"
                  size={12}
                  aria-hidden="true"
                />
                {formatDuration(file.duration)}
              </Badge>
            )}
            {file.hasGeneratedKaraoke && (
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md p-1.5 group-hover:opacity-0 transition-opacity duration-200">
                <KaraokeIcon className="w-4 h-4 text-white" />
              </div>
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
            <video
              src={file.url}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
              onError={() => setHasError(true)}
              onLoadedMetadata={(e) => {
                const video = e.target as HTMLVideoElement;
                video.currentTime = 1;
              }}
            />
          )}
          {file.duration && (
            <Badge className="absolute bottom-2 left-2 bg-black/20 text-white group-hover:opacity-0 transition-opacity duration-200">
              <Clock
                className="-ms-0.5 opacity-60"
                size={12}
                aria-hidden="true"
              />
              {formatDuration(file.duration)}
            </Badge>
          )}
          {file.hasGeneratedKaraoke && (
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md p-1.5 group-hover:opacity-0 transition-opacity duration-200">
              <KaraokeIcon className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-gradient-to-br from-secondary via-blue-300/50 to-secondary rounded-md flex items-center justify-center text-muted-foreground relative">
        {getFileIcon(file.type, file.name)}
        {file.duration && (
          <Badge className="absolute bottom-2 left-2 bg-black/20 text-white group-hover:opacity-0 transition-opacity duration-200">
            <Clock
              className="-ms-0.5 opacity-60"
              size={12}
              aria-hidden="true"
            />
            {formatDuration(file.duration)}
          </Badge>
        )}
        {file.hasGeneratedKaraoke && (
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-md p-1.5 group-hover:opacity-0 transition-opacity duration-200">
            <KaraokeIcon className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    );
  });

  const FileItem: React.FC<{ file: MediaItem }> = React.memo(
    ({ file }) => (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex flex-col space-y-2">
            <div
              draggable={
                !file.isOnTimeline &&
                !file.isGeneratingSprites &&
                !file.isGeneratingWaveform &&
                !file.isGeneratingSubtitles
              }
              onDragStart={(e) => {
                if (
                  !file.isOnTimeline &&
                  !file.isGeneratingSprites &&
                  !file.isGeneratingWaveform &&
                  !file.isGeneratingSubtitles
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
                  !file.isGeneratingSubtitles &&
                  'cursor-grab active:cursor-grabbing',
                (file.isOnTimeline ||
                  file.isGeneratingSprites ||
                  file.isGeneratingWaveform ||
                  file.isGeneratingSubtitles) &&
                  'cursor-default',
                draggedMediaId === file.id && 'opacity-50',
                (file.isGeneratingSprites ||
                  file.isGeneratingWaveform ||
                  file.isGeneratingSubtitles) &&
                  'opacity-60 pointer-events-none',
              )}
              onClick={async () => {
                if (
                  !file.isOnTimeline &&
                  !file.isGeneratingSprites &&
                  !file.isGeneratingWaveform &&
                  !file.isGeneratingSubtitles
                ) {
                  await addTrackFromMediaLibrary(file.id, 0);
                }
              }}
              title={
                file.isGeneratingSprites
                  ? 'Generating sprite sheets...'
                  : file.isGeneratingWaveform
                    ? 'Generating waveform...'
                    : file.isGeneratingSubtitles
                      ? 'Generating subtitles...'
                      : file.isOnTimeline
                        ? 'Already on timeline'
                        : 'Click or drag to add to timeline (starts at frame 0)'
              }
            >
              <MediaCover file={file} />
              {(file.isGeneratingSprites || file.isGeneratingWaveform) && (
                <div className="absolute bottom-0 p-2 left-0 right-0 h-8 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-end">
                  <Loader2 className="w-5 h-5 animate-spin text-white drop-shadow-lg" />
                </div>
              )}
              {file.isGeneratingSubtitles && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                  <div className="relative w-16 h-16">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                        className="text-white/20"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 28}`}
                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - (file.subtitleProgress || 0) / 100)}`}
                        className="text-white transition-all duration-300"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-white text-sm font-semibold drop-shadow-lg">
                        {Math.round(file.subtitleProgress || 0)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="absolute top-2 right-2 flex items-center space-x-1">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
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
              {file.isOnTimeline && (
                <Badge className="absolute top-2 left-2 bg-black/20 text-white group-hover:opacity-0 transition-opacity duration-200">
                  Added
                </Badge>
              )}
            </div>
            <div className="px-1">
              <p className="text-xs font-medium text-foreground truncate">
                {file.name}
              </p>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-fit !text-xs">
          <ContextMenuItem
            onClick={() => removeFile(file.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete</span>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={
              file.isOnTimeline ||
              file.isGeneratingSprites ||
              file.isGeneratingWaveform ||
              file.isGeneratingSubtitles
            }
            onClick={() => handleAddToTimeline(file.id)}
          >
            <PlusCircle className="h-4 w-4" />
            <span>Add to Timeline</span>
          </ContextMenuItem>
          {(file.type.startsWith('video/') ||
            file.type.startsWith('audio/')) && (
            <ContextMenuItem
              disabled={file.isGeneratingSubtitles}
              onClick={() => handleGenerateKaraokeSubtitles(file.id)}
            >
              <KaraokeIcon className="h-4 w-4" />
              <span>Generate Karaoke Subtitles</span>
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    ),
    (prevProps, nextProps) => {
      return (
        prevProps.file.id === nextProps.file.id &&
        prevProps.file.name === nextProps.file.name &&
        prevProps.file.isOnTimeline === nextProps.file.isOnTimeline &&
        prevProps.file.size === nextProps.file.size &&
        prevProps.file.duration === nextProps.file.duration &&
        prevProps.file.isGeneratingSprites ===
          nextProps.file.isGeneratingSprites &&
        prevProps.file.isGeneratingWaveform ===
          nextProps.file.isGeneratingWaveform &&
        prevProps.file.isGeneratingSubtitles ===
          nextProps.file.isGeneratingSubtitles &&
        prevProps.file.subtitleProgress === nextProps.file.subtitleProgress &&
        prevProps.file.hasGeneratedKaraoke ===
          nextProps.file.hasGeneratedKaraoke
      );
    },
  );

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
      {dragActive && (
        <div className="absolute inset-0 border-2 border-dashed flex items-center justify-center border-secondary bg-secondary/10 rounded-lg pointer-events-none z-10">
          <p className="text-sm text-muted-foreground">Drop files to import</p>
        </div>
      )}
    </div>
  );

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

  const getMediaItems = useMemo((): MediaItem[] => {
    return mediaLibrary.map((item) => {
      const trackId = sourceToTrackMap.get(item.source);
      const isUsed = !!trackId;
      const isTranscribing = currentTranscribingMediaId === item.id;
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
        isGeneratingSubtitles: isTranscribing,
        subtitleProgress: isTranscribing ? transcriptionProgress?.progress : 0,
        hasGeneratedKaraoke: item.hasGeneratedKaraoke,
      };
    });
  }, [
    mediaLibrary,
    sourceToTrackMap,
    isGeneratingSpriteSheet,
    isGeneratingWaveform,
    currentTranscribingMediaId,
    transcriptionProgress,
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
          <Button
            onClick={async () => {
              const result = await importMediaFromDialog();
              if (!result || (!result.success && !result.error)) return;
              if (result.success && result.importedFiles.length > 0) {
                console.log(
                  `✅ Successfully imported ${result.importedFiles.length} files via upload button`,
                );
              } else {
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

      <AlertDialog
        open={karaokeConfirmation.show}
        onOpenChange={handleKaraokeDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Generate Karaoke Subtitles for{' '}
              <span className="font-normal text-foreground">
                "{karaokeConfirmation.mediaName}"
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {karaokeConfirmation.existingSubtitleCount > 0 && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-amber-600 dark:text-amber-400 font-medium text-sm">
                    ⚠️ You have {karaokeConfirmation.existingSubtitleCount}{' '}
                    existing subtitle track
                    {karaokeConfirmation.existingSubtitleCount !== 1
                      ? 's'
                      : ''}{' '}
                    on the timeline.
                  </p>
                  <p className="text-amber-600/80 dark:text-amber-400/80 text-xs mt-1">
                    Do you want to delete them before generating new karaoke
                    subtitles?
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                This will use Whisper AI to transcribe the audio and create
                word-level subtitle tracks for karaoke-style animations.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {karaokeConfirmation.existingSubtitleCount > 0 && (
              <AlertDialogAction
                onClick={() => {
                  if (karaokeConfirmation.mediaId) {
                    handleConfirmKaraokeGeneration(
                      karaokeConfirmation.mediaId,
                      true,
                    );
                    handleKaraokeDialogOpenChange(false);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete & Generate
              </AlertDialogAction>
            )}
            <AlertDialogAction
              onClick={() => {
                if (karaokeConfirmation.mediaId) {
                  handleConfirmKaraokeGeneration(
                    karaokeConfirmation.mediaId,
                    false,
                  );
                  handleKaraokeDialogOpenChange(false);
                }
              }}
            >
              {karaokeConfirmation.existingSubtitleCount > 0
                ? 'Keep & Generate'
                : 'Generate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
