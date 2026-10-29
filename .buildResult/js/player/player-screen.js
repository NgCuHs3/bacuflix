import { createPlaybackService } from "./playback-service.js";
import { createSeekController } from "./seek-controller.js";
import { createSubtitleService } from "./subtitle-service.js";
import { getActiveSubtitleText } from "./subtitle-parser.js";
import { activateFocusedElement, focusNext } from "../navigation/remote-navigation.js";
import { formatTime } from "../utils/format-time.js";
import { currentDevice } from "../utils/device.js";

function playerMarkup(movie) {
  let hintText = "← → Move / seek · ↑ ↓ Switch controls · Volume keys adjust sound · Esc / Back to hide controls or return";
  if (currentDevice === "mobile") {
    hintText = "Double-tap left/right to seek 10s · Tap to show controls";
  } else if (currentDevice === "desktop") {
    hintText = "Space / K to pause · F for full screen · ← → seek 10s · ↑ ↓ volume · M mute";
  }

  return '<section id="video-stage" class="video-stage controls-visible" aria-label="Video player">' +
    '<div class="cinema-shade" aria-hidden="true"></div>' +
    '<video id="video" autoplay playsinline preload="auto" aria-label="BACUFlix video playback"></video>' +
    '<div id="subtitles" class="subtitle-overlay" aria-live="polite" aria-atomic="true"></div>' +
    '<div id="tap-zone-left" class="seek-tap-zone seek-tap-left" aria-hidden="true"></div>' +
    '<div id="tap-zone-right" class="seek-tap-zone seek-tap-right" aria-hidden="true"></div>' +
    '<div id="seek-overlay-left" class="seek-feedback-overlay seek-feedback-left" aria-hidden="true">' +
    '<div class="seek-feedback-ripple"></div>' +
    '<div class="seek-feedback-content">' +
    '<div class="seek-feedback-arrows"><svg viewBox="0 0 24 24" class="seek-feedback-icon" width="36" height="36" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg></div>' +
    '<span class="seek-feedback-text">10 seconds</span></div></div>' +
    '<div id="seek-overlay-right" class="seek-feedback-overlay seek-feedback-right" aria-hidden="true">' +
    '<div class="seek-feedback-ripple"></div>' +
    '<div class="seek-feedback-content">' +
    '<div class="seek-feedback-arrows"><svg viewBox="0 0 24 24" class="seek-feedback-icon" width="36" height="36" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg></div>' +
    '<span class="seek-feedback-text">10 seconds</span></div></div>' +
    '<header class="topbar ui-overlay">' +
    '<button class="brand home-return-button" type="button" aria-label="Return to movie catalog"><img src="icon.png" alt="">' +
    '<span>BACU<span class="brand-accent">Flix</span></span></button>' +
    '<span class="stream-label"><span class="live-dot"></span> NOW PLAYING</span></header>' +
    '<div class="bottom-bar ui-overlay"><div class="now-playing">' +
    '<span class="eyebrow">NOW PLAYING</span><span class="now-playing-title"></span>' +
    '</div></div>' +
    '<p id="status" class="status" role="status" aria-live="polite">Loading stream...</p>' +
    '<div id="player-loader" class="player-loader is-active" role="status" aria-label="Loading video">' +
    '<div class="loader-spinner" aria-hidden="true">' +
    '<svg class="spinner-svg" viewBox="0 0 50 50">' +
    '<circle class="spinner-track" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>' +
    '<circle class="spinner-circle" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>' +
    '</svg></div>' +
    '<span id="loader-label" class="loader-label">Loading movie...</span></div>' +
    '<div id="volume-hud" class="volume-hud" role="status" aria-live="polite" aria-hidden="true">' +
    '<span id="volume-hud-icon" class="volume-hud-icon" aria-hidden="true">♪</span>' +
    '<div class="volume-hud-track" aria-hidden="true"><div id="volume-hud-level" class="volume-hud-level"></div></div>' +
    '<span id="volume-hud-percent" class="volume-hud-percent">100%</span></div>' +
    '<button id="play-button" class="play-button" type="button" hidden>' +
    '<span class="play-icon" aria-hidden="true"></span><span>Play with sound</span></button>' +
    '<div id="controls" class="control-panel ui-overlay" aria-label="Playback controls">' +
    '<label class="timeline"><span id="current-time" class="time-label">0:00</span>' +
    '<input id="seek-bar" type="range" min="0" max="1000" value="0" aria-label="Seek" style="background-image: linear-gradient(to right, #e50924 0%, #e50924 0%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.35) 100%);">' +
    '<span id="duration" class="time-label">0:00</span></label>' +
    '<div class="control-row">' +
    '<button id="rewind-button" class="control-button" type="button" aria-label="Rewind 10 seconds">' +
    '<span class="control-symbol" aria-hidden="true"><svg class="control-icon" viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="m15 18-6-6 6-6"/></svg></span>' +
    '<span class="control-caption">Back</span></button>' +
    '<button id="toggle-play-button" class="control-button primary-control" type="button" aria-label="Pause">' +
    '<span id="play-pause-symbol" class="control-symbol" aria-hidden="true">Ⅱ</span>' +
    '<span id="play-pause-caption" class="control-caption">Pause</span></button>' +
    '<button id="forward-button" class="control-button" type="button" aria-label="Forward 10 seconds">' +
    '<span class="control-symbol" aria-hidden="true"><svg class="control-icon" viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="m9 18 6-6-6-6"/></svg></span>' +
    '<span class="control-caption">Forward</span></button>' +
    '<span class="control-divider" aria-hidden="true"></span>' +
    '<button id="volume-down-button" class="control-button compact-control" type="button" aria-label="Volume down">' +
    '<span class="control-symbol volume-symbol" aria-hidden="true">−</span><span class="control-caption">Vol −</span></button>' +
    '<button id="volume-up-button" class="control-button compact-control" type="button" aria-label="Volume up">' +
    '<span class="control-symbol volume-symbol" aria-hidden="true">+</span><span class="control-caption">Vol +</span></button>' +
    '<button id="subtitle-button" class="control-button compact-control" type="button" aria-pressed="true" aria-label="Toggle subtitles">' +
    '<span id="subtitle-symbol" class="control-symbol subtitle-symbol" aria-hidden="true">CC</span><span id="subtitle-label" class="control-caption">Subs</span></button>' +
    '<button id="fullscreen-button" class="control-button compact-control" type="button" aria-label="Enter fullscreen">' +
    '<span id="fullscreen-symbol" class="control-symbol fullscreen-symbol" aria-hidden="true">' +
    '<svg class="control-icon" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>' +
    '</span><span id="fullscreen-label" class="control-caption">Full screen</span></button>' +
    '</div><p class="remote-hint">' + hintText + '</p>' +
    '</div></section>';
}

