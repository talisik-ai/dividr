import { TrackInfo, VideoEditJob } from '../Schema/ffmpegConfig';

interface CommandParts {
  args: string[];
  filters: string[];
}

// -------------------------
// Step handlers
// -------------------------
const steps: ((job: VideoEditJob, cmd: CommandParts) => void)[] = [
  handleInputs,
  handleTrim,
  handleCrop,
  handleSubtitles,
  handleAspect,
  handleReplaceAudio,
];

function buildConcatFilter(inputs: string[], targetFps?: number) {
  const fpsFilters: string[] = [];
  const concatInputs: string[] = [];
  let hasVideo = false;
  let hasAudio = false;

  inputs.forEach((input, index) => {
    const isVideo = /\.(mp4|mov|mkv|avi|webm)$/i.test(input);
    const isAudioOnly = /\.(mp3|wav|aac|flac)$/i.test(input);

    if (isVideo) {
      hasVideo = true;
      if (targetFps) {
        fpsFilters.push(`[${index}:v]fps=${targetFps}[v${index}]`);
        concatInputs.push(`[v${index}]`);
      } else {
        concatInputs.push(`[${index}:v]`);
      }
    }

    if (!isVideo || !isAudioOnly) {
      hasAudio = true;
      concatInputs.push(`[${index}:a]`);
    }
  });

  const vf = fpsFilters.length ? fpsFilters.join(';') + ';' : '';
  const vFlag = hasVideo ? 1 : 0;
  const aFlag = hasAudio ? 1 : 0;

  return `${vf}${concatInputs.join('')}concat=n=${inputs.length}:v=${vFlag}:a=${aFlag}[outv][outa]`;
}

function escapePath(filePath: string) {
  // For Node.js spawn(), we don't need shell escaping or quotes
  // Just return the path as-is since spawn() passes arguments directly
  return filePath;
}

