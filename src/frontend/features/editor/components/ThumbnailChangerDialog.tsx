import { Button } from '@/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { cn } from '@/frontend/utils/utils';
import { ArrowLeft, ImageUp, Loader2, Upload, X } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVideoEditorStore } from '../stores/videoEditor/index';

interface ThumbnailChangerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThumbnailSelected: (thumbnailData: string) => void;
}

interface SpriteScrubbingPanelProps {
  onThumbnailCapture: (thumbnailData: string) => void;
  onUploadClick: () => void;
}

// Sprite scrubbing interface component
const SpriteScrubbingPanel: React.FC<SpriteScrubbingPanelProps> = React.memo(
  ({ onThumbnailCapture, onUploadClick }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [playheadPosition, setPlayheadPosition] = useState(0);
    const [hoveredPosition, setHoveredPosition] = useState<number | null>(null);
    const [videoLoaded, setVideoLoaded] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);

    // Get first video track and its sprite sheets
    const tracks = useVideoEditorStore((state) => state.tracks);
    const fps = useVideoEditorStore((state) => state.timeline.fps);
    const getSpriteSheetsBySource = useVideoEditorStore(
      (state) => state.getSpriteSheetsBySource,
    );

    const firstVideoTrack = useMemo(() => {
      return tracks.find((track) => track.type === 'video');
    }, [tracks]);

    const spriteSheetData = useMemo(() => {
      if (!firstVideoTrack?.source) return null;
      const result = getSpriteSheetsBySource(firstVideoTrack.source);
      return result?.success ? result : null;
    }, [firstVideoTrack, getSpriteSheetsBySource]);

    const spriteSheets = spriteSheetData?.spriteSheets || [];
    const allThumbnails = useMemo(() => {
      return spriteSheets.flatMap((sheet) => sheet.thumbnails);
    }, [spriteSheets]);

    // Calculate dimensions and metrics
    const trackMetrics = useMemo(() => {
      if (!firstVideoTrack) return null;
      const durationFrames =
        firstVideoTrack.endFrame - firstVideoTrack.startFrame;
      const durationSeconds = durationFrames / fps;
      const trackStartTime = firstVideoTrack.sourceStartTime || 0;
      return {
        durationFrames,
        durationSeconds,
        trackStartTime,
      };
    }, [firstVideoTrack, fps]);

    // Get video source URL - use previewUrl (blob URL created by Electron)
    const videoPath = useMemo(() => {
      if (!firstVideoTrack) return null;
      // Use previewUrl if available (this is the blob URL created by Electron)
      if (firstVideoTrack.previewUrl) {
        return firstVideoTrack.previewUrl;
      }
      // Fallback to source, but this might not work in browser
      return firstVideoTrack.source;
    }, [firstVideoTrack]);

    // Load video element
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !videoPath) {
        return;
      }

      const handleLoadedMetadata = () => {
        setVideoLoaded(true);
        // Draw initial frame
        if (trackMetrics) {
          video.currentTime = trackMetrics.trackStartTime;
        }
      };

      const handleSeeked = () => {
        // Draw frame directly here instead of calling separate function
        const canvas = canvasRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Calculate display dimensions maintaining aspect ratio
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = canvasWidth / canvasHeight;

        let drawWidth = canvasWidth;
        let drawHeight = canvasHeight;
        let offsetX = 0;
        let offsetY = 0;

        if (videoAspect > canvasAspect) {
          drawHeight = canvasWidth / videoAspect;
          offsetY = (canvasHeight - drawHeight) / 2;
        } else {
          drawWidth = canvasHeight * videoAspect;
          offsetX = (canvasWidth - drawWidth) / 2;
        }

        // Clear canvas with dark background
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw video frame
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
      };

      const handleLoadedData = () => {
        // Video data loaded
      };

      const handleError = () => {
        // Video load error
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('error', handleError);

      video.src = videoPath;
      video.load();

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('error', handleError);
      };
    }, [videoPath, trackMetrics]);

    // Calculate current time in video based on playhead position
    const currentVideoTime = useMemo(() => {
      if (!trackMetrics) return 0;
      return (
        trackMetrics.trackStartTime +
        playheadPosition * trackMetrics.durationSeconds
      );
    }, [playheadPosition, trackMetrics]);

    // Update video currentTime when playhead changes
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !videoLoaded || !trackMetrics) return;

      // Seek video to current time
      const targetTime = currentVideoTime;
      const diff = Math.abs(video.currentTime - targetTime);

      // Only seek if difference is significant (more than 1 frame)
      if (diff > 1 / fps) {
        video.currentTime = targetTime;
      }
    }, [currentVideoTime, videoLoaded, trackMetrics, fps]);

    // Handle mouse interaction for scrubbing
    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const container = containerRef.current;
        if (!container) return;

        setIsDragging(true);
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const position = Math.max(0, Math.min(1, x / rect.width));
        setPlayheadPosition(position);
      },
      [],
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const position = Math.max(0, Math.min(1, x / rect.width));
        setHoveredPosition(position);

        if (isDragging) {
          setPlayheadPosition(position);
        }
      },
      [isDragging],
    );

    const handlePointerUp = useCallback(() => {
      setIsDragging(false);
    }, []);

    const handlePointerLeave = useCallback(() => {
      setHoveredPosition(null);
      setIsDragging(false);
    }, []);

    // Capture thumbnail at current playhead position
    const handleCaptureThumbnail = useCallback(async () => {
      const canvas = canvasRef.current;
      if (!canvas || isCapturing) return;

      try {
        setIsCapturing(true);
        const thumbnailData = canvas.toDataURL('image/jpeg', 0.92);
        onThumbnailCapture(thumbnailData);
      } catch (error) {
        console.error('Failed to capture thumbnail:', error);
      } finally {
        setIsCapturing(false);
      }
    }, [onThumbnailCapture, isCapturing]);

    if (!firstVideoTrack) {
      return (
        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
          <ImageUp className="size-12 mb-4 opacity-50" />
          <p className="text-sm">No video track found in timeline</p>
          <p className="text-xs mt-2">
            Add a video to the timeline to select a thumbnail
          </p>
        </div>
      );
    }

    if (!videoPath) {
      return (
        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
          <ImageUp className="size-12 mb-4 opacity-50" />
          <p className="text-sm">Video source not available</p>
          <p className="text-xs mt-2">Unable to load video preview</p>
        </div>
      );
    }

    if (!spriteSheetData || spriteSheets.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
          <Loader2 className="size-8 mb-4 animate-spin text-blue-400" />
          <p className="text-sm">Generating sprite sheets...</p>
          <p className="text-xs mt-2 text-center max-w-md">
            This may take a moment for longer videos
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {/* Hidden video element for frame extraction */}
        <video
          ref={videoRef}
          className="hidden"
          preload="metadata"
          crossOrigin="anonymous"
        />

        {/* Preview Canvas */}
        <div className="relative bg-gray-900 rounded-lg self-center mb-4 overflow-hidden border border-border w-[330px] h-[184px]">
          <canvas
            ref={canvasRef}
            width={1920}
            height={1080}
            className="w-full h-auto"
          />
          {!videoLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <Loader2 className="size-8 animate-spin text-blue-400" />
            </div>
          )}
        </div>

        {/* Scrubbing Track */}
        <div
          ref={containerRef}
          className={cn(
            'relative h-20 bg-gray-800 rounded-lg border border-border overflow-hidden',
            isDragging && 'cursor-grabbing',
            !isDragging && 'cursor-grab',
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          {/* Sprite thumbnails strip - positioned accurately based on timestamps */}
          <div className="absolute inset-0">
            {allThumbnails.map((thumb) => {
              const sheet = spriteSheets[thumb.sheetIndex];
              if (!sheet || !trackMetrics) return null;

              // Calculate position and width based on timestamp
              const relativeTime =
                thumb.timestamp - trackMetrics.trackStartTime;
              const leftPercent =
                (relativeTime / trackMetrics.durationSeconds) * 100;

              // Find next thumbnail to calculate width
              const thumbIndex = allThumbnails.indexOf(thumb);
              const nextThumb = allThumbnails[thumbIndex + 1];
              const widthPercent = nextThumb
                ? ((nextThumb.timestamp - thumb.timestamp) /
                    trackMetrics.durationSeconds) *
                  100
                : ((trackMetrics.durationSeconds - relativeTime) /
                    trackMetrics.durationSeconds) *
                  100;

              // Skip if outside bounds
              if (
                relativeTime < 0 ||
                relativeTime > trackMetrics.durationSeconds
              ) {
                return null;
              }

              // Calculate scale to fit height of 80px
              const scale = 80 / thumb.height;

              return (
                <div
                  key={thumb.id}
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                    backgroundImage: `url(${sheet.url})`,
                    backgroundSize: `${sheet.width * scale}px ${sheet.height * scale}px`,
                    backgroundPosition: `-${thumb.x * scale}px -${thumb.y * scale}px`,
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              );
            })}
          </div>

          {/* Hover indicator */}
          {hoveredPosition !== null && !isDragging && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/40 pointer-events-none z-10"
              style={{ left: `${hoveredPosition * 100}%` }}
            />
          )}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-500 pointer-events-none z-20"
            style={{ left: `${playheadPosition * 100}%` }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-lg" />
          </div>

          {/* Glass overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
        </div>

        {/* Timestamp display */}
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>
            {trackMetrics
              ? `${(playheadPosition * trackMetrics.durationSeconds).toFixed(2)}s`
              : '0.00s'}
          </span>
          <span>
            {trackMetrics
              ? `${trackMetrics.durationSeconds.toFixed(2)}s`
              : '0.00s'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between gap-3">
          <Button
            variant="outline"
            onClick={onUploadClick}
            className="flex-1"
            size="lg"
          >
            <Upload className="size-4 mr-2" />
            Upload Image
          </Button>
          <Button
            variant="secondary"
            onClick={handleCaptureThumbnail}
            className="flex-1"
            size="lg"
            disabled={isCapturing || !videoLoaded}
          >
            {isCapturing ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Capturing...
              </>
            ) : (
              'Set Cover'
            )}
          </Button>
        </div>
      </div>
    );
  },
);

