/* eslint-disable @typescript-eslint/no-explicit-any */
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Checkbox } from '@/frontend/components/ui/checkbox';
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';
import { ColorPickerPopover } from '../shared/colorPickerPopover';
import { FontSelector } from '../shared/fontSelector';

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
  const setStyleApplicationMode = useVideoEditorStore(
    (state) => state.setStyleApplicationMode,
  );
  const setFontFamily = useVideoEditorStore((state) => state.setFontFamily);
  const setFontSize = useVideoEditorStore((state) => state.setFontSize);
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
  const setTextAlign = useVideoEditorStore((state) => state.setTextAlign);
  const setLetterSpacing = useVideoEditorStore(
    (state) => state.setLetterSpacing,
  );
  const setLineSpacing = useVideoEditorStore((state) => state.setLineSpacing);
  const resetTextStyles = useVideoEditorStore((state) => state.resetTextStyles);
  const addRecentColor = useVideoEditorStore((state) => state.addRecentColor);
  const snapshotStylesToSelectedTracks = useVideoEditorStore(
    (state) => state.snapshotStylesToSelectedTracks,
  );
  const beginGroup = useVideoEditorStore((state) => state.beginGroup);
  const endGroup = useVideoEditorStore((state) => state.endGroup);

  // Track if we're in a slider drag to avoid multiple beginGroup calls
  const isDraggingRef = useRef(false);

  // Get selected subtitle tracks
  const selectedSubtitleTracks = tracks.filter(
    (track) => track.type === 'subtitle' && selectedTrackIds.includes(track.id),
  );

  // Local state for text editing
  const [editedText, setEditedText] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);

  // Check if any styles have changed from default
  const hasStylesChanged = useMemo(() => {
    const defaults = {
      isBold: false,
      isItalic: false,
      isUnderline: false,
      textTransform: 'none',
      textAlign: 'center',
      fontSize: 40,
      fillColor: '#FFFFFF',
      strokeColor: '#000000',
      backgroundColor: 'rgba(0, 0, 0, 0)',
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

  // Don't render if no subtitle tracks are selected
  if (selectedSubtitleTracks.length === 0) {
    return null;
  }

  const isMultipleSelected = selectedSubtitleTracks.length > 1;
  const selectedTrack = selectedSubtitleTracks[0];
  const isGlobalStyleMode = textStyle.styleApplicationMode === 'all';

  const activeSubtitleStyle = useMemo(() => {
    if (!selectedTrack) {
      return textStyle.globalControls;
    }

    if (isGlobalStyleMode) {
      return textStyle.globalControls;
    }

    return {
      ...textStyle.globalControls,
      ...(selectedTrack.subtitleStyle || {}),
    };
  }, [
    isGlobalStyleMode,
    selectedTrack,
    selectedTrack?.subtitleText,
    selectedTrack?.subtitleStyle,
    textStyle.globalControls,
  ]);

  const hasOpacityChanged = useMemo(() => {
    return activeSubtitleStyle.opacity !== 100;
  }, [activeSubtitleStyle.opacity]);

  const handleTextEdit = useCallback(() => {
    // Only save if we're in editing mode and text changed
    if (isEditingText) {
      if (editedText !== selectedTrack.subtitleText) {
        updateTrack(selectedTrack.id, { subtitleText: editedText });
      }
      setIsEditingText(false);
    }
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
      if (e.key === 'Enter' && !e.shiftKey) {
        // Enter without shift: save and exit
        e.preventDefault();
        if (editedText !== selectedTrack.subtitleText) {
          updateTrack(selectedTrack.id, { subtitleText: editedText });
        }
        setIsEditingText(false);
      } else if (e.key === 'Escape') {
        // Escape: cancel and revert
        setEditedText(selectedTrack.subtitleText || '');
        setIsEditingText(false);
      }
      // Shift+Enter: allow default behavior (new line)
    },
    [editedText, selectedTrack.subtitleText, selectedTrack.id, updateTrack],
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

  // Auto-snapshot styles when tracks are selected in "selected" mode
  // This ensures tracks have complete styling data for export
  useEffect(() => {
    if (!isGlobalStyleMode && selectedSubtitleTracks.length > 0) {
      snapshotStylesToSelectedTracks();
    }
  }, [
    selectedTrackIds,
    isGlobalStyleMode,
    selectedSubtitleTracks.length,
    snapshotStylesToSelectedTracks,
  ]);

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

  // Handle slider drag start (begin batch transaction)
  const handleSliderDragStart = useCallback(() => {
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      beginGroup('Update Subtitle Style');
    }
  }, [beginGroup]);

  // Handle slider drag end (end batch transaction)
  const handleSliderDragEnd = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      endGroup();
    }
  }, [endGroup]);

  const handleOpacitySliderChange = useCallback(
    (values: number[]) => {
      setOpacity(values[0]);
    },
    [setOpacity],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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
            <FontSelector
              value={activeSubtitleStyle.fontFamily || 'Inter'}
              onValueChange={setFontFamily}
              size="sm"
              className="flex-1"
            />

            <Select
              value={String(activeSubtitleStyle.fontSize)}
              onValueChange={(value) => setFontSize(Number(value))}
            >
              <SelectTrigger className="w-20" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12</SelectItem>
                <SelectItem value="14">14</SelectItem>
                <SelectItem value="16">16</SelectItem>
                <SelectItem value="18">18</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="24">24</SelectItem>
                <SelectItem value="28">28</SelectItem>
                <SelectItem value="32">32</SelectItem>
                <SelectItem value="36">36</SelectItem>
                <SelectItem value="40">40</SelectItem>
                <SelectItem value="48">48</SelectItem>
                <SelectItem value="56">56</SelectItem>
                <SelectItem value="64">64</SelectItem>
                <SelectItem value="72">72</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            {/* Toggle Group - Styling */}
            <ToggleGroup
              type="multiple"
              className="justify-start gap-4"
              variant="default"
              value={[
                ...(activeSubtitleStyle.isBold ? ['bold'] : []),
                ...(activeSubtitleStyle.isItalic ? ['italic'] : []),
                ...(activeSubtitleStyle.isUnderline ? ['underline'] : []),
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
                      value={activeSubtitleStyle.textTransform}
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
                        {activeSubtitleStyle.textTransform === 'none' && (
                          <CaseSensitive className="size-5" />
                        )}
                        {activeSubtitleStyle.textTransform === 'uppercase' && (
                          <CaseUpper className="size-5" />
                        )}
                        {activeSubtitleStyle.textTransform === 'lowercase' && (
                          <CaseLower className="size-5" />
                        )}
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
                    <Select
                      value={activeSubtitleStyle.textAlign}
                      onValueChange={(value) =>
                        setTextAlign(
                          value as 'left' | 'center' | 'right' | 'justify',
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-auto px-2 gap-1"
                        variant="ghost"
                        chevronSize={3}
                      >
                        <div className="relative">
                          {activeSubtitleStyle.textAlign === 'left' && (
                            <AlignLeft className="size-5" />
                          )}
                          {activeSubtitleStyle.textAlign === 'center' && (
                            <AlignCenter className="size-5" />
                          )}
                          {activeSubtitleStyle.textAlign === 'right' && (
                            <AlignRight className="size-5" />
                          )}
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">
                          <div className="flex items-center">
                            <AlignLeft className="size-4 mr-2" />
                            Left
                          </div>
                        </SelectItem>
                        <SelectItem value="center">
                          <div className="flex items-center">
                            <AlignCenter className="size-4 mr-2" />
                            Center
                          </div>
                        </SelectItem>
                        <SelectItem value="right">
                          <div className="flex items-center">
                            <AlignRight className="size-4 mr-2" />
                            Right
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Text alignment</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-1">
                    <Select
                      value={
                        activeSubtitleStyle.letterSpacing === 0 &&
                        activeSubtitleStyle.lineSpacing === 1.2
                          ? 'normal'
                          : activeSubtitleStyle.letterSpacing === -1 &&
                              activeSubtitleStyle.lineSpacing === 1
                            ? 'tight'
                            : activeSubtitleStyle.letterSpacing === 1 &&
                                activeSubtitleStyle.lineSpacing === 1.5
                              ? 'loose'
                              : 'custom'
                      }
                      onValueChange={(value) => {
                        if (value === 'normal') {
                          setLetterSpacing(0);
                          setLineSpacing(1.2);
                        } else if (value === 'tight') {
                          setLetterSpacing(-1);
                          setLineSpacing(1);
                        } else if (value === 'loose') {
                          setLetterSpacing(1);
                          setLineSpacing(1.5);
                        }
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-auto px-2 gap-1"
                        variant="ghost"
                        chevronSize={3}
                      >
                        <div className="relative flex items-center">
                          <ListChevronsUpDown className="size-5 scale-x-[-1]" />
                          {(activeSubtitleStyle.letterSpacing !== 0 ||
                            activeSubtitleStyle.lineSpacing !== 1.2) && (
                            <Badge
                              variant="secondary"
                              className="absolute -right-3 -top-1 h-3 px-1 text-[8px]"
                            >
                              {activeSubtitleStyle.letterSpacing === -1 &&
                              activeSubtitleStyle.lineSpacing === 1
                                ? 'T'
                                : activeSubtitleStyle.letterSpacing === 1 &&
                                    activeSubtitleStyle.lineSpacing === 1.5
                                  ? 'L'
                                  : 'C'}
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
                  <p>Letter/line spacing</p>
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
                    changes can be applied globally or to selected segments
                    only.
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
                  {hasStylesChanged
                    ? 'Reset all styles'
                    : 'No changes to reset'}
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
                  value={activeSubtitleStyle.fillColor}
                  onChange={setFillColor}
                  onChangeComplete={addRecentColor}
                  recentColors={colorHistory.recentColors}
                />
                <div className="h-7 w-7"></div>
              </div>
            </div>

            {/* Stroke */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Stroke</label>
              <div className="flex items-center gap-1">
                <ColorPickerPopover
                  value={activeSubtitleStyle.strokeColor}
                  onChange={setStrokeColor}
                  onChangeComplete={addRecentColor}
                  recentColors={colorHistory.recentColors}
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
              <label className="text-xs text-muted-foreground">
                Background
              </label>
              <div className="flex items-center gap-1">
                <ColorPickerPopover
                  value={activeSubtitleStyle.backgroundColor}
                  onChange={setBackgroundColor}
                  onChangeComplete={addRecentColor}
                  recentColors={colorHistory.recentColors}
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
                <Switch
                  checked={activeSubtitleStyle.hasShadow}
                  onCheckedChange={toggleShadow}
                  className="h-4 w-7"
                  thumbClassName="size-3.5"
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
                    <p>Shadow options (coming soon)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        {/* Glow Section */}
        <Separator />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-foreground">
              Glow
            </label>
            <Switch
              checked={activeSubtitleStyle.hasGlow}
              onCheckedChange={toggleGlow}
              className="h-4 w-7"
              thumbClassName="size-3.5"
            />
          </div>
        </div>

        {/* Opacity Section */}
        <Separator />
        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground">
            Opacity
          </label>
          <div className="flex items-center gap-2">
            <Slider
              value={[activeSubtitleStyle.opacity]}
              onValueChange={handleOpacitySliderChange}
              onPointerDown={handleSliderDragStart}
              onValueCommit={handleSliderDragEnd}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <Input
              type="number"
              value={activeSubtitleStyle.opacity}
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

      {/* Fixed Footer - Style Application Mode */}
      <div className="border-t border-border bg-transparent px-4 py-3">
        <div className="flex items-center gap-3">
          <Checkbox
            id="apply-to-all"
            checked={textStyle.styleApplicationMode === 'all'}
            onCheckedChange={(checked) =>
              setStyleApplicationMode(checked ? 'all' : 'selected')
            }
          />
          <div className="flex-1">
            <label
              htmlFor="apply-to-all"
              className="text-sm font-medium cursor-pointer"
            >
              Apply styles to all subtitles
            </label>
            <p className="text-xs text-muted-foreground">
              {textStyle.styleApplicationMode === 'all'
                ? 'Styles affect all subtitle segments globally'
                : selectedSubtitleTracks.length > 0
                  ? `Styling ${selectedSubtitleTracks.length} selected segment${selectedSubtitleTracks.length > 1 ? 's' : ''}`
                  : 'Select subtitle segments to apply styles'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

SubtitlePropertiesComponent.displayName = 'SubtitleProperties';

export const SubtitleProperties = React.memo(SubtitlePropertiesComponent);
