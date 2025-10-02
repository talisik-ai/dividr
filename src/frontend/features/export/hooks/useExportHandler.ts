/**
 * useExportHandler Hook
 * Handles FFmpeg execution and progress tracking
 */
import {
  FfmpegCallbacks,
  runFfmpegWithProgress,
} from '@/backend/ffmpeg/ffmpegRunner';
import { VideoEditJob } from '@/backend/ffmpeg/schema/ffmpegConfig';
import { useCallback } from 'react';
import {
  useTimelineUtils,
  useVideoEditorStore,
} from '../../editor/stores/VideoEditorStore';

export const useExportHandler = () => {
  const render = useVideoEditorStore((state) => state.render);
  const startRender = useVideoEditorStore((state) => state.startRender);
  const updateRenderProgress = useVideoEditorStore(
    (state) => state.updateRenderProgress,
  );
  const finishRender = useVideoEditorStore((state) => state.finishRender);
  const cancelRender = useVideoEditorStore((state) => state.cancelRender);
  const { getTimelineGaps } = useTimelineUtils();

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
        startRender({
          outputPath: job.output,
          format: 'mp4',
          quality: 'high',
        });

        console.log('📞 Calling runFfmpegWithProgress...');
        const result = await runFfmpegWithProgress(job, callbacks);
        console.log('✅ runFfmpegWithProgress completed:', result);

        finishRender();
        alert('Render completed successfully!');
      } catch (error) {
        cancelRender();
        alert(`Render failed: ${error}`);
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

  return { executeExport };
};
