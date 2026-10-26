import { parseSrt, srtToWebVtt } from "./subtitle-parser.js";

const SUBTITLE_TIMEOUT_MS = 15000;
const memoryCache = new Map();

function decodeSubtitleBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  // Check for UTF-8 BOM
  let offset = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    offset = 3;
  }
  const payload = bytes.subarray(offset);

  if (typeof TextDecoder === "function") {
    try {
      const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
      return utf8Decoder.decode(payload);
    } catch (utf8Error) {
      try {
        const win1258Decoder = new TextDecoder("windows-1258");
        return win1258Decoder.decode(payload);
      } catch (winError) {
        try {
          const fallbackDecoder = new TextDecoder("utf-8", { fatal: false });
          return fallbackDecoder.decode(payload);
        } catch (error) {
          console.warn("TextDecoder fallback failed; attempting string escape decoding:", error);
        }
      }
    }
  }

  // Fallback for environments without TextDecoder
  let result = "";
  for (let index = 0; index < payload.length; index += 1) {
    result += String.fromCharCode(payload[index]);
  }
  try {
    return decodeURIComponent(escape(result));
  } catch (error) {
    return result;
  }
}

export function createSubtitleService() {
  let inFlightController = null;

  return {
    getCached(url) {
      if (!url) {
        return null;
      }
      return memoryCache.get(url) || null;
    },
    loadSubtitle(url, options) {
      if (!url || typeof url !== "string") {
        return Promise.resolve({ cues: [], vttText: "", url: "", error: "No subtitle URL provided." });
      }

      if (memoryCache.has(url)) {
        return Promise.resolve(memoryCache.get(url));
      }

      if (inFlightController) {
        inFlightController.abort();
        inFlightController = null;
      }

      const controller = (typeof AbortController === "function") ? new AbortController() : null;
      inFlightController = controller;
      let timer = 0;

      const fetchOptions = {};
      if (controller) {
        fetchOptions.signal = controller.signal;
      }
      if (options && options.signal) {
        options.signal.addEventListener("abort", function () {
          if (controller) {
            controller.abort();
          }
        });
      }

      const scheduleTimer = typeof window !== "undefined" && typeof window.setTimeout === "function"
        ? window.setTimeout
        : setTimeout;
      const cancelTimer = typeof window !== "undefined" && typeof window.clearTimeout === "function"
        ? window.clearTimeout
        : clearTimeout;
      const fetchImpl = typeof fetch === "function"
        ? fetch
        : (typeof window !== "undefined" && typeof window.fetch === "function" ? window.fetch : null);

      const timeoutPromise = new Promise(function (_, reject) {
        timer = scheduleTimer(function () {
          if (controller) {
            controller.abort();
          }
          reject(new Error("Subtitle request timed out."));
        }, SUBTITLE_TIMEOUT_MS);
      });

      const requestPromise = fetchImpl
        ? fetchImpl(url, fetchOptions).then(function (response) {
            if (!response.ok) {
              throw new Error("Subtitle request returned HTTP " + response.status + ".");
            }
            if (typeof response.arrayBuffer === "function") {
              return response.arrayBuffer().then(decodeSubtitleBuffer);
            }
            return response.text();
          })
        : new Promise(function (resolve, reject) {
            if (typeof XMLHttpRequest !== "function") {
              reject(new Error("No fetch or XMLHttpRequest available."));
              return;
            }
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.timeout = SUBTITLE_TIMEOUT_MS;
            xhr.responseType = "arraybuffer";
            xhr.onload = function () {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(decodeSubtitleBuffer(xhr.response));
              } else {
                reject(new Error("Subtitle request returned HTTP " + xhr.status + "."));
              }
            };
            xhr.onerror = function () {
              reject(new Error("Network error while loading subtitles."));
            };
            xhr.ontimeout = function () {
              reject(new Error("Subtitle request timed out."));
            };
            xhr.send();
          });

      return Promise.race([requestPromise, timeoutPromise]).then(function (rawText) {
        cancelTimer(timer);
        if (inFlightController === controller) {
          inFlightController = null;
        }

        const cues = parseSrt(rawText);
        const vttText = srtToWebVtt(rawText);
        const result = {
          url: url,
          cues: cues,
          vttText: vttText,
          cueCount: cues.length,
          error: cues.length === 0 ? "No subtitle cues found in file." : null
        };

        if (cues.length > 0) {
          memoryCache.set(url, result);
        }
        return result;
      }).catch(function (error) {
        cancelTimer(timer);
        if (inFlightController === controller) {
          inFlightController = null;
        }
        if (error.name === "AbortError") {
          return { url: url, cues: [], vttText: "", cueCount: 0, aborted: true };
        }
        console.warn("Unable to load movie subtitle:", error.message);
        return {
          url: url,
          cues: [],
          vttText: "",
          cueCount: 0,
          error: error.message || "Failed to load subtitles."
        };
      });
    },
    cancel() {
      if (inFlightController) {
        inFlightController.abort();
        inFlightController = null;
      }
    },
    clearCache() {
      memoryCache.clear();
    }
  };
}