SpriteScrubbingPanel.displayName = 'SpriteScrubbingPanel';

// Upload panel component with drag and drop
interface UploadPanelProps {
  onImageUpload: (imageData: string) => void;
  onBackToSprite: () => void;
}

const UploadPanel: React.FC<UploadPanelProps> = React.memo(
  ({ onImageUpload, onBackToSprite }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const dragCounter = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const imageFile = fileArray.find((file) =>
        file.type.startsWith('image/'),
      );

      if (!imageFile) {
        return;
      }

      setIsUploading(true);

      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          if (dataUrl) {
            // Create an image to validate and potentially resize
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');

              if (ctx) {
                ctx.drawImage(img, 0, 0);
                const finalDataUrl = canvas.toDataURL('image/jpeg', 0.92);
                setPreviewImage(finalDataUrl);
              }
            };
            img.src = dataUrl;
          }
        };
        reader.readAsDataURL(imageFile);
      } catch (error) {
        // Failed to process image
      } finally {
        setIsUploading(false);
      }
    }, []);

    const handleDragIn = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setDragActive(true);
      }
    }, []);

    const handleDragOut = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setDragActive(false);
      }
    }, []);

    const handleDrag = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        dragCounter.current = 0;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await handleFiles(e.dataTransfer.files);
        }
      },
      [handleFiles],
    );

    const handleFileInputChange = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
          await handleFiles(e.target.files);
        }
      },
      [handleFiles],
    );

    const handleClick = useCallback(() => {
      if (!previewImage) {
        fileInputRef.current?.click();
      }
    }, [previewImage]);

    const handleSetThumbnail = useCallback(() => {
      if (previewImage) {
        onImageUpload(previewImage);
      }
    }, [previewImage, onImageUpload]);

    const handleRemoveImage = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setPreviewImage(null);
    }, []);

    return (
      <div className="flex flex-col gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Preview/Drop area */}
        <div
          className={cn(
            'relative bg-gray-900 rounded-lg self-center border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors h-[184px] w-[330px]',
            dragActive
              ? 'border-secondary bg-secondary/10'
              : previewImage
                ? 'border-border hover:border-gray-600'
                : 'border-gray-700 hover:border-gray-600',
          )}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          {isUploading ? (
            <div className="flex flex-col items-center text-muted-foreground">
              <Loader2 className="size-12 mb-4 animate-spin text-blue-400" />
              <p className="text-sm">Loading image...</p>
            </div>
          ) : previewImage ? (
            <>
              <img
                src={previewImage}
                alt="Thumbnail preview"
                className="max-w-full max-h-full object-contain"
              />
              {/* Remove button */}
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 size-8 rounded-full"
                onClick={handleRemoveImage}
                title="Remove image"
              >
                <X className="size-4" />
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center text-muted-foreground">
              <Upload className="size-16 mb-4 opacity-50" />
              <p className="text-sm font-medium">
                Click to upload or drag and drop
              </p>
              <p className="text-xs mt-2">JPG, PNG, GIF, or WebP</p>
            </div>
          )}

          {dragActive && (
            <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
              <div className="text-blue-400 font-medium">Drop image here</div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-between gap-3">
          <Button
            variant="outline"
            onClick={onBackToSprite}
            className="flex-1"
            size="lg"
          >
            <ArrowLeft className="size-4 mr-2" />
            Back to Video
          </Button>
          {previewImage && (
            <Button onClick={handleSetThumbnail} className="flex-1" size="lg">
              Set as Thumbnail
            </Button>
          )}
        </div>
      </div>
    );
  },
);

