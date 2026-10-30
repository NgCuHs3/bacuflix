import { createSegmentLoader } from "./segment-loader.js";

export function createPlaybackService(video, callbacks) {
  let hls = null;
  let sourceUrl = "";
  let fallbackAttempted = false;
  let failed = false;
  let destroyed = false;
  const listeners = [];

  function listen(target, name, handler) {
    target.addEventListener(name, handler);
    listeners.push(function () {
      target.removeEventListener(name, handler);
    });
  }

  function status(message) {
    if (callbacks.onStatus) {
      callbacks.onStatus(message);
    }
  }

  function state() {
    if (callbacks.onState) {
      callbacks.onState({
        paused: video.paused,
        ended: video.ended
      });
    }
  }

  function cleanupMedia() {
    if (hls) {
      const oldHls = hls;
      hls = null;
      try {
        oldHls.stopLoad();
      } catch (_) {}
      try {
        oldHls.detachMedia();
      } catch (_) {}
      try {
        oldHls.destroy();
      } catch (_) {}
    }
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch (_) {}
  }

  function reportFailure(message, error) {
    if (failed || destroyed) {
      return;
    }
    failed = true;
    if (error) {
      console.error("Video playback failed:", error);
    }
    cleanupMedia();
    if (callbacks.onError) {
      callbacks.onError(message);
    }
  }

  function attemptPlayback() {
    if (failed || destroyed) {
      return;
    }
    const playback = video.play();
    if (playback && typeof playback.then === "function") {
      playback.catch(function (error) {
        if (failed || destroyed) {
          return;
        }
        if (error.name === "AbortError") {
          return;
        }
        if (error.name === "NotAllowedError") {
          status("Autoplay was blocked. Press Play to start.");
          if (callbacks.onAutoplayBlocked) {
            callbacks.onAutoplayBlocked();
          }
          return;
        }
        if (error.name === "NotSupportedError" && useNativeHls(error.message)) {
          return;
        }
        reportFailure("This browser could not decode the stream.", error);
      });
    }
  }

  function useNativeHls(reason) {
    if (fallbackAttempted || failed || destroyed ||
        !video.canPlayType("application/vnd.apple.mpegurl")) {
      return false;
    }
    fallbackAttempted = true;
    console.warn("Falling back to native HLS playback:", reason);
    cleanupMedia();
    video.src = sourceUrl;
    video.load();
    attemptPlayback();
    return true;
  }

  function onMediaError() {
    if (destroyed || !sourceUrl || (!hls && !video.getAttribute("src"))) {
      return;
    }
    const code = video.error ? video.error.code : "unknown";
    console.error("Video element error:", video.error);
    if (useNativeHls("media error " + code)) {
      return;
    }
    reportFailure("Unable to decode this stream (media error " + code + ").");
  }

  listen(video, "playing", function () {
    state();
    status("Playing");
    if (callbacks.onPlaying) {
      callbacks.onPlaying();
    }
  });
  listen(video, "play", state);
  listen(video, "pause", state);
  listen(video, "waiting", function () {
    status("Buffering...");
    if (callbacks.onWaiting) {
      callbacks.onWaiting();
    }
  });
  listen(video, "volumechange", function () {
    if (callbacks.onVolumeChange) {
      callbacks.onVolumeChange(video.muted || video.volume === 0, video.volume);
    }
  });
  ["timeupdate", "seeked", "durationchange", "loadedmetadata"].forEach(function (name) {
    listen(video, name, function () {
      if (callbacks.onTimelineChange) {
        callbacks.onTimelineChange();
      }
    });
  });
  listen(video, "ended", function () {
    status("Playback finished");
    if (callbacks.onEnded) {
      callbacks.onEnded();
    }
  });
  listen(video, "error", onMediaError);

  function getRange() {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      return { start: 0, end: video.duration };
    }
    try {
      if (video.seekable.length) {
        const lastRange = video.seekable.length - 1;
        return {
          start: video.seekable.start(lastRange),
          end: video.seekable.end(lastRange)
        };
      }
    } catch (error) {
      console.warn("Unable to read the stream seek range:", error);
    }
    return null;
  }

  return {
    start(url) {
      if (destroyed) {
        return;
      }
      sourceUrl = "";
      cleanupMedia();
      sourceUrl = url;
      failed = false;
      fallbackAttempted = false;
      video.muted = false;
      video.volume = 1;
      video.playsInline = true;
      video.autoplay = true;
      status("Loading stream...");

      if (window.Hls && window.Hls.isSupported()) {
        try {
          const instance = new window.Hls({
            loader: createSegmentLoader(window.Hls.DefaultConfig.loader)
          });
          hls = instance;
          instance.on(window.Hls.Events.MEDIA_ATTACHED, function () {
            if (destroyed || hls !== instance) {
              return;
            }
            instance.loadSource(sourceUrl);
          });
          instance.on(window.Hls.Events.MANIFEST_PARSED, function () {
            if (destroyed || hls !== instance) {
              return;
            }
            attemptPlayback();
          });
          instance.on(window.Hls.Events.ERROR, function (_event, data) {
            if (destroyed || hls !== instance || !data.fatal) {
              return;
            }
            console.error("HLS playback error:", data);
            if (!useNativeHls(data.details)) {
              reportFailure("Stream error: " + data.details);
            }
          });
          instance.attachMedia(video);
        } catch (error) {
          console.error("Unable to initialize HLS playback:", error);
          if (!useNativeHls(error.message)) {
            reportFailure("Unable to initialize the HLS player.", error);
          }
        }
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = sourceUrl;
        video.load();
        attemptPlayback();
        return;
      }
      reportFailure("This browser does not support HLS playback.");
    },
    play: attemptPlayback,
    pause() {
      video.pause();
    },
    toggle() {
      if (video.paused) {
        attemptPlayback();
      } else {
        video.pause();
      }
    },
    seek(time) {
      const range = getRange();
      if (!range || range.end <= range.start) {
        return false;
      }
      try {
        video.currentTime = Math.max(range.start, Math.min(range.end, time));
        return true;
      } catch (error) {
        console.warn("Unable to seek to the requested time:", error);
        status("Seeking is unavailable at this position.");
        return false;
      }
    },
    changeVolume(amount) {
      const volume = Math.max(0, Math.min(1, (video.muted ? 0 : video.volume) + amount));
      video.volume = volume;
      video.muted = volume === 0;
    },
    toggleMute() {
      video.muted = !(video.muted || video.volume === 0);
      if (!video.muted && video.volume === 0) {
        video.volume = 0.5;
      }
    },
    getRange,
    getCurrentTime() {
      return video.currentTime;
    },
    stop() {
      sourceUrl = "";
      cleanupMedia();
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      sourceUrl = "";
      listeners.forEach(function (removeListener) {
        removeListener();
      });
      cleanupMedia();
    }
  };
}
