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

  // Helper to check if input is a gap marker
  const isGapInput = (path: string): boolean => {
    return path === '__GAP__';
  };

  // Helper to get gap duration from trackInfo (no longer parsing from path)
  const getGapDuration = (trackInfo: TrackInfo): number => {
    return trackInfo.duration || 1;
  };

  if (job.operations.concat && inputCount > 1) {
    // Add all inputs first, handling gap generation
    job.inputs.forEach((input) => {
      const path = getInputPath(input);
      if (!isGapInput(path)) {
        // Only add real file inputs, gaps will be generated in filter complex
        cmd.args.push('-i', escapePath(path));
      }
    });

    const fpsFilters: string[] = [];
    const trimFilters: string[] = [];
    const concatVideoInputs: string[] = [];
    const concatAudioInputs: string[] = [];
    let videoCount = 0;
    let audioCount = 0;

    // Separate video and audio-only inputs, with proper indexing for gaps
    const videoInputs: Array<{
      originalIndex: number;
      fileIndex: number;
      trackInfo: TrackInfo;
      isGap: boolean;
    }> = [];
    const audioInputs: Array<{
      originalIndex: number;
      fileIndex: number;
      trackInfo: TrackInfo;
    }> = [];

    let fileInputIndex = 0; // Track actual file input index

    job.inputs.forEach((input, originalIndex) => {
      const path = getInputPath(input);
      const trackInfo = getTrackInfo(input);
      const isGap = isGapInput(path);
      const isVideo = /\.(mp4|mov|mkv|avi|webm)$/i.test(path) || isGap;
      const isAudio = /\.(mp3|wav|aac|flac)$/i.test(path);

      if (isVideo) {
        if (isGap) {
          videoInputs.push({
            originalIndex,
            fileIndex: -1,
            trackInfo,
            isGap: true,
          });
        } else {
          videoInputs.push({
            originalIndex,
            fileIndex: fileInputIndex,
            trackInfo,
            isGap: false,
          });
          fileInputIndex++;
        }
      } else if (isAudio) {
        audioInputs.push({
          originalIndex,
          fileIndex: fileInputIndex,
          trackInfo,
        });
        fileInputIndex++;
      }
    });

    // Handle video inputs for concatenation
    videoInputs.forEach(({ originalIndex, fileIndex, trackInfo, isGap }) => {
      videoCount++;
      let videoStreamRef: string;

      if (isGap) {
        // Generate black video in filter complex with precise timing
        const duration = getGapDuration(trackInfo);
        const targetFps = job.operations.targetFrameRate || 30;
        const gapRef = `[gap_v${originalIndex}]`;
        // Generate precise timing for gap
        trimFilters.push(
          `color=black:size=1920x1080:duration=${duration}:rate=${targetFps}[temp_gap_${originalIndex}];[temp_gap_${originalIndex}]setpts=PTS-STARTPTS${gapRef}`,
        );
        videoStreamRef = gapRef;
      } else {
        // Handle regular video file
        videoStreamRef = `[${fileIndex}:v]`;

        // Apply trimming if specified
        if (
          trackInfo.startTime !== undefined ||
          trackInfo.duration !== undefined
        ) {
          const trimmedRef = `[v${originalIndex}_trimmed]`;
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
            trimFilter += params.join(':') + `[temp_trim_${originalIndex}]`;
            // Add setpts to reset timestamps and ensure sync
            trimFilters.push(trimFilter);
            trimFilters.push(
              `[temp_trim_${originalIndex}]setpts=PTS-STARTPTS${trimmedRef}`,
            );
            videoStreamRef = trimmedRef;
          }
        }
      }

      // Apply FPS normalization
      if (job.operations.normalizeFrameRate) {
        const targetFps = job.operations.targetFrameRate || 30;
        const fpsRef = `[v${originalIndex}_fps]`;
        // Add fps conversion with timestamp reset
        fpsFilters.push(
          `${videoStreamRef}fps=${targetFps}:start_time=0${fpsRef}`,
        );
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
      const audioIndex = audioInputs[0].fileIndex;
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

      // Add flags to handle audio/video length mismatch gracefully and maintain sync
      cmd.args.push('-c:v', 'libx264', '-c:a', 'aac');
      cmd.args.push('-avoid_negative_ts', 'make_zero');
      cmd.args.push('-vsync', 'cfr'); // Constant frame rate to maintain sync
      cmd.args.push('-async', '1'); // Audio sync correction
    } else {
      // No separate audio files, concat audio from video files (with trimming)
      const audioTrimFilters: string[] = [];
      const silentAudioFilters: string[] = [];

      videoInputs.forEach(({ originalIndex, fileIndex, trackInfo, isGap }) => {
        audioCount++;

        if (isGap) {
          // Generate silent audio for gap inputs with precise timing
          const duration = getGapDuration(trackInfo);
          const silentAudioRef = `[silent_a${originalIndex}]`;
          silentAudioFilters.push(
            `anullsrc=channel_layout=stereo:sample_rate=48000:duration=${duration}[temp_silent_${originalIndex}];[temp_silent_${originalIndex}]asetpts=PTS-STARTPTS${silentAudioRef}`,
          );
          concatAudioInputs.push(silentAudioRef);
        } else {
          // Handle regular video files with audio
          const audioStreamRef = `[${fileIndex}:a]`;

          // Apply audio trimming if specified
          if (
            trackInfo.startTime !== undefined ||
            trackInfo.duration !== undefined
          ) {
            const audioTrimRef = `[a${originalIndex}_trimmed]`;
            let audioTrimFilter = `${audioStreamRef}atrim=`;

            const params = [];
            if (trackInfo.startTime !== undefined && trackInfo.startTime > 0) {
              params.push(`start=${trackInfo.startTime}`);
            }
            if (trackInfo.duration !== undefined) {
              params.push(`duration=${trackInfo.duration}`);
            }

            if (params.length > 0) {
              audioTrimFilter +=
                params.join(':') + `[temp_atrim_${originalIndex}]`;
              // Add asetpts to reset audio timestamps
              audioTrimFilters.push(audioTrimFilter);
              audioTrimFilters.push(
                `[temp_atrim_${originalIndex}]asetpts=PTS-STARTPTS${audioTrimRef}`,
              );
              concatAudioInputs.push(audioTrimRef);
            } else {
              // Reset timestamps for untrimmed audio too
              const resetAudioRef = `[a${originalIndex}_reset]`;
              audioTrimFilters.push(
                `${audioStreamRef}asetpts=PTS-STARTPTS${resetAudioRef}`,
              );
              concatAudioInputs.push(resetAudioRef);
            }
          } else {
            concatAudioInputs.push(audioStreamRef);
          }
        }
      });

      const allFilters = [
        ...trimFilters,
        ...fpsFilters,
        ...audioTrimFilters,
        ...silentAudioFilters,
      ];
      let filterComplex = '';

      if (allFilters.length > 0) {
        filterComplex = allFilters.join(';') + ';';
      }

      // Fix: Properly interleave video and audio inputs for concat filter
      // FFmpeg concat expects: [video0][audio0][video1][audio1]...concat=n=X:v=1:a=1[outv][outa]
      const concatInputPairs: string[] = [];
      for (let i = 0; i < videoCount; i++) {
        if (i < concatVideoInputs.length) {
          concatInputPairs.push(concatVideoInputs[i]);
          // Add corresponding audio input
          if (i < concatAudioInputs.length) {
            concatInputPairs.push(concatAudioInputs[i]);
          }
        }
      }

      const concatFilter = `${concatInputPairs.join('')}concat=n=${videoCount}:v=${videoCount > 0 ? 1 : 0}:a=${audioCount > 0 ? 1 : 0}:unsafe=1[temp_outv][temp_outa]`;
      // Add final timestamp reset for output streams
      const finalFilter = `[temp_outv]setpts=PTS-STARTPTS[outv];[temp_outa]asetpts=PTS-STARTPTS[outa]`;
      filterComplex += concatFilter + ';' + finalFilter;

      cmd.args.push('-filter_complex', filterComplex);
      cmd.args.push('-map', '[outv]', '-map', '[outa]');
    }
  } else {
    // Single input or non-concat mode
    if (job.inputs.length === 1) {
      const input = job.inputs[0];
      const trackInfo = getTrackInfo(input);
      const path = getInputPath(input);

      if (isGapInput(path)) {
        // Handle single gap input
        const duration = getGapDuration(trackInfo);
        const targetFps = job.operations.targetFrameRate || 30;

        const filterComplex = `color=black:size=1920x1080:duration=${duration}:rate=${targetFps}[outv];anullsrc=channel_layout=stereo:sample_rate=48000:duration=${duration}[outa]`;
        cmd.args.push(
          '-f',
          'lavfi',
          '-i',
          'color=black:size=1920x1080:duration=0.1:rate=30',
        ); // Dummy input to satisfy FFmpeg
        cmd.args.push('-filter_complex', filterComplex);
        cmd.args.push('-map', '[outv]', '-map', '[outa]');
      } else {
        // Handle regular file input
        cmd.args.push('-i', escapePath(path));

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

            cmd.args.push(
              '-filter_complex',
              `${trimFilter};${audioTrimFilter}`,
            );
            cmd.args.push('-map', '[outv]', '-map', '[outa]');
          }
        }
      }
    } else {
      // Multiple inputs but no concat - just add them
      job.inputs.forEach((input) => {
        const path = getInputPath(input);
        if (!isGapInput(path)) {
          // Only add real file inputs, gaps will be generated in filter complex
          cmd.args.push('-i', escapePath(path));
        }
      });
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

// Test function for the specific export error scenario
export function testExportErrorScenario() {
  const testJob: VideoEditJob = {
    inputs: [
      { path: 'uu.mp4', startTime: 0, duration: 10 },
      { path: 'eee.mp4', startTime: 0, duration: 15 },
    ],
    output: 'final_video.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  console.log('🐛 Testing Export Error Scenario Fix:');
  console.log('📹 Two video clips with FPS normalization');
  const command = buildFfmpegCommand(testJob);
  console.log('🎬 Fixed Command:', command.join(' '));

  // Validate filter complex structure
  const filterIndex = command.indexOf('-filter_complex');
  if (filterIndex !== -1 && filterIndex + 1 < command.length) {
    const filterComplex = command[filterIndex + 1];
    console.log('🎛️ Filter Complex:', filterComplex);

    // Check for proper video/audio interleaving
    if (
      filterComplex.includes('[v0_fps][a0_trimmed][v1_fps][a1_trimmed]concat')
    ) {
      console.log('✅ Video/Audio interleaving looks correct!');
    } else {
      console.log('⚠️ Check video/audio interleaving pattern');
    }
  }

  return command;
}