UploadPanel.displayName = 'UploadPanel';

// Main dialog component
export const ThumbnailChangerDialog: React.FC<ThumbnailChangerDialogProps> =
  React.memo(({ open, onOpenChange, onThumbnailSelected }) => {
    const [mode, setMode] = useState<'sprite' | 'upload'>('sprite');

    // Reset state when dialog opens
    useEffect(() => {
      if (open) {
        setMode('sprite');
      }
    }, [open]);

    const handleThumbnailCapture = useCallback(
      (thumbnailData: string) => {
        onThumbnailSelected(thumbnailData);
        onOpenChange(false);
      },
      [onThumbnailSelected, onOpenChange],
    );

    const handleImageUpload = useCallback(
      (imageData: string) => {
        onThumbnailSelected(imageData);
        onOpenChange(false);
      },
      [onThumbnailSelected, onOpenChange],
    );

    const handleUploadClick = useCallback(() => {
      setMode('upload');
    }, []);

    const handleBackToSprite = useCallback(() => {
      setMode('sprite');
    }, []);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Set Project Thumbnail</DialogTitle>
            <DialogDescription className="hidden" />
          </DialogHeader>

          <div className="mt-4">
            {mode === 'sprite' ? (
              <SpriteScrubbingPanel
                onThumbnailCapture={handleThumbnailCapture}
                onUploadClick={handleUploadClick}
              />
            ) : (
              <UploadPanel
                onImageUpload={handleImageUpload}
                onBackToSprite={handleBackToSprite}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  });

ThumbnailChangerDialog.displayName = 'ThumbnailChangerDialog';

export default ThumbnailChangerDialog;
