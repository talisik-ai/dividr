import { KaraokeIcon } from '@/frontend/assets/icons/karaoke';
import { RuntimeDownloadModal } from '@/frontend/components/custom/RuntimeDownloadModal';
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
  File,
  Image,
  Loader2,
  Music,
  PlusCircle,
  Trash,
  Trash2,
  Video,
} from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BasePanel } from '../../../components/panels/basePanel';
import { CustomPanelProps } from '../../../components/panels/panelRegistry';
import {
  importMediaFromDialogUnified,
  importMediaUnified,
} from '../../../services/mediaImportService';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';
import { VideoTrack } from '../../../stores/videoEditor/types';
import { isSubtitleFile } from '../../../stores/videoEditor/utils/subtitleParser';
import { getNextAvailableRowIndex } from '../../../timeline/utils/dynamicTrackRows';
import { DuplicateMediaDialog } from '../../dialogs/batchDuplicateMediaDialog';
import { KaraokeConfirmationDialog } from '../../dialogs/karaokeConfirmationDialog';
import { ProxyWarningDialog } from '../../dialogs/proxyWarningDialog';

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
  // Transcoding status for AVI and other browser-incompatible formats
  isTranscoding?: boolean;
  transcodingProgress?: number;
  transcodingFailed?: boolean;
  transcodingError?: string;
  // Proxy generation status for 4K+ videos
  isProxyProcessing?: boolean;
  isProxyReady?: boolean;
  proxyFailed?: boolean;
  resolution?: { width: number; height: number };
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
  const importMediaToTimeline = useVideoEditorStore(
    (state) => state.importMediaToTimeline,
  );
  const addTrackFromMediaLibrary = useVideoEditorStore(
    (state) => state.addTrackFromMediaLibrary,
  );
  const removeFromMediaLibrary = useVideoEditorStore(
    (state) => state.removeFromMediaLibrary,
  );
  const beginGroup = useVideoEditorStore((state) => state.beginGroup);
  const endGroup = useVideoEditorStore((state) => state.endGroup);
  const removeTrack = useVideoEditorStore((state) => state.removeTrack);
  const isGeneratingSpriteSheet = useVideoEditorStore(
    (state) => state.isGeneratingSpriteSheet,
  );
  const isGeneratingWaveform = useVideoEditorStore(
    (state) => state.isGeneratingWaveform,
  );
  const currentTranscribingMediaId = useVideoEditorStore(
    (state) => state.currentTranscribingMediaId,
  );
  const currentTranscribingTrackId = useVideoEditorStore(
    (state) => state.currentTranscribingTrackId,
  );
  const transcriptionProgress = useVideoEditorStore(
    (state) => state.transcriptionProgress,
  );

  // Duplicate detection state (unified for single or multiple files)
  const batchDuplicateDetection = useVideoEditorStore(
    (state) => state.batchDuplicateDetection,
  );
  const hideBatchDuplicateDialog = useVideoEditorStore(
    (state) => state.hideBatchDuplicateDialog,
  );

  // Check if any transcription is in progress (from media library or timeline)
  const isAnyTranscribing = !!(
    currentTranscribingMediaId || currentTranscribingTrackId
  );

  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);
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

  const [subtitleImportConfirmation, setSubtitleImportConfirmation] = useState<{
    show: boolean;
    mediaId: string | null;
    mediaName: string;
    targetFrame: number;
    generatedSubtitleIds: string[];
  }>({
    show: false,
    mediaId: null,
    mediaName: '',
    targetFrame: 0,
    generatedSubtitleIds: [],
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
      await importMediaUnified(
        files,
        'library-drop',
        {
          importMediaFromDrop,
          importMediaToTimeline,
          addTrackFromMediaLibrary,
        },
        { addToTimeline: false, showToasts: true },
      );
    },
    [importMediaFromDrop, importMediaToTimeline, addTrackFromMediaLibrary],
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

  const handleSubtitleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSubtitleImportConfirmation({
        show: false,
        mediaId: null,
        mediaName: '',
        targetFrame: 0,
        generatedSubtitleIds: [],
      });
    }
  }, []);

  const handleConfirmSubtitleImport = useCallback(
    async (deleteExisting: boolean) => {
      if (!subtitleImportConfirmation.mediaId) {
        handleSubtitleDialogOpenChange(false);
        return;
      }

      const { mediaId, mediaName, targetFrame, generatedSubtitleIds } =
        subtitleImportConfirmation;

      if (deleteExisting) {
        beginGroup?.(`Import Subtitles for ${mediaName}`);
      }

      try {
        if (deleteExisting && generatedSubtitleIds.length > 0) {
          generatedSubtitleIds.forEach((id) => removeTrack(id));
        }

        const latestTracks = (
          useVideoEditorStore.getState() as { tracks: VideoTrack[] }
        ).tracks;
        const subtitleRowIndex = getNextAvailableRowIndex(
          latestTracks,
          'subtitle',
        );

        await addTrackFromMediaLibrary(mediaId, targetFrame, subtitleRowIndex);
      } finally {
        if (deleteExisting) {
          endGroup?.();
        }
        handleSubtitleDialogOpenChange(false);
      }
    },
    [
      subtitleImportConfirmation,
      handleSubtitleDialogOpenChange,
      beginGroup,
      removeTrack,
      addTrackFromMediaLibrary,
      endGroup,
    ],
  );

  const handleMediaDragStart = useCallback(
    (e: React.DragEvent, mediaId: string) => {
      const mediaItem = mediaLibrary.find((item) => item.id === mediaId);
      const payload = mediaItem
        ? {
            mediaId,
            type: mediaItem.type,
            duration: mediaItem.duration,
            mimeType: mediaItem.mimeType,
            thumbnail: mediaItem.thumbnail || mediaItem.previewUrl,
            waveform: mediaItem.waveform?.cacheKey,
            source: mediaItem.source,
          }
        : { mediaId };

      // Provide both JSON and plain text for compatibility with existing handlers
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      e.dataTransfer.setData('text/plain', mediaId);
      e.dataTransfer.effectAllowed = 'copy';

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

  // Proxy warning dialog state for 4K+ videos
  const [proxyWarning, setProxyWarning] = useState<{
    show: boolean;
    mediaId: string | null;
    mediaName: string;
    resolution?: { width: number; height: number };
  }>({
    show: false,
    mediaId: null,
    mediaName: '',
    resolution: undefined,
  });

  const handleAddToTimeline = useCallback(
    async (fileId: string, bypassProxyCheck = false) => {
      const mediaItem = mediaLibrary.find((item) => item.id === fileId);

      // Check if this is a 4K+ video with proxy still processing
      // ALWAYS show warning for processing proxy, even on high-end hardware
      if (
        !bypassProxyCheck &&
        mediaItem?.type === 'video' &&
        mediaItem.proxy?.status === 'processing'
      ) {
        setProxyWarning({
          show: true,
          mediaId: fileId,
          mediaName: mediaItem.name,
          resolution:
            mediaItem.metadata?.width && mediaItem.metadata?.height
              ? {
                  width: mediaItem.metadata.width,
                  height: mediaItem.metadata.height,
                }
              : undefined,
        });
        return;
      }

      const isSubtitleDrop =
        mediaItem?.type === 'subtitle' ||
        (mediaItem?.name ? isSubtitleFile(mediaItem.name) : false);

      const generatedSubtitles = tracks.filter(
        (track) =>
          track.type === 'subtitle' && track.subtitleType === 'karaoke',
      );

      if (isSubtitleDrop && generatedSubtitles.length > 0) {
        setSubtitleImportConfirmation({
          show: true,
          mediaId: fileId,
          mediaName: mediaItem?.name || 'Subtitles',
          targetFrame: 0,
          generatedSubtitleIds: generatedSubtitles.map((t) => t.id),
        });
        return;
      }

      const subtitleRowIndex =
        isSubtitleDrop && tracks.length > 0
          ? getNextAvailableRowIndex(tracks as VideoTrack[], 'subtitle')
          : undefined;

      await addTrackFromMediaLibrary(fileId, 0, subtitleRowIndex);
      toast.success('Added to timeline');
    },
    [addTrackFromMediaLibrary, mediaLibrary, tracks],
  );

  const handleProxyWarningClose = useCallback(() => {
    setProxyWarning({
      show: false,
      mediaId: null,
      mediaName: '',
      resolution: undefined,
    });
  }, []);

  const handleProxyUseAnyway = useCallback(async () => {
    if (proxyWarning.mediaId) {
      // Add to timeline anyway, bypassing proxy check
      await handleAddToTimeline(proxyWarning.mediaId, true);
    }
    handleProxyWarningClose();
  }, [proxyWarning.mediaId, handleAddToTimeline, handleProxyWarningClose]);

  const handleProxyWaitForOptimization = useCallback(() => {
    // Just close the dialog - user chose to wait
    handleProxyWarningClose();
    toast.info('Asset will be available once optimization completes');
  }, [handleProxyWarningClose]);

  const generateKaraokeSubtitles = useVideoEditorStore(
    (state) => state.generateKaraokeSubtitles,
  );

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

  // Runtime download modal state
  const [showRuntimeModal, setShowRuntimeModal] = useState(false);
  const [pendingKaraokeAction, setPendingKaraokeAction] = useState<{
    fileId: string;
    deleteExisting: boolean;
  } | null>(null);

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

      // Delete existing subtitles if requested (using batch delete)
      if (deleteExisting) {
        const existingSubtitles = tracks.filter(
          (track) => track.type === 'subtitle',
        );
        console.log(
          `🗑️ Deleting ${existingSubtitles.length} existing subtitle tracks...`,
        );
        // Batch delete for better performance
        if (existingSubtitles.length > 0) {
          const { setSelectedTracks, removeSelectedTracks } =
            useVideoEditorStore.getState();
          setSelectedTracks(existingSubtitles.map((t) => t.id));
          removeSelectedTracks();
        }
      }

      try {
        const result = await generateKaraokeSubtitles(fileId, {
          model: 'base',
          keepExistingSubtitles:
            !deleteExisting &&
            tracks.some((track) => track.type === 'subtitle'),
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
        } else if (result.requiresDownload) {
          // Runtime not installed - show download modal
          setPendingKaraokeAction({ fileId, deleteExisting });
          setShowRuntimeModal(true);
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

  // Handler for successful runtime download - retry pending karaoke generation
  const handleRuntimeDownloadSuccess = useCallback(() => {
    if (pendingKaraokeAction) {
      const { fileId, deleteExisting } = pendingKaraokeAction;
      setPendingKaraokeAction(null);
      // Retry the karaoke generation
      handleConfirmKaraokeGeneration(fileId, deleteExisting);
    }
  }, [pendingKaraokeAction, handleConfirmKaraokeGeneration]);

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
          await importMediaFromDialogUnified(
            importMediaFromDialog,
            {
              importMediaFromDrop,
              importMediaToTimeline,
              addTrackFromMediaLibrary,
            },
            { addToTimeline: false, showToasts: true },
          );
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
          <div className="w-full h-full bg-muted rounded-md overflow-hidden relative flex items-center justify-center">
            <img
              src={mediaLibraryItem.thumbnail}
              alt={file.name}
              className="w-full h-full object-contain"
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
              <Badge className="p-[5px] absolute top-2 right-2 bg-black/20 text-white group-hover:opacity-0 transition-opacity duration-200">
                <KaraokeIcon />
              </Badge>
            )}
          </div>
        );
      }

      return (
        <div className="w-full h-full bg-muted rounded-md overflow-hidden relative flex items-center justify-center">
          {isImage ? (
            <img
              src={file.url}
              alt={file.name}
              className="w-full h-full object-contain"
              loading="lazy"
              onError={() => setHasError(true)}
            />
          ) : (
            <video
              src={file.url}
              className="w-full h-full object-contain"
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
            <Badge className="p-[5px] absolute top-2 right-2 bg-black/20 text-white group-hover:opacity-0 transition-opacity duration-200">
              <KaraokeIcon />
            </Badge>
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
          <Badge className="p-[5px] absolute top-2 right-2 bg-black/20 text-white group-hover:opacity-0 transition-opacity duration-200">
            <KaraokeIcon />
          </Badge>
        )}
      </div>
    );
  });

  const FileItem: React.FC<{
    file: MediaItem;
    isAnyTranscribing: boolean;
  }> = React.memo(
    ({ file, isAnyTranscribing }) => {
      // Determine if media is busy (processing something)
      const isBusy =
        file.isGeneratingSprites ||
        file.isGeneratingWaveform ||
        file.isGeneratingSubtitles ||
        file.isTranscoding;

      return (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex flex-col space-y-2">
              <div
                draggable={!file.isOnTimeline}
                onDragStart={(e) => {
                  if (!file.isOnTimeline) {
                    handleMediaDragStart(e, file.id);
                  } else {
                    e.preventDefault();
                  }
                }}
                className={cn(
                  'group relative h-[98px] rounded-md transition-all duration-200 overflow-hidden',
                  !file.isOnTimeline && 'cursor-grab active:cursor-grabbing',
                  file.isOnTimeline && 'cursor-default',
                )}
                onClick={async () => {
                  if (!file.isOnTimeline) {
                    await handleAddToTimeline(file.id);
                  }
                }}
                title={
                  file.isTranscoding
                    ? `Converting to MP4... ${Math.round(file.transcodingProgress || 0)}%`
                    : file.transcodingFailed
                      ? `Conversion failed: ${file.transcodingError || 'Unknown error'}`
                      : file.isProxyProcessing
                        ? 'Generating optimized preview for smooth editing...'
                        : file.isGeneratingSprites
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
                {/* Unified processing indicator - only for transcoding */}
                {(file.isTranscoding || file.isProxyProcessing) && (
                  <div className="absolute bottom-0 p-2 left-0 right-0 h-8 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-end">
                    <Loader2 className="w-5 h-5 animate-spin text-white drop-shadow-lg" />
                  </div>
                )}
                {file.isGeneratingSubtitles && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                    <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                      <circle
                        cx="20"
                        cy="20"
                        r="16"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        className="text-white/20"
                      />
                      <circle
                        cx="20"
                        cy="20"
                        r="16"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 16}`}
                        strokeDashoffset={`${2 * Math.PI * 16 * (1 - (file.subtitleProgress || 0) / 100)}`}
                        className="text-white transition-all duration-300"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                )}
                {/* Transcoding failed indicator */}
                {file.transcodingFailed && !file.isTranscoding && (
                  <div className="absolute top-2 right-2">
                    <Badge
                      variant="destructive"
                      className="text-[10px] px-1.5 py-0.5"
                      title={file.transcodingError || 'Conversion failed'}
                    >
                      Failed
                    </Badge>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="absolute bottom-1 right-2">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(file.id);
                      }}
                      variant="ghost"
                      size="sm"
                      className="!size-5 !p-1.5 rounded-sm bg-accent/20"
                      title="Remove from media library"
                    >
                      <Trash className="h-3 w-3" />
                    </Button>
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
              className="group text-red-500 dark:text-red-400 focus:text-red-600 dark:focus:text-red-300 data-[highlighted]:bg-red-500/10 dark:data-[highlighted]:bg-red-400/20 data-[highlighted]:text-red-600 dark:data-[highlighted]:text-red-300"
            >
              <Trash2 className="h-3 w-3 text-current" />
              <span>Delete</span>
            </ContextMenuItem>
            <ContextMenuItem
              disabled={file.isOnTimeline}
              onClick={() => handleAddToTimeline(file.id)}
            >
              <PlusCircle className="h-4 w-4" />
              <span>Add to Timeline</span>
            </ContextMenuItem>
            {(file.type.startsWith('video/') ||
              file.type.startsWith('audio/')) && (
              <ContextMenuItem
                disabled={file.isGeneratingSubtitles || isAnyTranscribing}
                onClick={() => handleGenerateKaraokeSubtitles(file.id)}
              >
                <KaraokeIcon className="h-4 w-4" />
                <span>Generate Karaoke Subtitles</span>
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      );
    },
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
          nextProps.file.hasGeneratedKaraoke &&
        prevProps.file.isTranscoding === nextProps.file.isTranscoding &&
        prevProps.file.transcodingProgress ===
          nextProps.file.transcodingProgress &&
        prevProps.file.transcodingFailed === nextProps.file.transcodingFailed &&
        prevProps.isAnyTranscribing === nextProps.isAnyTranscribing
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
            <FileItem
              key={file.id}
              file={file}
              isAnyTranscribing={isAnyTranscribing}
            />
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

      // Check transcoding status
      const isTranscoding =
        item.transcoding?.status === 'pending' ||
        item.transcoding?.status === 'processing';
      const transcodingFailed = item.transcoding?.status === 'failed';

      // Check proxy status (for 4K+ videos)
      const isProxyProcessing = item.proxy?.status === 'processing';
      const isProxyReady = item.proxy?.status === 'ready';
      const proxyFailed = item.proxy?.status === 'failed';

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
        isTranscoding,
        transcodingProgress: item.transcoding?.progress ?? 0,
        transcodingFailed,
        transcodingError: item.transcoding?.error,
        // Proxy status for 4K+ videos
        isProxyProcessing,
        isProxyReady,
        proxyFailed,
        resolution:
          item.metadata?.width && item.metadata?.height
            ? { width: item.metadata.width, height: item.metadata.height }
            : undefined,
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
              await importMediaFromDialogUnified(
                importMediaFromDialog,
                {
                  importMediaFromDrop,
                  importMediaToTimeline,
                  addTrackFromMediaLibrary,
                },
                { addToTimeline: false, showToasts: true },
              );
            }}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/80 font-normal text-sm rounded-sm"
            variant="ghost"
          >
            Import
            <PlusCircle className="size-4" />
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

      <KaraokeConfirmationDialog
        open={subtitleImportConfirmation.show}
        onOpenChange={handleSubtitleDialogOpenChange}
        mediaName={subtitleImportConfirmation.mediaName}
        existingSubtitleCount={
          subtitleImportConfirmation.generatedSubtitleIds.length
        }
        onConfirm={handleConfirmSubtitleImport}
        mode="import"
      />

      <KaraokeConfirmationDialog
        open={karaokeConfirmation.show}
        onOpenChange={handleKaraokeDialogOpenChange}
        mediaName={karaokeConfirmation.mediaName}
        existingSubtitleCount={karaokeConfirmation.existingSubtitleCount}
        onConfirm={(deleteExisting) => {
          if (karaokeConfirmation.mediaId) {
            handleConfirmKaraokeGeneration(
              karaokeConfirmation.mediaId,
              deleteExisting,
            );
          }
        }}
      />

      {/* Unified duplicate media dialog - works for single or multiple duplicates */}
      <DuplicateMediaDialog
        open={batchDuplicateDetection?.show ?? false}
        onOpenChange={(open) => {
          if (!open) {
            // Skip all duplicates if dialog closed (use existing)
            const skipChoices = new Map<string, 'use-existing'>();
            batchDuplicateDetection?.duplicates?.forEach((dup) => {
              skipChoices.set(dup.id, 'use-existing');
            });
            batchDuplicateDetection?.pendingResolve?.(skipChoices);
            hideBatchDuplicateDialog?.();
          }
        }}
        duplicates={batchDuplicateDetection?.duplicates ?? []}
        onConfirm={(choices) => {
          batchDuplicateDetection?.pendingResolve?.(choices);
          hideBatchDuplicateDialog?.();
        }}
        onCancel={() => {
          // Skip all duplicates (use existing)
          const skipChoices = new Map<string, 'use-existing'>();
          batchDuplicateDetection?.duplicates?.forEach((dup) => {
            skipChoices.set(dup.id, 'use-existing');
          });
          batchDuplicateDetection?.pendingResolve?.(skipChoices);
          hideBatchDuplicateDialog?.();
        }}
      />

      {/* Runtime download modal for transcription feature */}
      <RuntimeDownloadModal
        isOpen={showRuntimeModal}
        onClose={() => {
          setShowRuntimeModal(false);
          setPendingKaraokeAction(null);
        }}
        onSuccess={handleRuntimeDownloadSuccess}
        featureName="Karaoke Subtitle Generation"
      />

      {/* 4K Proxy Warning Dialog */}
      <ProxyWarningDialog
        open={proxyWarning.show}
        onOpenChange={(open) => {
          if (!open) handleProxyWarningClose();
        }}
        mediaName={proxyWarning.mediaName}
        resolution={proxyWarning.resolution}
        onUseAnyway={handleProxyUseAnyway}
        onWaitForOptimization={handleProxyWaitForOptimization}
      />
    </>
  );
};
