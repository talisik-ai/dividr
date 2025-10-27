import { BasePanel, CustomPanelProps } from '..';

export const CaptionsPanel: React.FC<CustomPanelProps> = ({ className }) => {
  return (
    <BasePanel
      title="Karaoke Subtitle"
      description="Add and edit karaoke subtitles"
      className={className}
    >
      <div className="space-y-4">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Coming soon</p>
          <p className="text-xs mt-2">
            Karaoke subtitles will be available in the next update.
          </p>
        </div>
      </div>
    </BasePanel>
  );
};
