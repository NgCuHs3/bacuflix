(function (global) {
var moduleFactories = {};
var moduleCache = {};
function registerModule(id, factory) { moduleFactories[id] = factory; }
function requireModule(id) {
  if (moduleCache[id]) { return moduleCache[id]; }
  if (!moduleFactories[id]) { throw new Error('Unknown BACUFlix module: ' + id); }
  var exports = moduleFactories[id](requireModule);
  moduleCache[id] = exports;
  return exports;
}
registerModule("js/app.js", function (requireModule) {
var movieCatalog = requireModule("js/data/movie-catalog.js")["movieCatalog"];var createHomeScreen = requireModule("js/home/home-screen.js")["createHomeScreen"];var createDoubleBack = requireModule("js/navigation/double-back.js")["createDoubleBack"];var createRemoteNavigation = requireModule("js/navigation/remote-navigation.js")["createRemoteNavigation"];var createPlayerScreen = requireModule("js/player/player-screen.js")["createPlayerScreen"];
const root = document.getElementById("app");
const remoteNavigation = createRemoteNavigation();
const doubleBack = createDoubleBack(2200);
let activeScreen = null;
let disposed = false;

function clearScreen() {
  if (activeScreen) {
    activeScreen.destroy();
    activeScreen = null;
  }
  remoteNavigation.setScreen(null);
}

function showHome() {
  if (disposed) {
    return;
  }
  doubleBack.reset();
  clearScreen();
  activeScreen = createHomeScreen(root, movieCatalog, {
    onSelect: showPlayer,
    onBack: function () {
      doubleBack.handle(function () {
        activeScreen.showBackPrompt("Press BACK again to exit BACUFlix");
      }, function () {
        if (window.tizen && window.tizen.application) {
          window.tizen.application.getCurrentApplication().exit();
        }
      });
    }
  });
  remoteNavigation.setScreen(activeScreen);
}

function showPlayer(movie) {
  if (disposed) {
    return;
  }
  doubleBack.reset();
  clearScreen();
  activeScreen = createPlayerScreen(root, movie, function (showPrompt) {
    doubleBack.handle(showPrompt, showHome);
  });
  remoteNavigation.setScreen(activeScreen);
}

function onPageHide() {
  if (disposed) {
    return;
  }
  disposed = true;
  doubleBack.destroy();
  clearScreen();
  remoteNavigation.destroy();
  window.removeEventListener("pagehide", onPageHide);
}

window.addEventListener("pagehide", onPageHide);
showHome();

return {};
});
registerModule("js/data/movie-catalog.js", function (requireModule) {
const movieCatalog = [
  {
    id: "featured-stream",
    title: "Featured Stream",
    subtitle: "Your home cinema, ready to play.",
    description: "Settle in and enjoy the featured BACUFlix stream.",
    category: "Featured",
    streamUrl: "https://a.kvp726.com/20261016/pD1jsW6Z/3500kb/hls/index.m3u8",
    artwork: "icon.png"
  }
];

return {movieCatalog: movieCatalog};
});
registerModule("js/home/home-screen.js", function (requireModule) {
var activateFocusedElement = requireModule("js/navigation/remote-navigation.js")["activateFocusedElement"];
var focusNext = requireModule("js/navigation/remote-navigation.js")["focusNext"];
function makeButton(className, text, label) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = text;
  button.setAttribute("aria-label", label || text);
  return button;
}

function makeArtwork(movie, className) {
  const artwork = document.createElement("div");
  artwork.className = className;
  const image = document.createElement("img");
  image.src = movie.artwork;
  image.alt = "";
  artwork.appendChild(image);
  return artwork;
}

function createHomeScreen(root, movies, actionsHandler) {
  if (!movies.length) {
    throw new Error("The BACUFlix catalog must include at least one movie.");
  }

  const featured = movies[0];
  const screen = document.createElement("section");
  screen.className = "home-screen";
  screen.setAttribute("aria-label", "BACUFlix home");
  let toastTimer = 0;
  let infoTimer = 0;

  const header = document.createElement("header");
  header.className = "home-header";
  header.innerHTML =
    '<a class="home-brand" href="#" aria-label="BACUFlix home">' +
    '<img src="icon.png" alt=""><span>BACU<span>Flix</span></span></a>' +
    '<span class="home-nav-current">HOME</span>';
  header.querySelector(".home-brand").addEventListener("click", function (event) {
    event.preventDefault();
  });

  const hero = document.createElement("section");
  hero.className = "home-feature";
  const heroArt = makeArtwork(featured, "feature-artwork");
  heroArt.setAttribute("aria-hidden", "true");

  const featureCopy = document.createElement("div");
  featureCopy.className = "feature-copy";
  const category = document.createElement("span");
  category.className = "feature-category";
  category.textContent = featured.category || "FEATURED";
  const title = document.createElement("h1");
  title.textContent = featured.title;
  const subtitle = document.createElement("p");
  subtitle.className = "feature-subtitle";
  subtitle.textContent = featured.subtitle;
  const description = document.createElement("p");
  description.className = "feature-description";
  description.textContent = featured.description;
  const actions = document.createElement("div");
  actions.className = "feature-actions";
  actions.dataset.focusGroup = "feature";
  const play = makeButton("home-action primary-home-action", "▶  Play now", "Play " + featured.title);
  const info = makeButton("home-action secondary-home-action", "More info");
  info.addEventListener("click", function () {
    description.classList.toggle("is-emphasized");
    window.clearTimeout(infoTimer);
    infoTimer = window.setTimeout(function () {
      description.classList.remove("is-emphasized");
    }, 1800);
  });
  play.addEventListener("click", function () {
    actionsHandler.onSelect(featured);
  });
  actions.appendChild(play);
  actions.appendChild(info);
  featureCopy.appendChild(category);
  featureCopy.appendChild(title);
  featureCopy.appendChild(subtitle);
  featureCopy.appendChild(description);
  featureCopy.appendChild(actions);
  hero.appendChild(heroArt);
  hero.appendChild(featureCopy);

  const library = document.createElement("section");
  library.className = "home-library";
  const libraryHeading = document.createElement("h2");
  libraryHeading.textContent = "Watch on BACUFlix";
  const row = document.createElement("div");
  row.className = "movie-row";
  row.dataset.focusGroup = "library";

  movies.forEach(function (movie) {
    const card = makeButton("movie-card", "", "Play " + movie.title);
    card.dataset.movieId = movie.id;
    const artwork = makeArtwork(movie, "movie-artwork");
    const cardTitle = document.createElement("span");
    cardTitle.className = "movie-card-title";
    cardTitle.textContent = movie.title;
    card.appendChild(artwork);
    card.appendChild(cardTitle);
    card.addEventListener("click", function () {
      actionsHandler.onSelect(movie);
    });
    row.appendChild(card);
  });
  library.appendChild(libraryHeading);
  library.appendChild(row);

  const hint = document.createElement("p");
  hint.className = "home-remote-hint";
  hint.textContent = "Use the directional buttons to explore · Press OK to play";
  const toast = document.createElement("p");
  toast.className = "home-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;
  screen.appendChild(header);
  screen.appendChild(hero);
  screen.appendChild(library);
  screen.appendChild(hint);
  screen.appendChild(toast);
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }
  root.appendChild(screen);

  const groups = {
    feature: Array.prototype.slice.call(actions.querySelectorAll("button")),
    library: Array.prototype.slice.call(row.querySelectorAll("button"))
  };
  groups.feature[0].focus();

  function focusGroup(name, first) {
    const items = groups[name] || [];
    if (items.length) {
      (first ? items[0] : items[items.length - 1]).focus();
    }
  }

  return {
    onKeyDown(event, key) {
      if (key.isBack) {
        if (key.isRepeat) {
          return true;
        }
        actionsHandler.onBack();
        return true;
      }
      const active = document.activeElement;
      const all = groups.feature.concat(groups.library);
      if (key.direction === "left" || key.direction === "right") {
        focusNext(all, active, key.direction);
        return true;
      }
      if (key.direction === "up" || key.direction === "down") {
        if (groups.library.indexOf(active) !== -1 || active === groups.feature[0] || active === groups.feature[1]) {
          focusGroup(key.direction === "up" ? "feature" : "library", true);
        }
        return true;
      }
      if (key.isSelect) {
        activateFocusedElement(active);
        return true;
      }
      return false;
    },
    onKeyUp() {
      return false;
    },
    showBackPrompt(message) {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = window.setTimeout(function () {
        toast.hidden = true;
      }, 2200);
    },
    destroy() {
      window.clearTimeout(toastTimer);
      window.clearTimeout(infoTimer);
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
    }
  };
}

return {createHomeScreen: createHomeScreen};
});
registerModule("js/navigation/remote-navigation.js", function (requireModule) {
const MEDIA_KEYS = [
  "MediaPlayPause",
  "MediaPlay",
  "MediaPause",
  "MediaStop",
  "MediaFastForward",
  "MediaRewind",
  "VolumeUp",
  "VolumeDown",
  "VolumeMute"
];

function keyCode(event) {
  return event.keyCode || event.which || 0;
}

function normalizeRemoteKey(event) {
  const code = keyCode(event);
  const key = event.key;
  let direction = null;

  if (key === "ArrowLeft" || key === "Left" || code === 37) {
    direction = "left";
  } else if (key === "ArrowRight" || key === "Right" || code === 39) {
    direction = "right";
  } else if (key === "ArrowUp" || key === "Up" || code === 38) {
    direction = "up";
  } else if (key === "ArrowDown" || key === "Down" || code === 40) {
    direction = "down";
  }

  return {
    code,
    key,
    direction,
    isRepeat: event.repeat === true,
    isBack: key === "Back" || key === "BrowserBack" || key === "Escape" ||
      key === "XF86Back" || code === 10009 || code === 27 || code === 8,
    isSelect: key === "Enter" || key === " " || code === 13 || code === 32,
    isPlayPause: key === "MediaPlayPause" || code === 10252,
    isPlay: key === "MediaPlay" || code === 415,
    isPause: key === "MediaPause" || code === 19,
    isFastForward: key === "MediaFastForward" || code === 417,
    isRewind: key === "MediaRewind" || code === 412,
    isVolumeUp: key === "VolumeUp" || code === 447,
    isVolumeDown: key === "VolumeDown" || code === 448,
    isVolumeMute: key === "VolumeMute" || code === 449
  };
}

function focusNext(elements, active, direction) {
  if (!elements.length) {
    return;
  }
  const current = elements.indexOf(active);
  const next = current < 0 ? 0 : (current + (direction === "left" ? -1 : 1) + elements.length) % elements.length;
  elements[next].focus();
}

function activateFocusedElement(element) {
  if (element && typeof element.click === "function") {
    element.click();
  }
}

function createRemoteNavigation() {
  let activeScreen = null;

  function onKeyDown(event) {
    if (activeScreen && activeScreen.onKeyDown && activeScreen.onKeyDown(event, normalizeRemoteKey(event))) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onKeyUp(event) {
    if (activeScreen && activeScreen.onKeyUp && activeScreen.onKeyUp(event, normalizeRemoteKey(event))) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);

  if (window.tizen && window.tizen.tvinputdevice) {
    try {
      const supportedNames = window.tizen.tvinputdevice.getSupportedKeys().map(function (item) {
        return item.name;
      });
      const keys = MEDIA_KEYS.filter(function (name) {
        return supportedNames.indexOf(name) !== -1;
      });
      if (keys.length && window.tizen.tvinputdevice.registerKeyBatch) {
        window.tizen.tvinputdevice.registerKeyBatch(keys);
      } else {
        keys.forEach(function (name) {
          window.tizen.tvinputdevice.registerKey(name);
        });
      }
    } catch (error) {
      console.warn("Some media remote keys could not be registered:", error);
    }
  }

  return {
    setScreen(screen) {
      activeScreen = screen;
    },
    destroy() {
      activeScreen = null;
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
    }
  };
}

return {normalizeRemoteKey: normalizeRemoteKey, focusNext: focusNext, activateFocusedElement: activateFocusedElement, createRemoteNavigation: createRemoteNavigation};
});
registerModule("js/navigation/double-back.js", function (requireModule) {
function createDoubleBack(timeout, onReset) {
  let timer = 0;
  let pendingAction = null;

  function reset() {
    window.clearTimeout(timer);
    timer = 0;
    pendingAction = null;
    if (onReset) {
      onReset();
    }
  }

  return {
    handle(onPrompt, onConfirm) {
      if (pendingAction) {
        const action = pendingAction;
        reset();
        action();
        return;
      }

      pendingAction = onConfirm;
      if (onPrompt) {
        onPrompt();
      }
      timer = window.setTimeout(reset, timeout);
    },
    reset,
    destroy: reset
  };
}

return {createDoubleBack: createDoubleBack};
});
registerModule("js/player/player-screen.js", function (requireModule) {
var createPlaybackService = requireModule("js/player/playback-service.js")["createPlaybackService"];var createSeekController = requireModule("js/player/seek-controller.js")["createSeekController"];var activateFocusedElement = requireModule("js/navigation/remote-navigation.js")["activateFocusedElement"];
var focusNext = requireModule("js/navigation/remote-navigation.js")["focusNext"];var formatTime = requireModule("js/utils/format-time.js")["formatTime"];
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

function createPlayerScreen(root, movie, onBackRequest) {
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

return {createPlayerScreen: createPlayerScreen};
});
registerModule("js/player/playback-service.js", function (requireModule) {
function createPlaybackService(video, callbacks) {
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

  function reportFailure(message, error) {
    if (failed || destroyed) {
      return;
    }
    failed = true;
    if (error) {
      console.error("Video playback failed:", error);
    }
    if (hls) {
      hls.destroy();
      hls = null;
    }
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
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.src = sourceUrl;
    video.load();
    attemptPlayback();
    return true;
  }

  function onMediaError() {
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
      sourceUrl = url;
      failed = false;
      fallbackAttempted = false;
      video.muted = false;
      video.volume = 1;
      video.playsInline = true;
      video.autoplay = true;
      status("Loading stream...");

      if (window.Hls && window.Hls.isSupported()) {
        hls = new window.Hls();
        hls.on(window.Hls.Events.MEDIA_ATTACHED, function () {
          hls.loadSource(sourceUrl);
        });
        hls.on(window.Hls.Events.MANIFEST_PARSED, attemptPlayback);
        hls.on(window.Hls.Events.ERROR, function (_event, data) {
          if (!data.fatal) {
            return;
          }
          console.error("HLS playback error:", data);
          if (!useNativeHls(data.details)) {
            reportFailure("Stream error: " + data.details);
          }
        });
        hls.attachMedia(video);
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
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      listeners.forEach(function (removeListener) {
        removeListener();
      });
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  };
}

return {createPlaybackService: createPlaybackService};
});
registerModule("js/player/seek-controller.js", function (requireModule) {
const DEFAULT_SPEED = {
  initialProgressPerSecond: 0.02,
  accelerationPerSecondSquared: 0.425,
  maximumProgressPerSecond: 1.1
};

function createSeekController(options) {
  const speed = Object.assign({}, DEFAULT_SPEED, options.speed);
  let frame = 0;
  let holdTimer = 0;
  let direction = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let previewProgress = 0;
  let startProgress = 0;
  let scrubbing = false;
  let moved = false;
  let heldSource = null;
  let pressedKeys = [];
  let disposed = false;

  function cancelFrame() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function animate(timestamp) {
    frame = 0;
    if (!scrubbing || !direction || disposed) {
      return;
    }

    const frameDuration = lastFrame ? Math.max(0, (timestamp - lastFrame) / 1000) : 0;
    lastFrame = timestamp;
    const elapsedBeforeFrame = elapsed;
    elapsed += frameDuration;
    const timeToMaximum = Math.max(0, (speed.maximumProgressPerSecond - speed.initialProgressPerSecond) /
      speed.accelerationPerSecondSquared);
    const acceleratedDuration = Math.max(0,
      Math.min(elapsed, timeToMaximum) - Math.min(elapsedBeforeFrame, timeToMaximum));
    const cappedDuration = Math.max(0, frameDuration - acceleratedDuration);
    const distance = speed.initialProgressPerSecond * frameDuration +
      speed.accelerationPerSecondSquared * acceleratedDuration *
      (elapsedBeforeFrame + elapsedBeforeFrame + acceleratedDuration) / 2 +
      speed.maximumProgressPerSecond * cappedDuration;

    previewProgress = Math.max(0, Math.min(1, previewProgress + direction * distance));
    moved = moved || previewProgress !== startProgress;
    options.onPreview(previewProgress, progressToTime(previewProgress));

    if (previewProgress > 0 && previewProgress < 1) {
      frame = window.requestAnimationFrame(animate);
    }
  }

  function progressToTime(progress) {
    const range = options.getRange();
    return range.start + progress * (range.end - range.start);
  }

  function begin(nextDirection, source) {
    if (disposed) {
      return;
    }
    const range = options.getRange();
    if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
      return;
    }

    if (!scrubbing) {
      scrubbing = true;
      previewProgress = Math.max(0, Math.min(1, (options.getCurrentTime() - range.start) / (range.end - range.start)));
      startProgress = previewProgress;
      elapsed = 0;
      lastFrame = 0;
      moved = false;
      heldSource = source || null;
    } else if (source && !heldSource) {
      heldSource = source;
    }

    direction = nextDirection < 0 ? -1 : 1;
    if (!frame && previewProgress > 0 && previewProgress < 1) {
      frame = window.requestAnimationFrame(animate);
    }
  }

  function finish(commit) {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    cancelFrame();
    if (!scrubbing) {
      heldSource = null;
      pressedKeys = [];
      return false;
    }

    const finalTime = progressToTime(previewProgress);
    const shouldCommit = commit && moved;
    scrubbing = false;
    direction = 0;
    heldSource = null;
    pressedKeys = [];
    if (shouldCommit) {
      options.onCommit(finalTime);
    } else {
      options.onPreview(previewProgress, finalTime);
    }
    return shouldCommit;
  }

  return {
    pressKey(nextDirection, key) {
      const index = pressedKeys.indexOf(key);
      if (index === -1) {
        pressedKeys.push(key);
      }
      begin(nextDirection, null);
    },
    releaseKey(key) {
      const index = pressedKeys.indexOf(key);
      if (index === -1) {
        return;
      }
      pressedKeys.splice(index, 1);
      if (pressedKeys.length) {
        const lastKey = pressedKeys[pressedKeys.length - 1];
        begin(lastKey === "left" || lastKey === "rewind" ? -1 : 1, null);
      } else {
        finish(true);
      }
    },
    startHold(nextDirection, source, delay) {
      if (scrubbing || holdTimer) {
        return;
      }
      heldSource = source;
      holdTimer = window.setTimeout(function () {
        holdTimer = 0;
        begin(nextDirection, source);
      }, delay);
    },
    releaseHold(source) {
      const wasScrubbing = heldSource === source && scrubbing;
      const wasHolding = heldSource === source && (scrubbing || holdTimer !== 0);
      if (wasHolding) {
        finish(true);
      } else {
        window.clearTimeout(holdTimer);
        holdTimer = 0;
        heldSource = null;
      }
      return wasScrubbing;
    },
    seekBy(seconds) {
      const range = options.getRange();
      if (!range || range.end <= range.start) {
        return;
      }
      options.onCommit(Math.max(range.start, Math.min(range.end, options.getCurrentTime() + seconds)));
    },
    setPreview(progress) {
      if (scrubbing) {
        finish(false);
      }
      const range = options.getRange();
      if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
        return;
      }
      scrubbing = true;
      previewProgress = Math.max(0, Math.min(1, progress));
      startProgress = Math.max(0, Math.min(1,
        (options.getCurrentTime() - range.start) / (range.end - range.start)));
      moved = previewProgress !== startProgress;
      direction = 0;
      heldSource = null;
      options.onPreview(previewProgress, progressToTime(previewProgress));
    },
    commitPreview() {
      finish(true);
    },
    cancel() {
      finish(false);
    },
    isHolding(source) {
      return heldSource === source && (scrubbing || holdTimer !== 0);
    },
    destroy() {
      disposed = true;
      finish(false);
    }
  };
}

return {createSeekController: createSeekController};
});
registerModule("js/utils/format-time.js", function (requireModule) {
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  const formattedSeconds = remainingSeconds < 10 ? "0" + remainingSeconds : String(remainingSeconds);

  if (hours > 0) {
    const formattedMinutes = minutes < 10 ? "0" + minutes : String(minutes);
    return hours + ":" + formattedMinutes + ":" + formattedSeconds;
  }
  return minutes + ":" + formattedSeconds;
}

return {formatTime: formatTime};
});
requireModule("js/app.js");
})(window);
