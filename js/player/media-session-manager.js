const POSITION_THROTTLE_MS = 1000;
const PLAY_VERIFY_DELAY_MS = 850;

function resolveNativeMediaSessionPlugin() {
  const win = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis.window : null);
  if (!win || !win.Capacitor) {
    return null;
  }
  const cap = win.Capacitor;
  if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) {
    return null;
  }
  if (cap.Plugins && cap.Plugins.NativeMediaSession) {
    return cap.Plugins.NativeMediaSession;
  }
  if (typeof cap.registerPlugin === "function") {
    try {
      return cap.registerPlugin("NativeMediaSession");
    } catch (_) {}
  }
  return null;
}

function resolveCapacitorAppPlugin() {
  const win = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis.window : null);
  if (!win || !win.Capacitor || !win.Capacitor.Plugins) {
    return null;
  }
  return win.Capacitor.Plugins.App || null;
}

function safeCall(promiseOrValue) {
  if (promiseOrValue && typeof promiseOrValue.catch === "function") {
    promiseOrValue.catch(function () {});
  }
}

function sanitizeFiniteNumber(value, fallback) {
  return (typeof value === "number" && Number.isFinite(value) && value >= 0) ? value : fallback;
}

function resolveArtworkUrl(movie) {
  if (!movie) {
    return "";
  }
  const raw = movie.thumb || movie.poster || "";
  if (!raw || typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const win = typeof window !== "undefined" ? window : null;
  if (win && win.location && win.location.origin) {
    try {
      return new URL(trimmed, win.location.origin).href;
    } catch (_) {}
  }
  return trimmed;
}

export function createMediaSessionManager(options) {
  const video = options && options.video ? options.video : null;
  const controller = (options && options.controller) ? options.controller : {};
  const plugin = (options && options.plugin) ? options.plugin : resolveNativeMediaSessionPlugin();
  const appPlugin = (options && options.appPlugin) ? options.appPlugin : resolveCapacitorAppPlugin();

  let disposed = false;
  let initialized = false;
  let lastPositionSyncAt = 0;
  let lastSyncedState = "";
  let lastSyncedPosition = -1;
  let lastSyncedDuration = -1;
  let lastSyncedRate = 1;
  let currentMetadataPayload = null;
  let playVerifyTimer = 0;
  let bgVerifyTimer = 0;
  const cleanups = [];
  const asyncListenerHandles = [];

  function clearTimers() {
    const win = typeof window !== "undefined" ? window : globalThis;
    if (playVerifyTimer) {
      win.clearTimeout(playVerifyTimer);
      playVerifyTimer = 0;
    }
    if (bgVerifyTimer) {
      win.clearTimeout(bgVerifyTimer);
      bgVerifyTimer = 0;
    }
  }

  function getDurationSeconds() {
    if (controller && typeof controller.getDuration === "function") {
      const d = controller.getDuration();
      if (typeof d === "number" && Number.isFinite(d) && d > 0) {
        return d;
      }
    }
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      return video.duration;
    }
    return 0;
  }

  function getPositionSeconds() {
    if (controller && typeof controller.getCurrentTime === "function") {
      const pos = controller.getCurrentTime();
      if (typeof pos === "number" && Number.isFinite(pos) && pos >= 0) {
        return pos;
      }
    }
    if (video && Number.isFinite(video.currentTime) && video.currentTime >= 0) {
      return video.currentTime;
    }
    return 0;
  }

  function getPlaybackRate() {
    if (video && typeof video.playbackRate === "number" && Number.isFinite(video.playbackRate) && video.playbackRate > 0) {
      return video.playbackRate;
    }
    return 1;
  }

  function derivePlaybackState(overrideState) {
    if (overrideState) {
      return overrideState;
    }
    if (!video) {
      return "idle";
    }
    if (video.error) {
      return "error";
    }
    if (video.ended) {
      return "ended";
    }
    if (video.paused) {
      return "paused";
    }
    if (video.seeking || video.readyState < 3) {
      return "buffering";
    }
    return "playing";
  }

  function syncPlaybackState(overrideState, force) {
    if (disposed || !plugin || typeof plugin.setPlaybackState !== "function") {
      return;
    }
    const state = derivePlaybackState(overrideState);
    const position = sanitizeFiniteNumber(getPositionSeconds(), 0);
    const duration = sanitizeFiniteNumber(getDurationSeconds(), 0);
    const playbackRate = getPlaybackRate();
    const navFlags = (controller && typeof controller.getNavigationState === "function")
      ? controller.getNavigationState()
      : null;
    const hasPrev = navFlags ? Boolean(navFlags.hasPrev) : Boolean(currentMetadataPayload && currentMetadataPayload.hasPrev);
    const hasNext = navFlags ? Boolean(navFlags.hasNext) : Boolean(currentMetadataPayload && currentMetadataPayload.hasNext);

    if (
      !force &&
      state === lastSyncedState &&
      Math.abs(position - lastSyncedPosition) < 0.75 &&
      Math.abs(duration - lastSyncedDuration) < 0.5 &&
      playbackRate === lastSyncedRate
    ) {
      return;
    }

    lastSyncedState = state;
    lastSyncedPosition = position;
    lastSyncedDuration = duration;
    lastSyncedRate = playbackRate;
    lastPositionSyncAt = Date.now();

    safeCall(plugin.setPlaybackState({
      state: state,
      position: position,
      duration: duration,
      playbackRate: playbackRate,
      hasPrev: hasPrev,
      hasNext: hasNext
    }));
  }

  function syncPositionThrottled(force) {
    if (disposed || !plugin) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastPositionSyncAt < POSITION_THROTTLE_MS) {
      return;
    }
    const position = sanitizeFiniteNumber(getPositionSeconds(), 0);
    const duration = sanitizeFiniteNumber(getDurationSeconds(), 0);
    const playbackRate = getPlaybackRate();

    if (
      !force &&
      Math.abs(position - lastSyncedPosition) < 0.8 &&
      Math.abs(duration - lastSyncedDuration) < 0.5 &&
      playbackRate === lastSyncedRate
    ) {
      return;
    }

    lastPositionSyncAt = now;
    lastSyncedPosition = position;
    lastSyncedDuration = duration;
    lastSyncedRate = playbackRate;

    if (typeof plugin.setPositionState === "function") {
      safeCall(plugin.setPositionState({
        position: position,
        duration: duration,
        playbackRate: playbackRate
      }));
    } else if (typeof plugin.setPlaybackState === "function") {
      syncPlaybackState(null, true);
    }
  }

  function updateMetadata(movie, navOptions) {
    if (disposed || !plugin || !movie) {
      return;
    }
    const navFlags = navOptions || (
      controller && typeof controller.getNavigationState === "function"
        ? controller.getNavigationState()
        : { hasPrev: false, hasNext: false }
    );
    const seriesTitle = movie.seriesTitle || "";
    const episodeName = movie.episodeName || "";
    const sourceName = movie.source || "BACUFlix";
    const title = movie.title || seriesTitle || "BACUFlix";
    const artist = (seriesTitle && episodeName)
      ? (seriesTitle + " · " + sourceName)
      : sourceName;
    const album = episodeName || seriesTitle || "BACUFlix";
    const artwork = resolveArtworkUrl(movie);
    const duration = sanitizeFiniteNumber(getDurationSeconds(), 0);
    const position = sanitizeFiniteNumber(getPositionSeconds(), 0);
    const hasPrev = Boolean(navFlags && navFlags.hasPrev);
    const hasNext = Boolean(navFlags && navFlags.hasNext);

    currentMetadataPayload = {
      title: title,
      artist: artist,
      album: album,
      artwork: artwork,
      duration: duration,
      position: position,
      hasPrev: hasPrev,
      hasNext: hasNext
    };

    if (typeof plugin.setMetadata === "function") {
      safeCall(plugin.setMetadata(currentMetadataPayload));
    }
  }

  function handleNativeAction(event) {
    if (disposed || !event || !event.action) {
      return;
    }
    const action = event.action;
    const win = typeof window !== "undefined" ? window : globalThis;

    if (action === "play") {
      if (typeof controller.play === "function") {
        controller.play();
      } else if (video) {
        safeCall(video.play());
      }
      if (playVerifyTimer) {
        win.clearTimeout(playVerifyTimer);
      }
      playVerifyTimer = win.setTimeout(function () {
        playVerifyTimer = 0;
        if (!disposed && video) {
          syncPlaybackState(video.paused ? "paused" : "playing", true);
        }
      }, PLAY_VERIFY_DELAY_MS);
      return;
    }

    if (action === "pause") {
      if (typeof controller.pause === "function") {
        controller.pause();
      } else if (video) {
        video.pause();
      }
      syncPlaybackState("paused", true);
      return;
    }

    if (action === "stop") {
      if (typeof controller.stop === "function") {
        controller.stop();
      } else if (video) {
        video.pause();
      }
      syncPlaybackState("paused", true);
      return;
    }

    if (action === "seekForward") {
      const delta = (typeof event.seconds === "number" && event.seconds > 0) ? event.seconds : 10;
      if (typeof controller.seekBy === "function") {
        controller.seekBy(delta);
      } else if (video) {
        video.currentTime = Math.max(0, getPositionSeconds() + delta);
      }
      syncPositionThrottled(true);
      return;
    }

    if (action === "seekBackward") {
      const delta = (typeof event.seconds === "number" && event.seconds > 0) ? event.seconds : 10;
      if (typeof controller.seekBy === "function") {
        controller.seekBy(-delta);
      } else if (video) {
        video.currentTime = Math.max(0, getPositionSeconds() - delta);
      }
      syncPositionThrottled(true);
      return;
    }

    if (action === "seekTo") {
      if (typeof event.position === "number" && Number.isFinite(event.position) && event.position >= 0) {
        if (typeof controller.seekTo === "function") {
          controller.seekTo(event.position);
        } else if (video) {
          video.currentTime = event.position;
        }
        syncPositionThrottled(true);
      }
      return;
    }

    if (action === "nextTrack") {
      if (typeof controller.nextTrack === "function") {
        controller.nextTrack();
      }
      return;
    }

    if (action === "previousTrack") {
      if (typeof controller.previousTrack === "function") {
        controller.previousTrack();
      }
      return;
    }
  }

  function listenDom(target, eventName, handler) {
    if (!target || typeof target.addEventListener !== "function") {
      return;
    }
    target.addEventListener(eventName, handler);
    cleanups.push(function () {
      target.removeEventListener(eventName, handler);
    });
  }

  function handleLifecycleTransition(isForeground) {
    if (disposed) {
      return;
    }
    const win = typeof window !== "undefined" ? window : globalThis;
    if (bgVerifyTimer) {
      win.clearTimeout(bgVerifyTimer);
      bgVerifyTimer = 0;
    }
    if (isForeground) {
      if (currentMetadataPayload && plugin && typeof plugin.setMetadata === "function") {
        currentMetadataPayload.duration = sanitizeFiniteNumber(getDurationSeconds(), 0);
        currentMetadataPayload.position = sanitizeFiniteNumber(getPositionSeconds(), 0);
        safeCall(plugin.setMetadata(currentMetadataPayload));
      }
      syncPlaybackState(null, true);
    } else {
      syncPlaybackState(null, true);
      bgVerifyTimer = win.setTimeout(function () {
        bgVerifyTimer = 0;
        if (!disposed) {
          syncPlaybackState(null, true);
        }
      }, 350);
    }
  }

  function init() {
    if (initialized || disposed || !plugin || !video) {
      return;
    }
    initialized = true;

    if (typeof plugin.requestNotificationPermission === "function") {
      safeCall(plugin.requestNotificationPermission());
    }

    listenDom(video, "play", function () {
      syncPlaybackState(video.readyState < 3 ? "buffering" : "playing", true);
    });
    listenDom(video, "playing", function () {
      syncPlaybackState("playing", true);
    });
    listenDom(video, "pause", function () {
      syncPlaybackState(video.ended ? "ended" : "paused", true);
    });
    listenDom(video, "waiting", function () {
      syncPlaybackState("buffering", true);
    });
    listenDom(video, "seeking", function () {
      syncPositionThrottled(true);
    });
    listenDom(video, "seeked", function () {
      syncPlaybackState(null, true);
    });
    listenDom(video, "timeupdate", function () {
      syncPositionThrottled(false);
    });
    listenDom(video, "durationchange", function () {
      if (currentMetadataPayload) {
        currentMetadataPayload.duration = sanitizeFiniteNumber(getDurationSeconds(), 0);
      }
      syncPlaybackState(null, true);
    });
    listenDom(video, "ended", function () {
      syncPlaybackState("ended", true);
    });
    listenDom(video, "ratechange", function () {
      syncPlaybackState(null, true);
    });
    listenDom(video, "error", function () {
      syncPlaybackState("error", true);
    });

    const doc = typeof document !== "undefined" ? document : null;
    if (doc) {
      listenDom(doc, "visibilitychange", function () {
        handleLifecycleTransition(!doc.hidden);
      });
    }

    if (typeof plugin.addListener === "function") {
      try {
        const res = plugin.addListener("mediaAction", handleNativeAction);
        if (res) {
          asyncListenerHandles.push(res);
        }
      } catch (_) {}
    }

    if (appPlugin && typeof appPlugin.addListener === "function") {
      try {
        const appRes = appPlugin.addListener("appStateChange", function (state) {
          if (state && typeof state.isActive === "boolean") {
            handleLifecycleTransition(state.isActive);
          }
        });
        if (appRes) {
          asyncListenerHandles.push(appRes);
        }
      } catch (_) {}
    }
  }

  init();

  return {
    updateMetadata: updateMetadata,
    syncPlaybackState: syncPlaybackState,
    notifyError: function () {
      syncPlaybackState("error", true);
    },
    destroy: function () {
      if (disposed) {
        return;
      }
      disposed = true;
      clearTimers();
      while (cleanups.length) {
        const cleanup = cleanups.pop();
        try {
          cleanup();
        } catch (_) {}
      }
      while (asyncListenerHandles.length) {
        const handleOrPromise = asyncListenerHandles.pop();
        if (handleOrPromise && typeof handleOrPromise.remove === "function") {
          safeCall(handleOrPromise.remove());
        } else if (handleOrPromise && typeof handleOrPromise.then === "function") {
          handleOrPromise.then(function (h) {
            if (h && typeof h.remove === "function") {
              safeCall(h.remove());
            }
          }).catch(function () {});
        }
      }
      if (plugin && typeof plugin.clear === "function") {
        safeCall(plugin.clear());
      }
    }
  };
}
