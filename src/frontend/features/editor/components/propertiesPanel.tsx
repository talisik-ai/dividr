import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Separator } from '@/frontend/components/ui/separator';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/frontend/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { cn } from '@/frontend/utils/utils';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseLower,
  CaseSensitive,
  CaseUpper,
  Info,
  Italic,
  ListChevronsUpDown,
  RotateCcw,
  Underline,
} from 'lucide-react';
import React, { useState } from 'react';
import { useVideoEditorStore } from '../stores/videoEditor/index';

interface PropertiesPanelProps {
  className?: string;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  className,
}) => {
  const {
    tracks,
    timeline,
    textStyle,
    updateTrack,
    setActiveTextStyle,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    setTextTransform,
    setFillColor,
    setStrokeColor,
    setBackgroundColor,
    toggleShadow,
    resetTextStyles,
  } = useVideoEditorStore();

  // Get selected subtitle tracks
  const selectedSubtitleTracks = tracks.filter(
    (track) =>
      track.type === 'subtitle' && timeline.selectedTrackIds.includes(track.id),
  );

  // Local state for text editing
  const [editedText, setEditedText] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);

  // Local state for spacing
  const [spacing, setSpacing] = useState('normal');

  // Don't render if no subtitle tracks are selected
  if (selectedSubtitleTracks.length === 0) {
    return null;
  }

  const isMultipleSelected = selectedSubtitleTracks.length > 1;
  const selectedTrack = selectedSubtitleTracks[0];

  const handleTextEdit = () => {
    if (isEditingText && editedText !== selectedTrack.subtitleText) {
      // Update the track with new text
      updateTrack(selectedTrack.id, { subtitleText: editedText });
    }
    setIsEditingText(!isEditingText);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedText(e.target.value);
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTextEdit();
    } else if (e.key === 'Escape') {
      setEditedText(selectedTrack.subtitleText || '');
      setIsEditingText(false);
    }
  };

  React.useEffect(() => {
    if (!isEditingText) {
      setEditedText(selectedTrack.subtitleText || '');
    }
  }, [selectedTrack.id, selectedTrack.subtitleText]);

  const handleReset = () => {
    resetTextStyles();
  };

  return (
    <div
      className={cn(
        'w-80 flex flex-col border-l border-accent bg-transparent',
        className,
      )}
    >
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Subtitle Text Editing */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Text</h4>
          <div className="relative">
            {isMultipleSelected ? (
              <p className="text-xs text-muted-foreground text-center">
                Click a single subtitle to edit its value
              </p>
            ) : isEditingText ? (
              <Input
                value={editedText}
                onChange={handleTextChange}
                onKeyDown={handleTextKeyDown}
                onBlur={handleTextEdit}
                autoFocus
                className="text-sm focus:text-sm placeholder:text-sm"
                placeholder="Enter subtitle text..."
              />
            ) : (
              <div
                className="p-3 bg-muted/50 border border-border rounded-lg cursor-text hover:bg-muted/70 transition-colors"
                onClick={() => setIsEditingText(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingText(true);
                }}
                aria-label="Click to edit text"
              >
                <p className="text-xs text-foreground whitespace-pre-wrap">
                  {selectedTrack.subtitleText || 'Click to edit text...'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Text Style Controls */}
        <div className="space-y-4">
          {/* Font Family & Size Row */}
          <div className="flex gap-2">
            <Select
              value={textStyle.activeStyle}
              onValueChange={setActiveTextStyle}
            >
              <SelectTrigger className="flex-1" size="sm">
                <SelectValue placeholder="Select font" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  <span style={{ fontWeight: '400' }}>Default</span>
                </SelectItem>
                <SelectItem value="semibold">
                  <span style={{ fontWeight: '600' }}>Semibold</span>
                </SelectItem>
                <SelectItem value="script">
                  <span style={{ fontFamily: '"Segoe Script", cursive' }}>
                    Script
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Select disabled>
                    <SelectTrigger className="w-20" size="sm">
                      <SelectValue placeholder="18" />
                    </SelectTrigger>
                  </Select>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Font size (coming soon)</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center justify-between">
            {/* Toggle Group - Styling */}
            <ToggleGroup
              type="multiple"
              className="justify-start gap-4"
              variant="default"
              value={[
                ...(textStyle.globalControls.isBold ? ['bold'] : []),
                ...(textStyle.globalControls.isItalic ? ['italic'] : []),
                ...(textStyle.globalControls.isUnderline ? ['underline'] : []),
              ]}
              onValueChange={(values) => {
                const wasBold = textStyle.globalControls.isBold;
                const wasItalic = textStyle.globalControls.isItalic;
                const wasUnderline = textStyle.globalControls.isUnderline;

                const isBoldNow = values.includes('bold');
                const isItalicNow = values.includes('italic');
                const isUnderlineNow = values.includes('underline');

                if (wasBold !== isBoldNow) toggleBold();
                if (wasItalic !== isItalicNow) toggleItalic();
                if (wasUnderline !== isUnderlineNow) toggleUnderline();
              }}
            >
              <ToggleGroupItem value="bold" aria-label="Toggle bold" size="sm">
                <Bold className="size-4" />
              </ToggleGroupItem>

              <ToggleGroupItem
                value="italic"
                aria-label="Toggle italic"
                size="sm"
              >
                <Italic className="size-4" />
              </ToggleGroupItem>

              <ToggleGroupItem
                value="underline"
                aria-label="Toggle underline"
                size="sm"
                disabled
              >
                <Underline className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="h-4 w-px bg-border" />

            {/* Text Transform & Alignment & Spacing */}
            <div className="flex gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-1">
                    <Select
                      value={textStyle.globalControls.textTransform}
                      onValueChange={(value) =>
                        setTextTransform(
                          value as
                            | 'none'
                            | 'uppercase'
                            | 'lowercase'
                            | 'capitalize',
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-auto px-2 gap-1"
                        variant="ghost"
                        chevronSize={3}
                      >
                        {textStyle.globalControls.textTransform === 'none' && (
                          <CaseSensitive className="size-5" />
                        )}
                        {textStyle.globalControls.textTransform ===
                          'uppercase' && <CaseUpper className="size-5" />}
                        {textStyle.globalControls.textTransform ===
                          'lowercase' && <CaseLower className="size-5" />}
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="none">
                          <div className="flex items-center">
                            <CaseSensitive className="size-4 mr-2" />
                            Default
                          </div>
                        </SelectItem>
                        <SelectItem value="uppercase">
                          <div className="flex items-center">
                            <CaseUpper className="size-4 mr-2" />
                            UPPERCASE
                          </div>
                        </SelectItem>
                        <SelectItem value="lowercase">
                          <div className="flex items-center">
                            <CaseLower className="size-4 mr-2" />
                            lowercase
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Text transform</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-1">
                    <Select disabled>
                      <SelectTrigger
                        size="sm"
                        className="w-auto px-2 gap-1"
                        variant="ghost"
                        chevronSize={3}
                      >
                        <div className="relative">
                          <AlignCenter className="size-5" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">
                          <AlignLeft className="size-4 mr-2" />
                          Left
                        </SelectItem>
                        <SelectItem value="center">
                          <AlignCenter className="size-4 mr-2" />
                          Center
                        </SelectItem>
                        <SelectItem value="right">
                          <AlignRight className="size-4 mr-2" />
                          Right
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Text alignment (coming soon)</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-1">
                    <Select value={spacing} onValueChange={setSpacing} disabled>
                      <SelectTrigger
                        size="sm"
                        className="w-auto px-2 gap-1"
                        variant="ghost"
                        chevronSize={3}
                      >
                        <div className="relative flex items-center">
                          <ListChevronsUpDown className="size-5 scale-x-[-1]" />
                          {spacing !== 'normal' && (
                            <Badge
                              variant="secondary"
                              className="ml-1 h-4 px-1 text-xs"
                            >
                              {spacing === 'tight'
                                ? 'T'
                                : spacing === 'loose'
                                  ? 'L'
                                  : spacing}
                            </Badge>
                          )}
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="tight">Tight</SelectItem>
                        <SelectItem value="loose">Loose</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Letter/line spacing (coming soon)</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <Separator />

        {/* Style Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Style</h4>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Text edits apply individually per subtitle clip. Style
                    changes affect all subtitles globally.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="h-7 w-7 p-0"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reset all styles</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Fill</label>
                  <Input
                    type="color"
                    value={textStyle.globalControls.fillColor}
                    onChange={(e) => setFillColor(e.target.value)}
                    className="h-9 p-1 cursor-pointer"
                    disabled
                    title="Coming soon"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fill color (coming soon)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">
                    Stroke
                  </label>
                  <Input
                    type="color"
                    value={textStyle.globalControls.strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="h-9 p-1 cursor-pointer"
                    disabled
                    title="Coming soon"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Stroke color (coming soon)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">
                    Background
                  </label>
                  <Input
                    type="color"
                    value={textStyle.globalControls.backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="h-9 p-1 cursor-pointer"
                    disabled
                    title="Coming soon"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Background color (coming soon)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">
                    Shadow
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleShadow}
                    className={cn(
                      'h-9',
                      textStyle.globalControls.hasShadow &&
                        'bg-accent text-accent-foreground',
                    )}
                    disabled
                  >
                    {textStyle.globalControls.hasShadow ? 'On' : 'Off'}
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Shadow (coming soon)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};