function handleInputs(job: VideoEditJob, cmd: CommandParts) {
  const inputCount = job.inputs.length;

  // Helper to get path from input (string or TrackInfo)
  const getInputPath = (input: string | TrackInfo): string => {
    return typeof input === 'string' ? input : input.path;
  };

  // Helper to get track info
  const getTrackInfo = (input: string | TrackInfo): TrackInfo => {
    return typeof input === 'string' ? { path: input } : input;
  };

  if (job.operations.concat && inputCount > 1) {
    // Add all inputs first
    job.inputs.forEach((input) => {
      cmd.args.push('-i', escapePath(getInputPath(input)));
    });

    const fpsFilters: string[] = [];
    const trimFilters: string[] = [];
    const concatVideoInputs: string[] = [];
    const concatAudioInputs: string[] = [];
    let videoCount = 0;
    let audioCount = 0;

    // Separate video and audio-only inputs
    const videoInputs: Array<{ index: number; trackInfo: TrackInfo }> = [];
    const audioInputs: Array<{ index: number; trackInfo: TrackInfo }> = [];

    job.inputs.forEach((input, index) => {
      const path = getInputPath(input);
      const trackInfo = getTrackInfo(input);
      const isVideo = /\.(mp4|mov|mkv|avi|webm)$/i.test(path);
      const isAudio = /\.(mp3|wav|aac|flac)$/i.test(path);

      if (isVideo) {
        videoInputs.push({ index, trackInfo });
      } else if (isAudio) {
        audioInputs.push({ index, trackInfo });
      }
    });

    // Handle video inputs for concatenation
    videoInputs.forEach(({ index, trackInfo }) => {
      videoCount++;
      let videoStreamRef = `[${index}:v]`;

      // Apply trimming if specified
      if (
        trackInfo.startTime !== undefined ||
        trackInfo.duration !== undefined
      ) {
        const trimmedRef = `[v${index}_trimmed]`;
        let trimFilter = `${videoStreamRef}trim=`;

        // Build trim parameters correctly
        const params = [];
        if (trackInfo.startTime !== undefined && trackInfo.startTime > 0) {
          params.push(`start=${trackInfo.startTime}`);
        }
        if (trackInfo.duration !== undefined) {
          params.push(`duration=${trackInfo.duration}`);
        }

        if (params.length > 0) {
          trimFilter += params.join(':') + trimmedRef;
          trimFilters.push(trimFilter);
          videoStreamRef = trimmedRef;
        }
      }

      // Apply FPS normalization
      if (job.operations.normalizeFrameRate) {
        const targetFps = job.operations.targetFrameRate || 30;
        const fpsRef = `[v${index}_fps]`;
        fpsFilters.push(`${videoStreamRef}fps=${targetFps}${fpsRef}`);
        concatVideoInputs.push(fpsRef);
      } else {
        concatVideoInputs.push(videoStreamRef);
      }
    });

    // For audio: if we have separate audio files, use video-only concat + audio replacement
    // Otherwise, use audio from video files for concatenation
    if (audioInputs.length > 0) {
      // Video-only concatenation when we have replacement audio
      const allFilters = [...trimFilters, ...fpsFilters];
      let filterComplex = '';

      if (allFilters.length > 0) {
        filterComplex = allFilters.join(';') + ';';
      }

      const videoOnlyFilter = `${concatVideoInputs.join('')}concat=n=${videoCount}:v=1:a=0[outv]`;
      filterComplex += videoOnlyFilter;

      // Use the first audio file as replacement (no duration trimming for replacement audio)
      const audioTrackInfo = audioInputs[0].trackInfo;
      const audioIndex = audioInputs[0].index;
      let audioRef = `${audioIndex}:a`;

      // Apply audio trimming if specified (independent of video trimming)
      if (
        audioTrackInfo.startTime !== undefined ||
        audioTrackInfo.duration !== undefined
      ) {
        const audioTrimRef = `[a${audioIndex}_trimmed]`;
        let audioTrimFilter = `[${audioIndex}:a]atrim=`;

        const params = [];
        if (
          audioTrackInfo.startTime !== undefined &&
          audioTrackInfo.startTime > 0
        ) {
          params.push(`start=${audioTrackInfo.startTime}`);
        }
        if (audioTrackInfo.duration !== undefined) {
          params.push(`duration=${audioTrackInfo.duration}`);
        }

        if (params.length > 0) {
          audioTrimFilter += params.join(':') + audioTrimRef;
          filterComplex = filterComplex + ';' + audioTrimFilter;
          audioRef = audioTrimRef.slice(1, -1); // Remove brackets for map
        }
      }

      // Add audio padding if needed to match video length
      // This extends short audio with silence to prevent cutoff
      const audioMapRef = audioRef.includes('_trimmed')
        ? `[${audioRef}]`
        : `${audioIndex}:a`;

      cmd.args.push('-filter_complex', filterComplex);
      cmd.args.push('-map', '[outv]', '-map', audioMapRef);

      // Add flags to handle audio/video length mismatch gracefully
      cmd.args.push('-c:v', 'libx264', '-c:a', 'aac');
      cmd.args.push('-avoid_negative_ts', 'make_zero');
    } else {
      // No separate audio files, concat audio from video files (with trimming)
      const audioTrimFilters: string[] = [];
      videoInputs.forEach(({ index, trackInfo }) => {
        audioCount++;
        const audioStreamRef = `[${index}:a]`;

        // Apply audio trimming if specified
        if (
          trackInfo.startTime !== undefined ||
          trackInfo.duration !== undefined
        ) {
          const audioTrimRef = `[a${index}_trimmed]`;
          let audioTrimFilter = `${audioStreamRef}atrim=`;

          const params = [];
          if (trackInfo.startTime !== undefined && trackInfo.startTime > 0) {
            params.push(`start=${trackInfo.startTime}`);
          }
          if (trackInfo.duration !== undefined) {
            params.push(`duration=${trackInfo.duration}`);
          }

          if (params.length > 0) {
            audioTrimFilter += params.join(':') + audioTrimRef;
            audioTrimFilters.push(audioTrimFilter);
            concatAudioInputs.push(audioTrimRef);
          } else {
            concatAudioInputs.push(audioStreamRef);
          }
        } else {
          concatAudioInputs.push(audioStreamRef);
        }
      });

      const allFilters = [...trimFilters, ...fpsFilters, ...audioTrimFilters];
      let filterComplex = '';

      if (allFilters.length > 0) {
        filterComplex = allFilters.join(';') + ';';
      }

      const concatFilter = `${concatVideoInputs.join('')}${concatAudioInputs.join('')}concat=n=${videoCount}:v=${videoCount > 0 ? 1 : 0}:a=${audioCount > 0 ? 1 : 0}[outv][outa]`;
      filterComplex += concatFilter;

      cmd.args.push('-filter_complex', filterComplex);
      cmd.args.push('-map', '[outv]', '-map', '[outa]');
    }
  } else {
    // Single input or non-concat mode
    if (job.inputs.length === 1) {
      const input = job.inputs[0];
      const trackInfo = getTrackInfo(input);

      cmd.args.push('-i', escapePath(getInputPath(input)));

      // Apply trimming for single track if specified
      if (
        trackInfo.startTime !== undefined ||
        trackInfo.duration !== undefined
      ) {
        let trimFilter = '[0:v]trim=';
        let audioTrimFilter = '[0:a]atrim=';

        const params = [];
        if (trackInfo.startTime !== undefined && trackInfo.startTime > 0) {
          params.push(`start=${trackInfo.startTime}`);
        }
        if (trackInfo.duration !== undefined) {
          params.push(`duration=${trackInfo.duration}`);
        }

        if (params.length > 0) {
          const paramString = params.join(':');
          trimFilter += paramString + '[outv]';
          audioTrimFilter += paramString + '[outa]';

          cmd.args.push('-filter_complex', `${trimFilter};${audioTrimFilter}`);
          cmd.args.push('-map', '[outv]', '-map', '[outa]');
        }
      }
    } else {
      // Multiple inputs but no concat - just add them
      job.inputs.forEach((input) =>
        cmd.args.push('-i', escapePath(getInputPath(input))),
      );
    }
  }
}

