import React from 'react';

/**
 * Transcription progress overlay component
 */

export interface TranscriptionProgressOverlayProps {
  progress: number;
}

export const TranscriptionProgressOverlay: React.FC<
  TranscriptionProgressOverlayProps
> = ({ progress }) => {
  return (
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1001]">
      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r="16"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          className="text-white/20"
        />
        <circle
          cx="20"
          cy="20"
          r="16"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeDasharray={`${2 * Math.PI * 16}`}
          strokeDashoffset={`${2 * Math.PI * 16 * (1 - progress / 100)}`}
          className="text-white transition-all duration-300"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
