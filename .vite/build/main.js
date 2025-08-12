"use strict";
const require$$3$1 = require("electron");
const path$1 = require("path");
const require$$1$1 = require("child_process");
const require$$0 = require("tty");
const require$$1 = require("util");
const require$$3 = require("fs");
const require$$4 = require("net");
const ffmpegPath = require("ffmpeg-static");
require("ffprobe-static");
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
          var fs = require$$3;
          stream2 = new fs.SyncWriteStream(fd2, { autoClose: false });
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
var path = path$1;
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
function handleInputs(job, cmd) {
  if (job.operations.concat && job.inputs.length > 1) {
    cmd.args.push(...job.inputs.flatMap((input) => ["-i", input]));
    if (job.operations.normalizeFrameRate) {
      const targetFps = job.operations.targetFrameRate || 30;
      const fpsFilters = job.inputs.map((_, index) => `[${index}:v]fps=${targetFps}[v${index}]`).join(";");
      const concatInputs = job.inputs.map((_, index) => `[v${index}][${index}:a]`).join("");
      cmd.filters.push(
        `${fpsFilters};${concatInputs}concat=n=${job.inputs.length}:v=1:a=1[outv][outa]`
      );
    } else {
      const concatInputs = job.inputs.map((_, index) => `[${index}:v][${index}:a]`).join("");
      cmd.filters.push(
        `${concatInputs}concat=n=${job.inputs.length}:v=1:a=1[outv][outa]`
      );
    }
    cmd.args.push("-filter_complex", cmd.filters.join(","));
    cmd.args.push("-map", "[outv]", "-map", "[outa]");
  } else {
    job.inputs.forEach((input) => cmd.args.push("-i", input));
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
  if (crop) cmd.filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
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
  cmd.args.push("-map", "0:v", "-map", `${job.inputs.length}:a`, "-shortest");
}
function buildFfmpegCommand(job, location) {
  const cmd = { args: [], filters: [] };
  for (const step of steps) step(job, cmd);
  if (cmd.filters.length > 0 && !(job.operations.concat && job.inputs.length > 1)) {
    cmd.args.push("-vf", cmd.filters.join(","));
  }
  const outputFilePath = location.endsWith("/") ? location + job.output : location + "/" + job.output;
  cmd.args.push(outputFilePath);
  return cmd.args;
}
function timeToSeconds(time) {
  const parts = time.split(":").map(Number);
  return parts.reduce((acc, val) => acc * 60 + val);
}
let currentFfmpegProcess = null;
function cancelCurrentFfmpeg() {
  if (currentFfmpegProcess) {
    try {
      currentFfmpegProcess.kill("SIGTERM");
      setTimeout(() => {
        if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
          currentFfmpegProcess.kill("SIGKILL");
        }
      }, 5e3);
      console.log("🛑 FFmpeg process cancelled");
      return true;
    } catch (err) {
      console.error("❌ Failed to cancel FFmpeg process:", err);
      return false;
    }
  }
  console.warn("⚠️ No active FFmpeg process to cancel");
  return false;
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
  return new Promise((resolve, reject) => {
    var _a;
    if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
      reject(new Error("Another FFmpeg process is already running. Please cancel it first."));
      return;
    }
    const location = "public/output/";
    const baseArgs = buildFfmpegCommand(job, location);
    const args = ["-progress", "pipe:1", "-y", ...baseArgs];
    const commandString = `"${ffmpegPath}" ${args.join(" ")}`;
    console.log("Running FFmpeg with progress:", commandString);
    let logs = "";
    let progressBuffer = "";
    (_a = callbacks == null ? void 0 : callbacks.onStatus) == null ? void 0 : _a.call(callbacks, "Starting FFmpeg process...");
    const ffmpeg = require$$1$1.spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
      // stdin, stdout, stderr
    });
    currentFfmpegProcess = ffmpeg;
    ffmpeg.stdout.on("data", (data) => {
      var _a2, _b, _c, _d;
      const text = data.toString();
      logs += `[stdout] ${text}
`;
      progressBuffer += text;
      const lines = progressBuffer.split("\n");
      progressBuffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) {
          (_a2 = callbacks == null ? void 0 : callbacks.onLog) == null ? void 0 : _a2.call(callbacks, line, "stdout");
          const progress = parseFfmpegProgress(line);
          if (Object.keys(progress).length > 0) {
            (_b = callbacks == null ? void 0 : callbacks.onProgress) == null ? void 0 : _b.call(callbacks, progress);
          }
          if (line.includes("progress=")) {
            const status = (_c = line.match(/progress=(\w+)/)) == null ? void 0 : _c[1];
            if (status) {
              (_d = callbacks == null ? void 0 : callbacks.onStatus) == null ? void 0 : _d.call(callbacks, status === "end" ? "Processing complete" : `Processing: ${status}`);
            }
          }
        }
      }
    });
    ffmpeg.stderr.on("data", (data) => {
      var _a2;
      const text = data.toString();
      logs += `[stderr] ${text}
`;
      (_a2 = callbacks == null ? void 0 : callbacks.onLog) == null ? void 0 : _a2.call(callbacks, text, "stderr");
      console.error(`[ffmpeg stderr]: ${text}`);
    });
    ffmpeg.on("error", (err) => {
      var _a2;
      logs += `[error] ${err.message}
`;
      (_a2 = callbacks == null ? void 0 : callbacks.onStatus) == null ? void 0 : _a2.call(callbacks, `Error: ${err.message}`);
      currentFfmpegProcess = null;
      reject(new Error(`FFmpeg process error: ${err.message}
Logs:
${logs}`));
    });
    ffmpeg.on("close", (code) => {
      var _a2, _b, _c;
      currentFfmpegProcess = null;
      if (code === 0) {
        (_a2 = callbacks == null ? void 0 : callbacks.onStatus) == null ? void 0 : _a2.call(callbacks, "FFmpeg process completed successfully");
        resolve({ command: commandString, logs });
      } else if (code === null || code === 130 || code === 143) {
        (_b = callbacks == null ? void 0 : callbacks.onStatus) == null ? void 0 : _b.call(callbacks, "FFmpeg process was cancelled");
        reject(new Error(`FFmpeg process was cancelled
Command: ${commandString}
Logs:
${logs}`));
      } else {
        (_c = callbacks == null ? void 0 : callbacks.onStatus) == null ? void 0 : _c.call(callbacks, `FFmpeg process failed with code ${code}`);
        reject(new Error(`FFmpeg exited with code ${code}
Command: ${commandString}
Logs:
${logs}`));
      }
    });
  });
}
async function runFfmpeg(job) {
  return runFfmpegWithProgress(job);
}
if (started) {
  require$$3$1.app.quit();
}
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
    event.sender.send("ffmpeg-complete", { success: false, error: error.message });
    return { success: false, error: error.message };
  }
});
require$$3$1.ipcMain.handle("cancel-ffmpeg", async (event) => {
  try {
    const cancelled = cancelCurrentFfmpeg();
    if (cancelled) {
      return { success: true, message: "FFmpeg process cancelled successfully" };
    } else {
      return { success: false, message: "No active FFmpeg process to cancel" };
    }
  } catch (error) {
    return { success: false, message: `Failed to cancel: ${error.message}` };
  }
});
const createWindow = () => {
  const mainWindow = new require$$3$1.BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path$1.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  {
    mainWindow.loadURL("http://localhost:5173");
  }
  mainWindow.webContents.openDevTools();
};
require$$3$1.app.on("ready", createWindow);
require$$3$1.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    require$$3$1.app.quit();
  }
});
require$$3$1.app.on("activate", () => {
  if (require$$3$1.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
