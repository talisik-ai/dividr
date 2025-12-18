# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dividr is a desktop video editing application built with Electron, React, and FFmpeg. It features AI-powered transcription via Faster-Whisper (Python), timeline-based editing, and multi-format export.

## Development Commands

```bash
yarn install              # Install dependencies
yarn start                # Start Electron app in development mode with hot-reloading
yarn lint                 # Run ESLint on TypeScript files
yarn test                 # Run tests with Vitest
yarn run package          # Package app for distribution
yarn run make             # Create platform installers (NSIS for Windows, ZIP for all)
```

### Python Environment (for transcription)

```bash
pip install -r requirements.txt                    # Install Python dependencies
python src/backend/scripts/transcribe.py --help   # Verify transcription script
```

## Architecture

### Electron Structure

- **Main Process** (`src/main.ts`): ~72KB file handling FFmpeg initialization, IPC handlers, window management, and backend service coordination
- **Preload Bridge** (`src/preload.ts`): Exposes `window.electronAPI` for renderer→main IPC communication
- **Renderer** (`src/renderer.tsx`): React app entry point

### Frontend (`src/frontend/`)

```
features/
├── editor/           # Main video editor feature
│   ├── stores/       # Zustand state management
│   ├── timeline/     # Timeline components & track rendering
│   ├── preview/      # Video preview canvas
│   └── components/   # Editor UI components
├── projects/         # Project management (create, open, save)
├── export/           # Export workflow
└── transcription/    # Whisper transcription UI
```

### Backend (`src/backend/`)

```
ffmpeg/               # FFmpeg command building, execution, progress tracking
whisper/              # Python Faster-Whisper integration
services/             # Project persistence (IndexedDB via projectService)
frontend_use/         # Utilities for frontend (sprite sheets, waveforms, thumbnails)
scripts/              # Python transcription script (transcribe.py)
```

### State Management

Uses **Zustand with slice pattern**. Main store at `src/frontend/features/editor/stores/videoEditor/`:

| Slice | Responsibility |
|-------|----------------|
| `tracksSlice` | Video/audio/text track data (largest slice) |
| `timelineSlice` | Timeline position, zoom, selection, snap |
| `playbackSlice` | Play/pause, volume, playback rate |
| `previewSlice` | Canvas settings, zoom, pan |
| `projectSlice` | Project lifecycle, auto-save |
| `undoRedoSlice` | Undo/redo with batch grouping |
| `mediaLibrarySlice` | Imported media management |
| `transcriptionSlice` | Transcription state |

Middleware: `subscribeWithSelector`, `persist` (localStorage), `devtools`

### Key Types

- `VideoTrack`: Single clip representation (type: `'video' | 'audio' | 'text' | 'image' | 'subtitle'`)
- `ProjectData`: Full project structure with metadata and videoEditor state
- Shared types in `src/shared/types/`

### IPC Communication

Frontend calls backend via `window.electronAPI.invoke(channel, ...args)`. Key channels:
- `ffmpeg:*` - FFmpeg operations with progress
- `whisper:*` - Transcription with progress
- `sprite-sheet-*` - Background thumbnail generation
- `extract-audio-from-video` - Audio extraction for waveforms

### Project Persistence

- **IndexedDB**: Project data via `projectService` (DB: `DividrProjects`)
- **localStorage**: UI preferences (zoom, snap settings, colors)
- Auto-save with debounce, change tracking via `hasUnsavedChanges`

## Code Conventions

- **Path alias**: `@/*` maps to `./src/*`
- **Styling**: Tailwind CSS with shadcn/ui components (Radix UI primitives)
- **Formatting**: Prettier with single quotes, 2-space tabs, Tailwind plugin
- **Linting**: ESLint with TypeScript, import ordering
- **Components**: UI primitives in `src/frontend/components/ui/`, custom in `components/custom/`

## Key Patterns

### Undo/Redo
- Captures `UndoableState` (tracks, timeline, preview)
- Supports batch grouping: `beginGroup()`/`endGroup()`
- Max 50 history entries

### Timeline
- Dynamic track rows with grouping by type
- Collision detection for clip boundaries
- Snap-to-grid (playhead, clip edges)
- Drag-and-drop with visual ghost

### Keyboard Shortcuts
- Uses `react-hotkeys-hook`
- Registry initialized globally
- Context-specific hooks: `useGlobalShortcuts`, `useTimelineShortcuts`, `useTrackShortcuts`

## FFmpeg Integration

FFmpeg binaries resolved in order:
1. `ffmpeg-static` (bundled, preferred)
2. `ffbinaries` (downloads on first use to `userData/ffmpeg-bin/`)

Command building in `src/backend/ffmpeg/commandBuilder.ts`, execution in `ffmpegRunner.ts`