export function createPlayerScreen(root, movie, onBackRequest) {
  root.innerHTML = playerMarkup(movie);
  const stage = root.querySelector("#video-stage");
  const video = root.querySelector("#video");
  const status = root.querySelector("#status");
  const playButton = root.querySelector("#play-button");
  const controls = root.querySelector("#controls");
  const seekBar = root.querySelector("#seek-bar");
  const currentTimeLabel = root.querySelector("#current-time");
  const durationLabel = root.querySelector("#duration");
  const togglePlayButton = root.querySelector("#toggle-play-button");
  const playPauseSymbol = root.querySelector("#play-pause-symbol");
  const playPauseCaption = root.querySelector("#play-pause-caption");
  const volumeHud = root.querySelector("#volume-hud");
  const volumeHudIcon = root.querySelector("#volume-hud-icon");
  const volumeHudLevel = root.querySelector("#volume-hud-level");
  const volumeHudPercent = root.querySelector("#volume-hud-percent");
  const nowPlayingTitle = root.querySelector(".now-playing-title");
  const subtitleButton = root.querySelector("#subtitle-button");
  const subtitleLabel = root.querySelector("#subtitle-label");
  const subtitleSymbol = root.querySelector("#subtitle-symbol");
  const fullscreenButton = root.querySelector("#fullscreen-button");
  const fullscreenLabel = root.querySelector("#fullscreen-label");
  const fullscreenSymbol = root.querySelector("#fullscreen-symbol");
  const FULLSCREEN_ENTER_ICON = '<svg class="control-icon" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  const FULLSCREEN_EXIT_ICON = '<svg class="control-icon" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';
  const subtitlesContainer = root.querySelector("#subtitles");
  const tapZoneLeft = root.querySelector("#tap-zone-left");
  const tapZoneRight = root.querySelector("#tap-zone-right");
  const seekOverlayLeft = root.querySelector("#seek-overlay-left");
  const seekOverlayRight = root.querySelector("#seek-overlay-right");
  const loader = root.querySelector("#player-loader");
  const loaderLabel = root.querySelector("#loader-label");
  const subtitleService = createSubtitleService();
  const cleanups = [];
  let subtitleCues = [];
  let subtitlesEnabled = true;
  let displayedSubtitleText = "";
  let statusTimer = 0;
  let controlsTimer = 0;
  let volumeHudTimer = 0;
  let singleClickTimer = 0;
  let feedbackTimer = 0;
  let lastTapTime = 0;
  let lastTapSide = null;
  let cumulativeSeconds = 0;
  let controlsVisible = true;
  let mediaStarted = false;
  let seeking = false;
  let disposed = false;
  let suppressScrubClick = null;
  let suppressClickTimer = 0;
  let pointerSeekSource = null;
  let selectedHoldSource = null;
  let autoplayBlocked = false;

  nowPlayingTitle.textContent = movie.title;

  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    cleanups.push(function () {
      target.removeEventListener(name, handler, options);
    });
  }

  function showStatus(message, persistent) {
    if (disposed) {
      return;
    }
    window.clearTimeout(statusTimer);
    status.textContent = message;
    status.dataset.visible = "true";
    if (!persistent) {
      statusTimer = window.setTimeout(function () {
        status.dataset.visible = "false";
      }, 2400);
    }
  }

  function showLoader(message) {
    if (disposed || !loader) {
      return;
    }
    if (loaderLabel && message) {
      loaderLabel.textContent = message;
    }
    loader.classList.add("is-active");
    stage.classList.add("is-loading");
  }

  function hideLoader() {
    if (!loader) {
      return;
    }
    loader.classList.remove("is-active");
    stage.classList.remove("is-loading", "is-buffering");
  }

  function updateSoundControl(muted, volume) {
    const percentage = muted ? 0 : Math.round(volume * 100);
    volumeHudIcon.textContent = muted ? "×" : "♪";
    volumeHudLevel.style.width = percentage + "%";
    volumeHudPercent.textContent = percentage + "%";
    volumeHud.setAttribute("aria-label", "Volume " + percentage + "%");
  }

  function showVolumeHud() {
    updateSoundControl(video.muted || video.volume === 0, video.volume);
    window.clearTimeout(volumeHudTimer);
    volumeHud.classList.add("is-visible");
    volumeHud.setAttribute("aria-hidden", "false");
    volumeHudTimer = window.setTimeout(function () {
      volumeHud.classList.remove("is-visible");
      volumeHud.setAttribute("aria-hidden", "true");
    }, 2200);
  }

  function renderSubtitles(text) {
    if (displayedSubtitleText === text) {
      return;
    }
    displayedSubtitleText = text;
    if (!text) {
      subtitlesContainer.innerHTML = "";
      subtitlesContainer.classList.remove("has-cues");
      return;
    }
    subtitlesContainer.classList.add("has-cues");
    subtitlesContainer.innerHTML = "";
    const box = document.createElement("div");
    box.className = "subtitle-box";
    const lines = text.split("\n");
    lines.forEach(function (line, index) {
      if (index > 0) {
        box.appendChild(document.createElement("br"));
      }
      const lineSpan = document.createElement("span");
      lineSpan.className = "subtitle-line";
      lineSpan.textContent = line;
      box.appendChild(lineSpan);
    });
    subtitlesContainer.appendChild(box);
  }

  function updateSubtitleDisplay(time) {
    if (!subtitlesEnabled || !subtitleCues || subtitleCues.length === 0) {
      renderSubtitles("");
      return;
    }
    const currentTime = typeof time === "number" ? time : playback.getCurrentTime();
    const activeText = getActiveSubtitleText(subtitleCues, currentTime);
    renderSubtitles(activeText);
  }

  function initSubtitles() {
    if (!movie || !movie.subtitle) {
      subtitleButton.disabled = true;
      subtitleButton.classList.add("is-unavailable");
      subtitleButton.setAttribute("aria-label", "Subtitles unavailable");
      subtitleButton.setAttribute("aria-pressed", "false");
      subtitleLabel.textContent = "No subs";
      return;
    }

    subtitleButton.disabled = false;
    subtitleButton.classList.add("is-loading");
    subtitleButton.setAttribute("aria-label", "Loading subtitles");
    subtitleLabel.textContent = "Loading...";

    subtitleService.loadSubtitle(movie.subtitle).then(function (result) {
      if (disposed) {
        return;
      }
      subtitleButton.classList.remove("is-loading");
      if (result.aborted) {
        return;
      }
      if (result.error || !result.cues || result.cues.length === 0) {
        subtitleCues = [];
        subtitlesEnabled = false;
        subtitleButton.disabled = true;
        subtitleButton.classList.add("is-unavailable");
        subtitleButton.setAttribute("aria-label", "Subtitles unavailable");
        subtitleButton.setAttribute("aria-pressed", "false");
        subtitleLabel.textContent = "No subs";
        if (result.error && result.error !== "No subtitle URL provided.") {
          showStatus("Subtitles could not be loaded: " + result.error);
        }
        return;
      }

      subtitleCues = result.cues;
      subtitlesEnabled = true;
      subtitleButton.disabled = false;
      subtitleButton.classList.add("is-active");
      subtitleButton.setAttribute("aria-label", "Turn subtitles off");
      subtitleButton.setAttribute("aria-pressed", "true");
      subtitleLabel.textContent = "Subs ON";
      updateSubtitleDisplay();
    }).catch(function () {
      if (disposed) {
        return;
      }
      subtitleButton.classList.remove("is-loading");
      subtitleButton.disabled = true;
      subtitleButton.classList.add("is-unavailable");
      subtitleButton.setAttribute("aria-label", "Subtitles unavailable");
      subtitleButton.setAttribute("aria-pressed", "false");
      subtitleLabel.textContent = "No subs";
      showStatus("Subtitles could not be loaded.");
    });
  }

  function isFullscreenActive() {
    return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  function updateFullscreenControl() {
    if (disposed) {
      return;
    }
    const isFull = isFullscreenActive();
    stage.classList.toggle("is-fullscreen", isFull);
    fullscreenButton.setAttribute("aria-label", isFull ? "Exit fullscreen" : "Enter fullscreen");
    fullscreenButton.setAttribute("aria-pressed", String(isFull));
    fullscreenLabel.textContent = isFull ? "Exit full" : "Full screen";
    fullscreenSymbol.innerHTML = isFull ? FULLSCREEN_EXIT_ICON : FULLSCREEN_ENTER_ICON;
    fullscreenButton.classList.toggle("is-active", isFull);
    if (isFull) {
      lockLandscape();
    } else {
      unlockLandscape();
    }
  }

  function toggleFullscreen() {
    if (isFullscreenActive()) {
      try {
        unlockLandscape();
        const exit = document.exitFullscreen ||
          document.webkitExitFullscreen ||
          document.mozCancelFullScreen ||
          document.msExitFullscreen;
        if (exit) {
          const p = exit.call(document);
          if (p && typeof p.catch === "function") {
            p.catch(function (error) {
              console.warn("Could not exit fullscreen:", error);
            });
          }
        }
      } catch (error) {
        console.warn("Could not exit fullscreen:", error);
      }
    } else {
      try {
        lockLandscape();
        const request = stage.requestFullscreen ||
          stage.webkitRequestFullscreen ||
          stage.mozRequestFullScreen ||
          stage.msRequestFullscreen ||
          (video && video.webkitEnterFullscreen ? function () { video.webkitEnterFullscreen(); } : null);
        if (request) {
          const p = request.call(stage);
          if (p && typeof p.catch === "function") {
            p.catch(function (error) {
              console.error("Could not enter fullscreen:", error);
              showStatus("Full screen is unavailable.");
            });
          }
        } else {
          showStatus("Full screen is unavailable.");
        }
      } catch (error) {
        console.error("Could not enter fullscreen:", error);
        showStatus("Full screen is unavailable.");
      }
    }
  }

  function lockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(function () {});
      } else if (screen.lockOrientation) {
        screen.lockOrientation("landscape");
      } else if (screen.mozLockOrientation) {
        screen.mozLockOrientation("landscape");
      } else if (screen.msLockOrientation) {
        screen.msLockOrientation("landscape");
      }
    } catch (_) {}
  }

  function unlockLandscape() {
    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      } else if (screen.unlockOrientation) {
        screen.unlockOrientation();
      }
    } catch (_) {}
  }

  function showSeekFeedback(side, seconds) {
    if (disposed) {
      return;
    }
    const overlay = side === "left" ? seekOverlayLeft : seekOverlayRight;
    const otherOverlay = side === "left" ? seekOverlayRight : seekOverlayLeft;
    const textEl = overlay.querySelector(".seek-feedback-text");

    otherOverlay.classList.remove("is-active");
    textEl.textContent = Math.abs(seconds) + " seconds";

    overlay.classList.remove("is-active");
    void overlay.offsetWidth;
    overlay.classList.add("is-active");

    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(function () {
      overlay.classList.remove("is-active");
      cumulativeSeconds = 0;
      lastTapSide = null;
    }, 750);
  }

  function handleStageTap(side) {
    if (disposed) {
      return;
    }
    const now = Date.now();
    const timeSinceLast = now - lastTapTime;

    if (timeSinceLast < 320 && lastTapSide === side) {
      window.clearTimeout(singleClickTimer);
      if (side === "center") {
        toggleFullscreen();
        lastTapTime = now;
        scheduleHide();
        return;
      }
      cumulativeSeconds += 10;
      const direction = side === "left" ? -1 : 1;
      seekController.seekBy(direction * 10);
      showSeekFeedback(side, cumulativeSeconds);
      lastTapTime = now;
      scheduleHide();
    } else {
      lastTapTime = now;
      lastTapSide = side;
      cumulativeSeconds = 10;

      const timeSinceShow = now - lastShowControlsTime;
      if (controlsVisible && timeSinceShow > 400) {
        hideControls(true);
        if (controls.contains(document.activeElement)) {
          document.activeElement.blur();
        }
      } else {
        showControls(false);
        scheduleHide();
      }
    }
  }

  function updatePlaybackControl(state) {
    togglePlayButton.setAttribute("aria-label", state.paused ? "Play" : "Pause");
    playPauseCaption.textContent = state.paused ? "Play" : "Pause";
    playPauseSymbol.textContent = state.paused ? "▶" : "Ⅱ";
  }

  function updateTimeline(previewProgress) {
    const range = playback.getRange();
    if (!range || range.end <= range.start) {
      seekBar.disabled = true;
      seekBar.value = "0";
      seekBar.style.setProperty("--seek-progress", "0%");
      seekBar.style.backgroundImage =
        "linear-gradient(to right, #e50924 0%, #e50924 0%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.35) 100%)";
      currentTimeLabel.textContent = formatTime(playback.getCurrentTime());
      durationLabel.textContent = formatTime(video.duration);
      return;
    }

    seekBar.disabled = false;
    const progress = Number.isFinite(previewProgress)
      ? Math.max(0, Math.min(1, previewProgress))
      : Math.max(0, Math.min(1, (playback.getCurrentTime() - range.start) / (range.end - range.start)));
    const percentage = progress * 100;
    const pctString = percentage.toFixed(2) + "%";
    seekBar.style.setProperty("--seek-progress", pctString);
    seekBar.style.backgroundImage =
      "linear-gradient(to right, #e50924 0%, #e50924 " + pctString + ", rgba(255, 255, 255, 0.35) " + pctString + ", rgba(255, 255, 255, 0.35) 100%)";
    seekBar.value = String(Math.round(percentage * 10));
    currentTimeLabel.textContent = formatTime(progress * (range.end - range.start));
    durationLabel.textContent = formatTime(range.end - range.start);
  }

  const CONTROLS_AUTOHIDE_MS = 4500;

  let lastShowControlsTime = 0;

  function showControls(focusPlayback) {
    window.clearTimeout(controlsTimer);
    controlsVisible = true;
    lastShowControlsTime = Date.now();
    stage.classList.add("controls-visible");
    if (focusPlayback) {
      togglePlayButton.focus();
    }
  }

  function hideControls(force) {
    if (!force && (!mediaStarted || autoplayBlocked || (video && video.paused))) {
      return;
    }
    controlsVisible = false;
    stage.classList.remove("controls-visible");
  }

  function scheduleHide(delay) {
    window.clearTimeout(controlsTimer);
    controlsTimer = window.setTimeout(function () {
      hideControls(false);
    }, typeof delay === "number" ? delay : CONTROLS_AUTOHIDE_MS);
  }

  function focusControl(direction) {
    const buttons = Array.prototype.slice.call(controls.querySelectorAll("button:not([disabled])"));
    const active = document.activeElement;
    const onTimeline = active === seekBar;
    seekController.commitPreview();

    if (direction === "up" || direction === "down") {
      if (onTimeline) {
        togglePlayButton.focus();
      } else {
        seekBar.focus();
      }
      return;
    }
    if (onTimeline || buttons.indexOf(active) === -1) {
      togglePlayButton.focus();
      return;
    }
    focusNext(buttons, active, direction);
  }

  function changeVolume(amount) {
    playback.changeVolume(amount);
    showVolumeHud();
    showStatus("Volume " + Math.round((video.muted ? 0 : video.volume) * 100) + "%");
  }

  function onKeyDown(event, key) {
    if (disposed) {
      return false;
    }
    if (key.isBack) {
      if (key.isRepeat) {
        return true;
      }
      seekController.commitPreview();
      if (controlsVisible || stage.classList.contains("controls-visible")) {
        window.clearTimeout(controlsTimer);
        hideControls(true);
        if (controls.contains(document.activeElement)) {
          document.activeElement.blur();
        }
        return true;
      }
      onBackRequest();
      return true;
    }

    if (!controlsVisible) {
      showControls(true);
    }
    scheduleHide();
    const target = document.activeElement;
    const inControls = controls.contains(target);

    if (target === seekBar && (key.direction === "left" || key.direction === "right")) {
      seekController.pressKey(key.direction === "left" ? -1 : 1, key.direction);
      return true;
    }
    if (key.direction === "left" || key.direction === "right") {
      if (inControls) {
        focusControl(key.direction);
      } else {
        togglePlayButton.focus();
      }
      return true;
    }
    if (key.direction === "up" || key.direction === "down") {
      if (inControls) {
        focusControl(key.direction);
      } else {
        togglePlayButton.focus();
      }
      return true;
    }

    if (key.isFastForward || key.isRewind) {
      seekController.pressKey(key.isRewind ? -1 : 1, key.isRewind ? "rewind" : "forward");
      return true;
    }
    if (key.isVolumeUp || key.isVolumeDown) {
      changeVolume(key.isVolumeUp ? 0.05 : -0.05);
      return true;
    }
    if (key.isVolumeMute) {
      playback.toggleMute();
      showVolumeHud();
      showStatus(video.muted ? "Sound off" : "Sound on");
      return true;
    }
    if (key.key === "f" || key.key === "F") {
      toggleFullscreen();
      return true;
    }
    if (key.isPlayPause) {
      playback.toggle();
      return true;
    }
    if (key.isPlay) {
      playback.play();
      return true;
    }
    if (key.isPause) {
      playback.pause();
      return true;
    }
    if (key.isSelect) {
      if (target === playButton) {
        playButton.click();
      } else if (target === seekBar) {
        return true;
      } else if (target === root.querySelector("#rewind-button") || target === root.querySelector("#forward-button")) {
        selectedHoldSource = target;
        seekController.startHold(target.id === "rewind-button" ? -1 : 1, target, 220);
      } else if (inControls) {
        activateFocusedElement(target);
      } else {
        playback.toggle();
      }
      return true;
    }
    return false;
  }

  function onKeyUp(event, key) {
    if (key.direction === "left" || key.direction === "right") {
      seekController.releaseKey(key.direction);
      return true;
    }
    if (key.isFastForward || key.isRewind) {
      seekController.releaseKey(key.isRewind ? "rewind" : "forward");
      return true;
    }
    if (key.isSelect && selectedHoldSource) {
      const source = selectedHoldSource;
      selectedHoldSource = null;
      if (seekController.releaseHold(source)) {
        return true;
      } else {
        source.click();
      }
      return true;
    }
    return false;
  }

  function suppressNextClick(source) {
    suppressScrubClick = source;
    window.clearTimeout(suppressClickTimer);
    suppressClickTimer = window.setTimeout(function () {
      suppressScrubClick = null;
    }, 500);
  }

  const playback = createPlaybackService(video, {
    onStatus(message) {
      showStatus(message, message === "Loading stream...");
      if (message === "Loading stream...") {
        showLoader("Loading movie...");
      }
    },
    onState(state) {
      updatePlaybackControl(state);
    },
    onVolumeChange(muted, volume) {
      updateSoundControl(muted, volume);
    },
    onTimelineChange() {
      if (!seeking) {
        updateTimeline();
      }
      updateSubtitleDisplay();
    },
    onAutoplayBlocked() {
      autoplayBlocked = true;
      hideLoader();
      playButton.hidden = false;
      showControls(false);
    },
    onError(message) {
      autoplayBlocked = false;
      hideLoader();
      playButton.hidden = true;
      stage.classList.add("playback-error");
      showStatus(message, true);
      scheduleHide();
    },
    onPlaying() {
      mediaStarted = true;
      autoplayBlocked = false;
      hideLoader();
      playButton.hidden = true;
      stage.classList.remove("playback-error");
      status.dataset.visible = "false";
      scheduleHide();
      updateSubtitleDisplay();
    },
    onWaiting() {
      showLoader("Buffering...");
      scheduleHide();
    },
    onEnded() {
      showControls(true);
    }
  });

  const seekController = createSeekController({
    getRange: playback.getRange,
    getCurrentTime: playback.getCurrentTime,
    onPreview(progress) {
      updateTimeline(progress);
      const range = playback.getRange();
      if (range && Number.isFinite(progress)) {
        const previewTime = range.start + Math.max(0, Math.min(1, progress)) * (range.end - range.start);
        updateSubtitleDisplay(previewTime);
      }
    },
    onCommit(time) {
      playback.seek(time);
      updateTimeline();
      updateSubtitleDisplay(time);
    }
  });

  const rewindButton = root.querySelector("#rewind-button");
  const forwardButton = root.querySelector("#forward-button");
  const seekButtons = [
    { element: rewindButton, direction: -1 },
    { element: forwardButton, direction: 1 }
  ];

  seekButtons.forEach(function (item) {
    listen(item.element, "click", function () {
      if (suppressScrubClick === item.element) {
        suppressScrubClick = null;
        window.clearTimeout(suppressClickTimer);
        return;
      }
      seekController.seekBy(item.direction * 10);
    });
    listen(item.element, "pointerdown", function () {
      pointerSeekSource = item.element;
      seekController.startHold(item.direction, item.element, 220);
    });
  });
  listen(document, "pointerup", function () {
    if (!pointerSeekSource) {
      return;
    }
    const source = pointerSeekSource;
    pointerSeekSource = null;
    if (seekController.releaseHold(source)) {
      suppressNextClick(source);
    }
  });

  listen(togglePlayButton, "click", function () {
    playback.toggle();
  });
  listen(root.querySelector(".home-return-button"), "click", function () {
    onBackRequest();
  });
  listen(root.querySelector("#volume-down-button"), "click", function () {
    changeVolume(-0.1);
  });
  listen(root.querySelector("#volume-up-button"), "click", function () {
    changeVolume(0.1);
  });
  listen(seekBar, "input", function () {
    seeking = true;
    const range = playback.getRange();
    if (range) {
      seekController.setPreview(Number(seekBar.value) / 1000);
    }
  });
  listen(seekBar, "change", function () {
    seeking = false;
    seekController.commitPreview();
    updateTimeline();
  });
  listen(seekBar, "pointerdown", function () {
    seeking = true;
  });
  listen(seekBar, "pointerup", function () {
    seeking = false;
    seekController.commitPreview();
  });
  listen(controls, "focusin", function () {
    showControls(false);
    scheduleHide();
  });
  listen(controls, "click", function (event) {
    event.stopPropagation();
    showControls(false);
    scheduleHide();
  });
  const topbar = root.querySelector(".topbar");
  if (topbar) {
    listen(topbar, "click", function (event) {
      event.stopPropagation();
      showControls(false);
      scheduleHide();
    });
  }
  let lastMouseX = -1;
  let lastMouseY = -1;
  listen(stage, "mousemove", function (event) {
    if (Date.now() - lastTapTime < 500) {
      return;
    }
    if (event && event.clientX === lastMouseX && event.clientY === lastMouseY) {
      return;
    }
    if (event) {
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
    }
    if (!controlsVisible) {
      showControls(false);
    }
    scheduleHide();
  });
  listen(tapZoneLeft, "click", function (event) {
    event.stopPropagation();
    handleStageTap("left");
  });
  listen(tapZoneRight, "click", function (event) {
    event.stopPropagation();
    handleStageTap("right");
  });
  listen(stage, "click", function (event) {
    if (event.target === video || event.target === stage) {
      handleStageTap("center");
    }
  });
  listen(playButton, "click", function () {
    playButton.hidden = true;
    autoplayBlocked = false;
    showLoader("Loading movie...");
    playback.play();
  });
  listen(video, "timeupdate", function () {
    updateSubtitleDisplay();
  });
  listen(video, "seeking", function () {
    updateSubtitleDisplay();
  });
  listen(video, "seeked", function () {
    updateSubtitleDisplay();
    if (video.readyState >= 3) {
      hideLoader();
    }
  });
  listen(video, "waiting", function () {
    showLoader("Buffering...");
  });
  listen(video, "canplay", function () {
    hideLoader();
  });
  listen(video, "playing", function () {
    hideLoader();
  });
  listen(video, "loadstart", function () {
    showLoader("Loading movie...");
  });
  listen(subtitleButton, "click", function () {
    if (!subtitleCues || subtitleCues.length === 0) {
      return;
    }
    subtitlesEnabled = !subtitlesEnabled;
    subtitleButton.setAttribute("aria-pressed", String(subtitlesEnabled));
    if (subtitlesEnabled) {
      subtitleButton.classList.add("is-active");
      subtitleButton.setAttribute("aria-label", "Turn subtitles off");
      subtitleLabel.textContent = "Subs ON";
      updateSubtitleDisplay();
      showStatus("Subtitles turned on");
    } else {
      subtitleButton.classList.remove("is-active");
      subtitleButton.setAttribute("aria-label", "Turn subtitles on");
      subtitleLabel.textContent = "Subs OFF";
      renderSubtitles("");
      showStatus("Subtitles turned off");
    }
  });
  listen(fullscreenButton, "click", function () {
    toggleFullscreen();
  });
  listen(document, "fullscreenchange", updateFullscreenControl);
  listen(document, "webkitfullscreenchange", updateFullscreenControl);
  listen(document, "mozfullscreenchange", updateFullscreenControl);
  listen(document, "MSFullscreenChange", updateFullscreenControl);
  listen(video, "webkitbeginfullscreen", updateFullscreenControl);
  listen(video, "webkitendfullscreen", updateFullscreenControl);
  listen(stage, "dblclick", function (event) {
    if (event.target === video || event.target === stage) {
      toggleFullscreen();
    }
  });
  listen(window, "blur", function () {
    seekController.commitPreview();
  });
  listen(document, "visibilitychange", function () {
    if (document.hidden) {
      seekController.commitPreview();
    }
  });

  updateSoundControl(video.muted, video.volume);
  updatePlaybackControl({ paused: video.paused });
  updateTimeline();
  initSubtitles();
  updateFullscreenControl();
  showLoader("Loading movie...");
  playback.start(movie.m3u8);
  scheduleHide();

  return {
    onKeyDown,
    onKeyUp,
    destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      hideLoader();
      unlockLandscape();
      if (isFullscreenActive()) {
        try {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) {
            exit.call(document);
          }
        } catch (_) {}
      }
      window.clearTimeout(statusTimer);
      window.clearTimeout(controlsTimer);
      window.clearTimeout(volumeHudTimer);
      window.clearTimeout(suppressClickTimer);
      window.clearTimeout(singleClickTimer);
      window.clearTimeout(feedbackTimer);
      subtitleService.cancel();
      subtitleCues = [];
      renderSubtitles("");
      seekController.destroy();
      cleanups.forEach(function (cleanup) {
        cleanup();
      });
      playback.destroy();
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
    }
  };
}
