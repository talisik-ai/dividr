import { Button } from '@/frontend/components/ui/button';
import { Separator } from '@/frontend/components/ui/separator';
import { Clock, Heading, Type } from 'lucide-react';
import React from 'react';
import { BasePanel } from '../../../components/panels/basePanel';
import { CustomPanelProps } from '../../../components/panels/panelRegistry';
import { AVAILABLE_FONTS } from '../../../constants/fonts';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';

export const TextToolsPanel: React.FC<CustomPanelProps> = ({ className }) => {
  const addTextClip = useVideoEditorStore((state) => state.addTextClip);
  const recentFonts = useVideoEditorStore((state) => state.recentFonts);
  const tracks = useVideoEditorStore((state) => state.tracks);
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );
  const updateTrack = useVideoEditorStore((state) => state.updateTrack);
  const currentFrame = useVideoEditorStore(
    (state) => state.timeline.currentFrame,
  );

  // Get font display names
  const recentFontItems = recentFonts
    .map((fontValue) => {
      const font = AVAILABLE_FONTS.find((f) => f.value === fontValue);
      return font ? { value: fontValue, label: font.label } : null;
    })
    .filter((item): item is { value: string; label: string } => item !== null)
    .slice(0, 6); // Show max 6 recent fonts (3x2 grid)

  // Get selected text tracks
  const selectedTextTracks = tracks.filter(
    (track) => track.type === 'text' && selectedTrackIds.includes(track.id),
  );

  // Handle font click - apply to selected text clip(s)
  const handleFontClick = (fontFamily: string) => {
    if (selectedTextTracks.length === 0) {
      console.log('No text clip selected');
      return;
    }

    // Apply font to all selected text tracks
    selectedTextTracks.forEach((track) => {
      updateTrack(track.id, {
        textStyle: {
          ...track.textStyle,
          fontFamily,
        },
      });
    });

    console.log(
      `✅ Applied font "${fontFamily}" to ${selectedTextTracks.length} text clip(s)`,
    );
  };

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
          className="w-full gap-2 bg-accent font-bold h-fit text-base text-accent-foreground hover:bg-accent/80"
        >
          <Heading className="size-5" />
          Add heading
        </Button>

        <Button
          onClick={handleAddBody}
          className="w-full gap-2 bg-accent text-xs h-fit font-bold text-accent-foreground hover:bg-accent/80"
        >
          <Type className="size-3.5" />
          Add body text
        </Button>

        {/* Recent Fonts Section */}
        {recentFontItems.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Clock className="size-3.5" />
                <span>Recent Used</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {recentFontItems.map((font) => (
                  <Button
                    key={font.value}
                    size="sm"
                    onClick={() => handleFontClick(font.value)}
                    disabled={selectedTextTracks.length === 0}
                    className="h-16 flex items-center justify-center text-accent-foreground hover:bg-accent/80 bg-accent  text-center text-xs font-medium transition-colors"
                    style={{ fontFamily: font.value }}
                    title={
                      selectedTextTracks.length === 0
                        ? 'Select a text clip to apply font'
                        : `Apply ${font.label} to selected text`
                    }
                  >
                    <span className="truncate">{font.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator className="my-4" />
        <div className="pt-2">
          <p className="text-xs text-muted-foreground">
            Text clips will be added at the current playhead position on the
            text track.
          </p>
        </div>
      </div>
    </BasePanel>
  );
};
