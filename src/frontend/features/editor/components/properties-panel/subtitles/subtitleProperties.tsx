/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { Slider } from '@/frontend/components/ui/slider';
import { Switch } from '@/frontend/components/ui/switch';
import { Textarea } from '@/frontend/components/ui/textarea';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/frontend/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
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
  MoreHorizontal,
  RotateCcw,
  Underline,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';
import { ColorPickerPopover } from '../shared/colorPickerPopover';

interface SubtitlePropertiesProps {
  selectedTrackIds: string[];
}

const SubtitlePropertiesComponent: React.FC<SubtitlePropertiesProps> = ({
  selectedTrackIds,
}) => {
  // Selective subscriptions to avoid re-renders during playback
  const tracks = useVideoEditorStore((state) => state.tracks);
  const textStyle = useVideoEditorStore((state) => state.textStyle);
  const colorHistory = useVideoEditorStore((state) => state.colorHistory);

  // Action subscriptions (these don't cause re-renders)
  const updateTrack = useVideoEditorStore((state) => state.updateTrack);
  const setActiveTextStyle = useVideoEditorStore(
    (state) => state.setActiveTextStyle,
  );
  const toggleBold = useVideoEditorStore((state) => state.toggleBold);
  const toggleItalic = useVideoEditorStore((state) => state.toggleItalic);
  const toggleUnderline = useVideoEditorStore((state) => state.toggleUnderline);
  const setTextTransform = useVideoEditorStore(
    (state) => state.setTextTransform,
  );
  const setFillColor = useVideoEditorStore((state) => state.setFillColor);
  const setStrokeColor = useVideoEditorStore((state) => state.setStrokeColor);
  const setBackgroundColor = useVideoEditorStore(
    (state) => state.setBackgroundColor,
  );
  const toggleShadow = useVideoEditorStore((state) => state.toggleShadow);
  const toggleGlow = useVideoEditorStore((state) => state.toggleGlow);
  const setOpacity = useVideoEditorStore((state) => state.setOpacity);
  const resetTextStyles = useVideoEditorStore((state) => state.resetTextStyles);
  const addRecentColor = useVideoEditorStore((state) => state.addRecentColor);

  // Get selected subtitle tracks
  const selectedSubtitleTracks = tracks.filter(
    (track) => track.type === 'subtitle' && selectedTrackIds.includes(track.id),
  );

  // Local state for text editing
  const [editedText, setEditedText] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);

  // Local state for spacing
  const [spacing, setSpacing] = useState('normal');

  // Check if in development mode
  const isDev = process.env.NODE_ENV === 'development';

  // Check if any styles have changed from default
  const hasStylesChanged = useMemo(() => {
    const defaults = {
      isBold: false,
      isItalic: false,
      isUnderline: false,
      textTransform: 'none',
      textAlign: 'center',
      fontSize: 18,
      fillColor: '#FFFFFF',
      strokeColor: '#000000',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      hasShadow: false,
      letterSpacing: 0,
      lineSpacing: 1.2,
      hasGlow: false,
      opacity: 100,
    };

    const current = textStyle.globalControls;

    return (
      current.isBold !== defaults.isBold ||
      current.isItalic !== defaults.isItalic ||
      current.isUnderline !== defaults.isUnderline ||
      current.textTransform !== defaults.textTransform ||
      current.textAlign !== defaults.textAlign ||
      current.fontSize !== defaults.fontSize ||
      current.fillColor !== defaults.fillColor ||
      current.strokeColor !== defaults.strokeColor ||
      current.backgroundColor !== defaults.backgroundColor ||
      current.hasShadow !== defaults.hasShadow ||
      current.letterSpacing !== defaults.letterSpacing ||
      current.lineSpacing !== defaults.lineSpacing ||
      current.hasGlow !== defaults.hasGlow ||
      current.opacity !== defaults.opacity ||
      textStyle.activeStyle !== 'default'
    );
  }, [textStyle]);

  // Check if opacity has changed from default
  const hasOpacityChanged = useMemo(() => {
    return textStyle.globalControls.opacity !== 100;
  }, [textStyle.globalControls.opacity]);

  // Don't render if no subtitle tracks are selected
  if (selectedSubtitleTracks.length === 0) {
    return null;
  }

  const isMultipleSelected = selectedSubtitleTracks.length > 1;
  const selectedTrack = selectedSubtitleTracks[0];

  const handleTextEdit = useCallback(() => {
    if (isEditingText && editedText !== selectedTrack.subtitleText) {
      // Update the track with new text
      updateTrack(selectedTrack.id, { subtitleText: editedText });
    }
    setIsEditingText(!isEditingText);
  }, [
    isEditingText,
    editedText,
    selectedTrack.subtitleText,
    selectedTrack.id,
    updateTrack,
  ]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setEditedText(e.target.value);
    },
    [],
  );

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        setEditedText(selectedTrack.subtitleText || '');
        setIsEditingText(false);
      }
    },
    [selectedTrack.subtitleText],
  );

  const handleStartEditing = useCallback(() => {
    setIsEditingText(true);
  }, []);

  const handleEditingKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        setIsEditingText(true);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isEditingText) {
      setEditedText(selectedTrack.subtitleText || '');
    }
  }, [isEditingText, selectedTrack.id, selectedTrack.subtitleText]);

  const handleReset = useCallback(() => {
    resetTextStyles();
  }, [resetTextStyles]);

  const handleResetOpacity = useCallback(() => {
    setOpacity(100);
  }, [setOpacity]);

  const handleOpacityInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value) || 0;
      setOpacity(value);
    },
    [setOpacity],
  );

  const handleOpacitySliderChange = useCallback(
    (values: number[]) => {
      setOpacity(values[0]);
    },
    [setOpacity],
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
      {/* Subtitle Text Editing */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Basic</h4>
        <div className="relative">
          {isMultipleSelected ? (
            <p className="text-xs text-muted-foreground text-center">
              Click a single subtitle to edit its value
            </p>
          ) : isEditingText ? (
            <Textarea
              value={editedText}
              onChange={handleTextChange}
              onKeyDown={handleTextKeyDown}
              onBlur={handleTextEdit}
              autoFocus
              placeholder="Enter subtitle text..."
              className="min-h-[80px] resize-none"
            />
          ) : (
            <div
              className="px-3 py-2 bg-muted/50 border border-border rounded-lg cursor-text hover:bg-muted/70 transition-colors"
              onClick={handleStartEditing}
              role="button"
              tabIndex={0}
              onKeyDown={handleEditingKeyDown}
              aria-label="Click to edit text"
            >
              <p className="text-sm text-foreground whitespace-pre-wrap">
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
                  Text edits apply individually per subtitle clip. Style changes
                  affect all subtitles globally.
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
                disabled={!hasStylesChanged}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {hasStylesChanged ? 'Reset all styles' : 'No changes to reset'}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="space-y-2">
          {/* Fill */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Fill</label>
            <div className="flex items-center gap-1">
              <ColorPickerPopover
                value={textStyle.globalControls.fillColor}
                onChange={setFillColor}
                onChangeComplete={addRecentColor}
                recentColors={colorHistory.recentColors}
                disabled={!isDev}
              />
              <div className="h-7 w-7"></div>
            </div>
          </div>

          {/* Stroke */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Stroke</label>
            <div className="flex items-center gap-1">
              <ColorPickerPopover
                value={textStyle.globalControls.strokeColor}
                onChange={setStrokeColor}
                onChangeComplete={addRecentColor}
                recentColors={colorHistory.recentColors}
                disabled={!isDev}
                showDiagonal
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Stroke options (coming soon)</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Background */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Background</label>
            <div className="flex items-center gap-1">
              <ColorPickerPopover
                value={textStyle.globalControls.backgroundColor}
                onChange={setBackgroundColor}
                onChangeComplete={addRecentColor}
                recentColors={colorHistory.recentColors}
                disabled={!isDev}
                showDiagonal
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Background options (coming soon)</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Shadow */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Shadow</label>
            <div className="flex items-center gap-1">
              <Button
                variant={
                  textStyle.globalControls.hasShadow ? 'default' : 'outline'
                }
                size="sm"
                onClick={toggleShadow}
                className="h-7 w-14 text-xs"
                disabled={!isDev}
              >
                {textStyle.globalControls.hasShadow ? 'On' : 'Off'}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Shadow options (coming soon)</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Glow Section - Developer Mode Only */}
      {isDev && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">
                Glow
              </label>
              <Switch
                checked={textStyle.globalControls.hasGlow}
                onCheckedChange={toggleGlow}
              />
            </div>
          </div>
        </>
      )}

      {/* Opacity Section */}
      <Separator />
      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">Opacity</label>
        <div className="flex items-center gap-2">
          <Slider
            value={[textStyle.globalControls.opacity]}
            onValueChange={handleOpacitySliderChange}
            min={0}
            max={100}
            step={1}
            className="flex-1"
          />
          <Input
            type="number"
            value={textStyle.globalControls.opacity}
            onChange={handleOpacityInputChange}
            min={0}
            max={100}
            className="w-16 h-8 text-xs text-center"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetOpacity}
            className="h-8 w-8 p-0"
            disabled={!hasOpacityChanged}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

SubtitlePropertiesComponent.displayName = 'SubtitleProperties';

export const SubtitleProperties = React.memo(SubtitlePropertiesComponent);
