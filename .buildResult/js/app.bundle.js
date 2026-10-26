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
var createHomeScreen = requireModule("js/home/home-screen.js")["createHomeScreen"];
var createDoubleBack = requireModule("js/navigation/double-back.js")["createDoubleBack"];
var createRemoteNavigation = requireModule("js/navigation/remote-navigation.js")["createRemoteNavigation"];
var createPlayerScreen = requireModule("js/player/player-screen.js")["createPlayerScreen"];
var createCatalogService = requireModule("js/services/catalog-service.js")["createCatalogService"];
const root = document.getElementById("app");
const remoteNavigation = createRemoteNavigation();
const doubleBack = createDoubleBack(2200);
const catalogService = createCatalogService();

const NavigationState = {
  activeScreenName: "catalog",
  selectedMovie: null,
  screenInstance: null,
  disposed: false
};

function setActiveScreen(name, screen) {
  NavigationState.activeScreenName = name;
  NavigationState.screenInstance = screen;
  if (name) {
    root.setAttribute("data-screen", name);
  } else {
    root.removeAttribute("data-screen");
  }
  remoteNavigation.setScreen(screen);
}

function clearScreen() {
  if (NavigationState.screenInstance) {
    NavigationState.screenInstance.destroy();
    NavigationState.screenInstance = null;
  }
  setActiveScreen(null, null);
}

function showHome(options) {
  if (NavigationState.disposed) {
    return;
  }
  doubleBack.reset();
  const previousMovie = NavigationState.selectedMovie;
  NavigationState.selectedMovie = null;
  clearScreen();

  const homeScreen = createHomeScreen(root, catalogService, {
    onSelect: function (movie) {
      showPlayer(movie, true);
    },
    onPlaybackUnavailable: function () {
      if (NavigationState.screenInstance && NavigationState.screenInstance.showBackPrompt) {
        NavigationState.screenInstance.showBackPrompt("Playback is disabled until an authorized stream is configured.");
      }
    },
    onBack: function () {
      doubleBack.handle(function () {
        if (NavigationState.screenInstance && NavigationState.screenInstance.showBackPrompt) {
          NavigationState.screenInstance.showBackPrompt("Press BACK again to exit BACUFlix");
        }
      }, function () {
        if (window.tizen && window.tizen.application) {
          window.tizen.application.getCurrentApplication().exit();
        }
      });
    }
  }, {
    selectedMovieId: options && options.selectedMovieId ? options.selectedMovieId : (previousMovie ? previousMovie.id : null)
  });

  setActiveScreen("catalog", homeScreen);

  if (typeof window !== "undefined" && window.history && window.history.state) {
    if (window.history.state.screen === "player") {
      window.history.replaceState({ screen: "catalog" }, "", window.location.pathname + window.location.search);
    }
  }
}

function handlePlayerBack() {
  if (typeof window !== "undefined" && window.history && window.history.state && window.history.state.screen === "player") {
    window.history.back();
  } else {
    showHome();
  }
}

function showPlayer(movie, pushHistory) {
  if (NavigationState.disposed || !movie || movie.playbackEnabled !== true) {
    return;
  }
  doubleBack.reset();
  NavigationState.selectedMovie = movie;
  clearScreen();

  const playerScreen = createPlayerScreen(root, movie, handlePlayerBack);
  setActiveScreen("player", playerScreen);

  if (pushHistory && typeof window !== "undefined" && window.history) {
    window.history.pushState({ screen: "player", movieId: movie.id }, "", "#player");
  }
}

function onPopState(event) {
  if (NavigationState.disposed) {
    return;
  }
  const state = event.state;
  if (state && state.screen === "player") {
    if (NavigationState.activeScreenName !== "player") {
      const lastResult = catalogService.getLastResult();
      const movie = (lastResult && lastResult.movies) ?
        lastResult.movies.find(function (m) { return m.id === state.movieId; }) : null;
      if (movie) {
        showPlayer(movie, false);
      } else {
        showHome();
      }
    }
  } else {
    if (NavigationState.activeScreenName !== "catalog") {
      showHome();
    }
  }
}

function onPageHide() {
  if (NavigationState.disposed) {
    return;
  }
  NavigationState.disposed = true;
  if (typeof window !== "undefined") {
    window.removeEventListener("popstate", onPopState);
  }
  doubleBack.destroy();
  clearScreen();
  remoteNavigation.destroy();
  window.removeEventListener("pagehide", onPageHide);
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", onPopState);
  if (window.history) {
    window.history.replaceState({ screen: "catalog" }, "", window.location.pathname + window.location.search);
  }
}

