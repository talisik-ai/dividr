import { HotkeysDialog } from '@/frontend/components/custom/HotkeysDialog';
import { NavigationBlockerDialog } from '@/frontend/components/custom/NavigationAlertDialog';
import { Button } from '@/frontend/components/ui/button';
import { BatchDuplicateMediaDialog } from '@/frontend/features/editor/components/dialogs/batchDuplicateMediaDialog';
import { FpsWarningDialog } from '@/frontend/features/editor/components/dialogs/fpsWarningDialog';
import { KaraokeConfirmationDialog } from '@/frontend/features/editor/components/dialogs/karaokeConfirmationDialog';
import ProxyWarningDialog from '@/frontend/features/editor/components/dialogs/proxyWarningDialog';
import ThumbnailChangerDialog from '@/frontend/features/editor/components/thumbnailChangerDialog';
import { DuplicateChoice } from '@/frontend/features/editor/stores/videoEditor/slices/mediaLibrarySlice';
import {
  RenderProcessDialog,
  RenderState,
} from '@/frontend/features/export/components/renderProcessDialog';
import CreateProjectDialog from '@/frontend/features/projects/components/createProjectDialog';
import React, { useState } from 'react';
import { toast } from 'sonner';

export const DialogsTest = () => {
  // State for all dialogs
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [proxyWarningOpen, setProxyWarningOpen] = useState(false);
  const [fpsWarningOpen, setFpsWarningOpen] = useState(false);
  const [karaokeConfirmOpen, setKaraokeConfirmOpen] = useState(false);
  const [karaokeImportOpen, setKaraokeImportOpen] = useState(false);
  const [duplicateMediaOpen, setDuplicateMediaOpen] = useState(false);
  const [thumbnailChangerOpen, setThumbnailChangerOpen] = useState(false);
  const [navigationBlockerOpen, setNavigationBlockerOpen] = useState(false);
  const [renderProcessOpen, setRenderProcessOpen] = useState(false);
  const [renderState, setRenderState] = useState<RenderState>('rendering');

  // Mock Data
  const mockDuplicateItems = [
    {
      id: 'dup1',
      existingMedia: {
        id: '1',
        name: 'video_v1.mp4',
        path: '/path/to/video_v1.mp4',
        type: 'video',
        thumbnail: 'https://placehold.co/600x400',
        duration: 120,
      },
      pendingFileName: 'video_v1_copy.mp4',
      pendingFile: new File([], 'video_v1_copy.mp4'),
    },
    {
      id: 'dup2',
      existingMedia: {
        id: '2',
        name: 'audio_track.mp3',
        path: '/path/to/audio_track.mp3',
        type: 'audio',
        duration: 240,
      },
      pendingFileName: 'audio_track_copy.mp3',
      pendingFile: new File([], 'audio_track_copy.mp3'),
    },
  ];

  const Card = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div
      className={`rounded-lg border border-border bg-card text-card-foreground shadow-sm ${className || ''}`}
    >
      {children}
    </div>
  );

  const CardHeader = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={`flex flex-col space-y-1.5 p-6 ${className || ''}`}>
      {children}
    </div>
  );

  const CardTitle = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div
      className={`text-2xl font-semibold leading-none tracking-tight ${className || ''}`}
    >
      {children}
    </div>
  );

  const CardContent = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={`p-6 pt-0 ${className || ''}`}>{children}</div>;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Dialog Showcase</h1>
        <p className="text-muted-foreground">
          A centralized place to test and review all application dialogs and
          modals.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Core Dialogs */}
        <Card>
          <CardHeader>
            <CardTitle>Core System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button onClick={() => setHotkeysOpen(true)} variant="outline">
                Hotkeys Dialog
              </Button>

              <CreateProjectDialog
                onCreateProject={async (title) => {
                  toast.success(`Project created: ${title}`);
                }}
                trigger={
                  <Button variant="outline">Create Project Dialog</Button>
                }
              />

              <Button
                onClick={() => setNavigationBlockerOpen(true)}
                variant="outline"
              >
                Navigation Blocker
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Editor Warnings */}
        <Card>
          <CardHeader>
            <CardTitle>Editor Warnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => setProxyWarningOpen(true)}
                variant="outline"
              >
                Proxy Warning (4K)
              </Button>
              <Button onClick={() => setFpsWarningOpen(true)} variant="outline">
                FPS Change Warning
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Media & Features */}
        <Card>
          <CardHeader>
            <CardTitle>Media & Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => setKaraokeConfirmOpen(true)}
                variant="outline"
              >
                Karaoke Generation
              </Button>
              <Button
                onClick={() => setKaraokeImportOpen(true)}
                variant="outline"
              >
                Subtitle Import
              </Button>
              <Button
                onClick={() => setDuplicateMediaOpen(true)}
                variant="outline"
              >
                Batch Duplicate Media
              </Button>
              <Button
                onClick={() => setThumbnailChangerOpen(true)}
                variant="outline"
              >
                Thumbnail Changer
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Processes */}
        <Card>
          <CardHeader>
            <CardTitle>Processes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  setRenderState('rendering');
                  setRenderProcessOpen(true);
                }}
                variant="outline"
              >
                Render Process (Rendering)
              </Button>
              <Button
                onClick={() => {
                  setRenderState('completed');
                  setRenderProcessOpen(true);
                }}
                variant="outline"
              >
                Render Process (Success)
              </Button>
              <Button
                onClick={() => {
                  setRenderState('failed');
                  setRenderProcessOpen(true);
                }}
                variant="outline"
              >
                Render Process (Failed)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actual Dialog Implementations */}

      <HotkeysDialog open={hotkeysOpen} onOpenChange={setHotkeysOpen} />

      <ProxyWarningDialog
        open={proxyWarningOpen}
        onOpenChange={setProxyWarningOpen}
        mediaName="heavy_4k_footage.mp4"
        resolution={{ width: 3840, height: 2160 }}
        onUseAnyway={() => {
          setProxyWarningOpen(false);
          toast.info('User chose to use media anyway');
        }}
        onWaitForOptimization={() => {
          setProxyWarningOpen(false);
          toast.success('User chose to wait for optimization');
        }}
      />

      <FpsWarningDialog
        open={fpsWarningOpen}
        onOpenChange={setFpsWarningOpen}
        originalFps={30}
        newFps={60}
        showInterpolationOption={true}
        onConfirm={(interpolation) => {
          toast.success(
            `Confirmed FPS change. Interpolation: ${interpolation}`,
          );
        }}
      />

      <KaraokeConfirmationDialog
        open={karaokeConfirmOpen}
        onOpenChange={setKaraokeConfirmOpen}
        mediaName="song_vocal_track.mp3"
        existingSubtitleCount={2}
        mode="generate"
        onConfirm={(deleteExisting) => {
          toast.success(
            `Confirmed generation. Delete existing: ${deleteExisting}`,
          );
        }}
      />

      <KaraokeConfirmationDialog
        open={karaokeImportOpen}
        onOpenChange={setKaraokeImportOpen}
        mediaName="subtitle_file.srt"
        existingSubtitleCount={0}
        mode="import"
        onConfirm={(val) => {
          toast.success('Import confirmed');
        }}
      />

      <BatchDuplicateMediaDialog
        open={duplicateMediaOpen}
        onOpenChange={setDuplicateMediaOpen}
        duplicates={mockDuplicateItems as any}
        onConfirm={(choices: Map<string, DuplicateChoice>) => {
          setDuplicateMediaOpen(false);
          console.log(choices);
          toast.success(`Processed ${choices.size} duplicate decisions`);
        }}
        onCancel={() => setDuplicateMediaOpen(false)}
      />

      <ThumbnailChangerDialog
        open={thumbnailChangerOpen}
        onOpenChange={setThumbnailChangerOpen}
        onThumbnailSelected={(data) => {
          console.log('Thumbnail data length:', data.length);
          toast.success('Thumbnail selected');
        }}
      />

      <NavigationBlockerDialog
        isOpen={navigationBlockerOpen}
        isSaving={false}
        onCancel={() => setNavigationBlockerOpen(false)}
        onConfirm={() => {
          setNavigationBlockerOpen(false);
          toast.info('User confirmed navigation away');
        }}
      />

      <RenderProcessDialog
        isOpen={renderProcessOpen}
        state={renderState}
        progress={renderState === 'rendering' ? 45 : 100}
        status={
          renderState === 'rendering'
            ? 'Encoding video stream...'
            : renderState === 'completed'
              ? 'Done'
              : 'Error'
        }
        currentTime="00:00:45.00"
        duration="00:01:30.00"
        errorMessage={
          renderState === 'failed' ? 'FFmpeg exited with code 1' : undefined
        }
        outputFilePath={
          renderState === 'completed'
            ? 'C:/Users/Nelson/Videos/Exported_Video.mp4'
            : undefined
        }
        onCancel={() => {
          setRenderProcessOpen(false);
          toast.info('Render cancelled');
        }}
        onClose={() => setRenderProcessOpen(false)}
        onRetry={() => {
          setRenderState('rendering');
          toast.info('Retrying render...');
        }}
      />
    </div>
  );
};
