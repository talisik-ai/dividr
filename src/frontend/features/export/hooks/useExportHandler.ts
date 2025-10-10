/**
 * useExportHandler Hook (Updated with RenderProcessDialog Integration)
 * Handles FFmpeg execution and progress tracking
 */
import {
  FfmpegCallbacks,
  runFfmpegWithProgress,
} from '@/backend/ffmpeg/ffmpegRunner';
import { VideoEditJob } from '@/backend/ffmpeg/schema/ffmpegConfig';
import { useCallback, useState } from 'react';
import {
  useTimelineUtils,
  useVideoEditorStore,
} from '../../editor/stores/videoEditor/index';
import { RenderState } from '../components/renderProcessDialog';

export const useExportHandler = () => {
  const render = useVideoEditorStore((state) => state.render);
  const startRender = useVideoEditorStore((state) => state.startRender);
  const updateRenderProgress = useVideoEditorStore(
    (state) => state.updateRenderProgress,
  );
  const finishRender = useVideoEditorStore((state) => state.finishRender);
  const cancelRender = useVideoEditorStore((state) => state.cancelRender);
  const { getTimelineGaps } = useTimelineUtils();

  // Dialog state management
  const [isRenderDialogOpen, setIsRenderDialogOpen] = useState(false);
  const [renderDialogState, setRenderDialogState] =
    useState<RenderState>('rendering');
  const [renderError, setRenderError] = useState<string | undefined>();
  const [outputFilePath, setOutputFilePath] = useState<string | undefined>();

  const executeExport = useCallback(
    async (job: VideoEditJob): Promise<void> => {
      try {
        // Get timeline gaps
        const gaps = getTimelineGaps();
        console.log('Gaps detected:', gaps);

        // Add gaps to job
        job.gaps = gaps;
        console.log('🎬 FFmpeg Job:', job);
        console.log('🗂️ Output Path:', job.outputPath);

        // Track current time to avoid race conditions
        let latestCurrentTime = render.currentTime;

        const callbacks: FfmpegCallbacks = {
          onProgress: (progress) => {
            if (progress.outTime) {
              latestCurrentTime = progress.outTime;
              updateRenderProgress(
                progress.percentage || render.progress,
                progress.percentage
                  ? `Rendering... ${progress.percentage.toFixed(1)}%`
                  : render.status,
                progress.outTime,
              );
            } else if (progress.percentage) {
              updateRenderProgress(
                progress.percentage,
                `Rendering... ${progress.percentage.toFixed(1)}%`,
                latestCurrentTime,
              );
            }
          },
          onStatus: (status) => {
            updateRenderProgress(render.progress, status, latestCurrentTime);
            console.log(render.progress);
          },
          onLog: () => {
            // Logging disabled
          },
        };

        console.log('🚀 Starting render process...');

        // Construct the full output file path (use forward slash for cross-platform compatibility)
        const fullOutputPath = `${job.outputPath}/${job.output}`.replace(
          /\//g,
          '\\',
        );

        // Open dialog and set to rendering state
        setRenderDialogState('rendering');
        setIsRenderDialogOpen(true);
        setRenderError(undefined);
        setOutputFilePath(fullOutputPath);

        startRender({
          outputPath: job.output,
          format: 'mp4',
          quality: 'high',
        });

        console.log('📞 Calling runFfmpegWithProgress...');
        const result = await runFfmpegWithProgress(job, callbacks);
        console.log('✅ runFfmpegWithProgress completed:', result);

        finishRender();

        // Update dialog to completed state
        setRenderDialogState('completed');
      } catch (error) {
        cancelRender();

        // Update dialog to failed state with error message
        setRenderDialogState('failed');
        setRenderError(error instanceof Error ? error.message : String(error));
      }
    },
    [
      render.progress,
      render.currentTime,
      render.status,
      startRender,
      updateRenderProgress,
      finishRender,
      cancelRender,
      getTimelineGaps,
    ],
  );

  const handleCancelRender = useCallback(() => {
    cancelRender();
    setRenderDialogState('cancelled');
  }, [cancelRender]);

  const handleCloseDialog = useCallback(() => {
    setIsRenderDialogOpen(false);
    setRenderDialogState('rendering');
    setRenderError(undefined);
    setOutputFilePath(undefined);
  }, []);

  return {
    executeExport,
    // Dialog state for component integration
    isRenderDialogOpen,
    renderDialogState,
    renderError,
    outputFilePath,
    handleCancelRender,
    handleCloseDialog,
  };
};