function handleTrim(job: VideoEditJob, cmd: CommandParts) {
  const trim = job.operations.trim;
  if (!trim) return;

  const { start, duration, end } = trim;
  if (start) cmd.args.unshift('-ss', start);
  if (duration) {
    cmd.args.push('-t', duration);
  } else if (end && start) {
    const dur = timeToSeconds(end) - timeToSeconds(start);
    cmd.args.push('-t', String(dur));
  }
}

function handleCrop(job: VideoEditJob, cmd: CommandParts) {
  const crop = job.operations.crop;
  if (crop)
    cmd.filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
}

function handleSubtitles(job: VideoEditJob, cmd: CommandParts) {
  if (job.operations.subtitles) {
    cmd.filters.push(`subtitles=${job.operations.subtitles}`);
  }
}

function handleAspect(job: VideoEditJob, cmd: CommandParts) {
  if (job.operations.aspect) cmd.args.push('-aspect', job.operations.aspect);
}

function handleReplaceAudio(job: VideoEditJob, cmd: CommandParts) {
  if (!job.operations.replaceAudio) return;
  cmd.args.push('-i', job.operations.replaceAudio);
  cmd.args.push('-map', '0:v', '-map', `${job.inputs.length}:a`);
}

// -------------------------
// Main builder
// -------------------------
export function buildFfmpegCommand(
  job: VideoEditJob,
  location?: string,
): string[] {
  const cmd: CommandParts = { args: [], filters: [] };

  // Run all step handlers
  for (const step of steps) step(job, cmd);

  // Apply -vf filters if we’re not in concat mode
  if (
    cmd.filters.length > 0 &&
    !(job.operations.concat && job.inputs.length > 1)
  ) {
    cmd.args.push('-vf', cmd.filters.join(','));
  }

  const outputFilePath = location
    ? location.endsWith('/')
      ? location + job.output
      : location + '/' + job.output
    : job.output;

  // Output file
  cmd.args.push(outputFilePath);
  console.log('🔧 FFmpeg Command Args:', cmd.args);
  console.log('🎬 Full FFmpeg Command:', ['ffmpeg', ...cmd.args].join(' '));
  return cmd.args;
}

