"use strict";
const require$$1$1 = require("child_process");
const require$$3$1 = require("electron");
const require$$0$1 = require("path");
const require$$0 = require("tty");
const require$$1 = require("util");
const require$$3 = require("fs");
const require$$4 = require("net");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static");
const fs = require("node:fs");
const http = require("node:http");
const path$1 = require("node:path");
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var src = { exports: {} };
var browser = { exports: {} };
var debug$1 = { exports: {} };
var ms;
var hasRequiredMs;
function requireMs() {
  if (hasRequiredMs) return ms;
  hasRequiredMs = 1;
  var s = 1e3;
  var m = s * 60;
  var h = m * 60;
  var d = h * 24;
  var y = d * 365.25;
  ms = function(val, options) {
    options = options || {};
    var type = typeof val;
    if (type === "string" && val.length > 0) {
      return parse(val);
    } else if (type === "number" && isNaN(val) === false) {
      return options.long ? fmtLong(val) : fmtShort(val);
    }
    throw new Error(
      "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
    );
  };
  function parse(str) {
    str = String(str);
    if (str.length > 100) {
      return;
    }
    var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
      str
    );
    if (!match) {
      return;
    }
    var n = parseFloat(match[1]);
    var type = (match[2] || "ms").toLowerCase();
    switch (type) {
      case "years":
      case "year":
      case "yrs":
      case "yr":
      case "y":
        return n * y;
      case "days":
      case "day":
      case "d":
        return n * d;
      case "hours":
      case "hour":
      case "hrs":
      case "hr":
      case "h":
        return n * h;
      case "minutes":
      case "minute":
      case "mins":
      case "min":
      case "m":
        return n * m;
      case "seconds":
      case "second":
      case "secs":
      case "sec":
      case "s":
        return n * s;
      case "milliseconds":
      case "millisecond":
      case "msecs":
      case "msec":
      case "ms":
        return n;
      default:
        return void 0;
    }
  }
  function fmtShort(ms2) {
    if (ms2 >= d) {
      return Math.round(ms2 / d) + "d";
    }
    if (ms2 >= h) {
      return Math.round(ms2 / h) + "h";
    }
    if (ms2 >= m) {
      return Math.round(ms2 / m) + "m";
    }
    if (ms2 >= s) {
      return Math.round(ms2 / s) + "s";
    }
    return ms2 + "ms";
  }
  function fmtLong(ms2) {
    return plural(ms2, d, "day") || plural(ms2, h, "hour") || plural(ms2, m, "minute") || plural(ms2, s, "second") || ms2 + " ms";
  }
  function plural(ms2, n, name) {
    if (ms2 < n) {
      return;
    }
    if (ms2 < n * 1.5) {
      return Math.floor(ms2 / n) + " " + name;
    }
    return Math.ceil(ms2 / n) + " " + name + "s";
  }
  return ms;
}
var hasRequiredDebug;
function requireDebug() {
  if (hasRequiredDebug) return debug$1.exports;
  hasRequiredDebug = 1;
  (function(module, exports) {
    exports = module.exports = createDebug.debug = createDebug["default"] = createDebug;
    exports.coerce = coerce;
    exports.disable = disable;
    exports.enable = enable;
    exports.enabled = enabled;
    exports.humanize = requireMs();
    exports.names = [];
    exports.skips = [];
    exports.formatters = {};
    var prevTime;
    function selectColor(namespace) {
      var hash = 0, i;
      for (i in namespace) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
      }
      return exports.colors[Math.abs(hash) % exports.colors.length];
    }
    function createDebug(namespace) {
      function debug2() {
        if (!debug2.enabled) return;
        var self = debug2;
        var curr = +/* @__PURE__ */ new Date();
        var ms2 = curr - (prevTime || curr);
        self.diff = ms2;
        self.prev = prevTime;
        self.curr = curr;
        prevTime = curr;
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i];
        }
        args[0] = exports.coerce(args[0]);
        if ("string" !== typeof args[0]) {
          args.unshift("%O");
        }
        var index = 0;
        args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
          if (match === "%%") return match;
          index++;
          var formatter = exports.formatters[format];
          if ("function" === typeof formatter) {
            var val = args[index];
            match = formatter.call(self, val);
            args.splice(index, 1);
            index--;
          }
          return match;
        });
        exports.formatArgs.call(self, args);
        var logFn = debug2.log || exports.log || console.log.bind(console);
        logFn.apply(self, args);
      }
      debug2.namespace = namespace;
      debug2.enabled = exports.enabled(namespace);
      debug2.useColors = exports.useColors();
      debug2.color = selectColor(namespace);
      if ("function" === typeof exports.init) {
        exports.init(debug2);
      }
      return debug2;
    }
    function enable(namespaces) {
      exports.save(namespaces);
      exports.names = [];
      exports.skips = [];
      var split = (typeof namespaces === "string" ? namespaces : "").split(/[\s,]+/);
      var len = split.length;
      for (var i = 0; i < len; i++) {
        if (!split[i]) continue;
        namespaces = split[i].replace(/\*/g, ".*?");
        if (namespaces[0] === "-") {
          exports.skips.push(new RegExp("^" + namespaces.substr(1) + "$"));
        } else {
          exports.names.push(new RegExp("^" + namespaces + "$"));
        }
      }
    }
    function disable() {
      exports.enable("");
    }
    function enabled(name) {
      var i, len;
      for (i = 0, len = exports.skips.length; i < len; i++) {
        if (exports.skips[i].test(name)) {
          return false;
        }
      }
      for (i = 0, len = exports.names.length; i < len; i++) {
        if (exports.names[i].test(name)) {
          return true;
        }
      }
      return false;
    }
    function coerce(val) {
      if (val instanceof Error) return val.stack || val.message;
      return val;
    }
  })(debug$1, debug$1.exports);
  return debug$1.exports;
}
var hasRequiredBrowser;
function requireBrowser() {
  if (hasRequiredBrowser) return browser.exports;
  hasRequiredBrowser = 1;
  (function(module, exports) {
    exports = module.exports = requireDebug();
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = "undefined" != typeof chrome && "undefined" != typeof chrome.storage ? chrome.storage.local : localstorage();
    exports.colors = [
      "lightseagreen",
      "forestgreen",
      "goldenrod",
      "dodgerblue",
      "darkorchid",
      "crimson"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && window.process.type === "renderer") {
        return true;
      }
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31 || // double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    exports.formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (err) {
        return "[UnexpectedJSONParseError]: " + err.message;
      }
    };
    function formatArgs(args) {
      var useColors2 = this.useColors;
      args[0] = (useColors2 ? "%c" : "") + this.namespace + (useColors2 ? " %c" : " ") + args[0] + (useColors2 ? "%c " : " ") + "+" + exports.humanize(this.diff);
      if (!useColors2) return;
      var c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      var index = 0;
      var lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, function(match) {
        if ("%%" === match) return;
        index++;
        if ("%c" === match) {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    function log() {
      return "object" === typeof console && console.log && Function.prototype.apply.call(console.log, console, arguments);
    }
    function save(namespaces) {
      try {
        if (null == namespaces) {
          exports.storage.removeItem("debug");
        } else {
          exports.storage.debug = namespaces;
        }
      } catch (e) {
      }
    }
    function load() {
      var r;
      try {
        r = exports.storage.debug;
      } catch (e) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    exports.enable(load());
    function localstorage() {
      try {
        return window.localStorage;
      } catch (e) {
      }
    }
  })(browser, browser.exports);
  return browser.exports;
}
var node = { exports: {} };
var hasRequiredNode;
function requireNode() {
  if (hasRequiredNode) return node.exports;
  hasRequiredNode = 1;
  (function(module, exports) {
    var tty = require$$0;
    var util = require$$1;
    exports = module.exports = requireDebug();
    exports.init = init;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.colors = [6, 2, 3, 4, 5, 1];
    exports.inspectOpts = Object.keys(process.env).filter(function(key) {
      return /^debug_/i.test(key);
    }).reduce(function(obj, key) {
      var prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, function(_, k) {
        return k.toUpperCase();
      });
      var val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) val = true;
      else if (/^(no|off|false|disabled)$/i.test(val)) val = false;
      else if (val === "null") val = null;
      else val = Number(val);
      obj[prop] = val;
      return obj;
    }, {});
    var fd = parseInt(process.env.DEBUG_FD, 10) || 2;
    if (1 !== fd && 2 !== fd) {
      util.deprecate(function() {
      }, "except for stderr(2) and stdout(1), any other usage of DEBUG_FD is deprecated. Override debug.log if you want to use a different log function (https://git.io/debug_fd)")();
    }
    var stream = 1 === fd ? process.stdout : 2 === fd ? process.stderr : createWritableStdioStream(fd);
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(fd);
    }
    exports.formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map(function(str) {
        return str.trim();
      }).join(" ");
    };
    exports.formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
    function formatArgs(args) {
      var name = this.namespace;
      var useColors2 = this.useColors;
      if (useColors2) {
        var c = this.color;
        var prefix = "  \x1B[3" + c + ";1m" + name + " \x1B[0m";
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push("\x1B[3" + c + "m+" + exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = (/* @__PURE__ */ new Date()).toUTCString() + " " + name + " " + args[0];
      }
    }
    function log() {
      return stream.write(util.format.apply(util, arguments) + "\n");
    }
    function save(namespaces) {
      if (null == namespaces) {
        delete process.env.DEBUG;
      } else {
        process.env.DEBUG = namespaces;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function createWritableStdioStream(fd2) {
      var stream2;
      var tty_wrap = process.binding("tty_wrap");
      switch (tty_wrap.guessHandleType(fd2)) {
        case "TTY":
          stream2 = new tty.WriteStream(fd2);
          stream2._type = "tty";
          if (stream2._handle && stream2._handle.unref) {
            stream2._handle.unref();
          }
          break;
        case "FILE":
          var fs2 = require$$3;
          stream2 = new fs2.SyncWriteStream(fd2, { autoClose: false });
          stream2._type = "fs";
          break;
        case "PIPE":
        case "TCP":
          var net = require$$4;
          stream2 = new net.Socket({
            fd: fd2,
            readable: false,
            writable: true
          });
          stream2.readable = false;
          stream2.read = null;
          stream2._type = "pipe";
          if (stream2._handle && stream2._handle.unref) {
            stream2._handle.unref();
          }
          break;
        default:
          throw new Error("Implement me. Unknown stream file type!");
      }
      stream2.fd = fd2;
      stream2._isStdio = true;
      return stream2;
    }
    function init(debug2) {
      debug2.inspectOpts = {};
      var keys = Object.keys(exports.inspectOpts);
      for (var i = 0; i < keys.length; i++) {
        debug2.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    exports.enable(load());
  })(node, node.exports);
  return node.exports;
}
if (typeof process !== "undefined" && process.type === "renderer") {
  src.exports = requireBrowser();
} else {
  src.exports = requireNode();
}
var srcExports = src.exports;
var path = require$$0$1;
var spawn = require$$1$1.spawn;
var debug = srcExports("electron-squirrel-startup");
var app = require$$3$1.app;
var run = function(args, done) {
  var updateExe = path.resolve(path.dirname(process.execPath), "..", "Update.exe");
  debug("Spawning `%s` with args `%s`", updateExe, args);
  spawn(updateExe, args, {
    detached: true
  }).on("close", done);
};
var check = function() {
  if (process.platform === "win32") {
    var cmd = process.argv[1];
    debug("processing squirrel command `%s`", cmd);
    var target = path.basename(process.execPath);
    if (cmd === "--squirrel-install" || cmd === "--squirrel-updated") {
      run(["--createShortcut=" + target], app.quit);
      return true;
    }
    if (cmd === "--squirrel-uninstall") {
      run(["--removeShortcut=" + target], app.quit);
      return true;
    }
    if (cmd === "--squirrel-obsolete") {
      app.quit();
      return true;
    }
  }
  return false;
};
var electronSquirrelStartup = check();
const started = /* @__PURE__ */ getDefaultExportFromCjs(electronSquirrelStartup);
const steps = [
  handleInputs,
  handleTrim,
  handleCrop,
  handleSubtitles,
  handleAspect,
  handleReplaceAudio
];
function escapePath(filePath) {
  return filePath;
}
function handleInputs(job, cmd) {
  const inputCount = job.inputs.length;
  const getInputPath = (input) => {
    return typeof input === "string" ? input : input.path;
  };
  const getTrackInfo = (input) => {
    return typeof input === "string" ? { path: input } : input;
  };
  if (job.operations.concat && inputCount > 1) {
    job.inputs.forEach((input) => {
      cmd.args.push("-i", escapePath(getInputPath(input)));
    });
    const fpsFilters = [];
    const trimFilters = [];
    const concatVideoInputs = [];
    const concatAudioInputs = [];
    let videoCount = 0;
    let audioCount = 0;
    const videoInputs = [];
    const audioInputs = [];
    job.inputs.forEach((input, index) => {
      const path2 = getInputPath(input);
      const trackInfo = getTrackInfo(input);
      const isVideo = /\.(mp4|mov|mkv|avi|webm)$/i.test(path2);
      const isAudio = /\.(mp3|wav|aac|flac)$/i.test(path2);
      if (isVideo) {
        videoInputs.push({ index, trackInfo });
      } else if (isAudio) {
        audioInputs.push({ index, trackInfo });
      }
    });
    videoInputs.forEach(({ index, trackInfo }) => {
      videoCount++;
      let videoStreamRef = `[${index}:v]`;
      if (trackInfo.startTime !== void 0 || trackInfo.duration !== void 0) {
        const trimmedRef = `[v${index}_trimmed]`;
        let trimFilter = `${videoStreamRef}trim=`;
        const params = [];
        if (trackInfo.startTime !== void 0 && trackInfo.startTime > 0) {
          params.push(`start=${trackInfo.startTime}`);
        }
        if (trackInfo.duration !== void 0) {
          params.push(`duration=${trackInfo.duration}`);
        }
        if (params.length > 0) {
          trimFilter += params.join(":") + trimmedRef;
          trimFilters.push(trimFilter);
          videoStreamRef = trimmedRef;
        }
      }
      if (job.operations.normalizeFrameRate) {
        const targetFps = job.operations.targetFrameRate || 30;
        const fpsRef = `[v${index}_fps]`;
        fpsFilters.push(`${videoStreamRef}fps=${targetFps}${fpsRef}`);
        concatVideoInputs.push(fpsRef);
      } else {
        concatVideoInputs.push(videoStreamRef);
      }
    });
    if (audioInputs.length > 0) {
      const allFilters = [...trimFilters, ...fpsFilters];
      let filterComplex = "";
      if (allFilters.length > 0) {
        filterComplex = allFilters.join(";") + ";";
      }
      const videoOnlyFilter = `${concatVideoInputs.join("")}concat=n=${videoCount}:v=1:a=0[outv]`;
      filterComplex += videoOnlyFilter;
      const audioTrackInfo = audioInputs[0].trackInfo;
      const audioIndex = audioInputs[0].index;
      let audioRef = `${audioIndex}:a`;
      if (audioTrackInfo.startTime !== void 0 || audioTrackInfo.duration !== void 0) {
        const audioTrimRef = `[a${audioIndex}_trimmed]`;
        let audioTrimFilter = `[${audioIndex}:a]atrim=`;
        const params = [];
        if (audioTrackInfo.startTime !== void 0 && audioTrackInfo.startTime > 0) {
          params.push(`start=${audioTrackInfo.startTime}`);
        }
        if (audioTrackInfo.duration !== void 0) {
          params.push(`duration=${audioTrackInfo.duration}`);
        }
        if (params.length > 0) {
          audioTrimFilter += params.join(":") + audioTrimRef;
          filterComplex = filterComplex + ";" + audioTrimFilter;
          audioRef = audioTrimRef.slice(1, -1);
        }
      }
      const audioMapRef = audioRef.includes("_trimmed") ? `[${audioRef}]` : `${audioIndex}:a`;
      cmd.args.push("-filter_complex", filterComplex);
      cmd.args.push("-map", "[outv]", "-map", audioMapRef);
      cmd.args.push("-c:v", "libx264", "-c:a", "aac");
      cmd.args.push("-avoid_negative_ts", "make_zero");
    } else {
      const audioTrimFilters = [];
      videoInputs.forEach(({ index, trackInfo }) => {
        audioCount++;
        const audioStreamRef = `[${index}:a]`;
        if (trackInfo.startTime !== void 0 || trackInfo.duration !== void 0) {
          const audioTrimRef = `[a${index}_trimmed]`;
          let audioTrimFilter = `${audioStreamRef}atrim=`;
          const params = [];
          if (trackInfo.startTime !== void 0 && trackInfo.startTime > 0) {
            params.push(`start=${trackInfo.startTime}`);
          }
          if (trackInfo.duration !== void 0) {
            params.push(`duration=${trackInfo.duration}`);
          }
          if (params.length > 0) {
            audioTrimFilter += params.join(":") + audioTrimRef;
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
      let filterComplex = "";
      if (allFilters.length > 0) {
        filterComplex = allFilters.join(";") + ";";
      }
      const concatFilter = `${concatVideoInputs.join("")}${concatAudioInputs.join("")}concat=n=${videoCount}:v=${videoCount > 0 ? 1 : 0}:a=${audioCount > 0 ? 1 : 0}[outv][outa]`;
      filterComplex += concatFilter;
      cmd.args.push("-filter_complex", filterComplex);
      cmd.args.push("-map", "[outv]", "-map", "[outa]");
    }
  } else {
    if (job.inputs.length === 1) {
      const input = job.inputs[0];
      const trackInfo = getTrackInfo(input);
      cmd.args.push("-i", escapePath(getInputPath(input)));
      if (trackInfo.startTime !== void 0 || trackInfo.duration !== void 0) {
        let trimFilter = "[0:v]trim=";
        let audioTrimFilter = "[0:a]atrim=";
        const params = [];
        if (trackInfo.startTime !== void 0 && trackInfo.startTime > 0) {
          params.push(`start=${trackInfo.startTime}`);
        }
        if (trackInfo.duration !== void 0) {
          params.push(`duration=${trackInfo.duration}`);
        }
        if (params.length > 0) {
          const paramString = params.join(":");
          trimFilter += paramString + "[outv]";
          audioTrimFilter += paramString + "[outa]";
          cmd.args.push("-filter_complex", `${trimFilter};${audioTrimFilter}`);
          cmd.args.push("-map", "[outv]", "-map", "[outa]");
        }
      }
    } else {
      job.inputs.forEach(
        (input) => cmd.args.push("-i", escapePath(getInputPath(input)))
      );
    }
  }
}
function handleTrim(job, cmd) {
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
function handleCrop(job, cmd) {
  const crop = job.operations.crop;
  if (crop)
    cmd.filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
}
function handleSubtitles(job, cmd) {
  if (job.operations.subtitles) {
    cmd.filters.push(`subtitles=${job.operations.subtitles}`);
  }
}
function handleAspect(job, cmd) {
  if (job.operations.aspect) cmd.args.push("-aspect", job.operations.aspect);
}
function handleReplaceAudio(job, cmd) {
  if (!job.operations.replaceAudio) return;
  cmd.args.push("-i", job.operations.replaceAudio);
  cmd.args.push("-map", "0:v", "-map", `${job.inputs.length}:a`);
}
function buildFfmpegCommand(job, location) {
  const cmd = { args: [], filters: [] };
  for (const step of steps) step(job, cmd);
  if (cmd.filters.length > 0 && !(job.operations.concat && job.inputs.length > 1)) {
    cmd.args.push("-vf", cmd.filters.join(","));
  }
  const outputFilePath = location.endsWith("/") ? location + job.output : location + "/" + job.output;
  cmd.args.push(outputFilePath);
  console.log("🔧 FFmpeg Command Args:", cmd.args);
  console.log("🎬 Full FFmpeg Command:", ["ffmpeg", ...cmd.args].join(" "));
  return cmd.args;
}
function timeToSeconds(time) {
  const parts = time.split(":").map(Number);
  return parts.reduce((acc, val) => acc * 60 + val);
}
const isElectron = () => {
  return typeof window !== "undefined" && window.electronAPI;
};
function cancelCurrentFfmpeg() {
  if (!isElectron()) {
    console.warn("FFmpeg operations require Electron main process");
    return Promise.resolve(false);
  }
  return window.electronAPI.invoke("ffmpeg:cancel");
}
function parseFfmpegProgress(progressLine) {
  const progress = {};
  const patterns = {
    frame: /frame=\s*(\d+)/,
    fps: /fps=\s*([\d.]+)/,
    bitrate: /bitrate=\s*([\d.]+\w+)/,
    outTime: /time=(\d{2}:\d{2}:\d{2}\.\d{2})/,
    totalSize: /size=\s*(\d+\w+)/,
    speed: /speed=\s*([\d.]+x)/,
    progress: /progress=(\w+)/
  };
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = progressLine.match(pattern);
    if (match) {
      progress[key] = key === "frame" || key === "fps" ? Number(match[1]) : match[1];
    }
  }
  return progress;
}
async function runFfmpegWithProgress(job, callbacks) {
  if (!isElectron()) {
    throw new Error("FFmpeg operations require Electron main process");
  }
  return new Promise((resolve, reject) => {
    const handleProgress = (event, data) => {
      var _a, _b, _c, _d, _e;
      if (data.type === "stdout") {
        (_a = callbacks == null ? void 0 : callbacks.onLog) == null ? void 0 : _a.call(callbacks, data.data, "stdout");
        const progress = parseFfmpegProgress(data.data);
        if (Object.keys(progress).length > 0) {
          (_b = callbacks == null ? void 0 : callbacks.onProgress) == null ? void 0 : _b.call(callbacks, progress);
        }
        if (data.data.includes("progress=")) {
          const status = (_c = data.data.match(/progress=(\w+)/)) == null ? void 0 : _c[1];
          if (status) {
            (_d = callbacks == null ? void 0 : callbacks.onStatus) == null ? void 0 : _d.call(callbacks, status === "end" ? "Processing complete" : `Processing: ${status}`);
          }
        }
      } else if (data.type === "stderr") {
        (_e = callbacks == null ? void 0 : callbacks.onLog) == null ? void 0 : _e.call(callbacks, data.data, "stderr");
      }
    };
    window.electronAPI.on("ffmpeg:progress", handleProgress);
    window.electronAPI.invoke("ffmpegRun", job).then((result) => {
      window.electronAPI.removeListener("ffmpeg:progress", handleProgress);
      resolve({ command: "ffmpeg-via-ipc", logs: result.logs });
    }).catch((error) => {
      window.electronAPI.removeListener("ffmpeg:progress", handleProgress);
      reject(error);
    });
  });
}
async function runFfmpeg(job) {
  const result = await window.electronAPI.ffmpegRun(job);
  if (result.success) {
    return result.result;
  } else {
    throw new Error(result.error || "FFmpeg execution failed");
  }
}
if (started) {
  require$$3$1.app.quit();
}
let mediaServer = null;
const MEDIA_SERVER_PORT = 3001;
function createMediaServer() {
  mediaServer = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(404);
      res.end();
      return;
    }
    const urlPath = decodeURIComponent(req.url.slice(1));
    try {
      if (!fs.existsSync(urlPath)) {
        res.writeHead(404);
        res.end("File not found");
        return;
      }
      const stats = fs.statSync(urlPath);
      const ext = path$1.extname(urlPath).toLowerCase();
      let mimeType = "application/octet-stream";
      if ([".mp4", ".webm", ".ogg"].includes(ext)) {
        mimeType = `video/${ext.slice(1)}`;
      } else if ([".mp3", ".wav", ".aac"].includes(ext)) {
        mimeType = `audio/${ext.slice(1)}`;
      } else if ([".jpg", ".jpeg"].includes(ext)) {
        mimeType = "image/jpeg";
      } else if (ext === ".png") {
        mimeType = "image/png";
      } else if (ext === ".gif") {
        mimeType = "image/gif";
      }
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = end - start + 1;
        const stream = fs.createReadStream(urlPath, { start, end });
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${stats.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": mimeType,
          "Access-Control-Allow-Origin": "*"
        });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": stats.size,
          "Content-Type": mimeType,
          "Access-Control-Allow-Origin": "*"
        });
        fs.createReadStream(urlPath).pipe(res);
      }
    } catch (error) {
      console.error("Error serving file:", error);
      res.writeHead(500);
      res.end("Internal server error");
    }
  });
  mediaServer.listen(MEDIA_SERVER_PORT, "localhost", () => {
    console.log(
      `📁 Media server started on http://localhost:${MEDIA_SERVER_PORT}`
    );
  });
  mediaServer.on("error", (error) => {
    console.error("Media server error:", error);
  });
}
require$$3$1.app.whenReady().then(() => {
  createMediaServer();
});
require$$3$1.ipcMain.handle(
  "open-file-dialog",
  async (event, options) => {
    try {
      const result = await require$$3$1.dialog.showOpenDialog({
        title: (options == null ? void 0 : options.title) || "Select Media Files",
        properties: (options == null ? void 0 : options.properties) || ["openFile", "multiSelections"],
        filters: (options == null ? void 0 : options.filters) || [
          {
            name: "Media Files",
            extensions: [
              "mp4",
              "avi",
              "mov",
              "mkv",
              "mp3",
              "wav",
              "aac",
              "jpg",
              "jpeg",
              "png",
              "gif"
            ]
          },
          {
            name: "Video Files",
            extensions: ["mp4", "avi", "mov", "mkv", "webm", "wmv", "flv"]
          },
          {
            name: "Audio Files",
            extensions: ["mp3", "wav", "aac", "flac", "ogg", "m4a"]
          },
          {
            name: "Image Files",
            extensions: ["jpg", "jpeg", "png", "gif", "bmp", "tiff"]
          },
          { name: "All Files", extensions: ["*"] }
        ]
      });
      if (!result.canceled && result.filePaths.length > 0) {
        const fileInfos = result.filePaths.map((filePath) => {
          const stats = fs.statSync(filePath);
          const fileName = path$1.basename(filePath);
          const ext = path$1.extname(fileName).toLowerCase().slice(1);
          let type = "video";
          if (["mp3", "wav", "aac", "flac", "ogg", "m4a"].includes(ext)) {
            type = "audio";
          } else if (["jpg", "jpeg", "png", "gif", "bmp", "tiff"].includes(ext)) {
            type = "image";
          }
          return {
            path: filePath,
            name: fileName,
            size: stats.size,
            type,
            extension: ext
          };
        });
        return { success: true, files: fileInfos };
      } else {
        return { success: false, canceled: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
);
require$$3$1.ipcMain.handle("run-ffmpeg", async (event, job) => {
  try {
    const result = await runFfmpeg(job);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
require$$3$1.ipcMain.handle("run-ffmpeg-with-progress", async (event, job) => {
  try {
    const result = await runFfmpegWithProgress(job, {
      onProgress: (progress) => {
        event.sender.send("ffmpeg-progress", progress);
      },
      onStatus: (status) => {
        event.sender.send("ffmpeg-status", status);
      },
      onLog: (log, type) => {
        event.sender.send("ffmpeg-log", { log, type });
      }
    });
    event.sender.send("ffmpeg-complete", { success: true, result });
    return { success: true, result };
  } catch (error) {
    event.sender.send("ffmpeg-complete", {
      success: false,
      error: error.message
    });
    return { success: false, error: error.message };
  }
});
require$$3$1.ipcMain.handle("cancel-ffmpeg", async (event) => {
  try {
    const cancelled = cancelCurrentFfmpeg();
    if (cancelled) {
      return {
        success: true,
        message: "FFmpeg process cancelled successfully"
      };
    } else {
      return { success: false, message: "No active FFmpeg process to cancel" };
    }
  } catch (error) {
    return { success: false, message: `Failed to cancel: ${error.message}` };
  }
});
require$$3$1.ipcMain.handle("create-preview-url", async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const ext = path$1.extname(filePath).toLowerCase().slice(1);
    if (["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext)) {
      const fileBuffer = fs.readFileSync(filePath);
      let mimeType = "image/jpeg";
      if (["png"].includes(ext)) {
        mimeType = "image/png";
      } else if (["gif"].includes(ext)) {
        mimeType = "image/gif";
      }
      const base64 = fileBuffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;
      return { success: true, url: dataUrl };
    }
    if (["mp4", "webm", "ogg", "avi", "mov", "mkv", "mp3", "wav", "aac"].includes(
      ext
    )) {
      const encodedPath = encodeURIComponent(filePath);
      const serverUrl = `http://localhost:${MEDIA_SERVER_PORT}/${encodedPath}`;
      console.log(`🎬 Created server URL for media: ${serverUrl}`);
      return { success: true, url: serverUrl };
    }
    return { success: false, error: "Unsupported file type" };
  } catch (error) {
    console.error("Failed to create preview URL:", error);
    return { success: false, error: error.message };
  }
});
require$$3$1.ipcMain.handle(
  "get-file-stream",
  async (event, filePath, start, end) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      const startByte = start || 0;
      const endByte = end || Math.min(startByte + 1024 * 1024, fileSize - 1);
      const buffer = Buffer.alloc(endByte - startByte + 1);
      const fd = fs.openSync(filePath, "r");
      fs.readSync(fd, buffer, 0, buffer.length, startByte);
      fs.closeSync(fd);
      return {
        success: true,
        data: buffer.toString("base64"),
        start: startByte,
        end: endByte,
        total: fileSize
      };
    } catch (error) {
      console.error("Failed to get file stream:", error);
      return { success: false, error: error.message };
    }
  }
);
require$$3$1.ipcMain.handle("ffmpeg:detect-frame-rate", async (event, videoPath) => {
  return new Promise((resolve, reject) => {
    const ffprobe = require$$1$1.spawn(ffprobePath.path, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-select_streams",
      "v:0",
      videoPath
    ]);
    let output = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });
    ffprobe.stderr.on("data", (data) => {
      console.error(`ffprobe stderr: ${data}`);
    });
    ffprobe.on("close", (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          const videoStream = result.streams[0];
          if (videoStream && videoStream.r_frame_rate) {
            const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
            const frameRate = Math.round(num / den * 100) / 100;
            resolve(frameRate);
          } else {
            resolve(30);
          }
        } catch (err) {
          console.error("Failed to parse ffprobe output:", err);
          resolve(30);
        }
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });
    ffprobe.on("error", (err) => {
      reject(new Error(`ffprobe error: ${err.message}`));
    });
  });
});
require$$3$1.ipcMain.handle("ffmpeg:get-duration", async (event, filePath) => {
  return new Promise((resolve, reject) => {
    const ffprobe = require$$1$1.spawn(ffprobePath.path, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath
    ]);
    let output = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });
    ffprobe.stderr.on("data", (data) => {
      console.error(`ffprobe stderr: ${data}`);
    });
    ffprobe.on("close", (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          if (result.format && result.format.duration) {
            const duration = parseFloat(result.format.duration);
            console.log(
              `📏 Duration from format: ${duration}s for ${filePath}`
            );
            resolve(duration);
            return;
          }
          if (result.streams && result.streams.length > 0) {
            for (const stream of result.streams) {
              if (stream.duration && parseFloat(stream.duration) > 0) {
                const duration = parseFloat(stream.duration);
                console.log(
                  `📏 Duration from stream: ${duration}s for ${filePath}`
                );
                resolve(duration);
                return;
              }
            }
          }
          const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePath);
          const fallbackDuration = isImage ? 5 : 60;
          console.warn(
            `⚠️ Could not determine duration for ${filePath}, using fallback: ${fallbackDuration}s`
          );
          resolve(fallbackDuration);
        } catch (err) {
          console.error("Failed to parse ffprobe output:", err);
          const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePath);
          resolve(isImage ? 5 : 60);
        }
      } else {
        console.error(`ffprobe failed with code ${code} for ${filePath}`);
        const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePath);
        resolve(isImage ? 5 : 60);
      }
    });
    ffprobe.on("error", (err) => {
      console.error(`ffprobe error for ${filePath}:`, err.message);
      const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePath);
      resolve(isImage ? 5 : 60);
    });
  });
});
let currentFfmpegProcess = null;
require$$3$1.ipcMain.handle("ffmpegRun", async (event, job) => {
  return new Promise((resolve, reject) => {
    if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
      reject(new Error("Another FFmpeg process is already running"));
      return;
    }
    const location = "public/output/";
    const baseArgs = buildFfmpegCommand(job, location);
    const args = ["-progress", "pipe:1", "-y", ...baseArgs];
    console.log("Running FFmpeg with args:", args);
    const ffmpeg = require$$1$1.spawn(ffmpegPath, args);
    currentFfmpegProcess = ffmpeg;
    let logs = "";
    ffmpeg.stdout.on("data", (data) => {
      const text = data.toString();
      logs += `[stdout] ${text}
`;
      event.sender.send("ffmpeg:progress", { type: "stdout", data: text });
    });
    ffmpeg.stderr.on("data", (data) => {
      const text = data.toString();
      logs += `[stderr] ${text}
`;
      event.sender.send("ffmpeg:progress", { type: "stderr", data: text });
    });
    ffmpeg.on("close", (code) => {
      currentFfmpegProcess = null;
      if (code === 0) {
        resolve({ success: true, logs });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}
Logs:
${logs}`));
      }
    });
    ffmpeg.on("error", (err) => {
      currentFfmpegProcess = null;
      reject(err);
    });
  });
});
require$$3$1.ipcMain.handle("ffmpeg:cancel", async () => {
  if (currentFfmpegProcess) {
    currentFfmpegProcess.kill("SIGTERM");
    return true;
  }
  return false;
});
const createWindow = () => {
  const mainWindow = new require$$3$1.BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    autoHideMenuBar: true,
    minWidth: 750,
    minHeight: 500,
    webPreferences: {
      contextIsolation: true,
      preload: path$1.join(__dirname, "preload.js"),
      webSecurity: true,
      nodeIntegration: true
      // devTools: false,
    }
  });
  {
    mainWindow.loadURL("http://localhost:5173");
  }
  require$$3$1.ipcMain.on("close-btn", () => {
    if (!mainWindow) return;
    require$$3$1.app.quit();
  });
  require$$3$1.ipcMain.on("minimize-btn", () => {
    if (mainWindow) mainWindow.minimize();
  });
  require$$3$1.ipcMain.on("maximize-btn", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  mainWindow.webContents.openDevTools();
};
require$$3$1.app.on("ready", createWindow);
require$$3$1.app.on("window-all-closed", () => {
  if (mediaServer) {
    mediaServer.close();
    console.log("📁 Media server stopped");
  }
  if (process.platform !== "darwin") {
    require$$3$1.app.quit();
  }
});
require$$3$1.app.on("activate", () => {
  if (require$$3$1.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
require$$3$1.app.on("before-quit", () => {
  if (mediaServer) {
    mediaServer.close();
    console.log("📁 Media server stopped");
  }
});
