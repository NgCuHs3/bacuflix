import { createHomeScreen } from "./home/home-screen.js";
import { createDoubleBack } from "./navigation/double-back.js";
import { createRemoteNavigation } from "./navigation/remote-navigation.js";
import { createPlayerScreen } from "./player/player-screen.js";
import { createCatalogService } from "./services/catalog-service.js";
import { currentDevice } from "./utils/device.js";

const root = document.getElementById("app");
if (document.documentElement) {
  document.documentElement.setAttribute("data-device", currentDevice);
}
if (root) {
  root.setAttribute("data-device", currentDevice);
}
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
