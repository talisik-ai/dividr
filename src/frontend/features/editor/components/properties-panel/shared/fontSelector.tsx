/**
 * Font Selector Component
 * A searchable font picker with popover and command palette
 */
import { Button } from '@/frontend/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/frontend/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/frontend/components/ui/popover';
import { cn } from '@/frontend/utils/utils';
import { Check, ChevronDown } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import {
  AVAILABLE_FONTS,
  FontOption,
  SANS_SERIF_FONTS,
  SERIF_FONTS,
} from '../../../constants/fonts';

interface FontSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  recentFonts?: string[];
  onFontUsed?: (fontFamily: string) => void;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

const FontSelectorComponent = ({
  value,
  onValueChange,
  disabled = false,
  recentFonts = [],
  onFontUsed,
  size = 'sm',
  className,
}: FontSelectorProps) => {
  const [open, setOpen] = useState(false);

  // Memoize the selected font to prevent recalculation
  const selectedFont = useMemo(
    () => AVAILABLE_FONTS.find((font) => font.value === value),
    [value],
  );

  // Memoize recent font options to prevent recalculation
  const recentFontOptions = useMemo(
    () =>
      recentFonts
        .map((fontValue) => AVAILABLE_FONTS.find((f) => f.value === fontValue))
        .filter((font): font is FontOption => font !== undefined)
        .slice(0, 5), // Limit to 5 recent fonts
    [recentFonts],
  );

  // Memoize the select handler to prevent re-creation
  const handleSelect = useCallback(
    (fontValue: string) => {
      onValueChange(fontValue);
      onFontUsed?.(fontValue);
      setOpen(false);
    },
    [onValueChange, onFontUsed],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          size={size}
          className={cn(
            'justify-between font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span
            className="truncate"
            style={{ fontFamily: selectedFont?.value }}
          >
            {selectedFont?.label || 'Select font...'}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search fonts..."
            className="h-9 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <CommandList>
            <CommandEmpty>No font found.</CommandEmpty>

            {/* Recent Fonts */}
            {recentFontOptions.length > 0 && (
              <>
                <CommandGroup heading="Recent">
                  {recentFontOptions.map((font) => (
                    <CommandItem
                      key={font.value}
                      value={font.value}
                      onSelect={() => handleSelect(font.value)}
                    >
                      <span
                        className="flex-1"
                        style={{ fontFamily: font.value }}
                      >
                        {font.label}
                      </span>
                      <Check
                        className={cn(
                          'ml-2 h-4 w-4',
                          value === font.value ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Sans-Serif Fonts */}
            <CommandGroup heading="Sans-Serif">
              {SANS_SERIF_FONTS.map((font) => (
                <CommandItem
                  key={font.value}
                  value={font.value}
                  onSelect={() => handleSelect(font.value)}
                  keywords={[font.label, font.value, 'sans-serif']}
                >
                  <span className="flex-1" style={{ fontFamily: font.value }}>
                    {font.label}
                  </span>
                  <Check
                    className={cn(
                      'ml-2 h-4 w-4',
                      value === font.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            {/* Serif Fonts */}
            <CommandGroup heading="Serif">
              {SERIF_FONTS.map((font) => (
                <CommandItem
                  key={font.value}
                  value={font.value}
                  onSelect={() => handleSelect(font.value)}
                  keywords={[font.label, font.value, 'serif']}
                >
                  <span className="flex-1" style={{ fontFamily: font.value }}>
                    {font.label}
                  </span>
                  <Check
                    className={cn(
                      'ml-2 h-4 w-4',
                      value === font.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

FontSelectorComponent.displayName = 'FontSelector';

// Memoize the component to prevent unnecessary re-renders
export const FontSelector = React.memo(FontSelectorComponent);
