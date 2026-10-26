import { createPlaybackService } from "./playback-service.js";
import { createSeekController } from "./seek-controller.js";
import { activateFocusedElement, focusNext } from "../navigation/remote-navigation.js";
import { formatTime } from "../utils/format-time.js";

function playerMarkup(movie) {
  return '<section id="video-stage" class="video-stage controls-visible" aria-label="Video player">' +
    '<div class="cinema-shade" aria-hidden="true"></div>' +
    '<video id="video" autoplay playsinline preload="auto" aria-label="BACUFlix video playback"></video>' +
    '<header class="topbar ui-overlay">' +
    '<a class="brand" href="#" aria-label="BACUFlix home"><img src="icon.png" alt="">' +
    '<span>BACU<span class="brand-accent">Flix</span></span></a>' +
    '<span class="stream-label"><span class="live-dot"></span> NOW PLAYING</span></header>' +
    '<div class="bottom-bar ui-overlay"><div class="now-playing">' +
    '<span class="eyebrow">NOW PLAYING</span><span class="now-playing-title"></span>' +
    '</div></div>' +
    '<p id="status" class="status" role="status" aria-live="polite">Loading stream...</p>' +
    '<div id="volume-hud" class="volume-hud" role="status" aria-live="polite" aria-hidden="true">' +
    '<span id="volume-hud-icon" class="volume-hud-icon" aria-hidden="true">♪</span>' +
    '<div class="volume-hud-track" aria-hidden="true"><div id="volume-hud-level" class="volume-hud-level"></div></div>' +
    '<span id="volume-hud-percent" class="volume-hud-percent">100%</span></div>' +
    '<button id="play-button" class="play-button" type="button" hidden>' +
    '<span class="play-icon" aria-hidden="true"></span><span>Play with sound</span></button>' +
    '<div id="controls" class="control-panel ui-overlay" aria-label="Playback controls">' +
    '<label class="timeline"><span id="current-time" class="time-label">0:00</span>' +
    '<input id="seek-bar" type="range" min="0" max="1000" value="0" aria-label="Seek">' +
    '<span id="duration" class="time-label">0:00</span></label>' +
    '<div class="control-row">' +
    '<button id="rewind-button" class="control-button" type="button" aria-label="Rewind 10 seconds">' +
    '<span class="control-symbol rewind-symbol" aria-hidden="true">10</span><span class="control-caption">Back</span></button>' +
    '<button id="toggle-play-button" class="control-button primary-control" type="button" aria-label="Pause">' +
    '<span id="play-pause-symbol" class="control-symbol" aria-hidden="true">Ⅱ</span>' +
    '<span id="play-pause-caption" class="control-caption">Pause</span></button>' +
    '<button id="forward-button" class="control-button" type="button" aria-label="Forward 10 seconds">' +
    '<span class="control-symbol forward-symbol" aria-hidden="true">10</span><span class="control-caption">Forward</span></button>' +
    '<span class="control-divider" aria-hidden="true"></span>' +
    '<button id="volume-down-button" class="control-button compact-control" type="button" aria-label="Volume down">' +
    '<span class="control-symbol volume-symbol" aria-hidden="true">−</span><span class="control-caption">Vol −</span></button>' +
    '<button id="sound-toggle" class="control-button compact-control" type="button" aria-pressed="false" aria-label="Mute">' +
    '<span id="sound-symbol" class="control-symbol" aria-hidden="true">♪</span><span id="sound-label" class="control-caption">Mute</span></button>' +
    '<button id="volume-up-button" class="control-button compact-control" type="button" aria-label="Volume up">' +
    '<span class="control-symbol volume-symbol" aria-hidden="true">+</span><span class="control-caption">Vol +</span></button>' +
    '<button id="fullscreen-button" class="control-button compact-control" type="button" aria-label="Toggle fullscreen">' +
    '<span class="control-symbol fullscreen-symbol" aria-hidden="true">□</span><span class="control-caption">Full screen</span></button>' +
    '</div><p class="remote-hint">← → Move / seek · ↑ ↓ Switch controls · Volume keys adjust sound · Back twice for library</p>' +
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
  const soundToggle = root.querySelector("#sound-toggle");
  const soundLabel = root.querySelector("#sound-label");
  const soundSymbol = root.querySelector("#sound-symbol");
  const volumeHud = root.querySelector("#volume-hud");
  const volumeHudIcon = root.querySelector("#volume-hud-icon");
  const volumeHudLevel = root.querySelector("#volume-hud-level");
  const volumeHudPercent = root.querySelector("#volume-hud-percent");
  const nowPlayingTitle = root.querySelector(".now-playing-title");
  const cleanups = [];
  let statusTimer = 0;
  let controlsTimer = 0;
  let volumeHudTimer = 0;
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

  function updateSoundControl(muted, volume) {
    const percentage = muted ? 0 : Math.round(volume * 100);
    soundToggle.setAttribute("aria-pressed", String(muted));
    soundToggle.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    soundLabel.textContent = muted ? "Unmute" : "Mute";
    soundSymbol.textContent = muted ? "×" : "♪";
    soundToggle.classList.toggle("is-muted", muted);
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
      currentTimeLabel.textContent = formatTime(playback.getCurrentTime());
      durationLabel.textContent = formatTime(video.duration);
      return;
    }

    seekBar.disabled = false;
    const progress = Number.isFinite(previewProgress)
      ? Math.max(0, Math.min(1, previewProgress))
      : Math.max(0, Math.min(1, (playback.getCurrentTime() - range.start) / (range.end - range.start)));
    const percentage = progress * 100;
    seekBar.style.setProperty("--seek-progress", percentage + "%");
    seekBar.value = String(Math.round(percentage * 10));
    currentTimeLabel.textContent = formatTime(progress * (range.end - range.start));
    durationLabel.textContent = formatTime(range.end - range.start);
  }

  function showControls(focusPlayback) {
    window.clearTimeout(controlsTimer);
    controlsVisible = true;
    stage.classList.add("controls-visible");
    if (focusPlayback) {
      togglePlayButton.focus();
    }
  }

  function hideControls(force) {
    if (!force && (!mediaStarted || autoplayBlocked)) {
      return;
    }
    controlsVisible = false;
    stage.classList.remove("controls-visible");
  }

  function scheduleHide(delay) {
    window.clearTimeout(controlsTimer);
    controlsTimer = window.setTimeout(function () {
      hideControls(false);
    }, delay);
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
      showControls(false);
      onBackRequest(function () {
        showStatus("Press BACK again to return to BACUFlix");
        showControls(false);
      });
      return true;
    }

    if (!controlsVisible) {
      showControls(true);
    }
    scheduleHide(3000);
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
    },
    onAutoplayBlocked() {
      autoplayBlocked = true;
      playButton.hidden = false;
      showControls(false);
    },
    onError(message) {
      autoplayBlocked = false;
      playButton.hidden = true;
      stage.classList.add("playback-error");
      showStatus(message, true);
      scheduleHide(3000);
    },
    onPlaying() {
      mediaStarted = true;
      autoplayBlocked = false;
      playButton.hidden = true;
      stage.classList.remove("playback-error");
      status.dataset.visible = "false";
      scheduleHide(3000);
    },
    onWaiting() {
      showControls(false);
      scheduleHide(3000);
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
    },
    onCommit(time) {
      playback.seek(time);
      updateTimeline();
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
  listen(root.querySelector("#volume-down-button"), "click", function () {
    changeVolume(-0.1);
  });
  listen(root.querySelector("#volume-up-button"), "click", function () {
    changeVolume(0.1);
  });
  listen(soundToggle, "click", function () {
    playback.toggleMute();
    showVolumeHud();
    showStatus(video.muted ? "Sound off" : "Sound on");
  });
  listen(root.querySelector("#fullscreen-button"), "click", function () {
    const request = stage.requestFullscreen || stage.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (exit) {
        exit.call(document);
      }
    } else if (request) {
      const result = request.call(stage);
      if (result && typeof result.catch === "function") {
        result.catch(function (error) {
          console.error("Could not enter fullscreen:", error);
          showStatus("Full screen is unavailable.");
        });
      }
    } else {
      showStatus("Full screen is unavailable.");
    }
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
    scheduleHide(3000);
  });
  listen(controls, "click", function () {
    showControls(false);
    scheduleHide(3000);
  });
  listen(document, "mousemove", function () {
    if (!controlsVisible) {
      showControls(false);
    }
    scheduleHide(3000);
  });
  listen(document, "touchstart", function () {
    showControls(false);
    scheduleHide(3000);
  });
  listen(stage, "click", function (event) {
    if (event.target === video || event.target === stage) {
      if (!controlsVisible) {
        showControls(false);
        scheduleHide(3000);
      } else {
        playback.toggle();
        scheduleHide(3000);
      }
    }
  });
  listen(playButton, "click", function () {
    playButton.hidden = true;
    autoplayBlocked = false;
    playback.play();
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
  playback.start(movie.streamUrl);
  scheduleHide(3000);

  return {
    onKeyDown,
    onKeyUp,
    destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      window.clearTimeout(statusTimer);
      window.clearTimeout(controlsTimer);
      window.clearTimeout(volumeHudTimer);
      window.clearTimeout(suppressClickTimer);
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
