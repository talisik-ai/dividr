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

  
  // Handle inputs & concat
  function handleInputs(job: VideoEditJob, cmd: CommandParts) {
    if (job.operations.concat && job.inputs.length > 1) {
      cmd.args.push(...job.inputs.flatMap(input => ["-i", input]));
      
      // Enhanced concatenation with frame rate normalization
      if (job.operations.normalizeFrameRate) {
        const targetFps = job.operations.targetFrameRate || 30;
        
        // Generate fps filters for each video input
    
        const fpsFilters = job.inputs
          .map((_, index) => `[${index}:v]fps=${targetFps}[v${index}]`)
          .join(";");
    
        // Generate concat inputs (normalized video + original audio)
        const concatInputs = job.inputs
          .map((_, index) => `[v${index}][${index}:a]`)
          .join("");
        
        // Combine fps normalization and concatenation
        cmd.filters.push(
          `${fpsFilters};${concatInputs}concat=n=${job.inputs.length}:v=1:a=1[outv][outa]`

        );
      } else {
        // Original concatenation logic
        const concatInputs = job.inputs
          .map((_, index) => `[${index}:v][${index}:a]`)
          .join("");
        cmd.filters.push(
          `${concatInputs}concat=n=${job.inputs.length}:v=1:a=1[outv][outa]`
        );
      }
      
      cmd.args.push("-filter_complex", cmd.filters.join(","));
      cmd.args.push("-map", "[outv]", "-map", "[outa]");
    } else {
      job.inputs.forEach(input => cmd.args.push("-i", input));
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
  