/* eslint-disable @typescript-eslint/no-explicit-any */
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { calculateDefaultFontSize } from '../../../preview/core/constants';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';
import { ColorPickerPopover } from '../shared/colorPickerPopover';
import { FontSelector } from '../shared/fontSelector';
import { FONT_SIZE_PRESETS, NumericInput } from '../shared/numericInput';

interface TextPropertiesProps {
  selectedTrackIds: string[];
}

const DEFAULT_TEXT_STYLE: {
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  fontSize: number;
  fillColor: string;
  strokeColor: string;
  backgroundColor: string;
  hasShadow: boolean;
  letterSpacing: number;
  lineHeight: number;
  hasGlow: boolean;
  opacity: number;
} = {
  fontFamily: '"Arial", sans-serif',
  fontWeight: '400',
  fontStyle: 'normal',
  isBold: false,
  isItalic: false,
  isUnderline: false,
  textTransform: 'none',
  textAlign: 'center',
  fontSize: 40,
  fillColor: '#FFFFFF',
  strokeColor: '#000000',
  backgroundColor: 'transparent',
  hasShadow: false,
  letterSpacing: 0,
  lineHeight: 1.2,
  hasGlow: false,
  opacity: 100,
};

const TextPropertiesComponent: React.FC<TextPropertiesProps> = ({
  selectedTrackIds,
}) => {
  // Selective subscriptions to avoid re-renders during playback
  const tracks = useVideoEditorStore((state) => state.tracks);
  const colorHistory = useVideoEditorStore((state) => state.colorHistory);
  const recentFonts = useVideoEditorStore((state) => state.recentFonts);
  const canvasHeight = useVideoEditorStore(
    (state) => state.preview?.canvasHeight || 720,
  );

  // Calculate resolution-aware default font size
  const dynamicDefaultFontSize = useMemo(
    () => calculateDefaultFontSize(canvasHeight),
    [canvasHeight],
  );

  // Action subscriptions (these don't cause re-renders)
  const updateTrack = useVideoEditorStore((state) => state.updateTrack);
  const updateTrackProperty = useVideoEditorStore(
    (state) => state.updateTrackProperty,
  );
  const beginPropertyUpdate = useVideoEditorStore(
    (state) => state.beginPropertyUpdate,
  );
  const endPropertyUpdate = useVideoEditorStore(
    (state) => state.endPropertyUpdate,
  );
  const addRecentColor = useVideoEditorStore((state) => state.addRecentColor);
  const addRecentFont = useVideoEditorStore((state) => state.addRecentFont);

  // Track if we're in a slider drag to avoid multiple beginGroup calls
  const isDraggingRef = useRef(false);

  // Get selected text tracks
  const selectedTextTracks = tracks.filter(
    (track) => track.type === 'text' && selectedTrackIds.includes(track.id),
  );

  // Local state for text editing
  const [editedText, setEditedText] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);

  // Don't render if no text tracks are selected
  if (selectedTextTracks.length === 0) {
    return null;
  }

  const isMultipleSelected = selectedTextTracks.length > 1;
  const selectedTrack = selectedTextTracks[0];
  const currentStyle = selectedTrack.textStyle || DEFAULT_TEXT_STYLE;

  // Helper function to update text style for selected tracks (creates undo entry)
  const updateTextStyle = useCallback(
    (styleUpdates: Partial<typeof DEFAULT_TEXT_STYLE>) => {
      selectedTextTracks.forEach((track) => {
        const currentTrackStyle = track.textStyle || DEFAULT_TEXT_STYLE;
        updateTrack(track.id, {
          textStyle: {
            ...currentTrackStyle,
            ...styleUpdates,
          },
        });
      });
    },
    [selectedTextTracks, updateTrack],
  );

  // Helper function to update text style during drag (batch-safe, no individual undo entries)
  const updateTextStyleDrag = useCallback(
    (styleUpdates: Partial<typeof DEFAULT_TEXT_STYLE>) => {
      selectedTextTracks.forEach((track) => {
        const currentTrackStyle = track.textStyle || DEFAULT_TEXT_STYLE;
        updateTrackProperty(track.id, {
          textStyle: {
            ...currentTrackStyle,
            ...styleUpdates,
          },
        });
      });
    },
    [selectedTextTracks, updateTrackProperty],
  );

  // Handle slider drag start (begin batch transaction)
  const handleSliderDragStart = useCallback(() => {
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      beginPropertyUpdate('Update Text Style');
    }
  }, [beginPropertyUpdate]);

  // Handle slider drag end (end batch transaction)
  const handleSliderDragEnd = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      endPropertyUpdate();
    }
  }, [endPropertyUpdate]);

  // Check if any styles have changed from default (using resolution-aware font size)
  const hasStylesChanged = useMemo(() => {
    return (
      currentStyle.isBold !== DEFAULT_TEXT_STYLE.isBold ||
      currentStyle.isItalic !== DEFAULT_TEXT_STYLE.isItalic ||
      currentStyle.isUnderline !== DEFAULT_TEXT_STYLE.isUnderline ||
      currentStyle.textTransform !== DEFAULT_TEXT_STYLE.textTransform ||
      currentStyle.textAlign !== DEFAULT_TEXT_STYLE.textAlign ||
      currentStyle.fontSize !== dynamicDefaultFontSize ||
      currentStyle.fillColor !== DEFAULT_TEXT_STYLE.fillColor ||
      currentStyle.strokeColor !== DEFAULT_TEXT_STYLE.strokeColor ||
      currentStyle.backgroundColor !== DEFAULT_TEXT_STYLE.backgroundColor ||
      currentStyle.hasShadow !== DEFAULT_TEXT_STYLE.hasShadow ||
      currentStyle.letterSpacing !== DEFAULT_TEXT_STYLE.letterSpacing ||
      currentStyle.lineHeight !== DEFAULT_TEXT_STYLE.lineHeight ||
      currentStyle.hasGlow !== DEFAULT_TEXT_STYLE.hasGlow ||
      currentStyle.opacity !== DEFAULT_TEXT_STYLE.opacity
    );
  }, [currentStyle, dynamicDefaultFontSize]);

  // Check if opacity has changed from default
  const hasOpacityChanged = useMemo(() => {
    return currentStyle.opacity !== 100;
  }, [currentStyle.opacity]);

  const handleTextEdit = useCallback(() => {
    // Only save if we're in editing mode and text changed
    if (isEditingText) {
      if (editedText !== selectedTrack.textContent) {
        updateTrack(selectedTrack.id, { textContent: editedText });
      }
      setIsEditingText(false);
    }
  }, [
    isEditingText,
    editedText,
    selectedTrack.textContent,
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
        if (editedText !== selectedTrack.textContent) {
          updateTrack(selectedTrack.id, { textContent: editedText });
        }
        setIsEditingText(false);
      } else if (e.key === 'Escape') {
        // Escape: cancel and revert
        setEditedText(selectedTrack.textContent || '');
        setIsEditingText(false);
      }
      // Shift+Enter: allow default behavior (new line)
    },
    [editedText, selectedTrack.textContent, selectedTrack.id, updateTrack],
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
      setEditedText(selectedTrack.textContent || '');
    }
  }, [isEditingText, selectedTrack.id, selectedTrack.textContent]);

  const handleReset = useCallback(() => {
    // Reset with resolution-aware default font size
    updateTextStyle({
      ...DEFAULT_TEXT_STYLE,
      fontSize: dynamicDefaultFontSize,
    });
  }, [updateTextStyle, dynamicDefaultFontSize]);

  const handleResetOpacity = useCallback(() => {
    updateTextStyle({ opacity: 100 });
  }, [updateTextStyle]);

  const handleOpacityInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value) || 0;
      updateTextStyle({ opacity: value });
    },
    [updateTextStyle],
  );

  const handleOpacitySliderChange = useCallback(
    (values: number[]) => {
      updateTextStyleDrag({ opacity: values[0] });
    },
    [updateTextStyleDrag],
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
      {/* Text Editing */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Basic</h4>
        <div className="relative">
          {isMultipleSelected ? (
            <p className="text-xs text-muted-foreground text-center">
              Click a single text clip to edit its value
            </p>
          ) : isEditingText ? (
            <Textarea
              value={editedText}
              onChange={handleTextChange}
              onKeyDown={handleTextKeyDown}
              onBlur={handleTextEdit}
              autoFocus
              placeholder="Enter text..."
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
                {selectedTrack.textContent || 'Click to edit text...'}
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
            value={selectedTextTracks[0]?.textStyle?.fontFamily || 'Inter'}
            onValueChange={(value) => {
              updateTextStyle({ fontFamily: value });
            }}
            onFontUsed={addRecentFont}
            recentFonts={recentFonts}
            disabled={isMultipleSelected}
            size="sm"
            className="flex-1"
          />

          <NumericInput
            value={currentStyle.fontSize}
            onChange={(value) => updateTextStyle({ fontSize: value })}
            onChangeStart={() => beginPropertyUpdate('Font Size')}
            onChangeEnd={endPropertyUpdate}
            min={1}
            max={999}
            step={1}
            presets={FONT_SIZE_PRESETS}
            disabled={isMultipleSelected}
            className="w-24"
            ariaLabel="Font size"
          />
        </div>

        <div className="flex items-center justify-between">
          {/* Toggle Group - Styling */}
          <ToggleGroup
            type="multiple"
            className="justify-start gap-4"
            variant="default"
            value={[
              ...(currentStyle.isBold ? ['bold'] : []),
              ...(currentStyle.isItalic ? ['italic'] : []),
              ...(currentStyle.isUnderline ? ['underline'] : []),
            ]}
            onValueChange={(values) => {
              const wasBold = currentStyle.isBold;
              const wasItalic = currentStyle.isItalic;
              const wasUnderline = currentStyle.isUnderline;

              const isBoldNow = values.includes('bold');
              const isItalicNow = values.includes('italic');
              const isUnderlineNow = values.includes('underline');

              if (wasBold !== isBoldNow) updateTextStyle({ isBold: isBoldNow });
              if (wasItalic !== isItalicNow)
                updateTextStyle({ isItalic: isItalicNow });
              if (wasUnderline !== isUnderlineNow)
                updateTextStyle({ isUnderline: isUnderlineNow });
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
                    value={String(currentStyle.textTransform || 'none')}
                    onValueChange={(value) => {
                      const transform = value as
                        | 'none'
                        | 'uppercase'
                        | 'lowercase'
                        | 'capitalize';
                      updateTextStyle({ textTransform: transform });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-auto px-2 gap-1"
                      variant="ghost"
                      chevronSize={3}
                    >
                      {currentStyle.textTransform === 'none' && (
                        <CaseSensitive className="size-5" />
                      )}
                      {currentStyle.textTransform === 'uppercase' && (
                        <CaseUpper className="size-5" />
                      )}
                      {currentStyle.textTransform === 'lowercase' && (
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
                    value={String(currentStyle.textAlign || 'center')}
                    onValueChange={(value) => {
                      const align = value as
                        | 'left'
                        | 'center'
                        | 'right'
                        | 'justify';
                      updateTextStyle({ textAlign: align });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-auto px-2 gap-1"
                      variant="ghost"
                      chevronSize={3}
                    >
                      <div className="relative">
                        {currentStyle.textAlign === 'left' && (
                          <AlignLeft className="size-5" />
                        )}
                        {currentStyle.textAlign === 'center' && (
                          <AlignCenter className="size-5" />
                        )}
                        {currentStyle.textAlign === 'right' && (
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
                      currentStyle.letterSpacing === 0 &&
                      currentStyle.lineHeight === 1.2
                        ? 'normal'
                        : currentStyle.letterSpacing === -1 &&
                            currentStyle.lineHeight === 1
                          ? 'tight'
                          : currentStyle.letterSpacing === 1 &&
                              currentStyle.lineHeight === 1.5
                            ? 'loose'
                            : 'custom'
                    }
                    onValueChange={(value) => {
                      if (value === 'normal') {
                        updateTextStyle({
                          letterSpacing: 0,
                          lineHeight: 1.2,
                        });
                      } else if (value === 'tight') {
                        updateTextStyle({
                          letterSpacing: -1,
                          lineHeight: 1,
                        });
                      } else if (value === 'loose') {
                        updateTextStyle({
                          letterSpacing: 1,
                          lineHeight: 1.5,
                        });
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
                        {(currentStyle.letterSpacing !== 0 ||
                          currentStyle.lineHeight !== 1.2) && (
                          <Badge
                            variant="secondary"
                            className="absolute -right-3 -top-1 h-3 px-1 text-[8px]"
                          >
                            {currentStyle.letterSpacing === -1 &&
                            currentStyle.lineHeight === 1
                              ? 'T'
                              : currentStyle.letterSpacing === 1 &&
                                  currentStyle.lineHeight === 1.5
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
                <p>Line height</p>
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
                  All style changes apply individually per text clip. Each text
                  element has its own independent styling.
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
                value={currentStyle.fillColor}
                onChange={(color) => updateTextStyle({ fillColor: color })}
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
                value={currentStyle.strokeColor}
                onChange={(color) => updateTextStyle({ strokeColor: color })}
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
            <label className="text-xs text-muted-foreground">Background</label>
            <div className="flex items-center gap-1">
              <ColorPickerPopover
                value={currentStyle.backgroundColor}
                onChange={(color) =>
                  updateTextStyle({ backgroundColor: color })
                }
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
                checked={currentStyle.hasShadow}
                onCheckedChange={() =>
                  updateTextStyle({ hasShadow: !currentStyle.hasShadow })
                }
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
          <label className="text-sm font-semibold text-foreground">Glow</label>
          <Switch
            checked={currentStyle.hasGlow}
            onCheckedChange={() =>
              updateTextStyle({ hasGlow: !currentStyle.hasGlow })
            }
            className="h-4 w-7"
            thumbClassName="size-3.5"
          />
        </div>
      </div>

      {/* Opacity Section */}
      <Separator />
      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">Opacity</label>
        <div className="flex items-center gap-2">
          <Slider
            value={[currentStyle.opacity]}
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
            value={currentStyle.opacity}
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

TextPropertiesComponent.displayName = 'TextProperties';

export const TextProperties = React.memo(TextPropertiesComponent);