window.addEventListener("pagehide", onPageHide);
showHome();

return {};
});
registerModule("js/home/home-screen.js", function (requireModule) {
var activateFocusedElement = requireModule("js/navigation/remote-navigation.js")["activateFocusedElement"];
var focusNext = requireModule("js/navigation/remote-navigation.js")["focusNext"];
var fallbackPoster = requireModule("js/config/catalog-sources.js")["fallbackPoster"];
function makeButton(className, text, label) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = text;
  button.setAttribute("aria-label", label || text);
  return button;
}

function makeMovieCard(movie, actionsHandler) {
  const card = document.createElement("article");
  card.className = "catalog-card";

  const image = document.createElement("img");
  image.className = "catalog-poster";
  image.alt = "";
  let usingFallback = !movie.poster || movie.poster === fallbackPoster;
  image.addEventListener("error", function onPosterError() {
    if (usingFallback) {
      image.removeEventListener("error", onPosterError);
      console.error("Fallback poster could not be loaded:", fallbackPoster);
      return;
    }
    usingFallback = true;
    console.warn("Movie poster could not be loaded; using fallback:", {
      title: movie.title,
      url: movie.poster
    });
    image.classList.add("is-fallback");
    image.src = fallbackPoster;
  });
  image.src = usingFallback ? fallbackPoster : movie.poster;

  const details = document.createElement("div");
  details.className = "catalog-card-details";
  const title = document.createElement("h2");
  title.className = "catalog-card-title";
  title.textContent = movie.title;
  const source = document.createElement("p");
  source.className = "catalog-card-source";
  source.textContent = movie.source;
  const play = makeButton(
    "home-action primary-home-action catalog-play" + (movie.playbackEnabled ? "" : " is-unavailable"),
    movie.playbackEnabled ? "▶  Play" : "Awaiting authorized stream",
    (movie.playbackEnabled ? "Play " : "Playback unavailable for ") + movie.title
  );
  if (movie.playbackEnabled) {
    play.addEventListener("click", function () {
      actionsHandler.onSelect(movie);
    });
  } else {
    play.title = "Playback is disabled until an authorized stream source is configured.";
    play.addEventListener("click", function () {
      actionsHandler.onPlaybackUnavailable(movie);
    });
  }

  details.appendChild(title);
  details.appendChild(source);
  details.appendChild(play);
  card.appendChild(image);
  card.appendChild(details);
  return { element: card, playButton: play, movie: movie };
}

function createHomeScreen(root, catalogService, actionsHandler, options) {
  const screen = document.createElement("section");
  screen.className = "home-screen catalog-screen";
  screen.setAttribute("aria-label", "BACUFlix movie catalog");
  let toastTimer = 0;
  let destroyed = false;
  let refreshing = false;
  let currentResult = null;
  let movieButtons = [];

  const header = document.createElement("header");
  header.className = "home-header";
  const brand = document.createElement("div");
  brand.className = "home-brand";
  const logo = document.createElement("img");
  logo.src = "icon.png";
  logo.alt = "";
  const brandText = document.createElement("span");
  brandText.textContent = "BACU";
  const brandAccent = document.createElement("span");
  brandAccent.textContent = "Flix";
  brandText.appendChild(brandAccent);
  brand.appendChild(logo);
  brand.appendChild(brandText);

  const catalogLabel = document.createElement("span");
  catalogLabel.className = "home-nav-current";
  catalogLabel.textContent = "MOVIES";
  const refreshButton = makeButton("home-action secondary-home-action catalog-refresh", "Refresh catalog");
  refreshButton.addEventListener("click", function () {
    refresh(true);
  });
  header.appendChild(brand);
  header.appendChild(catalogLabel);
  header.appendChild(refreshButton);

  const heading = document.createElement("h1");
  heading.className = "catalog-heading";
  heading.textContent = "Discover movies";
  const message = document.createElement("p");
  message.className = "catalog-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const grid = document.createElement("div");
  grid.className = "catalog-grid";
  grid.setAttribute("aria-label", "Movies");
  const notice = document.createElement("p");
  notice.className = "catalog-notice";
  const toast = document.createElement("p");
  toast.className = "home-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;
  const hint = document.createElement("p");
  hint.className = "home-remote-hint";
  hint.textContent = "Use the directional buttons to explore · Press OK to select";
  screen.appendChild(header);
  screen.appendChild(heading);
  screen.appendChild(message);
  screen.appendChild(notice);
  screen.appendChild(grid);
  screen.appendChild(hint);
  screen.appendChild(toast);
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }
  root.appendChild(screen);

  function render(result) {
    currentResult = result;
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    movieButtons = [];
    notice.textContent = "";
    notice.hidden = true;
    if (result.failedAll) {
      const reason = result.errors.length ? " " + result.errors[0].message : "";
      message.textContent = "Unable to load the movie catalog." + reason;
      message.classList.add("is-error");
      return;
    }

    message.classList.remove("is-error");
    if (!result.movies.length) {
      message.textContent = "No movies are available in this catalog.";
      return;
    }

    message.textContent = result.movies.length + (result.movies.length === 1 ? " movie" : " movies");
    let focusedButton = null;
    result.movies.forEach(function (movie) {
      const card = makeMovieCard(movie, actionsHandler);
      grid.appendChild(card.element);
      movieButtons.push(card.playButton);
      if (options && options.selectedMovieId && movie.id === options.selectedMovieId) {
        focusedButton = card.playButton;
      }
    });
    if (result.errors.length) {
      notice.textContent = "Some catalogs could not be refreshed. Showing available saved movies.";
      notice.hidden = false;
    } else if (result.diagnostics.length) {
      notice.textContent = result.diagnostics.length + " invalid catalog entr" +
        (result.diagnostics.length === 1 ? "y was" : "ies were") + " skipped.";
      notice.hidden = false;
    }

    if (focusedButton && !screen.contains(document.activeElement)) {
      focusedButton.focus();
    }
  }

  function refresh(force) {
    if (refreshing || destroyed) {
      return;
    }
    refreshing = true;
    refreshButton.disabled = true;
    message.classList.remove("is-error");
    if (!currentResult || !currentResult.movies.length) {
      message.textContent = force ? "Refreshing movie catalog..." : "Loading movie catalog...";
    } else {
      notice.textContent = "Refreshing movie catalog...";
      notice.hidden = false;
    }
    catalogService.load(force).then(function (result) {
      if (!destroyed) {
        render(result);
      }
    }).catch(function (error) {
      if (!destroyed) {
        render({
          movies: [],
          errors: [{ message: error.message || "Catalog request failed." }],
          diagnostics: [],
          failedAll: true
        });
      }
    }).then(function () {
      refreshing = false;
      if (!destroyed) {
        refreshButton.disabled = false;
        if (!screen.contains(document.activeElement)) {
          if (options && options.selectedMovieId) {
            const matchIndex = currentResult && currentResult.movies ?
              currentResult.movies.findIndex(function (m) { return m.id === options.selectedMovieId; }) : -1;
            if (matchIndex >= 0 && movieButtons[matchIndex]) {
              movieButtons[matchIndex].focus();
              return;
            }
          }
          if (movieButtons.length) {
            movieButtons[0].focus();
          } else {
            refreshButton.focus();
          }
        }
      }
    });
  }

  const existingResult = (options && options.initialResult) ||
    (catalogService && typeof catalogService.getLastResult === "function" ? catalogService.getLastResult() : null);
  if (existingResult && existingResult.movies && existingResult.movies.length) {
    render(existingResult);
  }
  refresh(false);

  function allFocusable() {
    return [refreshButton].concat(movieButtons);
  }

  return {
    onKeyDown(event, key) {
      if (key.isBack) {
        if (!key.isRepeat) {
          actionsHandler.onBack();
        }
        return true;
      }
      if (key.isSelect) {
        activateFocusedElement(document.activeElement);
        return true;
      }
      if (key.direction === "left" || key.direction === "right") {
        focusNext(allFocusable(), document.activeElement, key.direction);
        return true;
      }
      if (key.direction === "up" || key.direction === "down") {
        const active = document.activeElement;
        if (active === refreshButton && key.direction === "down" && movieButtons.length) {
          movieButtons[0].focus();
        } else if (movieButtons.indexOf(active) !== -1 && key.direction === "up") {
          refreshButton.focus();
        }
        return true;
      }
      return false;
    },
    onKeyUp() {
      return false;
    },
    showBackPrompt(text) {
      window.clearTimeout(toastTimer);
      toast.textContent = text;
      toast.hidden = false;
      toastTimer = window.setTimeout(function () {
        toast.hidden = true;
      }, 2200);
    },
    getResult() {
      return currentResult;
    },
    destroy() {
      destroyed = true;
      window.clearTimeout(toastTimer);
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
registerModule("js/config/catalog-sources.js", function (requireModule) {
const catalogSources = [
  {
    id: "bacuflix-main",
    url: "https://raw.githubusercontent.com/NgCuHs3/bacuflix/refs/heads/main/data/movies.md",
    playbackEnabled: true
  }
];

const fallbackPoster = "icon.png";

return {catalogSources: catalogSources, fallbackPoster: fallbackPoster};
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
var createPlaybackService = requireModule("js/player/playback-service.js")["createPlaybackService"];
var createSeekController = requireModule("js/player/seek-controller.js")["createSeekController"];
var createSubtitleService = requireModule("js/player/subtitle-service.js")["createSubtitleService"];
var getActiveSubtitleText = requireModule("js/player/subtitle-parser.js")["getActiveSubtitleText"];
var activateFocusedElement = requireModule("js/navigation/remote-navigation.js")["activateFocusedElement"];
var focusNext = requireModule("js/navigation/remote-navigation.js")["focusNext"];
var formatTime = requireModule("js/utils/format-time.js")["formatTime"];
function playerMarkup(movie) {
  return '<section id="video-stage" class="video-stage controls-visible" aria-label="Video player">' +
    '<div class="cinema-shade" aria-hidden="true"></div>' +
    '<video id="video" autoplay playsinline preload="auto" aria-label="BACUFlix video playback"></video>' +
    '<div id="subtitles" class="subtitle-overlay" aria-live="polite" aria-atomic="true"></div>' +
    '<header class="topbar ui-overlay">' +
    '<button class="brand home-return-button" type="button" aria-label="Return to movie catalog"><img src="icon.png" alt="">' +
    '<span>BACU<span class="brand-accent">Flix</span></span></button>' +
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
    '<button id="subtitle-button" class="control-button compact-control" type="button" aria-pressed="true" aria-label="Toggle subtitles">' +
    '<span id="subtitle-symbol" class="control-symbol subtitle-symbol" aria-hidden="true">CC</span><span id="subtitle-label" class="control-caption">Subs</span></button>' +
    '<button id="fullscreen-button" class="control-button compact-control" type="button" aria-label="Toggle fullscreen">' +
    '<span class="control-symbol fullscreen-symbol" aria-hidden="true">□</span><span class="control-caption">Full screen</span></button>' +
    '</div><p class="remote-hint">← → Move / seek · ↑ ↓ Switch controls · Volume keys adjust sound · Back to return to library</p>' +
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
  const subtitleButton = root.querySelector("#subtitle-button");
  const subtitleLabel = root.querySelector("#subtitle-label");
  const subtitleSymbol = root.querySelector("#subtitle-symbol");
  const subtitlesContainer = root.querySelector("#subtitles");
  const subtitleService = createSubtitleService();
  const cleanups = [];
  let subtitleCues = [];
  let subtitlesEnabled = true;
  let displayedSubtitleText = "";
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
      onBackRequest();
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
      updateSubtitleDisplay();
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
      updateSubtitleDisplay();
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
  listen(video, "timeupdate", function () {
    updateSubtitleDisplay();
  });
  listen(video, "seeking", function () {
    updateSubtitleDisplay();
  });
  listen(video, "seeked", function () {
    updateSubtitleDisplay();
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
  playback.start(movie.m3u8);
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

return {createPlayerScreen: createPlayerScreen};
});
registerModule("js/player/playback-service.js", function (requireModule) {
var createSegmentLoader = requireModule("js/player/segment-loader.js")["createSegmentLoader"];
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
        try {
          hls = new window.Hls({
            loader: createSegmentLoader(window.Hls.DefaultConfig.loader)
          });
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
registerModule("js/player/segment-loader.js", function (requireModule) {
var inspectSegment = requireModule("js/player/segment-inspector.js")["inspectSegment"];
function isFragment(context) {
  return context && (context.type === "fragment" ||
    context.type === "media-fragment" || context.type === "audio-fragment");
}

function createSegmentLoader(DefaultLoader) {
  if (typeof DefaultLoader !== "function") {
    throw new Error("The HLS default loader is unavailable.");
  }

  function SegmentLoader(config) {
    this.delegate = new DefaultLoader(config);
    this.context = null;
  }
  Object.defineProperty(SegmentLoader.prototype, "stats", {
    get() {
      return this.delegate.stats;
    }
  });
  SegmentLoader.prototype.load = function (context, config, callbacks) {
    this.context = context;
    if (!isFragment(context)) {
      return this.delegate.load(context, config, callbacks);
    }

    const wrappedCallbacks = Object.create(callbacks);
    wrappedCallbacks.onSuccess = function (response, stats, loadedContext, networkDetails) {
      let inspection;
      try {
        inspection = inspectSegment(response.data);
      } catch (error) {
        console.warn("Rejected malformed wrapped media segment:", error.message);
        callbacks.onError({
          code: 0,
          text: error.message
        }, loadedContext, networkDetails, stats);
        return;
      }
      if (inspection.kind === "png-wrapped-mpeg-ts") {
        response = Object.assign({}, response, { data: inspection.data });
        console.info(
          "Recovered PNG-wrapped MPEG-TS segment (" +
          inspection.pngBytes + " wrapper bytes, " +
          inspection.transportStreamBytes + " media bytes)."
        );
      }
      callbacks.onSuccess(response, stats, loadedContext, networkDetails);
    };
    return this.delegate.load(context, config, wrappedCallbacks);
  };
  SegmentLoader.prototype.abort = function () {
    this.delegate.abort();
  };
  SegmentLoader.prototype.destroy = function () {
    this.delegate.destroy();
    this.delegate = null;
  };
  SegmentLoader.prototype.getResponseHeader = function (name) {
    return this.delegate.getResponseHeader(name);
  };
  return SegmentLoader;
}

return {createSegmentLoader: createSegmentLoader};
});
registerModule("js/player/segment-inspector.js", function (requireModule) {
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const TS_PACKET_SIZE = 188;
const CRC_TABLE = (function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function asBytes(data) {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function hasSignature(bytes, signature) {
  if (bytes.length < signature.length) {
    return false;
  }
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      return false;
    }
  }
  return true;
}

function readUint32(bytes, offset) {
  return bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3];
}

function chunkName(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateTransportStream(bytes) {
  if (bytes.length < TS_PACKET_SIZE * 2 || bytes.length % TS_PACKET_SIZE !== 0) {
    return false;
  }
  const packetCount = Math.min(5, bytes.length / TS_PACKET_SIZE);
  for (let packet = 0; packet < packetCount; packet += 1) {
    if (bytes[packet * TS_PACKET_SIZE] !== 0x47) {
      return false;
    }
  }
  return true;
}

function findPngTrailerStart(bytes) {
  let offset = PNG_SIGNATURE.length;
  let foundHeader = false;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const payloadOffset = typeOffset + 4;
    if (length > bytes.length - payloadOffset - 4) {
      throw new Error("PNG chunk extends beyond the segment boundary.");
    }

    const name = chunkName(bytes, typeOffset);
    const crcOffset = payloadOffset + length;
    const expectedCrc = readUint32(bytes, crcOffset);
    if (crc32(bytes, typeOffset, crcOffset) !== expectedCrc) {
      throw new Error("PNG chunk checksum is invalid.");
    }

    if (!foundHeader) {
      if (name !== "IHDR" || length !== 13) {
        throw new Error("PNG does not begin with a valid IHDR chunk.");
      }
      foundHeader = true;
    } else if (name === "IHDR") {
      throw new Error("PNG contains a duplicate IHDR chunk.");
    }

    offset = crcOffset + 4;
    if (name === "IEND") {
      if (length !== 0) {
        throw new Error("PNG IEND chunk must have an empty payload.");
      }
      return offset;
    }
  }

  throw new Error("PNG IEND chunk is missing or truncated.");
}

function inspectSegment(data) {
  const bytes = asBytes(data);
  if (!bytes || !bytes.length) {
    return { kind: "unknown", data: data };
  }

  if (validateTransportStream(bytes)) {
    return { kind: "mpeg-ts", data: data };
  }

  if (bytes.length >= 8 &&
      (chunkName(bytes, 4) === "ftyp" || chunkName(bytes, 4) === "styp" ||
       chunkName(bytes, 4) === "moof")) {
    return { kind: "fragmented-mp4", data: data };
  }

  if (!hasSignature(bytes, PNG_SIGNATURE)) {
    return { kind: "unknown", data: data };
  }

  const trailerStart = findPngTrailerStart(bytes);
  const trailer = bytes.subarray(trailerStart);
  if (!validateTransportStream(trailer)) {
    throw new Error("PNG segment has no valid trailing MPEG-TS payload.");
  }

  const recovered = trailer.slice();
  return {
    kind: "png-wrapped-mpeg-ts",
    data: recovered.buffer,
    pngBytes: trailerStart,
    transportStreamBytes: recovered.length
  };
}

return {inspectSegment: inspectSegment};
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
registerModule("js/player/subtitle-service.js", function (requireModule) {
var parseSrt = requireModule("js/player/subtitle-parser.js")["parseSrt"];
var srtToWebVtt = requireModule("js/player/subtitle-parser.js")["srtToWebVtt"];
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

function createSubtitleService() {
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

return {createSubtitleService: createSubtitleService};
});
registerModule("js/player/subtitle-parser.js", function (requireModule) {
function parseTimestamp(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const millis = parseInt(match[4].padEnd(3, "0").slice(0, 3), 10);
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }
  const shortMatch = trimmed.match(/^(\d{1,2}):(\d{2})[,.](\d{1,3})/);
  if (shortMatch) {
    const minutes = parseInt(shortMatch[1], 10);
    const seconds = parseInt(shortMatch[2], 10);
    const millis = parseInt(shortMatch[3].padEnd(3, "0").slice(0, 3), 10);
    return minutes * 60 + seconds + millis / 1000;
  }
  return null;
}

function formatVttTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00:00.000";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const millis = Math.floor((seconds - total) * 1000);

  const hh = hours < 10 ? "0" + hours : String(hours);
  const mm = minutes < 10 ? "0" + minutes : String(minutes);
  const ss = secs < 10 ? "0" + secs : String(secs);
  const ms = millis < 10 ? "00" + millis : (millis < 100 ? "0" + millis : String(millis));

  return hh + ":" + mm + ":" + ss + "." + ms;
}

function stripSubtitleHtml(text) {
  if (typeof text !== "string") {
    return "";
  }
  return text
    .replace(/\{[^}]*\}/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseSrt(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return [];
  }

  const clean = rawText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const blocks = clean.split(/\n\s*\n+/);
  const cues = [];

  blocks.forEach(function (block, blockIndex) {
    const lines = block.split("\n").map(function (line) {
      return line.trim();
    }).filter(Boolean);

    if (!lines.length) {
      return;
    }

    let timeLineIndex = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].indexOf("-->") !== -1) {
        timeLineIndex = index;
        break;
      }
    }

    if (timeLineIndex === -1) {
      return;
    }

    const timeParts = lines[timeLineIndex].split("-->");
    if (timeParts.length !== 2) {
      return;
    }

    const start = parseTimestamp(timeParts[0]);
    const endRaw = timeParts[1].trim().split(/\s+/)[0];
    const end = parseTimestamp(endRaw);

    if (start === null || end === null || end <= start) {
      return;
    }

    const dialogueLines = lines.slice(timeLineIndex + 1);
    const dialogue = dialogueLines.map(stripSubtitleHtml).filter(Boolean).join("\n");

    if (dialogue) {
      cues.push({
        id: blockIndex + 1,
        start: start,
        end: end,
        text: dialogue
      });
    }
  });

  cues.sort(function (a, b) {
    return a.start - b.start;
  });

  return cues;
}

function srtToWebVtt(srtContent) {
  const cues = parseSrt(srtContent);
  const output = ["WEBVTT\n"];

  cues.forEach(function (cue, index) {
    output.push(
      String(index + 1) + "\n" +
      formatVttTimestamp(cue.start) + " --> " + formatVttTimestamp(cue.end) + "\n" +
      cue.text + "\n"
    );
  });

  return output.join("\n");
}

function findActiveCues(cues, currentTime) {
  if (!Array.isArray(cues) || !cues.length || typeof currentTime !== "number" || currentTime < 0) {
    return [];
  }

  const active = [];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (cue.start <= currentTime && currentTime <= cue.end) {
      active.push(cue);
    } else if (cue.start > currentTime) {
      break;
    }
  }

  return active;
}

function getActiveSubtitleText(cues, currentTime) {
  const active = findActiveCues(cues, currentTime);
  if (!active.length) {
    return "";
  }
  return active.map(function (cue) {
    return cue.text;
  }).join("\n");
}

return {formatVttTimestamp: formatVttTimestamp, stripSubtitleHtml: stripSubtitleHtml, parseSrt: parseSrt, srtToWebVtt: srtToWebVtt, findActiveCues: findActiveCues, getActiveSubtitleText: getActiveSubtitleText};
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
registerModule("js/services/catalog-service.js", function (requireModule) {
var catalogSources = requireModule("js/config/catalog-sources.js")["catalogSources"];
var fallbackPoster = requireModule("js/config/catalog-sources.js")["fallbackPoster"];
var parseMovieMarkdown = requireModule("js/data/movie-markdown-parser.js")["parseMovieMarkdown"];
const CACHE_KEY = "bacuflix.movie-catalog.v1";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;

function readCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn("Unable to read the movie catalog cache:", error.message);
    return {};
  }
}

function writeCache(cache) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("Unable to save the movie catalog cache:", error.message);
  }
}

function errorMessage(error) {
  return error && error.message ? error.message : "Catalog request failed.";
}

function fetchText(url, forceRefresh) {
  if (typeof window.fetch === "function") {
    const controller = typeof window.AbortController === "function" ? new window.AbortController() : null;
    const options = controller ? { signal: controller.signal } : {};
    if (forceRefresh) {
      options.cache = "no-cache";
    }
    let timer = 0;
    const request = window.fetch(url, options).then(function (response) {
      if (!response.ok) {
        throw new Error("Catalog request returned HTTP " + response.status + ".");
      }
      return response.text();
    });
    const timeout = new Promise(function (_resolve, reject) {
      timer = window.setTimeout(function () {
        if (controller) {
          controller.abort();
        }
        reject(new Error("Catalog request timed out."));
      }, REQUEST_TIMEOUT_MS);
    });
    return Promise.race([request, timeout]).then(function (text) {
      window.clearTimeout(timer);
      return text;
    }, function (error) {
      window.clearTimeout(timer);
      throw error;
    });
  }

  return new Promise(function (resolve, reject) {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.timeout = REQUEST_TIMEOUT_MS;
    request.onload = function () {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.responseText);
      } else {
        reject(new Error("Catalog request returned HTTP " + request.status + "."));
      }
    };
    request.onerror = function () {
      reject(new Error("Network error while loading the movie catalog."));
    };
    request.ontimeout = function () {
      reject(new Error("Catalog request timed out."));
    };
    request.send();
  });
}

function mergeMovies(sourceResults) {
  const seen = Object.create(null);
  const movies = [];
  sourceResults.forEach(function (result) {
    result.movies.forEach(function (movie) {
      if (!seen[movie.m3u8]) {
        seen[movie.m3u8] = true;
        movies.push(movie);
      }
    });
  });
  return movies;
}

function createCatalogService(sources) {
  const configuredSources = (sources || catalogSources).slice();
  let inFlight = null;
  let lastResult = null;

  try {
    const cached = readCache();
    const initialResults = configuredSources.map(function (source) {
      const saved = cached[source.id] && cached[source.id].url === source.url ? cached[source.id] : null;
      if (saved && typeof saved.markdown === "string") {
        const parsed = parseMovieMarkdown(saved.markdown, {
          catalogSourceId: source.id,
          fallbackPoster: fallbackPoster,
          playbackEnabled: source.playbackEnabled
        });
        return { movies: parsed.movies, diagnostics: parsed.diagnostics, cached: true };
      }
      return { movies: [], diagnostics: [], cached: false };
    });
    const initialMovies = mergeMovies(initialResults);
    if (initialMovies.length) {
      lastResult = {
        movies: initialMovies,
        errors: [],
        diagnostics: [],
        failedAll: false,
        cached: true
      };
    }
  } catch (error) {
    // Ignore cache bootstrap errors
  }

  return {
    getLastResult() {
      return lastResult;
    },
    load(forceRefresh) {
      if (inFlight) {
        return inFlight;
      }

      const cached = readCache();
      const now = Date.now();
      const requests = configuredSources.map(function (source) {
        const saved = cached[source.id] && cached[source.id].url === source.url ?
          cached[source.id] : null;
        if (!forceRefresh && saved && now - saved.savedAt < CACHE_TTL_MS) {
          const parsed = parseMovieMarkdown(saved.markdown, {
            catalogSourceId: source.id,
            fallbackPoster: fallbackPoster,
            playbackEnabled: source.playbackEnabled
          });
          return Promise.resolve({
            movies: parsed.movies,
            diagnostics: parsed.diagnostics,
            cached: true
          });
        }

        return fetchText(source.url, forceRefresh).then(function (markdown) {
          const parsed = parseMovieMarkdown(markdown, {
            catalogSourceId: source.id,
            fallbackPoster: fallbackPoster,
            playbackEnabled: source.playbackEnabled
          });
          if (!parsed.movies.length) {
            return {
              movies: [],
              diagnostics: parsed.diagnostics,
              cached: false,
              error: "Catalog contains no valid movie entries."
            };
          }
          cached[source.id] = { url: source.url, markdown: markdown, savedAt: Date.now() };
          return {
            movies: parsed.movies,
            diagnostics: parsed.diagnostics,
            cached: false
          };
        }).catch(function (error) {
          const stale = cached[source.id];
          if (stale) {
            const parsedStale = parseMovieMarkdown(stale.markdown, {
              catalogSourceId: source.id,
              fallbackPoster: fallbackPoster,
              playbackEnabled: source.playbackEnabled
            });
            return {
              movies: parsedStale.movies,
              diagnostics: parsedStale.diagnostics,
              cached: true,
              error: errorMessage(error)
            };
          }
          return {
            movies: [],
            diagnostics: [],
            cached: false,
            error: errorMessage(error)
          };
        });
      });

      const operation = Promise.all(requests).then(function (results) {
        writeCache(cached);
        const errors = [];
        const diagnostics = [];
        results.forEach(function (result, index) {
          if (result.error) {
            errors.push({ sourceId: configuredSources[index].id, message: result.error });
          }
          result.diagnostics.forEach(function (diagnostic) {
            diagnostics.push({
              sourceId: configuredSources[index].id,
              entry: diagnostic.entry,
              message: diagnostic.message
            });
          });
        });
        const movies = mergeMovies(results);
        lastResult = {
          movies: movies,
          errors: errors,
          diagnostics: diagnostics,
          failedAll: movies.length === 0 && errors.length > 0,
          cached: results.every(function (result) { return result.cached; })
        };
        return lastResult;
      });
      inFlight = operation.then(function (result) {
        inFlight = null;
        return result;
      }, function (error) {
        inFlight = null;
        throw error;
      });
      return inFlight;
    }
  };
}

return {createCatalogService: createCatalogService};
});
registerModule("js/data/movie-markdown-parser.js", function (requireModule) {
function extractLinkDestination(value) {
  const trimmed = value.trim();
  const autolink = trimmed.match(/^<(https:\/\/[^>\s]+)>$/i);
  if (autolink) {
    return autolink[1].trim();
  }
  const markdownLink = trimmed.match(/^\[[^\]]*\]\(\s*<?(https:\/\/[^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)$/i);
  if (markdownLink) {
    return markdownLink[1].trim();
  }
  return trimmed.replace(/^["']|["']$/g, "").trim();
}

function parseHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      return null;
    }
    url.hash = "";
    return url;
  } catch (error) {
    return null;
  }
}

function makeStableId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return "movie-" + (hash >>> 0).toString(36);
}

function parseMovieBlock(block, entryNumber, options, diagnostics) {
  const fields = Object.create(null);
  block.split(/\r?\n/).forEach(function (line) {
    const match = line.match(/^\s*-\s*(title|poster|m3u8|subtitle|source)\s*:\s*(.*?)\s*$/i);
    if (match) {
      fields[match[1].toLowerCase()] = match[2].trim();
    }
  });

  const title = (fields.title || "").replace(/\s+/g, " ").trim();
  const streamUrl = parseHttpsUrl(extractLinkDestination(fields.m3u8 || ""));
  if (!title) {
    diagnostics.push({ entry: entryNumber, message: "Movie entry has no title." });
    return null;
  }
  if (!streamUrl) {
    diagnostics.push({ entry: entryNumber, message: "Movie entry has no valid HTTPS M3U8 URL." });
    return null;
  }

  const posterUrl = parseHttpsUrl(extractLinkDestination(fields.poster || ""));
  if (fields.poster && !posterUrl) {
    diagnostics.push({ entry: entryNumber, message: "Movie poster URL is invalid; using the fallback poster." });
  }

  const rawSubtitle = fields.subtitle ? extractLinkDestination(fields.subtitle) : "";
  const subtitleUrl = rawSubtitle ? parseHttpsUrl(rawSubtitle) : null;
  if (fields.subtitle && !subtitleUrl) {
    diagnostics.push({ entry: entryNumber, message: "Movie subtitle URL is invalid." });
  }

  const source = (fields.source || "").replace(/\s+/g, " ").trim() || streamUrl.hostname;
  return {
    id: makeStableId(streamUrl.href),
    title: title,
    poster: posterUrl ? posterUrl.href : options.fallbackPoster,
    m3u8: streamUrl.href,
    subtitle: subtitleUrl ? subtitleUrl.href : null,
    source: source,
    catalogSourceId: options.catalogSourceId,
    playbackEnabled: options.playbackEnabled === true
  };
}

function parseMovieMarkdown(markdown, options) {
  const settings = Object.assign({
    catalogSourceId: "unknown",
    fallbackPoster: "icon.png",
    playbackEnabled: false
  }, options);
  const diagnostics = [];
  const movies = [];
  const text = typeof markdown === "string" ? markdown.replace(/^\uFEFF/, "") : "";
  const sections = text.split(/^##\s+Movie\s*$/gim);

  if (sections.length < 2) {
    return { movies: movies, diagnostics: [{ entry: 0, message: "No movie entries were found." }] };
  }

  sections.slice(1).forEach(function (block, index) {
    const movie = parseMovieBlock(block, index + 1, settings, diagnostics);
    if (movie) {
      movies.push(movie);
    }
  });

  return { movies: movies, diagnostics: diagnostics };
}

return {parseMovieMarkdown: parseMovieMarkdown};
});
requireModule("js/app.js");
})(window);
