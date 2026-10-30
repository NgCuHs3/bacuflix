import { createHomeScreen } from "./home/home-screen.js";
import { createDoubleBack } from "./navigation/double-back.js";
import { createRemoteNavigation } from "./navigation/remote-navigation.js";
import { createPlayerScreen } from "./player/player-screen.js";
import { createCatalogService } from "./services/catalog-service.js";
import { createKkphimApi } from "./services/kkphim-api.js";
import { currentDevice } from "./utils/device.js";
import { parseRoute, buildMovieUrl, buildEpisodeUrl, buildHomeUrl } from "./utils/url.js";

const root = document.getElementById("app");
if (document.documentElement) {
  document.documentElement.setAttribute("data-device", currentDevice);
}
if (document.body) {
  document.body.setAttribute("data-device", currentDevice);
}
if (root) {
  root.setAttribute("data-device", currentDevice);
}
const remoteNavigation = createRemoteNavigation();
const doubleBack = createDoubleBack(2200);
const catalogService = createCatalogService();
const kkphimApi = createKkphimApi();

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
    onOpenDetail: function (movie) {
      if (typeof window !== "undefined" && window.history && window.history.pushState) {
        try {
          window.history.pushState({ screen: "movie-detail", movieSlug: movie.slug }, "", buildMovieUrl(movie.slug));
        } catch (_) {}
      }
    },
    onCloseDetail: function () {
      if (typeof window !== "undefined" && window.history && window.history.pushState) {
        try {
          window.history.pushState({ screen: "catalog" }, "", buildHomeUrl());
        } catch (_) {}
      }
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
    selectedMovieId: options && options.selectedMovieId ? options.selectedMovieId : (previousMovie ? previousMovie.id : null),
    autoOpenSlug: options && options.autoOpenSlug ? options.autoOpenSlug : null,
    autoOpenEpisodeIndex: options && typeof options.autoOpenEpisodeIndex === "number" ? options.autoOpenEpisodeIndex : 0
  });

  setActiveScreen("catalog", homeScreen);

  if (typeof window !== "undefined" && window.history && window.history.replaceState) {
    try {
      if (options && options.autoOpenSlug) {
        window.history.replaceState({ screen: "movie-detail", movieSlug: options.autoOpenSlug }, "", buildMovieUrl(options.autoOpenSlug));
      } else {
        window.history.replaceState({ screen: "catalog" }, "", buildHomeUrl());
      }
    } catch (_) {}
  }
}

function handlePlayerBack() {
  const prevMovie = NavigationState.selectedMovie;
  if (prevMovie && prevMovie.slug) {
    showHome({
      autoOpenSlug: prevMovie.slug,
      autoOpenEpisodeIndex: typeof prevMovie.currentEpisodeIndex === "number" ? prevMovie.currentEpisodeIndex : 0
    });
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

  if (pushHistory && typeof window !== "undefined" && window.history && window.history.pushState) {
    const epNum = (typeof movie.currentEpisodeIndex === "number") ? (movie.currentEpisodeIndex + 1) : 1;
    const slug = movie.slug || movie.id;
    try {
      window.history.pushState({ screen: "player", movieSlug: slug, ep: epNum }, "", buildEpisodeUrl(slug, epNum));
    } catch (_) {}
  }
}

function playEpisodeFromData(movie, episodes, epParam) {
  const currentServer = episodes && episodes[0];
  const serverData = (currentServer && Array.isArray(currentServer.server_data)) ? currentServer.server_data : [];
  if (!serverData.length) {
    showHome({ autoOpenSlug: movie.slug });
    return;
  }

  let targetIndex = 0;
  if (epParam) {
    const epNum = parseInt(epParam, 10);
    if (!isNaN(epNum) && epNum >= 1 && epNum <= serverData.length) {
      targetIndex = epNum - 1;
    } else {
      const foundIdx = serverData.findIndex(function (item) {
        return item.slug === epParam || item.name === epParam || String(item.name).toLowerCase() === String(epParam).toLowerCase();
      });
      if (foundIdx !== -1) {
        targetIndex = foundIdx;
      }
    }
  }

  const epObj = serverData[targetIndex];
  const streamUrl = epObj.link_m3u8 || epObj.link_embed;
  const serverName = currentServer ? currentServer.server_name : "Vietsub";
  const playbackMovie = {
    id: movie.slug + "-" + (epObj.slug || targetIndex),
    slug: movie.slug,
    seriesTitle: movie.title,
    episodeName: epObj.name,
    title: movie.title + " - " + epObj.name,
    poster: movie.poster,
    m3u8: streamUrl,
    fallbackEmbed: epObj.link_embed || "",
    playbackEnabled: true,
    source: "KKPhim · " + serverName,
    episodesList: serverData.map(function (item, idx) {
      return {
        index: idx,
        name: item.name,
        slug: item.slug || String(idx),
        m3u8: item.link_m3u8 || item.link_embed,
        fallbackEmbed: item.link_embed || ""
      };
    }),
    currentEpisodeIndex: targetIndex,
    serverName: serverName
  };

  showPlayer(playbackMovie, false);
}

function handleDeepLink(movieSlug, epParam) {
  kkphimApi.getMovieDetail(movieSlug).then(function (data) {
    if (NavigationState.disposed) {
      return;
    }
    if (epParam) {
      playEpisodeFromData(data.movie, data.episodes, epParam);
    } else {
      showHome({ autoOpenSlug: movieSlug });
    }
  }).catch(function (error) {
    console.warn("Failed to load deep link:", error);
    showHome();
  });
}

function onPopState() {
  if (NavigationState.disposed) {
    return;
  }
  const route = parseRoute(window.location.search, window.location.hash);
  if (route.movieSlug && route.ep) {
    handleDeepLink(route.movieSlug, route.ep);
  } else if (route.movieSlug) {
    if (NavigationState.activeScreenName === "catalog" && NavigationState.screenInstance && NavigationState.screenInstance.openMovie) {
      NavigationState.screenInstance.openMovie(route.movieSlug);
    } else {
      showHome({ autoOpenSlug: route.movieSlug });
    }
  } else {
    if (NavigationState.activeScreenName === "catalog" && NavigationState.screenInstance && NavigationState.screenInstance.isDetailOpen && NavigationState.screenInstance.isDetailOpen()) {
      NavigationState.screenInstance.closeDetail();
    } else if (NavigationState.activeScreenName !== "catalog") {
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
  window.addEventListener("pagehide", onPageHide);
  const initialRoute = parseRoute(window.location.search, window.location.hash);
  if (initialRoute.movieSlug) {
    handleDeepLink(initialRoute.movieSlug, initialRoute.ep);
  } else {
    showHome();
  }
} else {
  showHome();
}
