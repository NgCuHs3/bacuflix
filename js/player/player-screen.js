import { createPlaybackService } from "./playback-service.js";
import { createSeekController } from "./seek-controller.js";
import { createSubtitleService } from "./subtitle-service.js";
import { getActiveSubtitleText } from "./subtitle-parser.js";
import { activateFocusedElement, focusNext } from "../navigation/remote-navigation.js";
import { formatTime } from "../utils/format-time.js";
import { currentDevice } from "../utils/device.js";
import { buildEpisodeUrl, copyTextToClipboard } from "../utils/url.js";

const PLAY_ICON = '<svg class="control-icon" viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>';
const PAUSE_ICON = '<svg class="control-icon" viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6 5.5A1.5 1.5 0 0 1 7.5 4h1A1.5 1.5 0 0 1 10 5.5v13A1.5 1.5 0 0 1 8.5 20h-1A1.5 1.5 0 0 1 6 18.5v-13zm8 0A1.5 1.5 0 0 1 15.5 4h1a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-13z"/></svg>';

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
    '<div class="now-playing">' +
    '<span class="eyebrow"><span class="live-dot"></span> NOW PLAYING</span>' +
    '<span class="now-playing-title"></span>' +
    '</div></header>' +
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
    '<button id="prev-episode-button" class="control-button" type="button" aria-label="Tập trước">' +
    '<span class="control-symbol" aria-hidden="true"><svg class="control-icon" viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style="fill: currentColor; stroke: none;"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/></svg></span>' +
    '<span class="control-caption">Tập trước</span></button>' +
    '<button id="rewind-button" class="control-button" type="button" aria-label="Rewind 10 seconds">' +
    '<span class="control-symbol" aria-hidden="true"><svg class="control-icon" viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="m15 18-6-6 6-6"/></svg></span>' +
    '<span class="control-caption">Back</span></button>' +
    '<button id="toggle-play-button" class="control-button primary-control" type="button" aria-label="Pause">' +
    '<span id="play-pause-symbol" class="control-symbol" aria-hidden="true">' + PAUSE_ICON + '</span>' +
    '<span id="play-pause-caption" class="control-caption">Pause</span></button>' +
    '<button id="forward-button" class="control-button" type="button" aria-label="Forward 10 seconds">' +
    '<span class="control-symbol" aria-hidden="true"><svg class="control-icon" viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="m9 18 6-6-6-6"/></svg></span>' +
    '<span class="control-caption">Forward</span></button>' +
    '<button id="next-episode-button" class="control-button" type="button" aria-label="Tập tiếp theo">' +
    '<span class="control-symbol" aria-hidden="true"><svg class="control-icon" viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style="fill: currentColor; stroke: none;"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></span>' +
    '<span class="control-caption">Tập tiếp</span></button>' +
    '<button id="share-button" class="control-button compact-control" type="button" aria-label="Chia sẻ tập phim">' +
    '<span class="control-symbol share-symbol" aria-hidden="true"><svg class="control-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span>' +
    '<span class="control-caption">Chia sẻ</span></button>' +
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
    '</div>' +
    '<div id="auto-next-overlay" class="auto-next-overlay" hidden aria-hidden="true">' +
    '<div class="auto-next-box">' +
    '<p class="auto-next-label">TẬP TIẾP THEO</p>' +
    '<h3 id="auto-next-title" class="auto-next-title"></h3>' +
    '<p class="auto-next-countdown">Tự động phát sau <span id="auto-next-timer">5</span>s</p>' +
    '<div class="auto-next-actions">' +
    '<button id="auto-next-now" type="button" class="home-action primary-home-action auto-next-btn">Phát ngay</button>' +
    '<button id="auto-next-cancel" type="button" class="home-action secondary-home-action auto-next-btn">Hủy</button>' +
    '</div></div></div>' +
    '</section>';
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
  const prevEpisodeButton = root.querySelector("#prev-episode-button");
  const nextEpisodeButton = root.querySelector("#next-episode-button");
  const autoNextOverlay = root.querySelector("#auto-next-overlay");
  const autoNextTitle = root.querySelector("#auto-next-title");
  const autoNextTimer = root.querySelector("#auto-next-timer");
  const autoNextNowBtn = root.querySelector("#auto-next-now");
  const autoNextCancelBtn = root.querySelector("#auto-next-cancel");
  let currentMovie = movie;
  let episodesList = Array.isArray(movie.episodesList) ? movie.episodesList : [];
  let currentEpisodeIndex = (typeof movie.currentEpisodeIndex === "number") ? movie.currentEpisodeIndex : 0;
  let autoNextCountdownTimer = 0;
  let autoNextRemainingSec = 0;
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
  let pendingSeekTime = null;
  let ignoreTimelineUntil = 0;
  let seekCommitTimer = 0;
  let lastDirectCommitTime = 0;
  let lastDirectCommitValue = "";

  function getEffectiveCurrentTime() {
    if (pendingSeekTime !== null && Date.now() < ignoreTimelineUntil) {
      return pendingSeekTime;
    }
    return playback.getCurrentTime();
  }

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

  function showSeekFeedback(side, percentageOrSeconds, deltaSeconds, targetTime) {
    if (disposed) {
      return;
    }
    const overlay = side === "left" ? seekOverlayLeft : seekOverlayRight;
    const otherOverlay = side === "left" ? seekOverlayRight : seekOverlayLeft;
    const textEl = overlay.querySelector(".seek-feedback-text");

    otherOverlay.classList.remove("is-active");

    let text = "";
    if (typeof percentageOrSeconds === "number" && typeof deltaSeconds === "number") {
      const pct = Math.round(percentageOrSeconds);
      const sign = deltaSeconds >= 0 ? "+" : "";
      if (typeof targetTime === "number" && Number.isFinite(targetTime)) {
        text = pct + "% · " + formatTime(targetTime) + " (" + sign + deltaSeconds + "s)";
      } else {
        text = pct + "% (" + sign + deltaSeconds + "s)";
      }
    } else {
      text = Math.abs(percentageOrSeconds) + " seconds";
    }

    textEl.textContent = text;

    if (!overlay.classList.contains("is-active")) {
      overlay.classList.add("is-active");
    }

    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(function () {
      overlay.classList.remove("is-active");
      cumulativeSeconds = 0;
      lastTapSide = null;
    }, 850);
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
    playPauseSymbol.innerHTML = state.paused ? PLAY_ICON : PAUSE_ICON;
  }

  function updateTimeline(previewProgress) {
    const range = playback.getRange();
    if (!range || range.end <= range.start) {
      seekBar.disabled = true;
      seekBar.value = "0";
      seekBar.style.setProperty("--seek-progress", "0%");
      seekBar.style.backgroundImage = "linear-gradient(to right, #e50914 0%, #e50914 0%, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.28) 100%)";
      currentTimeLabel.textContent = formatTime(playback.getCurrentTime());
      durationLabel.textContent = formatTime(video.duration);
      return;
    }

    seekBar.disabled = false;
    const progress = Number.isFinite(previewProgress)
      ? Math.max(0, Math.min(1, previewProgress))
      : Math.max(0, Math.min(1, (getEffectiveCurrentTime() - range.start) / (range.end - range.start)));
    const percentage = progress * 100;
    const pctStr = percentage.toFixed(2) + "%";
    seekBar.style.setProperty("--seek-progress", pctStr);
    seekBar.style.backgroundImage = "linear-gradient(to right, #e50914 0%, #e50914 " + pctStr + ", rgba(255, 255, 255, 0.28) " + pctStr + ", rgba(255, 255, 255, 0.28) 100%)";
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

  function updateNextButtonState() {
    const hasMultiple = episodesList && episodesList.length > 1;
    if (prevEpisodeButton) {
      const hasPrev = hasMultiple && currentEpisodeIndex > 0;
      if (!hasMultiple) {
        prevEpisodeButton.hidden = true;
        prevEpisodeButton.style.display = "none";
      } else {
        prevEpisodeButton.hidden = false;
        prevEpisodeButton.style.display = "";
        prevEpisodeButton.disabled = !hasPrev;
        if (hasPrev) {
          const prevEp = episodesList[currentEpisodeIndex - 1];
          prevEpisodeButton.setAttribute("aria-label", "Tập trước: " + prevEp.name);
          prevEpisodeButton.title = "Phát tập trước: " + prevEp.name;
        } else {
          prevEpisodeButton.setAttribute("aria-label", "Đang ở tập đầu");
          prevEpisodeButton.title = "Đang ở tập đầu";
        }
      }
    }
    if (!nextEpisodeButton) {
      return;
    }
    const hasNext = hasMultiple && (currentEpisodeIndex + 1 < episodesList.length);
    if (!hasMultiple) {
      nextEpisodeButton.hidden = true;
      nextEpisodeButton.style.display = "none";
    } else {
      nextEpisodeButton.hidden = false;
      nextEpisodeButton.style.display = "";
      nextEpisodeButton.disabled = !hasNext;
      if (hasNext) {
        const nextEp = episodesList[currentEpisodeIndex + 1];
        nextEpisodeButton.setAttribute("aria-label", "Tập tiếp theo: " + nextEp.name);
        nextEpisodeButton.title = "Phát tiếp: " + nextEp.name;
      } else {
        nextEpisodeButton.setAttribute("aria-label", "Đã đến tập cuối");
        nextEpisodeButton.title = "Đã đến tập cuối";
      }
    }
  }

  function cancelAutoNext() {
    if (autoNextCountdownTimer) {
      window.clearInterval(autoNextCountdownTimer);
      autoNextCountdownTimer = 0;
    }
    if (autoNextOverlay) {
      autoNextOverlay.hidden = true;
      autoNextOverlay.setAttribute("aria-hidden", "true");
    }
  }

  function startAutoNextCountdown() {
    cancelAutoNext();
    if (!episodesList || episodesList.length <= 1 || (currentEpisodeIndex + 1 >= episodesList.length) || disposed) {
      return;
    }
    const nextEp = episodesList[currentEpisodeIndex + 1];
    if (!nextEp) {
      return;
    }
    autoNextRemainingSec = 5;
    if (autoNextTitle) {
      autoNextTitle.textContent = nextEp.name;
    }
    if (autoNextTimer) {
      autoNextTimer.textContent = String(autoNextRemainingSec);
    }
    if (autoNextOverlay) {
      autoNextOverlay.hidden = false;
      autoNextOverlay.setAttribute("aria-hidden", "false");
    }
    if (autoNextNowBtn) {
      autoNextNowBtn.focus();
    }
    autoNextCountdownTimer = window.setInterval(function () {
      if (disposed) {
        cancelAutoNext();
        return;
      }
      autoNextRemainingSec -= 1;
      if (autoNextTimer) {
        autoNextTimer.textContent = String(Math.max(0, autoNextRemainingSec));
      }
      if (autoNextRemainingSec <= 0) {
        cancelAutoNext();
        playEpisode(currentEpisodeIndex + 1);
      }
    }, 1000);
  }

  function playEpisode(index) {
    if (index < 0 || !episodesList || index >= episodesList.length || disposed) {
      return;
    }
    cancelAutoNext();
    seekController.cancel();
    window.clearTimeout(seekCommitTimer);
    seekCommitTimer = 0;
    pendingSeekTime = null;
    ignoreTimelineUntil = 0;
    seeking = false;
    currentEpisodeIndex = index;
    const ep = episodesList[index];
    const streamUrl = ep.m3u8 || ep.fallbackEmbed;
    if (!streamUrl) {
      showStatus("Không tìm thấy đường dẫn phát cho " + ep.name);
      return;
    }
    const seriesTitle = currentMovie.seriesTitle || (currentMovie.title ? currentMovie.title.split(" - ")[0] : "Phim");
    const newFullTitle = seriesTitle + " - " + ep.name;
    currentMovie.title = newFullTitle;
    currentMovie.m3u8 = streamUrl;
    currentMovie.currentEpisodeIndex = index;
    if (nowPlayingTitle) {
      nowPlayingTitle.textContent = newFullTitle;
    }
    mediaStarted = false;
    autoplayBlocked = false;
    playButton.hidden = true;
    showLoader("Đang tải " + ep.name + "...");
    showStatus("Đang phát " + ep.name);
    const wasFocusedOnPrev = document.activeElement === prevEpisodeButton;
    const wasFocusedOnNext = document.activeElement === nextEpisodeButton;
    updateNextButtonState();
    if (wasFocusedOnPrev && (!prevEpisodeButton || prevEpisodeButton.disabled || prevEpisodeButton.hidden)) {
      if (nextEpisodeButton && !nextEpisodeButton.disabled && !nextEpisodeButton.hidden) {
        nextEpisodeButton.focus();
      } else {
        togglePlayButton.focus();
      }
    } else if (wasFocusedOnNext && (!nextEpisodeButton || nextEpisodeButton.disabled || nextEpisodeButton.hidden)) {
      if (prevEpisodeButton && !prevEpisodeButton.disabled && !prevEpisodeButton.hidden) {
        prevEpisodeButton.focus();
      } else {
        togglePlayButton.focus();
      }
    }
    updateTimeline(0);
    if (typeof window !== "undefined" && window.history && window.history.replaceState) {
      const epNum = index + 1;
      const movieSlug = currentMovie.slug || currentMovie.id;
      if (movieSlug) {
        try {
          window.history.replaceState({ screen: "player", movieSlug: movieSlug, ep: epNum }, "", buildEpisodeUrl(movieSlug, epNum));
        } catch (_) {}
      }
    }
    playback.start(streamUrl);
    scheduleHide(3000);
  }

  function getControlButtons() {
    return Array.prototype.slice.call(
      controls.querySelectorAll("button:not([disabled]):not([hidden])")
    ).filter(function (btn) {
      return btn.style.display !== "none";
    });
  }

  function focusControl(direction) {
    const buttons = getControlButtons();
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
    if (autoNextOverlay && !autoNextOverlay.hidden) {
      if (key.isBack || key.isEscape) {
        cancelAutoNext();
        showControls(true);
        return true;
      }
      if (key.isSelect) {
        if (document.activeElement === autoNextCancelBtn) {
          cancelAutoNext();
          showControls(true);
        } else {
          cancelAutoNext();
          playEpisode(currentEpisodeIndex + 1);
        }
        return true;
      }
      if (key.direction === "left" || key.direction === "right") {
        if (document.activeElement === autoNextCancelBtn) {
          autoNextNowBtn.focus();
        } else {
          autoNextCancelBtn.focus();
        }
        return true;
      }
      return true;
    }
    if (key.isBack) {
      if (key.isRepeat) {
        return true;
      }
      seekController.commitPreview();
      onBackRequest();
      return true;
    }

    const wasControlsVisible = controlsVisible;
    if (!controlsVisible) {
      if (key.direction === "left" || key.direction === "right") {
        showControls(false);
        seekBar.focus();
      } else {
        showControls(true);
      }
    }
    scheduleHide();
    const target = document.activeElement;
    const inControls = controls.contains(target);

    if (key.direction === "left" || key.direction === "right") {
      if (wasControlsVisible && inControls && target !== seekBar && !seekController.isScrubbing()) {
        focusControl(key.direction);
        return true;
      }
      if (target !== seekBar) {
        seekBar.focus();
      }
      const wasScrubbing = seekController.isScrubbing();
      seekController.pressKey(key.direction === "left" ? -1 : 1, key.direction);
      if (!wasScrubbing) {
        showControls(false);
        scheduleHide();
      }
      return true;
    }
    if (key.direction === "up" || key.direction === "down") {
      if (!wasControlsVisible) {
        togglePlayButton.focus();
        return true;
      }
      if (inControls) {
        focusControl(key.direction);
      } else {
        togglePlayButton.focus();
      }
      return true;
    }

    if (key.isFastForward || key.isRewind) {
      const wasScrubbing = seekController.isScrubbing();
      seekController.pressKey(key.isRewind ? -1 : 1, key.isRewind ? "rewind" : "forward");
      if (!wasScrubbing) {
        showControls(false);
        scheduleHide();
      }
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
        seekController.pressKey(target.id === "rewind-button" ? -1 : 1, target.id);
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
      if (seekController.isScrubbing()) {
        seekController.releaseKey(key.direction);
      }
      return true;
    }
    if (key.isFastForward || key.isRewind) {
      seekController.releaseKey(key.isRewind ? "rewind" : "forward");
      return true;
    }
    if (key.isSelect && selectedHoldSource) {
      const source = selectedHoldSource;
      selectedHoldSource = null;
      seekController.releaseKey(source.id);
      suppressNextClick(source);
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
      if (!seeking && !video.seeking && !seekController.isScrubbing() && Date.now() >= ignoreTimelineUntil) {
        updateTimeline();
      }
      if (!seekController.isScrubbing()) {
        updateSubtitleDisplay();
      }
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
      if (!seekController.isScrubbing()) {
        updateSubtitleDisplay();
      }
    },
    onWaiting() {
      showLoader("Buffering...");
      scheduleHide();
    },
    onEnded() {
      showControls(true);
      if (episodesList && episodesList.length > 1 && currentEpisodeIndex + 1 < episodesList.length) {
        startAutoNextCountdown();
      }
    }
  });

  const seekController = createSeekController({
    getRange: playback.getRange,
    getCurrentTime: getEffectiveCurrentTime,
    onPreview(progress, time, meta) {
      updateTimeline(progress);
      const range = playback.getRange();
      if (range && Number.isFinite(progress)) {
        const previewTime = range.start + Math.max(0, Math.min(1, progress)) * (range.end - range.start);
        updateSubtitleDisplay(previewTime);
      }
      if (meta && meta.direction) {
        const side = meta.direction < 0 ? "left" : "right";
        showSeekFeedback(side, meta.percentage, meta.deltaSeconds, time);
      }
    },
    onCommit(time, meta) {
      pendingSeekTime = time;
      ignoreTimelineUntil = Date.now() + 1200;
      const range = playback.getRange();
      const progress = (range && range.end > range.start)
        ? Math.max(0, Math.min(1, (time - range.start) / (range.end - range.start)))
        : (meta && Number.isFinite(meta.percentage) ? meta.percentage / 100 : undefined);
      updateTimeline(progress);
      updateSubtitleDisplay(time);
      if (meta && meta.direction && !meta.isDirect) {
        const side = meta.direction < 0 ? "left" : "right";
        showSeekFeedback(side, meta.percentage, meta.deltaSeconds, time);
      }
      window.clearTimeout(seekCommitTimer);
      if (meta && meta.isTap) {
        seekCommitTimer = window.setTimeout(function () {
          seekCommitTimer = 0;
          if (!disposed) {
            ignoreTimelineUntil = Date.now() + 1200;
            playback.seek(time);
          }
        }, 180);
      } else {
        seekCommitTimer = 0;
        playback.seek(time);
      }
      scheduleHide();
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
      seekController.pressKey(item.direction, item.element.id);
      seekController.releaseKey(item.element.id);
    });
    listen(item.element, "pointerdown", function () {
      pointerSeekSource = item.element;
      seekController.pressKey(item.direction, item.element.id);
    });
  });
  listen(document, "pointerup", function () {
    if (!pointerSeekSource) {
      return;
    }
    const source = pointerSeekSource;
    pointerSeekSource = null;
    seekController.releaseKey(source.id);
    suppressNextClick(source);
  });

  const shareButton = root.querySelector("#share-button");
  if (shareButton) {
    listen(shareButton, "click", function () {
      const epNum = currentEpisodeIndex + 1;
      const movieSlug = currentMovie.slug || currentMovie.id;
      const shareUrl = buildEpisodeUrl(movieSlug, epNum);
      copyTextToClipboard(shareUrl).then(function (success) {
        showStatus(success ? "Đã sao chép link tập " + epNum + "!" : "Không thể sao chép liên kết.");
      });
    });
  }

  listen(togglePlayButton, "click", function () {
    playback.toggle();
  });
  if (prevEpisodeButton) {
    listen(prevEpisodeButton, "click", function () {
      if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
      }
    });
  }
  if (nextEpisodeButton) {
    listen(nextEpisodeButton, "click", function () {
      if (currentEpisodeIndex + 1 < episodesList.length) {
        playEpisode(currentEpisodeIndex + 1);
      }
    });
  }
  if (autoNextNowBtn) {
    listen(autoNextNowBtn, "click", function () {
      cancelAutoNext();
      if (currentEpisodeIndex + 1 < episodesList.length) {
        playEpisode(currentEpisodeIndex + 1);
      }
    });
  }
  if (autoNextCancelBtn) {
    listen(autoNextCancelBtn, "click", function () {
      cancelAutoNext();
      showControls(true);
    });
  }
  listen(root.querySelector(".home-return-button"), "click", function () {
    onBackRequest();
  });
  listen(root.querySelector("#volume-down-button"), "click", function () {
    changeVolume(-0.1);
  });
  listen(root.querySelector("#volume-up-button"), "click", function () {
    changeVolume(0.1);
  });
  function commitSeekBarValue() {
    if (seekController.isScrubbing() && !seeking) {
      return;
    }
    seeking = false;
    const now = Date.now();
    const currentVal = String(seekBar.value);
    if (now - lastDirectCommitTime < 80 && currentVal === lastDirectCommitValue) {
      return;
    }
    lastDirectCommitTime = now;
    lastDirectCommitValue = currentVal;
    const range = playback.getRange();
    if (range) {
      seekController.setPreview(Number(seekBar.value) / 1000);
    }
    seekController.commitPreview();
  }

  listen(seekBar, "keydown", function (event) {
    const k = event.key || "";
    if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" || k === "Left" || k === "Right" || k === "Up" || k === "Down") {
      event.preventDefault();
    }
  });
  listen(seekBar, "input", function () {
    if (seekController.isScrubbing() && !seeking) {
      return;
    }
    seeking = true;
    const range = playback.getRange();
    if (range) {
      seekController.setPreview(Number(seekBar.value) / 1000);
    }
  });
  listen(seekBar, "change", function () {
    commitSeekBarValue();
  });
  listen(seekBar, "pointerdown", function () {
    seeking = true;
  });
  listen(seekBar, "pointerup", function () {
    commitSeekBarValue();
  });
  listen(seekBar, "click", function () {
    commitSeekBarValue();
  });
  const timeline = root.querySelector(".timeline");
  if (timeline) {
    listen(timeline, "click", function (event) {
      if (event.target === currentTimeLabel || event.target === durationLabel || event.target === seekBar) {
        return;
      }
      const rect = seekBar.getBoundingClientRect();
      if (rect.width > 0) {
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        seekBar.value = String(Math.round(ratio * 1000));
        commitSeekBarValue();
      }
    });
  }
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
  listen(video, "seeked", function () {
    if (!seekCommitTimer && !seekController.isScrubbing()) {
      pendingSeekTime = null;
      ignoreTimelineUntil = 0;
    }
    if (!seekController.isScrubbing()) {
      updateSubtitleDisplay();
    }
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
  updateNextButtonState();
  showLoader("Loading movie...");
  playback.start(movie.m3u8);
  togglePlayButton.focus();
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
            const p = exit.call(document);
            if (p && typeof p.catch === "function") {
              p.catch(function () {});
            }
          }
        } catch (_) {}
      }
      window.clearTimeout(statusTimer);
      window.clearTimeout(controlsTimer);
      window.clearTimeout(volumeHudTimer);
      window.clearTimeout(suppressClickTimer);
      window.clearTimeout(singleClickTimer);
      window.clearTimeout(feedbackTimer);
      window.clearTimeout(seekCommitTimer);
      subtitleService.cancel();
      subtitleCues = [];
      renderSubtitles("");
      cancelAutoNext();
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
