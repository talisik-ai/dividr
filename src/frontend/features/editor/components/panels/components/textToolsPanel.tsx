import { Button } from '@/frontend/components/ui/button';
import { Heading, Type } from 'lucide-react';
import React from 'react';
import { BasePanel } from '../../../components/panels/basePanel';
import { CustomPanelProps } from '../../../components/panels/panelRegistry';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';

export const TextToolsPanel: React.FC<CustomPanelProps> = ({ className }) => {
  const addTextClip = useVideoEditorStore((state) => state.addTextClip);
  const currentFrame = useVideoEditorStore(
    (state) => state.timeline.currentFrame,
  );

  const handleAddHeading = async () => {
    try {
      await addTextClip('heading', currentFrame);
      console.log('✅ Added heading text clip at frame:', currentFrame);
    } catch (error) {
      console.error('❌ Error adding heading text clip:', error);
    }
  };

  const handleAddBody = async () => {
    try {
      await addTextClip('body', currentFrame);
      console.log('✅ Added body text clip at frame:', currentFrame);
    } catch (error) {
      console.error('❌ Error adding body text clip:', error);
    }
  };

  return (
    <BasePanel
      title="Text Tools"
      description="Add and manage text elements"
      className={className}
    >
      <div className="space-y-3">
        <Button
          onClick={handleAddHeading}
          className="w-full gap-2 bg-accent font-bold h-fit text-base text-accent-foreground"
        >
          <Heading className="size-5" />
          Add heading
        </Button>

        <Button
          onClick={handleAddBody}
          className="w-full gap-2 bg-accent text-xs h-fit font-bold text-accent-foreground"
        >
          <Type className="size-3.5" />
          Add body text
        </Button>

        <div className="mt-4 pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Text clips will be added at the current playhead position on the
            text track.
          </p>
        </div>
      </div>
    </BasePanel>
  );
};
