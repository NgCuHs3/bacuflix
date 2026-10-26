import { movieCatalog } from "./data/movie-catalog.js";
import { createHomeScreen } from "./home/home-screen.js";
import { createDoubleBack } from "./navigation/double-back.js";
import { createRemoteNavigation } from "./navigation/remote-navigation.js";
import { createPlayerScreen } from "./player/player-screen.js";

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
