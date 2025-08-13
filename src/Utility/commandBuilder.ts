import { VideoEditJob } from '../Schema/ffmpegConfig';

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
  
    const vf = fpsFilters.length ? fpsFilters.join(";") + ";" : "";
    const vFlag = hasVideo ? 1 : 0;
    const aFlag = hasAudio ? 1 : 0;
  
    return `${vf}${concatInputs.join("")}concat=n=${inputs.length}:v=${vFlag}:a=${aFlag}[outv][outa]`;
  }

  
  function escapePath(filePath: string) {
    // For Node.js spawn(), we don't need shell escaping or quotes
    // Just return the path as-is since spawn() passes arguments directly
    return filePath;
  }
  
  function handleInputs(job: VideoEditJob, cmd: CommandParts) {
    const inputCount = job.inputs.length;
  
    if (job.operations.concat && inputCount > 1) {
      cmd.args.push(...job.inputs.flatMap(input => ["-i", escapePath(input)]));
  
      const fpsFilters: string[] = [];
      const concatVideoInputs: string[] = [];
      const concatAudioInputs: string[] = [];
      let videoCount = 0;
      let audioCount = 0;
      
      // Separate video and audio-only inputs
      const videoInputs: Array<{index: number, path: string}> = [];
      const audioInputs: Array<{index: number, path: string}> = [];
  
      job.inputs.forEach((input, index) => {
        const isVideo = /\.(mp4|mov|mkv|avi|webm)$/i.test(input);
        const isAudio = /\.(mp3|wav|aac|flac)$/i.test(input);
  
        if (isVideo) {
          videoInputs.push({index, path: input});
        } else if (isAudio) {
          audioInputs.push({index, path: input});
        }
      });
      
      // Handle video inputs for concatenation
      videoInputs.forEach(({index}) => {
        videoCount++;
        if (job.operations.normalizeFrameRate) {
          const targetFps = job.operations.targetFrameRate || 30;
          fpsFilters.push(`[${index}:v]fps=${targetFps}[v${index}]`);
          concatVideoInputs.push(`[v${index}]`);
        } else {
          concatVideoInputs.push(`[${index}:v]`);
        }
      });
      
      // For audio: if we have separate audio files, use video-only concat + audio replacement
      // Otherwise, use audio from video files for concatenation
      if (audioInputs.length > 0) {
        // Video-only concatenation when we have replacement audio
        const vf = fpsFilters.length ? fpsFilters.join(";") + ";" : "";
        const videoOnlyFilter = `${vf}${concatVideoInputs.join("")}concat=n=${videoCount}:v=1:a=0[outv]`;
        cmd.filters.push(videoOnlyFilter);
        
        // Use the first audio file as replacement
        const audioIndex = audioInputs[0].index;
        cmd.args.push("-filter_complex", cmd.filters.join(","));
        cmd.args.push("-map", "[outv]", "-map", `${audioIndex}:a`, "-shortest");
      } else {
        // No separate audio files, concat audio from video files
        videoInputs.forEach(({index}) => {
          audioCount++;
          concatAudioInputs.push(`[${index}:a]`);
        });
        
        const vf = fpsFilters.length ? fpsFilters.join(";") + ";" : "";
        const filterString = `${vf}${concatVideoInputs.join("")}${concatAudioInputs.join("")}concat=n=${videoCount}:v=${videoCount > 0 ? 1 : 0}:a=${audioCount > 0 ? 1 : 0}[outv][outa]`;
        
        cmd.filters.push(filterString);
        cmd.args.push("-filter_complex", cmd.filters.join(","));
        cmd.args.push("-map", "[outv]", "-map", "[outa]");
      }
    } else {
      job.inputs.forEach(input => cmd.args.push("-i", escapePath(input)));
    }
  }
  

  
  function handleTrim(job: VideoEditJob, cmd: CommandParts) {
    const trim = job.operations.trim;
    if (!trim) return;
  
    const { start, duration, end } = trim;
    if (start) cmd.args.unshift("-ss", start);
    if (duration) {
      cmd.args.push("-t", duration);
    } else if (end && start) {
      const dur = timeToSeconds(end) - timeToSeconds(start);
      cmd.args.push("-t", String(dur));
    }
  }
  
  function handleCrop(job: VideoEditJob, cmd: CommandParts) {
    const crop = job.operations.crop;
    if (crop) cmd.filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  }
  
  function handleSubtitles(job: VideoEditJob, cmd: CommandParts) {
    if (job.operations.subtitles) {
      cmd.filters.push(`subtitles=${job.operations.subtitles}`);
    }
  }
  
  function handleAspect(job: VideoEditJob, cmd: CommandParts) {
    if (job.operations.aspect) cmd.args.push("-aspect", job.operations.aspect);
  }
  
  function handleReplaceAudio(job: VideoEditJob, cmd: CommandParts) {
    if (!job.operations.replaceAudio) return;
    cmd.args.push("-i", job.operations.replaceAudio);
    cmd.args.push("-map", "0:v", "-map", `${job.inputs.length}:a`, "-shortest");
  }
  
  // -------------------------
  // Main builder
  // -------------------------
  export function buildFfmpegCommand(job: VideoEditJob, location?: string): string[] {
    const cmd: CommandParts = { args: [], filters: [] };
  
    // Run all step handlers
    for (const step of steps) step(job, cmd);
  
    // Apply -vf filters if we’re not in concat mode
    if (cmd.filters.length > 0 && !(job.operations.concat && job.inputs.length > 1)) {
      cmd.args.push("-vf", cmd.filters.join(","));
    }
  
    const outputFilePath = location ? (location.endsWith('/') ? location + job.output : location + '/' + job.output) : job.output;

    // Output file
    cmd.args.push(outputFilePath);
    console.log("🔧 FFmpeg Command Args:", cmd.args);
    console.log("🎬 Full FFmpeg Command:", ['ffmpeg', ...cmd.args].join(' '));
    return cmd.args;
  }
  
  // -------------------------
  // Helpers
  // -------------------------
  function timeToSeconds(time: string): number {
    const parts = time.split(":").map(Number);
    return parts.reduce((acc, val) => acc * 60 + val);
  }

  // Test function for debugging command generation
  export function testConcatCommand() {
    const testJob: VideoEditJob = {
      inputs: ["video1.mp4", "video2.mp4"],
      output: "output.mp4",
      operations: {
        concat: true,
        normalizeFrameRate: true,
        targetFrameRate: 30
      }
    };
    
    const command = buildFfmpegCommand(testJob);
    console.log("🧪 Test Concat Command:", command.join(" "));
    return command;
  }
  
  // Test function for mixed video/audio inputs (audio replacement)
  export function testAudioReplacementCommand() {
    const testJob: VideoEditJob = {
      inputs: ["video1.mp4", "audio1.mp3", "video2.mp4"],
      output: "output.mp4",
      operations: {
        concat: true,
        normalizeFrameRate: true,
        targetFrameRate: 30
      }
    };
    
    const command = buildFfmpegCommand(testJob);
    console.log("🎵 Test Audio Replacement Command:", command.join(" "));
    return command;
  }
  