// -------------------------
// Helpers
// -------------------------
function timeToSeconds(time: string): number {
  const parts = time.split(':').map(Number);
  return parts.reduce((acc, val) => acc * 60 + val);
}

// Test function for debugging command generation
export function testConcatCommand() {
  const testJob: VideoEditJob = {
    inputs: ['video1.mp4', 'video2.mp4'],
    output: 'output.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  const command = buildFfmpegCommand(testJob);
  console.log('🧪 Test Concat Command:', command.join(' '));
  return command;
}

// Test function for mixed video/audio inputs (audio replacement)
export function testAudioReplacementCommand() {
  const testJob: VideoEditJob = {
    inputs: ['video1.mp4', 'audio1.mp3', 'video2.mp4'],
    output: 'output.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  const command = buildFfmpegCommand(testJob);
  console.log('🎵 Test Audio Replacement Command:', command.join(' '));
  return command;
}

// Test function for track trimming
export function testTrackTrimmingCommand() {
  const testJob: VideoEditJob = {
    inputs: [
      { path: 'video1.mp4', startTime: 10, duration: 20 }, // Start at 10s, take 20s
      { path: 'video2.mp4', startTime: 5, duration: 15 }, // Start at 5s, take 15s
      { path: 'audio1.mp3', startTime: 2, duration: 30 }, // Audio: independent timing! 2s start, 30s duration
    ],
    output: 'trimmed_output.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  console.log(
    '✂️ Expected behavior: Video plays for full 35s, audio plays for 30s then silence for last 5s',
  );
  console.log(
    '📏 Note: Track durations should now be accurate (no more 50s estimates!)',
  );
  console.log(
    '🎵 Audio trimming: Independent of video - can trim start/end separately!',
  );
  const command = buildFfmpegCommand(testJob);
  console.log('✂️ Test Track Trimming Command:', command.join(' '));
  return command;
}

// Test function for single track trimming
export function testSingleTrackTrimming() {
  const testJob: VideoEditJob = {
    inputs: [
      { path: 'video1.mp4', startTime: 5, duration: 10 }, // Start at 5s, take 10s
    ],
    output: 'single_trimmed.mp4',
    operations: {
      concat: false,
      normalizeFrameRate: false,
    },
  };

  const command = buildFfmpegCommand(testJob);
  console.log('🎬 Single Track Trimming:', command.join(' '));
  return command;
}

// Test function for independent audio trimming
export function testIndependentAudioTrimming() {
  const testJob: VideoEditJob = {
    inputs: [
      { path: 'video1.mp4', startTime: 10, duration: 30 }, // Video: 10s-40s (30s duration)
      { path: 'audio1.mp3', startTime: 5, duration: 25 }, // Audio: 5s-30s (25s duration) - independent timing!
    ],
    output: 'independent_audio_trim.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: false,
    },
  };

  console.log(
    '🎵 Independent Audio Trimming: Audio trimmed separately from video',
  );
  console.log('📹 Video: 10s start, 30s duration');
  console.log('🎵 Audio: 5s start, 25s duration (completely independent!)');
  const command = buildFfmpegCommand(testJob);
  console.log('🎛️ Command:', command.join(' '));
  return command;
}
