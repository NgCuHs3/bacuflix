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
var createKkphimApi = requireModule("js/services/kkphim-api.js")["createKkphimApi"];
var currentDevice = requireModule("js/utils/device.js")["currentDevice"];
var parseRoute = requireModule("js/utils/url.js")["parseRoute"];
var buildMovieUrl = requireModule("js/utils/url.js")["buildMovieUrl"];
var buildEpisodeUrl = requireModule("js/utils/url.js")["buildEpisodeUrl"];
var buildHomeUrl = requireModule("js/utils/url.js")["buildHomeUrl"];
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
        } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App && typeof window.Capacitor.Plugins.App.exitApp === "function") {
          window.Capacitor.Plugins.App.exitApp();
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
    originTitle: movie.originTitle || "",
    episodeName: epObj.name,
    title: movie.title + " - " + epObj.name,
    poster: movie.poster,
    thumb: movie.thumb || movie.poster,
    year: movie.year || "",
    quality: movie.quality || "",
    lang: movie.lang || "",
    type: movie.type || "",
    categories: Array.isArray(movie.categories) ? movie.categories : [],
    countries: Array.isArray(movie.countries) ? movie.countries : [],
    actors: Array.isArray(movie.actors) ? movie.actors : [],
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

function setupCapacitorAndroidBridge() {
  if (typeof window === "undefined" || !window.Capacitor || !window.Capacitor.Plugins) {
    return;
  }
  const plugins = window.Capacitor.Plugins;
  if (plugins.StatusBar) {
    try {
      if (typeof plugins.StatusBar.setBackgroundColor === "function") {
        plugins.StatusBar.setBackgroundColor({ color: "#08090D" });
      }
      if (typeof plugins.StatusBar.setStyle === "function") {
        plugins.StatusBar.setStyle({ style: "DARK" });
      }
    } catch (_) {}
  }
  if (plugins.App && typeof plugins.App.addListener === "function") {
    plugins.App.addListener("backButton", function () {
      if (NavigationState.disposed) {
        return;
      }
      if (NavigationState.activeScreenName === "player") {
        handlePlayerBack();
        return;
      }
      if (
        NavigationState.activeScreenName === "catalog" &&
        NavigationState.screenInstance &&
        typeof NavigationState.screenInstance.isDetailOpen === "function" &&
        NavigationState.screenInstance.isDetailOpen()
      ) {
        NavigationState.screenInstance.closeDetail();
        return;
      }
      doubleBack.handle(function () {
        if (NavigationState.screenInstance && NavigationState.screenInstance.showBackPrompt) {
          NavigationState.screenInstance.showBackPrompt("Nhấn BACK lần nữa để thoát BACUFlix");
        }
      }, function () {
        if (typeof plugins.App.exitApp === "function") {
          plugins.App.exitApp();
        }
      });
    });
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", onPopState);
  window.addEventListener("pagehide", onPageHide);
  setupCapacitorAndroidBridge();
  const initialRoute = parseRoute(window.location.search, window.location.hash);
  if (initialRoute.movieSlug) {
    handleDeepLink(initialRoute.movieSlug, initialRoute.ep);
  } else {
    showHome();
  }
} else {
  showHome();
}

return {};
});
registerModule("js/home/home-screen.js", function (requireModule) {
var activateFocusedElement = requireModule("js/navigation/remote-navigation.js")["activateFocusedElement"];
var focusNext = requireModule("js/navigation/remote-navigation.js")["focusNext"];
var fallbackPoster = requireModule("js/config/catalog-sources.js")["fallbackPoster"];
var createKkphimApi = requireModule("js/services/kkphim-api.js")["createKkphimApi"];
var isFavorite = requireModule("js/services/favorites-service.js")["isFavorite"];
var toggleFavorite = requireModule("js/services/favorites-service.js")["toggleFavorite"];
var getFavorites = requireModule("js/services/favorites-service.js")["getFavorites"];
var getWatchHistory = requireModule("js/services/watch-history-service.js")["getWatchHistory"];
var removeWatchHistory = requireModule("js/services/watch-history-service.js")["removeWatchHistory"];
var createGoogleTrendingService = requireModule("js/services/google-trending-service.js")["createGoogleTrendingService"];
var createMlRecommendationService = requireModule("js/services/ml-recommendation-service.js")["createMlRecommendationService"];
var recordUserSearchQuery = requireModule("js/services/ml-recommendation-service.js")["recordUserSearchQuery"];
var invalidateMlRecommendationCache = requireModule("js/services/ml-recommendation-service.js")["invalidateMlRecommendationCache"];
var createMovieDetailModal = requireModule("js/home/movie-detail-modal.js")["createMovieDetailModal"];
var createHeroCarousel = requireModule("js/home/hero-carousel.js")["createHeroCarousel"];
var createMovieCarouselSection = requireModule("js/home/movie-carousel.js")["createMovieCarouselSection"];
var createContinueWatchingSection = requireModule("js/home/movie-carousel.js")["createContinueWatchingSection"];
var createGenreSection = requireModule("js/home/movie-carousel.js")["createGenreSection"];
var createTvSearchKeyboard = requireModule("js/home/tv-search-keyboard.js")["createTvSearchKeyboard"];
var currentDevice = requireModule("js/utils/device.js")["currentDevice"];
var lazyLoadImage = requireModule("js/utils/lazy-image.js")["lazyLoadImage"];
var cancelLazyImage = requireModule("js/utils/lazy-image.js")["cancelLazyImage"];
var formatTime = requireModule("js/utils/format-time.js")["formatTime"];
const PLACEHOLDER_POSTER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function makeMovieCard(movie, actionsHandler) {
  const card = document.createElement("article");
  card.className = "catalog-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", movie.title);
  card.dataset.movieId = movie.id;

  const posterWrap = document.createElement("div");
  posterWrap.className = "catalog-poster-wrap";

  const image = document.createElement("img");
  image.className = "catalog-poster";
  image.alt = "";
  image.decoding = "async";
  image.loading = "lazy";
  image.width = 240;
  image.height = 360;
  let usingFallback = !movie.poster || movie.poster === fallbackPoster;
  const targetPosterUrl = usingFallback ? fallbackPoster : movie.poster;

  image.addEventListener("error", function onPosterError() {
    if (usingFallback) {
      image.removeEventListener("error", onPosterError);
      return;
    }
    usingFallback = true;
    image.classList.add("is-fallback");
    image.src = fallbackPoster;
  });
  image.src = PLACEHOLDER_POSTER;

  const posterShade = document.createElement("div");
  posterShade.className = "catalog-poster-shade";
  posterShade.setAttribute("aria-hidden", "true");

  // Badges container (Top-left red FHD badge)
  const badges = document.createElement("div");
  badges.className = "catalog-card-badges";

  const qualityLabel = (movie.quality && String(movie.quality).trim()) ? movie.quality : "FHD";
  const qBadge = document.createElement("span");
  qBadge.className = "catalog-badge catalog-badge-quality";
  qBadge.textContent = qualityLabel;
  badges.appendChild(qBadge);

  if (movie.episodeCurrent) {
    const eBadge = document.createElement("span");
    eBadge.className = "catalog-badge catalog-badge-episode";
    eBadge.textContent = movie.episodeCurrent;
    badges.appendChild(eBadge);
  } else if (movie.lang) {
    const lBadge = document.createElement("span");
    lBadge.className = "catalog-badge catalog-badge-lang";
    lBadge.textContent = movie.lang;
    badges.appendChild(lBadge);
  }

  // Quick favorite button
  const favBtn = document.createElement("button");
  favBtn.type = "button";
  const initialFav = isFavorite(movie.slug || movie.id);
  favBtn.className = "catalog-card-fav" + (initialFav ? " is-favorite" : "");
  favBtn.setAttribute("aria-label", initialFav ? "Bỏ yêu thích" : "Thêm yêu thích");
  favBtn.tabIndex = -1;
  favBtn.innerHTML = '<span class="card-fav-icon">' + (initialFav ? "♥" : "♡") + '</span>';
  favBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    const isNowFav = toggleFavorite(movie);
    favBtn.classList.toggle("is-favorite", isNowFav);
    favBtn.setAttribute("aria-label", isNowFav ? "Bỏ yêu thích" : "Thêm yêu thích");
    const icon = favBtn.querySelector(".card-fav-icon");
    if (icon) {
      icon.textContent = isNowFav ? "♥" : "♡";
    }
    if (typeof actionsHandler.onFavoriteToggle === "function") {
      actionsHandler.onFavoriteToggle(movie, isNowFav);
    }
  });

  posterWrap.appendChild(image);
  posterWrap.appendChild(posterShade);
  posterWrap.appendChild(badges);
  posterWrap.appendChild(favBtn);

  const details = document.createElement("div");
  details.className = "catalog-card-details";
  const title = document.createElement("h2");
  title.className = "catalog-card-title";
  title.textContent = movie.title;

  const metaParts = [];
  if (typeof movie.currentTime === "number" && movie.currentTime > 5) {
    metaParts.push("Xem tiếp " + formatTime(movie.currentTime));
  } else if (movie.mlMatchPercent) {
    metaParts.push(movie.mlMatchPercent + "% phù hợp");
  }
  if (movie.episodeCurrent) {
    metaParts.push(movie.episodeCurrent);
  }
  if (movie.year) {
    metaParts.push(movie.year);
  }
  if (!metaParts.length && movie.lang) {
    metaParts.push(movie.lang);
  } else if (!metaParts.length && movie.source) {
    metaParts.push(movie.source);
  }
  const source = document.createElement("p");
  source.className = "catalog-card-source";
  source.textContent = metaParts.length ? metaParts.join(" • ") : "Tập mới";

  const play = document.createElement("button");
  play.type = "button";
  play.className = "home-action primary-home-action catalog-play" + (movie.playbackEnabled ? "" : " is-unavailable");
  play.tabIndex = -1;
  play.setAttribute("aria-label", (movie.playbackEnabled ? "Chi tiết / Xem " : "Playback unavailable for ") + movie.title);

  const playIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  playIcon.setAttribute("class", "catalog-play-icon");
  playIcon.setAttribute("viewBox", "0 0 24 24");
  playIcon.setAttribute("width", "16");
  playIcon.setAttribute("height", "16");
  playIcon.setAttribute("fill", "currentColor");
  playIcon.setAttribute("aria-hidden", "true");
  const playPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  playPath.setAttribute("d", "M8 5v14l11-7z");
  playIcon.appendChild(playPath);

  const playText = document.createElement("span");
  playText.className = "catalog-play-label";
  playText.textContent = movie.playbackEnabled ? "Xem ngay" : "Unavailable";

  play.appendChild(playIcon);
  play.appendChild(playText);

  const cardEntry = {
    element: card,
    playButton: play,
    favButton: favBtn,
    image: image,
    posterUrl: targetPosterUrl,
    imageAttached: false,
    movie: movie
  };

  if (movie.playbackEnabled) {
    play.addEventListener("click", function (event) {
      event.stopPropagation();
      if (typeof actionsHandler.onOpenDetail === "function" && (movie.slug || !movie.m3u8)) {
        actionsHandler.onOpenDetail(movie);
      } else {
        actionsHandler.onSelect(movie);
      }
    });
  } else {
    play.title = "Playback is disabled until an authorized stream source is configured.";
    play.addEventListener("click", function (event) {
      event.stopPropagation();
      actionsHandler.onPlaybackUnavailable(movie);
    });
  }

  card.addEventListener("click", function (event) {
    if (event.target === play || play.contains(event.target) || event.target === favBtn || favBtn.contains(event.target)) {
      return;
    }
    if (typeof actionsHandler.onCardClick === "function") {
      actionsHandler.onCardClick(cardEntry);
    }
  });

  details.appendChild(title);
  details.appendChild(source);
  details.appendChild(play);
  card.appendChild(posterWrap);
  card.appendChild(details);
  return cardEntry;
}

function createHomeScreen(root, catalogService, actionsHandler, options) {
  const screen = document.createElement("section");
  screen.className = "home-screen catalog-screen";
  screen.setAttribute("aria-label", "BACUFlix Streaming Home");

  function isTv() {
    return currentDevice === "tv" ||
      (root && root.getAttribute("data-device") === "tv") ||
      (document.documentElement && document.documentElement.getAttribute("data-device") === "tv") ||
      (typeof window !== "undefined" && Boolean(window.tizen || window.webOS));
  }

  const kkphimApi = createKkphimApi();
  const googleTrendingService = createGoogleTrendingService(kkphimApi);
  const mlRecommendationService = createMlRecommendationService(kkphimApi);

  let toastTimer = 0;
  let clockTimer = 0;
  let mlModelIntervalTimer = 0;
  let isMlRunning = false;
  let lastRenderedRecommendedSig = "";
  let searchDebounceTimer = 0;
  let destroyed = false;
  let refreshing = false;
  let loadTabSeq = 0;
  let pendingScrollToGrid = false;
  let latestRecommendedMovies = [];
  let activeTab = "new"; // "new" | "movies" | "tvshows" | "trending" | "recommended" | "favorites" | "history" | "genre" | "search"
  let activeGenre = null;
  let previousTab = "new";
  let currentSearchQuery = "";
  let currentResult = null;
  let cards = [];
  let activeCardIndex = 0;
  let selectedCardEntry = null;
  let currentActionEntry = null;
  let isProgrammaticFocus = false;
  let cachedColumnsCount = 6;
  let cachedGridTop = 0;
  let tvKeyboard = null;

  // Virtual Scrolling State
  const mountedIndices = new Set();
  let currentStartRow = -1;
  let currentEndRow = -1;
  let virtualScrollRaf = 0;

  // Pagination / Infinite scroll state
  let currentPage = 1;
  let isLoadingMore = false;
  let hasMore = true;

  function openMovieItem(movie) {
    if (!movie) {
      return;
    }
    if (tvKeyboard && tvKeyboard.isOpen()) {
      tvKeyboard.close();
    }
    if (movie.slug) {
      detailModal.open(movie);
    } else if (movie.playbackEnabled) {
      actionsHandler.onSelect(movie);
    } else {
      actionsHandler.onPlaybackUnavailable(movie);
    }
  }

  function handleGlobalFavoriteChanged(_movie, _isFav) {
    invalidateMlRecommendationCache();
    heroCarousel.refreshFavoriteStates();
    carouselSections.forEach(function (sec) {
      if (sec && typeof sec.updateFavoriteStates === "function") {
        sec.updateFavoriteStates();
      }
    });
    updateCardFavStates();
    refreshMlRecommendations(true);
    if (activeTab === "favorites") {
      loadTab("favorites", true);
    }
  }

  const cardActions = {
    onSelect: actionsHandler.onSelect,
    onPlaybackUnavailable: actionsHandler.onPlaybackUnavailable,
    onOpenDetail: function (m) {
      openMovieItem(m);
    },
    onFavoriteToggle: function (m, isFav) {
      handleGlobalFavoriteChanged(m, isFav);
    },
    onCardClick: function (entry) {
      if (tvKeyboard && tvKeyboard.isOpen()) {
        tvKeyboard.close();
      }
      if (entry.movie && entry.movie.slug) {
        detailModal.open(entry.movie);
      } else if (entry.movie && entry.movie.playbackEnabled) {
        actionsHandler.onSelect(entry.movie);
      } else {
        activateStageB(entry);
      }
    }
  };

  function ensureCardCreated(entry) {
    if (!entry) {
      return null;
    }
    if (!entry.element) {
      const built = makeMovieCard(entry.movie, cardActions);
      entry.element = built.element;
      entry.playButton = built.playButton;
      entry.favButton = built.favButton;
      entry.image = built.image;
      entry.posterUrl = built.posterUrl;
      entry.imageAttached = built.imageAttached;
      entry.element.dataset.cardIndex = String(entry.index);
      entry.element.addEventListener("focus", function () {
        if (isProgrammaticFocus) {
          return;
        }
        if (document.activeElement === entry.element) {
          setSelectedCard(entry, false);
        }
      });
    }
    return entry;
  }

  function attachCardPoster(entry) {
    if (entry && entry.image && !entry.imageAttached && entry.posterUrl) {
      entry.image.src = entry.posterUrl;
      entry.imageAttached = true;
    }
  }

  function detachCardPoster(entry) {
    if (entry && entry.image && entry.imageAttached) {
      cancelLazyImage(entry.image);
      entry.image.src = PLACEHOLDER_POSTER;
      entry.imageAttached = false;
    }
  }

  // Detail Modal instance
  const detailModal = createMovieDetailModal(screen, kkphimApi, {
    onSelectEpisode: function (playbackMovie) {
      if (typeof actionsHandler.onSelect === "function") {
        actionsHandler.onSelect(playbackMovie);
      }
    },
    onFavoritesChanged: function (m, isFav) {
      handleGlobalFavoriteChanged(m, isFav);
    },
    onOpen: function (movie) {
      if (typeof actionsHandler.onOpenDetail === "function") {
        actionsHandler.onOpenDetail(movie);
      }
    },
    onClose: function () {
      refreshContinueWatching();
      refreshMlRecommendations(false);
      if (selectedCardEntry) {
        setSelectedCard(selectedCardEntry, true);
      }
      if (typeof actionsHandler.onCloseDetail === "function") {
        actionsHandler.onCloseDetail();
      }
    }
  });

  if (options && options.autoOpenSlug) {
    detailModal.open({
      slug: options.autoOpenSlug,
      title: "",
      currentEpisodeIndex: typeof options.autoOpenEpisodeIndex === "number" ? options.autoOpenEpisodeIndex : 0
    });
  }

  // Hero Section Carousel
  const heroCarousel = createHeroCarousel(screen, {
    onPlayMovie: function (movie) {
      openMovieItem(movie);
    },
    onOpenDetail: function (movie) {
      openMovieItem(movie);
    },
    onFavoriteToggle: function (movie, isFav) {
      handleGlobalFavoriteChanged(movie, isFav);
    }
  });

  function updateCardFavStates() {
    cards.forEach(function (cardEntry) {
      if (!cardEntry.favButton) {
        return;
      }
      const isFav = isFavorite(cardEntry.movie.slug || cardEntry.movie.id);
      cardEntry.favButton.classList.toggle("is-favorite", isFav);
      cardEntry.favButton.setAttribute("aria-label", isFav ? "Bỏ yêu thích" : "Thêm yêu thích");
      const icon = cardEntry.favButton.querySelector(".card-fav-icon");
      if (icon) {
        icon.textContent = isFav ? "♥" : "♡";
      }
    });
  }

  function updateColumnsCount() {
    const kbOpen = Boolean(tvKeyboard && tvKeyboard.isOpen());
    if (isTv()) {
      cachedColumnsCount = kbOpen ? 3 : 6;
      return;
    }
    const width = (typeof window !== "undefined" ? window.innerWidth : 0) || (root && root.clientWidth) || 1280;
    if (width < 768) {
      cachedColumnsCount = 3;
    } else if (width < 1024) {
      cachedColumnsCount = kbOpen ? 3 : 4;
    } else if (width < 1280) {
      cachedColumnsCount = kbOpen ? 3 : 5;
    } else {
      cachedColumnsCount = kbOpen ? 4 : 6;
    }
  }

  function ensureCardVisible(cardElement) {
    if (!cardElement || !screen) {
      return;
    }
    const containerRect = screen.getBoundingClientRect();
    const cardRect = cardElement.getBoundingClientRect();
    const bufferTop = 100;
    const bufferBottom = 60;

    const isAbove = cardRect.top < containerRect.top + bufferTop;
    const isBelow = cardRect.bottom > containerRect.bottom - bufferBottom;

    if (!isAbove && !isBelow) {
      return;
    }

    if (isAbove) {
      screen.scrollTop = Math.max(0, screen.scrollTop + (cardRect.top - containerRect.top - bufferTop));
    } else if (isBelow) {
      screen.scrollTop += (cardRect.bottom - containerRect.bottom + bufferBottom);
    }
  }

  function clearActionFocus() {
    if (currentActionEntry && currentActionEntry.element) {
      currentActionEntry.element.classList.remove("has-action-focus");
      if (currentActionEntry.playButton) {
        currentActionEntry.playButton.tabIndex = -1;
      }
      currentActionEntry = null;
    }
  }

  function setSelectedCard(targetEntry, focusElement) {
    if (!targetEntry) {
      if (selectedCardEntry && selectedCardEntry.element) {
        selectedCardEntry.element.classList.remove("is-selected", "movie-card--selected");
      }
      clearActionFocus();
      selectedCardEntry = null;
      return;
    }

    ensureCardCreated(targetEntry);
    if (typeof targetEntry.index === "number") {
      ensureCardInWindow(targetEntry.index);
    }
    attachCardPoster(targetEntry);

    clearActionFocus();

    if (selectedCardEntry !== targetEntry) {
      if (selectedCardEntry && selectedCardEntry.element) {
        selectedCardEntry.element.classList.remove("is-selected", "movie-card--selected");
      }
      selectedCardEntry = targetEntry;
      targetEntry.element.classList.add("is-selected", "movie-card--selected");
      if (typeof targetEntry.index === "number") {
        activeCardIndex = targetEntry.index;
      } else {
        const foundIdx = cards.indexOf(targetEntry);
        if (foundIdx !== -1) {
          activeCardIndex = foundIdx;
        }
      }
    } else if (!targetEntry.element.classList.contains("is-selected")) {
      targetEntry.element.classList.add("is-selected", "movie-card--selected");
    }

    if (focusElement) {
      isProgrammaticFocus = true;
      targetEntry.element.focus({ preventScroll: true });
      isProgrammaticFocus = false;
      ensureCardVisible(targetEntry.element);
    }
  }

  function activateStageB(cardEntry) {
    if (!cardEntry) {
      return;
    }
    ensureCardCreated(cardEntry);
    setSelectedCard(cardEntry, false);
    cardEntry.element.classList.add("has-action-focus");
    cardEntry.playButton.tabIndex = 0;
    currentActionEntry = cardEntry;
    isProgrammaticFocus = true;
    cardEntry.playButton.focus({ preventScroll: true });
    isProgrammaticFocus = false;
    ensureCardVisible(cardEntry.element);
  }

  function cancelStageB(cardEntry) {
    const entry = cardEntry || currentActionEntry || selectedCardEntry;
    if (!entry) {
      return;
    }
    ensureCardCreated(entry);
    clearActionFocus();
    entry.element.classList.add("is-selected", "movie-card--selected");
    isProgrammaticFocus = true;
    entry.element.focus({ preventScroll: true });
    isProgrammaticFocus = false;
    ensureCardVisible(entry.element);
  }

  function getActiveCardIndex() {
    if (!cards.length) {
      return -1;
    }
    const active = document.activeElement;
    if (selectedCardEntry && selectedCardEntry.element && (selectedCardEntry.element === active || selectedCardEntry.playButton === active || selectedCardEntry.element.contains(active))) {
      return activeCardIndex;
    }
    if (active) {
      const cardEl = active.closest ? active.closest(".catalog-card") : null;
      if (cardEl && cardEl.dataset.cardIndex !== undefined) {
        const idx = parseInt(cardEl.dataset.cardIndex, 10);
        if (!isNaN(idx) && idx >= 0 && idx < cards.length) {
          selectedCardEntry = cards[idx];
          activeCardIndex = idx;
          return idx;
        }
      }
    }
    const isHeader = (tabButtons && tabButtons.includes(active)) || (searchInput && (active === searchInput || searchBox.contains(active))) || (searchClear && active === searchClear);
    const isSidebar = sidebar && sidebar.contains(active);
    const isHero = heroCarousel && heroCarousel.element && heroCarousel.element.contains(active);
    const isCarousels = homeCarouselsContainer && homeCarouselsContainer.contains(active);
    const isKb = tvKeyboard && tvKeyboard.contains(active);
    if (!isHeader && !isSidebar && !isHero && !isCarousels && !isKb) {
      if (activeCardIndex >= 0 && activeCardIndex < cards.length) {
        return activeCardIndex;
      }
      return 0;
    }
    return -1;
  }

  // =========================================================================
  // 1. TOP NAVIGATION HEADER (Desktop + Mobile)
  // =========================================================================
  const header = document.createElement("header");
  header.className = "home-header";

  const headerLeft = document.createElement("div");
  headerLeft.className = "home-header-left";

  const menuToggleBtn = document.createElement("button");
  menuToggleBtn.type = "button";
  menuToggleBtn.className = "header-menu-toggle";
  menuToggleBtn.tabIndex = -1;
  menuToggleBtn.setAttribute("aria-label", "Đóng mở thanh bên");
  menuToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  menuToggleBtn.addEventListener("click", function () {
    screen.classList.toggle("is-sidebar-collapsed");
  });

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
  brand.addEventListener("click", function () {
    switchTab("new");
    screen.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Top Navigation Tabs: Trang chủ | Phim | TV Show | Danh sách của tôi | Thịnh hành
  const navTabs = document.createElement("nav");
  navTabs.className = "home-nav-tabs";
  navTabs.setAttribute("aria-label", "Mục chính");

  const tabConfigs = [
    { id: "new", label: "Trang chủ" },
    { id: "movies", label: "Phim" },
    { id: "tvshows", label: "TV Show" },
    { id: "favorites", label: "Danh sách của tôi" },
    { id: "trending", label: "Thịnh hành" }
  ];
  const tabButtons = [];

  tabConfigs.forEach(function (tab) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "home-nav-tab" + (tab.id === activeTab ? " is-active" : "");
    btn.textContent = tab.label;
    btn.setAttribute("aria-label", tab.label);
    btn.dataset.tabId = tab.id;
    btn.addEventListener("click", function () {
      if (tvKeyboard && tvKeyboard.isOpen()) {
        tvKeyboard.close();
      }
      switchTab(tab.id);
    });
    navTabs.appendChild(btn);
    tabButtons.push(btn);
  });

  headerLeft.appendChild(menuToggleBtn);
  headerLeft.appendChild(brand);
  headerLeft.appendChild(navTabs);

  const headerRight = document.createElement("div");
  headerRight.className = "home-header-right";

  // Search input & Clear
  const searchBox = document.createElement("div");
  searchBox.className = "home-search-box";

  const searchIcon = document.createElement("span");
  searchIcon.className = "home-search-icon";
  searchIcon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "home-search-input";
  searchInput.placeholder = "Tìm kiếm phim, diễn viên...";
  searchInput.setAttribute("aria-label", "Tìm kiếm phim, diễn viên");
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  if (isTv()) {
    searchInput.readOnly = true;
    searchInput.setAttribute("inputmode", "none");
  }

  const searchClear = document.createElement("button");
  searchClear.type = "button";
  searchClear.className = "home-search-clear";
  searchClear.textContent = "×";
  searchClear.setAttribute("aria-label", "Xóa tìm kiếm");
  searchClear.hidden = true;

  searchBox.appendChild(searchIcon);
  searchBox.appendChild(searchInput);
  searchBox.appendChild(searchClear);

  // Mobile compact search toggle button
  const mobileSearchToggleBtn = document.createElement("button");
  mobileSearchToggleBtn.type = "button";
  mobileSearchToggleBtn.className = "header-icon-btn mobile-search-toggle";
  mobileSearchToggleBtn.setAttribute("aria-label", "Mở tìm kiếm");
  mobileSearchToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  mobileSearchToggleBtn.addEventListener("click", function () {
    const isExpanded = header.classList.toggle("is-mobile-search-open");
    if (isExpanded) {
      window.setTimeout(function () {
        searchInput.focus();
      }, 40);
    }
  });

  // Notification Icon Button
  const notifBtn = document.createElement("button");
  notifBtn.type = "button";
  notifBtn.className = "header-icon-btn header-notif-btn";
  notifBtn.tabIndex = -1;
  notifBtn.setAttribute("aria-label", "Thông báo phim mới");
  notifBtn.innerHTML = '' +
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
    '<span class="notif-badge-dot" aria-hidden="true"></span>';
  notifBtn.addEventListener("click", function () {
    switchTab("new");
    showBackPrompt("Đã cập nhật danh sách phim mới nhất hôm nay!");
  });

  // User Profile Avatar Button
  const profileBtn = document.createElement("button");
  profileBtn.type = "button";
  profileBtn.className = "header-profile-btn";
  profileBtn.tabIndex = -1;
  profileBtn.setAttribute("aria-label", "Tài khoản & Danh sách của tôi");
  profileBtn.innerHTML = '' +
    '<span class="profile-avatar-circle">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>' +
    '</span>';
  profileBtn.addEventListener("click", function () {
    switchTab("favorites");
  });

  headerRight.appendChild(searchBox);
  headerRight.appendChild(mobileSearchToggleBtn);
  headerRight.appendChild(notifBtn);
  headerRight.appendChild(profileBtn);

  header.appendChild(headerLeft);
  header.appendChild(headerRight);

  // =========================================================================
  // 2. LEFT SIDEBAR NAVIGATION (Desktop Web + Smart TV)
  // =========================================================================
  const sidebar = document.createElement("aside");
  sidebar.className = "app-sidebar";
  sidebar.setAttribute("aria-label", "Điều hướng chính");

  const tvSidebarBrand = document.createElement("div");
  tvSidebarBrand.className = "tv-sidebar-brand";
  tvSidebarBrand.innerHTML = '<span>BACU<span class="brand-red">Flix</span></span>';
  sidebar.appendChild(tvSidebarBrand);

  const sidebarNavList = document.createElement("nav");
  sidebarNavList.className = "sidebar-nav-list";

  const sidebarConfigs = [
    {
      id: "new",
      label: "Trang chủ",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>'
    },
    {
      id: "movies",
      label: "Phim",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>'
    },
    {
      id: "tvshows",
      label: "TV Show",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>'
    },
    {
      id: "favorites",
      label: "Danh sách",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
    },
    {
      id: "history",
      label: "Lịch sử",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    }
  ];

  const sidebarButtons = [];
  sidebarConfigs.forEach(function (item) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sidebar-nav-btn" + (item.id === activeTab ? " is-active" : "");
    btn.dataset.tabId = item.id;
    btn.innerHTML = '<span class="sidebar-nav-icon" aria-hidden="true">' + item.icon + '</span><span class="sidebar-nav-label">' + item.label + '</span>';
    btn.addEventListener("click", function () {
      if (tvKeyboard && tvKeyboard.isOpen()) {
        tvKeyboard.close();
      }
      switchTab(item.id);
    });
    sidebarNavList.appendChild(btn);
    sidebarButtons.push(btn);
  });

  // TV Search item in Sidebar
  const sidebarDivider = document.createElement("div");
  sidebarDivider.className = "sidebar-divider";
  sidebarNavList.appendChild(sidebarDivider);

  const sidebarSearchBtn = document.createElement("button");
  sidebarSearchBtn.type = "button";
  sidebarSearchBtn.className = "sidebar-nav-btn sidebar-search-btn";
  sidebarSearchBtn.dataset.action = "search";
  sidebarSearchBtn.innerHTML = '<span class="sidebar-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span><span class="sidebar-nav-label">Tìm kiếm</span>';
  sidebarSearchBtn.addEventListener("click", function () {
    if (isTv()) {
      openCustomTvKeyboard(true);
    } else {
      searchInput.focus();
    }
  });
  sidebarNavList.appendChild(sidebarSearchBtn);
  sidebarButtons.push(sidebarSearchBtn);

  sidebar.appendChild(sidebarNavList);

  const sidebarFooter = document.createElement("div");
  sidebarFooter.className = "sidebar-footer";
  const sidebarSettingsBtn = document.createElement("button");
  sidebarSettingsBtn.type = "button";
  sidebarSettingsBtn.className = "sidebar-nav-btn sidebar-settings-btn";
  sidebarSettingsBtn.innerHTML = '<span class="sidebar-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span><span class="sidebar-nav-label">Cài đặt</span>';
  sidebarSettingsBtn.addEventListener("click", function () {
    showBackPrompt("BACUFlix v2.5 · Chất lượng phát tự động FHD / 4K");
  });
  sidebarFooter.appendChild(sidebarSettingsBtn);
  sidebarButtons.push(sidebarSettingsBtn);
  sidebar.appendChild(sidebarFooter);

  // =========================================================================
  // 3. MOBILE BOTTOM NAVIGATION BAR
  // =========================================================================
  const mobileBottomNav = document.createElement("nav");
  mobileBottomNav.className = "mobile-bottom-nav";
  mobileBottomNav.setAttribute("aria-label", "Điều hướng di động");

  const mobileNavConfigs = [
    {
      id: "new",
      label: "Trang chủ",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>'
    },
    {
      id: "movies",
      label: "Phim",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>'
    },
    {
      id: "tvshows",
      label: "TV Show",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>'
    },
    {
      id: "favorites",
      label: "Danh sách",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
    },
    {
      id: "history",
      label: "Tài khoản",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    }
  ];

  const mobileNavButtons = [];
  mobileNavConfigs.forEach(function (item) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mobile-bottom-nav-item" + (item.id === activeTab ? " is-active" : "");
    btn.dataset.tabId = item.id;
    btn.tabIndex = -1;
    btn.innerHTML = '<span class="mobile-nav-icon" aria-hidden="true">' + item.icon + '</span><span class="mobile-nav-label">' + item.label + '</span>';
    btn.addEventListener("click", function () {
      switchTab(item.id);
      screen.scrollTo({ top: 0, behavior: "smooth" });
    });
    mobileBottomNav.appendChild(btn);
    mobileNavButtons.push(btn);
  });

  // =========================================================================
  // 4. SMART TV STATUS WIDGET (Wi-Fi + Clock)
  // =========================================================================
  const tvStatusWidget = document.createElement("div");
  tvStatusWidget.className = "tv-status-widget";
  tvStatusWidget.setAttribute("aria-hidden", "true");
  const tvClockSpan = document.createElement("span");
  tvClockSpan.className = "tv-clock-time";
  function updateTvClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    tvClockSpan.textContent = hh + ":" + mm;
  }
  updateTvClock();
  clockTimer = window.setInterval(updateTvClock, 30000);
  tvStatusWidget.innerHTML = '<span class="tv-wifi-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg></span>';
  tvStatusWidget.appendChild(tvClockSpan);

  // =========================================================================
  // 5. SEARCH INPUT HANDLERS
  // =========================================================================
  function handleSearchValueChange(rawVal) {
    const val = (rawVal || "").trim();
    if (searchInput.value !== rawVal) {
      searchInput.value = rawVal;
    }
    if (tvKeyboard) {
      tvKeyboard.setValue(rawVal);
    }
    searchClear.hidden = !val;
    window.clearTimeout(searchDebounceTimer);
    if (!val) {
      if (activeTab === "search") {
        switchTab(previousTab || "new", true);
      }
      return;
    }
    searchDebounceTimer = window.setTimeout(function () {
      executeSearch(val);
    }, 350);
  }

  function openCustomTvKeyboard(focusFirstKey) {
    if (!tvKeyboard) {
      return;
    }
    const wasOpen = tvKeyboard.isOpen();
    searchBox.classList.add("is-keyboard-active");
    tvKeyboard.open(searchInput.value, focusFirstKey);
    if (!wasOpen) {
      cachedMeasuredWidth = 0;
      updateColumnsCount();
      currentStartRow = -1;
      currentEndRow = -1;
      updateVirtualWindow();
    }
  }

  searchInput.addEventListener("focus", function () {
    if (isTv()) {
      openCustomTvKeyboard(true);
    }
  });

  searchBox.addEventListener("click", function () {
    if (isTv()) {
      openCustomTvKeyboard(true);
    }
  });

  searchInput.addEventListener("input", function () {
    handleSearchValueChange(searchInput.value);
  });

  searchInput.addEventListener("keydown", function (e) {
    if (isTv()) {
      e.preventDefault();
      openCustomTvKeyboard(true);
      return;
    }
    if (e.key === "Enter") {
      window.clearTimeout(searchDebounceTimer);
      const val = searchInput.value.trim();
      if (val) {
        executeSearch(val);
      }
    } else if (e.key === "Escape") {
      searchInput.blur();
    }
  });

  searchClear.addEventListener("click", function (e) {
    e.stopPropagation();
    searchInput.value = "";
    if (tvKeyboard) {
      tvKeyboard.setValue("");
    }
    searchClear.hidden = true;
    switchTab(previousTab || "new", true);
    if (isTv() && tvKeyboard && tvKeyboard.isOpen()) {
      tvKeyboard.focusFirstKey();
    } else {
      searchInput.focus();
    }
  });

  // =========================================================================
  // 6. HOME CAROUSEL SECTIONS (New, Top 10, Continue Watching, Trending, Recommended, Genres, Series)
  // =========================================================================
  const homeCarouselsContainer = document.createElement("div");
  homeCarouselsContainer.className = "home-carousels-container";

  const sharedCarouselCallbacks = {
    onSelectMovie: function (movie) {
      openMovieItem(movie);
    },
    onFavoriteToggle: function (movie, isFav) {
      handleGlobalFavoriteChanged(movie, isFav);
    },
    onViewAll: function (cfg) {
      if (cfg.targetTab) {
        pendingScrollToGrid = true;
        switchTab(cfg.targetTab);
      }
    }
  };

  // Section 1: Phim mới cập nhật
  const newReleasesCarousel = createMovieCarouselSection({
    id: "new-releases",
    title: "Phim mới cập nhật",
    targetTab: "new",
    maxItems: 14
  }, sharedCarouselCallbacks);

  // Section 2: Top 10 hôm nay
  const top10Carousel = createMovieCarouselSection({
    id: "top-10",
    title: "Top 10 hôm nay",
    isTop10: true,
    targetTab: "trending",
    maxItems: 10
  }, sharedCarouselCallbacks);

  function resumeWatchHistoryItem(item) {
    if (!item) {
      return;
    }
    const epIndex = typeof item.currentEpisodeIndex === "number" ? item.currentEpisodeIndex : 0;
    const savedTime = (typeof item.currentTime === "number" && item.currentTime > 5) ? item.currentTime : 0;

    if (item.m3u8 && Array.isArray(item.episodesList) && item.episodesList.length > 0) {
      const epName = item.episodeName || (item.episodesList[epIndex] && item.episodesList[epIndex].name) || ("Tập " + (epIndex + 1));
      const seriesTitle = item.seriesTitle || item.title || "Phim";
      actionsHandler.onSelect({
        id: (item.slug || item.id) + "-" + epIndex,
        slug: item.slug || item.id,
        seriesTitle: seriesTitle,
        originTitle: item.originTitle || "",
        episodeName: epName,
        title: seriesTitle + " - " + epName,
        poster: item.poster,
        thumb: item.thumb || item.poster,
        year: item.year || "",
        quality: item.quality || "",
        lang: item.lang || "",
        type: item.type || "",
        categories: Array.isArray(item.categories) ? item.categories : [],
        countries: Array.isArray(item.countries) ? item.countries : [],
        actors: Array.isArray(item.actors) ? item.actors : [],
        m3u8: item.m3u8,
        fallbackEmbed: item.fallbackEmbed || "",
        playbackEnabled: true,
        source: item.source || "KKPhim",
        episodesList: item.episodesList,
        currentEpisodeIndex: epIndex,
        resumeTime: savedTime,
        serverName: item.serverName || "Vietsub"
      });
      return;
    }

    const slug = item.slug || item.id;
    if (slug && kkphimApi && typeof kkphimApi.getMovieDetail === "function") {
      kkphimApi.getMovieDetail(slug).then(function (data) {
        if (destroyed || !data || !data.movie) {
          return;
        }
        const episodes = data.episodes || [];
        const currentServer = episodes[0];
        const serverData = (currentServer && Array.isArray(currentServer.server_data)) ? currentServer.server_data : [];
        if (!serverData.length) {
          openMovieItem(item);
          return;
        }
        const safeIdx = Math.max(0, Math.min(serverData.length - 1, epIndex));
        const epObj = serverData[safeIdx];
        const streamUrl = epObj.link_m3u8 || epObj.link_embed || item.m3u8;
        if (!streamUrl) {
          openMovieItem(item);
          return;
        }
        const serverName = currentServer ? currentServer.server_name : "Vietsub";
        actionsHandler.onSelect({
          id: data.movie.slug + "-" + (epObj.slug || safeIdx),
          slug: data.movie.slug,
          seriesTitle: data.movie.title,
          originTitle: data.movie.originTitle || "",
          episodeName: epObj.name,
          title: data.movie.title + " - " + epObj.name,
          poster: data.movie.poster,
          thumb: data.movie.thumb || data.movie.poster,
          year: data.movie.year || "",
          quality: data.movie.quality || "",
          lang: data.movie.lang || "",
          type: data.movie.type || "",
          categories: Array.isArray(data.movie.categories) ? data.movie.categories : [],
          countries: Array.isArray(data.movie.countries) ? data.movie.countries : [],
          actors: Array.isArray(data.movie.actors) ? data.movie.actors : [],
          m3u8: streamUrl,
          fallbackEmbed: epObj.link_embed || "",
          playbackEnabled: true,
          source: "KKPhim · " + serverName,
          episodesList: serverData.map(function (epItem, idx) {
            return {
              index: idx,
              name: epItem.name,
              slug: epItem.slug || String(idx),
              m3u8: epItem.link_m3u8 || epItem.link_embed,
              fallbackEmbed: epItem.link_embed || ""
            };
          }),
          currentEpisodeIndex: safeIdx,
          resumeTime: savedTime,
          serverName: serverName
        });
      }).catch(function () {
        if (item.m3u8) {
          actionsHandler.onSelect(Object.assign({}, item, {
            playbackEnabled: true,
            resumeTime: savedTime
          }));
        } else {
          openMovieItem(item);
        }
      });
      return;
    }

    openMovieItem({
      slug: item.slug || item.id,
      id: item.id || item.slug,
      title: item.title,
      poster: item.poster,
      currentEpisodeIndex: epIndex,
      playbackEnabled: true
    });
  }

  // Section 3: Tiếp tục xem (Continue Watching)
  const continueWatchingSection = createContinueWatchingSection({
    onResumeItem: function (item) {
      resumeWatchHistoryItem(item);
    },
    onRemoveItem: function (item) {
      removeWatchHistory(item.slug || item.id);
      invalidateMlRecommendationCache();
      refreshContinueWatching();
      refreshMlRecommendations(true);
    }
  });

  // Section 4: Phim thịnh hành
  const trendingCarousel = createMovieCarouselSection({
    id: "trending",
    title: "Phim thịnh hành",
    targetTab: "trending",
    maxItems: 14
  }, sharedCarouselCallbacks);

  // Section 5: Phim đề xuất
  const recommendedCarousel = createMovieCarouselSection({
    id: "recommended",
    title: "Phim đề xuất",
    targetTab: "recommended",
    maxItems: 14
  }, sharedCarouselCallbacks);

  // Section 6: Thể loại (Genre Browsing)
  const genreSection = createGenreSection({
    onSelectGenre: function (genre) {
      openGenreTab(genre);
    }
  });

  // Section 7: Phim bộ nổi bật
  const seriesCarousel = createMovieCarouselSection({
    id: "featured-series",
    title: "Phim bộ nổi bật",
    targetTab: "tvshows",
    maxItems: 14
  }, sharedCarouselCallbacks);

  const carouselSections = [
    newReleasesCarousel,
    top10Carousel,
    continueWatchingSection,
    trendingCarousel,
    recommendedCarousel,
    genreSection,
    seriesCarousel
  ];

  carouselSections.forEach(function (sec) {
    homeCarouselsContainer.appendChild(sec.element);
  });

  function refreshContinueWatching() {
    const historyItems = getWatchHistory();
    continueWatchingSection.setItems(historyItems);
  }

  // =========================================================================
  // 7. CATALOG GRID & VIRTUAL SCROLL
  // =========================================================================
  const catalogSectionWrap = document.createElement("section");
  catalogSectionWrap.className = "catalog-grid-section";

  const headingHeader = document.createElement("div");
  headingHeader.className = "catalog-heading-row";

  const heading = document.createElement("h1");
  heading.className = "catalog-heading";
  heading.textContent = "Kho phim khám phá";

  const message = document.createElement("p");
  message.className = "catalog-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

  headingHeader.appendChild(heading);
  headingHeader.appendChild(message);

  const grid = document.createElement("div");
  grid.className = "catalog-grid";
  grid.setAttribute("aria-label", "Danh sách phim");

  const topSpacer = document.createElement("div");
  topSpacer.className = "catalog-grid-spacer catalog-grid-spacer-top";
  topSpacer.setAttribute("aria-hidden", "true");
  topSpacer.style.display = "none";

  const bottomSpacer = document.createElement("div");
  bottomSpacer.className = "catalog-grid-spacer catalog-grid-spacer-bottom";
  bottomSpacer.setAttribute("aria-hidden", "true");
  bottomSpacer.style.display = "none";

  grid.appendChild(topSpacer);
  grid.appendChild(bottomSpacer);

  let cachedMeasuredCardHeight = 0;
  let cachedMeasuredWidth = 0;

  function measureLayout() {
    const kbOpen = Boolean(tvKeyboard && tvKeyboard.isOpen());
    if (isTv()) {
      const tvCols = kbOpen ? 3 : 6;
      const tvCardHeight = kbOpen ? 380 : 390;
      const tvGap = kbOpen ? 20 : 22;
      return {
        cardHeight: tvCardHeight,
        gap: tvGap,
        rowHeight: tvCardHeight + tvGap,
        cols: tvCols
      };
    }
    const width = (typeof window !== "undefined" ? window.innerWidth : 0) || (root && root.clientWidth) || 1280;
    let cols = kbOpen ? 3 : 6;
    let gap = 18;
    let baseCardHeight = 320;

    if (width < 768) {
      cols = 3;
      gap = 10;
      const cardWidth = Math.max(100, (width - 28 - gap * 2) / 3);
      baseCardHeight = Math.round(cardWidth * 1.5);
    } else if (width < 1024) {
      cols = kbOpen ? 3 : 4;
      gap = 14;
      const cardWidth = Math.max(140, (width - 48 - gap * (cols - 1)) / cols);
      baseCardHeight = Math.round(cardWidth * 1.5);
    } else if (width < 1280) {
      cols = kbOpen ? 3 : 5;
      gap = 18;
      const effectiveWidth = Math.max(600, width - 240);
      const cardWidth = Math.max(160, (effectiveWidth - gap * (cols - 1)) / cols);
      baseCardHeight = Math.round(cardWidth * 1.5);
    } else {
      cols = kbOpen ? 4 : 6;
      gap = 20;
      const effectiveWidth = Math.max(800, width - 260);
      const cardWidth = Math.max(170, (effectiveWidth - gap * (cols - 1)) / cols);
      baseCardHeight = Math.round(cardWidth * 1.5);
    }

    if (width !== cachedMeasuredWidth || !cachedMeasuredCardHeight) {
      cachedMeasuredWidth = width;
      cachedMeasuredCardHeight = baseCardHeight;
      for (let i = 0; i < cards.length; i += 1) {
        if (cards[i] && cards[i].element && cards[i].element.isConnected) {
          const rect = cards[i].element.getBoundingClientRect();
          if (rect.height > 100) {
            cachedMeasuredCardHeight = Math.round(rect.height);
            break;
          }
        }
      }
    }

    return {
      cardHeight: cachedMeasuredCardHeight,
      gap: gap,
      rowHeight: cachedMeasuredCardHeight + gap,
      cols: cols
    };
  }

  function mountRange(startIndex, endIndex, cols) {
    const posterKeepMargin = (cols || 6) * 4;
    const toRemove = [];
    mountedIndices.forEach(function (idx) {
      if (idx < startIndex || idx > endIndex) {
        toRemove.push(idx);
      }
    });
    for (let k = 0; k < toRemove.length; k += 1) {
      const idx = toRemove[k];
      const entry = cards[idx];
      if (entry && entry.element && entry.element.parentNode === grid) {
        grid.removeChild(entry.element);
      }
      if (entry && (idx < startIndex - posterKeepMargin || idx > endIndex + posterKeepMargin)) {
        detachCardPoster(entry);
      }
      mountedIndices.delete(idx);
    }

    for (let i = endIndex; i >= startIndex; i -= 1) {
      const entry = cards[i];
      if (!entry) {
        continue;
      }
      ensureCardCreated(entry);
      attachCardPoster(entry);
      if (!mountedIndices.has(i) && entry.element) {
        let anchor = bottomSpacer;
        if (cards[i + 1] && cards[i + 1].element && cards[i + 1].element.parentNode === grid) {
          anchor = cards[i + 1].element;
        } else {
          for (let j = i + 1; j <= endIndex; j += 1) {
            if (mountedIndices.has(j) && cards[j] && cards[j].element && cards[j].element.parentNode === grid) {
              anchor = cards[j].element;
              break;
            }
          }
        }
        grid.insertBefore(entry.element, anchor);
        mountedIndices.add(i);
      }
    }
  }

  function updateVirtualWindow(forceTargetRow) {
    if (!cards.length || destroyed) {
      topSpacer.style.display = "none";
      bottomSpacer.style.display = "none";
      return;
    }
    const layout = measureLayout();
    cachedColumnsCount = layout.cols;
    const totalRows = Math.ceil(cards.length / layout.cols);

    if (!cachedGridTop) {
      cachedGridTop = grid.offsetTop || 300;
    }
    const viewportHeight = screen.clientHeight || window.innerHeight || 1080;
    const scrollTop = screen.scrollTop || 0;

    // When on the home screen ("new" tab) with carousels visible, do not mount bottom grid until viewport nears it
    if (activeTab === "new" && !homeCarouselsContainer.hidden && (scrollTop + viewportHeight + 400 < cachedGridTop) && typeof forceTargetRow !== "number") {
      topSpacer.style.display = "none";
      bottomSpacer.style.display = "none";
      mountRange(-1, -1, layout.cols);
      currentStartRow = -1;
      currentEndRow = -1;
      return;
    }

    if (cards.length <= 24) {
      topSpacer.style.display = "none";
      bottomSpacer.style.display = "none";
      mountRange(0, cards.length - 1, layout.cols);
      currentStartRow = 0;
      currentEndRow = totalRows - 1;
      return;
    }

    const relativeScroll = Math.max(0, scrollTop - cachedGridTop);

    const bufferRows = 3;
    let startRow = Math.max(0, Math.floor(relativeScroll / layout.rowHeight) - bufferRows);
    let endRow = Math.min(totalRows - 1, Math.ceil((relativeScroll + viewportHeight) / layout.rowHeight) + bufferRows);

    if (typeof forceTargetRow === "number") {
      if (forceTargetRow < startRow) {
        startRow = Math.max(0, forceTargetRow - 1);
      }
      if (forceTargetRow > endRow) {
        endRow = Math.min(totalRows - 1, forceTargetRow + 1);
      }
    }

    if (startRow === currentStartRow && endRow === currentEndRow && typeof forceTargetRow !== "number") {
      return;
    }

    currentStartRow = startRow;
    currentEndRow = endRow;

    if (startRow > 0) {
      topSpacer.style.display = "block";
      topSpacer.style.height = Math.max(0, startRow * layout.rowHeight - layout.gap) + "px";
    } else {
      topSpacer.style.display = "none";
    }

    const remainingRows = totalRows - 1 - endRow;
    if (remainingRows > 0) {
      bottomSpacer.style.display = "block";
      bottomSpacer.style.height = Math.max(0, remainingRows * layout.rowHeight - layout.gap) + "px";
    } else {
      bottomSpacer.style.display = "none";
    }

    const startIndex = startRow * layout.cols;
    const endIndex = Math.min(cards.length - 1, (endRow + 1) * layout.cols - 1);
    mountRange(startIndex, endIndex, layout.cols);
  }

  function scheduleVirtualUpdate() {
    if (virtualScrollRaf) {
      return;
    }
    virtualScrollRaf = window.requestAnimationFrame(function () {
      virtualScrollRaf = 0;
      updateVirtualWindow();
    });
  }

  function ensureCardInWindow(targetIdx) {
    if (typeof targetIdx !== "number" || targetIdx < 0 || targetIdx >= cards.length) {
      return;
    }
    const layout = measureLayout();
    const targetRow = Math.floor(targetIdx / layout.cols);
    if (targetRow < currentStartRow || targetRow > currentEndRow) {
      updateVirtualWindow(targetRow);
    }
  }

  function clearGrid() {
    mountedIndices.clear();
    currentStartRow = -1;
    currentEndRow = -1;
    cachedGridTop = 0;
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    grid.appendChild(topSpacer);
    grid.appendChild(bottomSpacer);
    topSpacer.style.display = "none";
    bottomSpacer.style.display = "none";
  }

  const notice = document.createElement("p");
  notice.className = "catalog-notice";
  notice.hidden = true;

  const loadingMoreEl = document.createElement("div");
  loadingMoreEl.className = "catalog-loading-more";
  loadingMoreEl.hidden = true;
  loadingMoreEl.innerHTML = "" +
    '<div class="loader-spinner" aria-hidden="true">' +
      '<svg class="spinner-svg" viewBox="0 0 50 50">' +
        '<circle class="spinner-track" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>' +
        '<circle class="spinner-circle" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>' +
      '</svg>' +
    '</div>' +
    '<span class="loading-more-text">Đang tải thêm phim...</span>';

  const toast = document.createElement("p");
  toast.className = "home-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;

  const hint = document.createElement("p");
  hint.className = "home-remote-hint";
  hint.textContent = "Phím điều hướng để di chuyển · OK để xem chi tiết & chọn tập";

  catalogSectionWrap.appendChild(headingHeader);
  catalogSectionWrap.appendChild(notice);
  catalogSectionWrap.appendChild(grid);
  catalogSectionWrap.appendChild(loadingMoreEl);
  catalogSectionWrap.appendChild(hint);

  // Main layout wrapper (Sidebar on Left + Main Content on Right)
  const layoutShell = document.createElement("div");
  layoutShell.className = "home-layout-shell";

  const mainContent = document.createElement("div");
  mainContent.className = "home-main-content";
  mainContent.appendChild(tvStatusWidget);
  mainContent.appendChild(heroCarousel.element);
  mainContent.appendChild(homeCarouselsContainer);
  mainContent.appendChild(catalogSectionWrap);

  layoutShell.appendChild(sidebar);
  layoutShell.appendChild(mainContent);

  screen.appendChild(header);
  screen.appendChild(layoutShell);
  screen.appendChild(mobileBottomNav);
  screen.appendChild(toast);

  function focusPrimaryNav() {
    if (isTv() && sidebarButtons.length) {
      const activeSideBtn = sidebarButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || sidebarButtons[0];
      activeSideBtn.focus();
      return;
    }
    const activeTabBtn = tabButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || tabButtons[0];
    if (activeTabBtn) {
      activeTabBtn.focus();
    }
  }

  // Mount Custom TV Search Keyboard
  tvKeyboard = createTvSearchKeyboard(screen, {
    onChange: function (newVal) {
      handleSearchValueChange(newVal);
    },
    onSubmit: function (_val) {
      if (cards.length > 0) {
        setSelectedCard(cards[0], true);
      }
    },
    onMoveLeftToGrid: function () {
      if (cards.length > 0) {
        const targetIdx = (activeCardIndex >= 0 && activeCardIndex < cards.length) ? activeCardIndex : 0;
        setSelectedCard(cards[targetIdx], true);
      } else {
        tvKeyboard.close();
        focusPrimaryNav();
      }
    },
    onMoveUpToHeader: function () {
      focusPrimaryNav();
    },
    onClose: function () {
      searchBox.classList.remove("is-keyboard-active");
      cachedMeasuredWidth = 0;
      updateColumnsCount();
      currentStartRow = -1;
      currentEndRow = -1;
      updateVirtualWindow();
    }
  });

  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }
  root.appendChild(screen);

  function showBackPrompt(text) {
    window.clearTimeout(toastTimer);
    toast.textContent = text;
    toast.hidden = false;
    toastTimer = window.setTimeout(function () {
      toast.hidden = true;
    }, 2400);
  }

  function render(result) {
    currentResult = result;
    clearGrid();
    cards = [];
    selectedCardEntry = null;
    currentActionEntry = null;
    activeCardIndex = 0;
    notice.textContent = "";
    notice.hidden = true;

    if (result.failedAll) {
      const reason = result.errors && result.errors.length ? " " + result.errors[0].message : "";
      message.textContent = "Không thể tải danh sách phim." + reason;
      message.classList.add("is-error");
      return;
    }

    message.classList.remove("is-error");
    if (!result.movies || !result.movies.length) {
      if (activeTab === "favorites") {
        message.textContent = "Chưa có phim nào trong danh sách của bạn. Hãy chọn ♥ hoặc + Thêm vào danh sách!";
      } else if (activeTab === "history") {
        message.textContent = "Chưa có lịch sử xem phim. Hãy chọn một bộ phim để bắt đầu thưởng thức!";
      } else if (activeTab === "search") {
        message.textContent = 'Không tìm thấy phim phù hợp với từ khóa "' + currentSearchQuery + '".';
      } else {
        message.textContent = "Hiện không có phim nào trong mục này.";
      }
      return;
    }

    message.textContent = result.movies.length + " phim";
    let targetCard = null;

    result.movies.forEach(function (movie, idx) {
      const cardEntry = {
        movie: movie,
        index: idx,
        element: null,
        playButton: null,
        favButton: null,
        image: null,
        posterUrl: (!movie.poster || movie.poster === fallbackPoster) ? fallbackPoster : movie.poster,
        imageAttached: false
      };
      cards.push(cardEntry);

      if (options && options.selectedMovieId && movie.id === options.selectedMovieId) {
        targetCard = cardEntry;
        activeCardIndex = idx;
      }
    });

    updateVirtualWindow();

    if (result.notice) {
      notice.textContent = result.notice;
      notice.hidden = false;
    }

    if (cards.length > 0) {
      updateColumnsCount();
      const hasHero = !heroCarousel.element.hidden;
      const active = document.activeElement;
      const isHeaderActive = (tabButtons && tabButtons.includes(active)) || active === searchInput || (sidebar && sidebar.contains(active)) || (tvKeyboard && tvKeyboard.contains(active));
      const isHeroActive = heroCarousel.element && heroCarousel.element.contains(active);

      if (pendingScrollToGrid) {
        pendingScrollToGrid = false;
        setSelectedCard(targetCard || cards[0], !detailModal.isOpen() && !isHeaderActive);
        if (hasHero) {
          const gridTop = catalogSectionWrap.offsetTop || heading.offsetTop || 420;
          screen.scrollTo({ top: Math.max(0, gridTop - 84), behavior: "smooth" });
        } else {
          screen.scrollTop = 0;
          if (typeof window !== "undefined") {
            window.scrollTo(0, 0);
          }
        }
      } else if (hasHero) {
        setSelectedCard(targetCard || cards[0], false);
        if (!detailModal.isOpen() && !isHeaderActive && !isHeroActive) {
          const heroBtns = heroCarousel.getFocusableElements();
          if (heroBtns.length) {
            heroBtns[0].focus();
          }
          screen.scrollTop = 0;
          if (typeof window !== "undefined") {
            window.scrollTo(0, 0);
          }
        }
      } else {
        setSelectedCard(targetCard || cards[0], !detailModal.isOpen() && !isHeaderActive);
      }
    }
  }

  function appendMovies(newMovies) {
    if (!newMovies || !newMovies.length) {
      return;
    }
    let appendedCount = 0;
    let startIndex = cards.length;

    newMovies.forEach(function (movie) {
      const exists = cards.some(function (c) {
        return (movie.slug && c.movie.slug === movie.slug) || (movie.id && c.movie.id === movie.id);
      });
      if (exists) {
        return;
      }

      cards.push({
        movie: movie,
        index: startIndex,
        element: null,
        playButton: null,
        favButton: null,
        image: null,
        posterUrl: (!movie.poster || movie.poster === fallbackPoster) ? fallbackPoster : movie.poster,
        imageAttached: false
      });
      startIndex += 1;
      appendedCount += 1;
    });

    if (appendedCount > 0) {
      updateVirtualWindow();
      message.textContent = cards.length + " phim";
    }
  }

  function loadMore() {
    if (isLoadingMore || !hasMore || destroyed) {
      return;
    }
    if (activeTab === "favorites" || activeTab === "history") {
      return;
    }

    isLoadingMore = true;
    loadingMoreEl.hidden = false;
    const nextPage = currentPage + 1;

    let promise;
    if (activeTab === "new") {
      promise = kkphimApi.getNewUpdated(nextPage);
    } else if (activeTab === "movies") {
      promise = kkphimApi.getMoviesByCategory("phim-le", nextPage, 24);
    } else if (activeTab === "tvshows") {
      promise = kkphimApi.getMoviesByCategory("phim-bo", nextPage, 24);
    } else if (activeTab === "trending") {
      promise = kkphimApi.getTrending(nextPage);
    } else if (activeTab === "recommended") {
      const profile = mlRecommendationService.trainModel();
      const topGenre = (profile && profile.rankedGenres && profile.rankedGenres[0] && profile.rankedGenres[0].slug) || "hanh-dong";
      promise = kkphimApi.getMoviesByGenre(topGenre, nextPage, 24).then(function (res) {
        const rawList = (res && Array.isArray(res.movies)) ? res.movies : [];
        const scoredList = rawList.map(function (m) {
          const ev = mlRecommendationService.scoreMovie(m, profile);
          return Object.assign({}, m, { mlScore: ev.score, mlMatchPercent: ev.matchPercent });
        }).sort(function (a, b) { return (b.mlScore || 0) - (a.mlScore || 0); });
        return { movies: scoredList };
      });
    } else if (activeTab === "genre" && activeGenre) {
      promise = kkphimApi.getMoviesByGenre(activeGenre.slug, nextPage, 24);
    } else if (activeTab === "search") {
      promise = kkphimApi.searchMovies(currentSearchQuery, 24, nextPage);
    }

    if (!promise) {
      isLoadingMore = false;
      loadingMoreEl.hidden = true;
      return;
    }

    promise.then(function (res) {
      if (destroyed) {
        return;
      }
      const newMovies = res && Array.isArray(res.movies) ? res.movies : [];
      if (!newMovies.length) {
        hasMore = false;
        return;
      }
      currentPage = nextPage;
      appendMovies(newMovies);
    }).catch(function (err) {
      console.warn("Không thể tải thêm phim:", err);
    }).then(function () {
      isLoadingMore = false;
      if (!destroyed) {
        loadingMoreEl.hidden = true;
      }
    });
  }

  // IntersectionObserver for infinite scroll
  let sentinelObserver = null;
  if (typeof IntersectionObserver !== "undefined") {
    sentinelObserver = new IntersectionObserver(function (entries) {
      if (entries[0] && entries[0].isIntersecting) {
        if (!isLoadingMore && hasMore && !destroyed && activeTab !== "favorites" && activeTab !== "history") {
          loadMore();
        }
      }
    }, {
      root: screen,
      rootMargin: "600px 0px"
    });
    sentinelObserver.observe(loadingMoreEl);
  }

  // Scroll listener (Sticky header opacity + Virtual window update)
  let scrollRafId = 0;
  let lastVirtualScrollTop = 0;
  function onScreenScroll() {
    const st = screen.scrollTop || 0;
    header.classList.toggle("is-scrolled", st > 24);

    if (Math.abs(st - lastVirtualScrollTop) > 360) {
      lastVirtualScrollTop = st;
      updateVirtualWindow();
    } else {
      scheduleVirtualUpdate();
    }
    if (sentinelObserver || scrollRafId || isLoadingMore || !hasMore || destroyed || activeTab === "favorites" || activeTab === "history") {
      return;
    }
    scrollRafId = window.requestAnimationFrame(function () {
      scrollRafId = 0;
      if (isLoadingMore || !hasMore || destroyed || activeTab === "favorites" || activeTab === "history") {
        return;
      }
      const scrollBottom = screen.scrollHeight - screen.scrollTop - screen.clientHeight;
      if (scrollBottom < 400) {
        loadMore();
      }
    });
  }
  screen.addEventListener("scroll", onScreenScroll, { passive: true });

  function updateNavButtonsUI() {
    tabButtons.forEach(function (btn) {
      const isAct = btn.dataset.tabId === activeTab;
      btn.classList.toggle("is-active", isAct);
      btn.setAttribute("aria-selected", isAct ? "true" : "false");
    });
    sidebarButtons.forEach(function (btn) {
      if (!btn.dataset.tabId) {
        btn.classList.toggle("is-active", activeTab === "search" && btn.dataset.action === "search");
        return;
      }
      const isAct = btn.dataset.tabId === activeTab;
      btn.classList.toggle("is-active", isAct);
    });
    mobileNavButtons.forEach(function (btn) {
      const isAct = btn.dataset.tabId === activeTab;
      btn.classList.toggle("is-active", isAct);
    });
  }

  function openGenreTab(genre) {
    if (!genre) {
      return;
    }
    activeGenre = genre;
    switchTab("genre");
    screen.scrollTo({ top: 0, behavior: "smooth" });
  }

  function switchTab(tabId, keepKeyboardOpen) {
    if (activeTab !== "search") {
      previousTab = activeTab;
    }
    activeTab = tabId;
    currentPage = 1;
    hasMore = true;
    isLoadingMore = false;
    loadingMoreEl.hidden = true;
    cachedGridTop = 0;
    updateNavButtonsUI();

    if (tabId !== "search") {
      currentSearchQuery = "";
      if (searchInput.value) {
        searchInput.value = "";
        if (tvKeyboard) {
          tvKeyboard.setValue("");
        }
        searchClear.hidden = true;
      }
      if (!keepKeyboardOpen && tvKeyboard && tvKeyboard.isOpen()) {
        tvKeyboard.close();
      }
    }

    const kbOpen = Boolean(tvKeyboard && tvKeyboard.isOpen());
    const showHero = (tabId === "new" || tabId === "movies" || tabId === "tvshows" || tabId === "trending") && !kbOpen;
    heroCarousel.element.hidden = !showHero;
    if (showHero) {
      heroCarousel.startAutoSlide();
    } else {
      heroCarousel.stopAutoSlide();
    }

    // Show Home Carousels only on "new" (Trang chủ) when keyboard is closed
    const showCarousels = (tabId === "new") && !kbOpen;
    homeCarouselsContainer.hidden = !showCarousels;
    if (showCarousels) {
      refreshContinueWatching();
    }

    if (tabId === "new") {
      heading.textContent = "Kho phim khám phá";
    } else if (tabId === "movies") {
      heading.textContent = "Phim lẻ đặc sắc";
    } else if (tabId === "tvshows") {
      heading.textContent = "Phim bộ & TV Show";
    } else if (tabId === "trending") {
      heading.textContent = "Phim đang thịnh hành";
    } else if (tabId === "recommended") {
      heading.textContent = "Phim đề xuất cho bạn";
      screen.scrollTop = 0;
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
      }
    } else if (tabId === "favorites") {
      heading.textContent = "Danh sách của tôi";
    } else if (tabId === "history") {
      heading.textContent = "Lịch sử xem phim";
    } else if (tabId === "genre" && activeGenre) {
      heading.textContent = "Thể loại: " + activeGenre.name;
    }

    loadTab(tabId, false);
  }

  function executeSearch(keyword) {
    const kw = (keyword || "").trim();
    if (!kw) {
      return;
    }
    recordUserSearchQuery(kw);
    if (activeTab !== "search") {
      previousTab = activeTab;
    }
    activeTab = "search";
    currentPage = 1;
    hasMore = true;
    isLoadingMore = false;
    loadingMoreEl.hidden = true;
    cachedGridTop = 0;
    currentSearchQuery = kw;

    updateNavButtonsUI();
    heroCarousel.element.hidden = true;
    heroCarousel.stopAutoSlide();
    homeCarouselsContainer.hidden = true;
    heading.textContent = 'Kết quả tìm kiếm: "' + kw + '"';
    const cachedSearch = (typeof kkphimApi.getCachedSearch === "function") ? kkphimApi.getCachedSearch(kw, 1) : null;
    if (cachedSearch && cachedSearch.movies && cachedSearch.movies.length > 0) {
      render({
        movies: cachedSearch.movies,
        errors: [],
        diagnostics: [],
        failedAll: false
      });
      return;
    }
    message.textContent = "Đang tìm kiếm phim...";
    message.classList.remove("is-error");

    kkphimApi.searchMovies(kw, 24, 1).then(function (res) {
      if (destroyed || activeTab !== "search" || currentSearchQuery !== kw) {
        return;
      }
      render({
        movies: res.movies || [],
        errors: [],
        diagnostics: [],
        failedAll: false
      });
    }).catch(function (error) {
      if (destroyed || activeTab !== "search") {
        return;
      }
      render({
        movies: [],
        errors: [{ message: error.message || "Lỗi khi tìm kiếm phim." }],
        diagnostics: [],
        failedAll: true
      });
    });
  }

  function loadTab(tabId, force) {
    if (destroyed) {
      return;
    }
    loadTabSeq += 1;
    const reqSeq = loadTabSeq;
    refreshing = true;
    message.classList.remove("is-error");

    if (!currentResult || !currentResult.movies || !currentResult.movies.length) {
      message.textContent = "Đang tải danh sách phim...";
    } else {
      notice.textContent = "Đang làm mới danh sách phim...";
      notice.hidden = false;
    }

    let promise;
    if (tabId === "new") {
      promise = kkphimApi.getNewUpdated(1).then(function (res) {
        const list = res.movies || [];
        newReleasesCarousel.setMovies(list);
        genreSection.updateBackdropsFromMovies(list);
        return { movies: list, errors: [], diagnostics: [], failedAll: false };
      });
    } else if (tabId === "movies") {
      promise = kkphimApi.getMoviesByCategory("phim-le", 1, 24).then(function (res) {
        return { movies: res.movies || [], errors: [], diagnostics: [], failedAll: false };
      });
    } else if (tabId === "tvshows") {
      promise = kkphimApi.getMoviesByCategory("phim-bo", 1, 24).then(function (res) {
        return { movies: res.movies || [], errors: [], diagnostics: [], failedAll: false };
      });
    } else if (tabId === "trending") {
      promise = googleTrendingService.getTrending(force).then(function (res) {
        return { movies: res.movies || [], errors: [], diagnostics: [], failedAll: false };
      });
    } else if (tabId === "recommended") {
      promise = mlRecommendationService.getRecommendations({ force: Boolean(force), limit: 24 }).then(function (res) {
        const list = (res && Array.isArray(res.movies)) ? res.movies : [];
        if (list.length > 0) {
          latestRecommendedMovies = list.slice();
          return { movies: list, errors: [], diagnostics: [], failedAll: false };
        }
        if (latestRecommendedMovies.length > 0) {
          return { movies: latestRecommendedMovies.slice(), errors: [], diagnostics: [], failedAll: false };
        }
        return kkphimApi.getMoviesByCategory("phim-le", 1, 24).then(function (fallbackRes) {
          return { movies: (fallbackRes && fallbackRes.movies) || [], errors: [], diagnostics: [], failedAll: false };
        });
      });
    } else if (tabId === "genre" && activeGenre) {
      promise = kkphimApi.getMoviesByGenre(activeGenre.slug, 1, 24).then(function (res) {
        return { movies: res.movies || [], errors: [], diagnostics: [], failedAll: false };
      });
    } else if (tabId === "favorites") {
      const favs = getFavorites();
      promise = Promise.resolve({
        movies: favs.slice(),
        errors: [],
        diagnostics: [],
        failedAll: false
      });
    } else if (tabId === "history") {
      const hist = getWatchHistory();
      promise = Promise.resolve({
        movies: hist.slice(),
        errors: [],
        diagnostics: [],
        failedAll: false
      });
    } else {
      promise = Promise.resolve({ movies: [], errors: [], diagnostics: [], failedAll: false });
    }

    promise.then(function (result) {
      if (!destroyed && reqSeq === loadTabSeq && activeTab === tabId) {
        render(result);
      }
    }).catch(function (error) {
      if (!destroyed && reqSeq === loadTabSeq && activeTab === tabId) {
        render({
          movies: [],
          errors: [{ message: error.message || "Không thể tải dữ liệu phim." }],
          diagnostics: [],
          failedAll: true
        });
      }
    }).then(function () {
      if (reqSeq !== loadTabSeq) {
        return;
      }
      refreshing = false;
      if (!destroyed && !detailModal.isOpen()) {
        if (!screen.contains(document.activeElement)) {
          if (options && options.selectedMovieId) {
            const matchIndex = currentResult && currentResult.movies ?
              currentResult.movies.findIndex(function (m) { return m.id === options.selectedMovieId; }) : -1;
            if (matchIndex >= 0 && cards[matchIndex]) {
              setSelectedCard(cards[matchIndex], true);
              return;
            }
          }
          if (cards.length) {
            setSelectedCard(cards[activeCardIndex] || cards[0], false);
          }
        }
      }
    });
  }

  function refreshMlRecommendations(force, isBackgroundTick) {
    if (destroyed || isMlRunning) {
      return;
    }
    if (isBackgroundTick && typeof document !== "undefined" && document.hidden) {
      return;
    }
    isMlRunning = true;
    mlRecommendationService.getRecommendations({ force: Boolean(force), limit: 24 }).then(function (res) {
      isMlRunning = false;
      if (destroyed) {
        return;
      }
      const movies = (res && Array.isArray(res.movies)) ? res.movies : [];
      if (movies.length) {
        latestRecommendedMovies = movies.slice();
        const nextSig = movies.slice(0, 14).map(function (m) {
          return (m.slug || m.id) + ":" + (m.mlMatchPercent || "");
        }).join("|");
        const activeEl = typeof document !== "undefined" ? document.activeElement : null;
        const focusInsideRecCarousel = Boolean(
          isBackgroundTick &&
          activeEl &&
          recommendedCarousel &&
          recommendedCarousel.element &&
          recommendedCarousel.element.contains(activeEl)
        );
        if (nextSig !== lastRenderedRecommendedSig && !focusInsideRecCarousel) {
          lastRenderedRecommendedSig = nextSig;
          recommendedCarousel.setMovies(movies.slice(0, 14));
          if (activeTab === "recommended" && !isBackgroundTick) {
            render({ movies: movies, errors: [], diagnostics: [], failedAll: false });
          }
        }
      } else if (!latestRecommendedMovies.length) {
        return kkphimApi.getMoviesByCategory("phim-le", 1, 14).then(function (fallbackRes) {
          if (!destroyed && fallbackRes && Array.isArray(fallbackRes.movies)) {
            latestRecommendedMovies = fallbackRes.movies.slice();
            recommendedCarousel.setMovies(fallbackRes.movies);
          }
        });
      }
    }).catch(function () {
      isMlRunning = false;
      if (latestRecommendedMovies.length) {
        return;
      }
      kkphimApi.getHome().then(function (res) {
        if (!destroyed && res && res.movies) {
          latestRecommendedMovies = res.movies.slice();
          recommendedCarousel.setMovies(res.movies);
        }
      }).catch(function () {});
    });
  }

  function loadInitialHomeCarousels() {
    refreshContinueWatching();

    // 1. Trending + Hero + Top 10 (Highest priority for initial above-the-fold viewport)
    googleTrendingService.getTrending(false).then(function (res) {
      if (destroyed) {
        return;
      }
      const list = (res && Array.isArray(res.movies)) ? res.movies : [];
      if (list.length) {
        heroCarousel.setMovies(list, kkphimApi);
        top10Carousel.setMovies(list.slice(0, 10));
        trendingCarousel.setMovies(list.slice(0, 14));
        const active = document.activeElement;
        const isHeaderFocused = (tabButtons && tabButtons.includes(active)) || active === searchInput || (sidebar && sidebar.contains(active)) || (tvKeyboard && tvKeyboard.contains(active));
        if (!detailModal.isOpen() && !isHeaderFocused && !(tvKeyboard && tvKeyboard.isOpen())) {
          const heroBtns = heroCarousel.getFocusableElements();
          if (heroBtns.length) {
            heroBtns[0].focus();
            screen.scrollTop = 0;
            if (typeof window !== "undefined") {
              window.scrollTo(0, 0);
            }
          }
        }
      }
    }).catch(function (err) {
      console.warn("Lỗi tải hero & top 10:", err);
    });

    // 2. Machine Learning Personalized Recommendations - Automatically runs ML model & searches API, then re-evaluates every 10s
    window.setTimeout(function () {
      if (destroyed) {
        return;
      }
      refreshMlRecommendations(false, false);
    }, 300);

    if (mlModelIntervalTimer) {
      window.clearInterval(mlModelIntervalTimer);
    }
    mlModelIntervalTimer = window.setInterval(function () {
      if (destroyed) {
        return;
      }
      refreshMlRecommendations(true, true);
    }, 10000);

    // 3. Featured Series (phim-bo) - Staggered by 700ms
    window.setTimeout(function () {
      if (destroyed) {
        return;
      }
      kkphimApi.getMoviesByCategory("phim-bo", 1, 14).then(function (res) {
        if (destroyed) {
          return;
        }
        const movies = (res && Array.isArray(res.movies)) ? res.movies : [];
        seriesCarousel.setMovies(movies);
      }).catch(function () {});
    }, 700);
  }

  function onWindowResize() {
    cachedMeasuredWidth = 0;
    cachedGridTop = 0;
    updateColumnsCount();
    updateVirtualWindow();
  }
  window.addEventListener("resize", onWindowResize);

  loadInitialHomeCarousels();
  switchTab("new");

  // Helper to get visible interactive rows inside homeCarouselsContainer for TV D-Pad navigation
  function getVisibleCarouselRows() {
    if (homeCarouselsContainer.hidden) {
      return [];
    }
    const rows = [];
    carouselSections.forEach(function (sec) {
      if (!sec || !sec.element || sec.element.hidden) {
        return;
      }
      const items = sec.getFocusableCards ? sec.getFocusableCards() : [];
      if (items && items.length) {
        rows.push({ section: sec, items: items });
      }
    });
    return rows;
  }

  return {
    onKeyDown(event, key) {
      if (detailModal.isOpen()) {
        return detailModal.onKeyDown(event, key);
      }

      const active = document.activeElement;

      // Delegate to custom TV keyboard when focus is inside it
      if (tvKeyboard && tvKeyboard.isOpen() && tvKeyboard.contains(active)) {
        return tvKeyboard.onKeyDown(event, key);
      }

      const isTyping = !isTv() && active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");

      if (isTyping) {
        if (key.isEscape || key.isBack) {
          active.blur();
          focusPrimaryNav();
          return true;
        }
        if (key.direction === "down") {
          active.blur();
          if (!heroCarousel.element.hidden) {
            const heroBtns = heroCarousel.getFocusableElements();
            if (heroBtns.length) {
              heroBtns[0].focus();
              return true;
            }
          }
          if (cards.length > 0) {
            setSelectedCard(cards[0], true);
            return true;
          }
        }
        return false;
      }

      if (key.isBack) {
        if (tvKeyboard && tvKeyboard.isOpen()) {
          tvKeyboard.close();
          focusPrimaryNav();
          return true;
        }
        if (currentActionEntry || (selectedCardEntry && selectedCardEntry.element && selectedCardEntry.element.classList.contains("has-action-focus"))) {
          cancelStageB(currentActionEntry || selectedCardEntry);
          return true;
        }
        const activeIdx = getActiveCardIndex();
        if (activeIdx !== -1) {
          const cardEntry = cards[activeIdx];
          if (cardEntry.element && (document.activeElement === cardEntry.playButton || cardEntry.element.classList.contains("has-action-focus"))) {
            cancelStageB(cardEntry);
            return true;
          }
        }
        if (activeTab === "search" && searchInput.value) {
          searchInput.value = "";
          if (tvKeyboard) {
            tvKeyboard.setValue("");
          }
          searchClear.hidden = true;
          switchTab(previousTab || "new");
          return true;
        }
        if (activeTab === "genre" || activeTab === "recommended") {
          switchTab("new");
          return true;
        }
        if (!key.isRepeat) {
          actionsHandler.onBack();
        }
        return true;
      }

      const topHeaderNav = tabButtons.concat([searchInput]);
      const isHeaderActive = topHeaderNav.includes(active) || active === searchClear;
      const isSidebarActive = sidebar && sidebar.contains(active);
      const isHeroActive = heroCarousel.element && heroCarousel.element.contains(active);
      const isCarouselActive = homeCarouselsContainer && !homeCarouselsContainer.hidden && homeCarouselsContainer.contains(active);

      if (!isHeaderActive && !isSidebarActive && !isHeroActive && !isCarouselActive) {
        const hasHero = !heroCarousel.element.hidden;
        const heroBtns = hasHero ? heroCarousel.getFocusableElements() : [];
        if (hasHero && heroBtns.length && (!active || active === document.body || active === document.documentElement || active === screen || active === root) && screen.scrollTop < 200) {
          heroBtns[0].focus();
        } else {
          const activeIdx = getActiveCardIndex();
          if (activeIdx === -1 && cards.length > 0) {
            const fallbackIdx = (activeCardIndex >= 0 && activeCardIndex < cards.length) ? activeCardIndex : 0;
            setSelectedCard(cards[fallbackIdx], true);
          } else if (cards.length > 0 && (!active || active === document.body || active === document.documentElement || active === screen || active === root)) {
            const idxToFocus = activeIdx >= 0 ? activeIdx : 0;
            setSelectedCard(cards[idxToFocus], true);
          }
        }
      }

      if (key.isSelect) {
        if (active === searchInput) {
          openCustomTvKeyboard(true);
          return true;
        }
        if (tabButtons.includes(active) || sidebarButtons.includes(active)) {
          active.click();
          return true;
        }
        if (active === searchClear) {
          searchClear.click();
          return true;
        }
        if (isHeroActive || isCarouselActive) {
          if (typeof active.click === "function") {
            active.click();
            return true;
          }
        }
        const activeIdx = getActiveCardIndex();
        if (activeIdx !== -1) {
          const cardEntry = cards[activeIdx];
          if (tvKeyboard && tvKeyboard.isOpen()) {
            tvKeyboard.close();
          }
          if (active === cardEntry.playButton || currentActionEntry === cardEntry) {
            if (cardEntry.movie.slug) {
              detailModal.open(cardEntry.movie);
            } else if (cardEntry.movie.playbackEnabled) {
              actionsHandler.onSelect(cardEntry.movie);
            } else {
              actionsHandler.onPlaybackUnavailable(cardEntry.movie);
            }
            return true;
          } else {
            if (cardEntry.movie && cardEntry.movie.slug) {
              detailModal.open(cardEntry.movie);
            } else {
              activateStageB(cardEntry);
            }
            return true;
          }
        }
        return false;
      }

      // Sidebar Navigation
      if (isSidebarActive) {
        const sIdx = sidebarButtons.indexOf(active);
        if (key.direction === "up") {
          if (sIdx > 0) {
            sidebarButtons[sIdx - 1].focus();
          }
          return true;
        }
        if (key.direction === "down") {
          if (sIdx < sidebarButtons.length - 1) {
            sidebarButtons[sIdx + 1].focus();
          }
          return true;
        }
        if (key.direction === "right") {
          if (!heroCarousel.element.hidden) {
            const heroBtns = heroCarousel.getFocusableElements();
            if (heroBtns.length) {
              heroBtns[0].focus();
              return true;
            }
          }
          const rows = getVisibleCarouselRows();
          if (rows.length && rows[0].items.length) {
            rows[0].items[0].focus();
            return true;
          }
          if (cards.length > 0) {
            setSelectedCard(cards[activeCardIndex >= 0 ? activeCardIndex : 0], true);
            return true;
          }
        }
        return true;
      }

      // Horizontal Carousel Navigation
      if (isCarouselActive) {
        const rows = getVisibleCarouselRows();
        let foundRowIdx = -1;
        let foundColIdx = -1;
        for (let r = 0; r < rows.length; r += 1) {
          const cIdx = rows[r].items.indexOf(active);
          if (cIdx !== -1) {
            foundRowIdx = r;
            foundColIdx = cIdx;
            break;
          }
        }
        if (foundRowIdx !== -1) {
          const currentRowItems = rows[foundRowIdx].items;
          if (key.direction === "left") {
            if (foundColIdx > 0) {
              const prevEl = currentRowItems[foundColIdx - 1];
              prevEl.focus({ preventScroll: true });
              if (typeof prevEl.scrollIntoView === "function") {
                prevEl.scrollIntoView({ block: "nearest", inline: "nearest" });
              }
              return true;
            } else if (sidebarButtons.length) {
              const activeSideBtn = sidebarButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || sidebarButtons[0];
              activeSideBtn.focus();
              return true;
            }
          } else if (key.direction === "right") {
            if (foundColIdx < currentRowItems.length - 1) {
              const nextEl = currentRowItems[foundColIdx + 1];
              nextEl.focus({ preventScroll: true });
              if (typeof nextEl.scrollIntoView === "function") {
                nextEl.scrollIntoView({ block: "nearest", inline: "nearest" });
              }
              return true;
            }
            return true;
          } else if (key.direction === "up") {
            if (foundRowIdx > 0) {
              const prevRowItems = rows[foundRowIdx - 1].items;
              const targetEl = prevRowItems[Math.min(foundColIdx, prevRowItems.length - 1)];
              targetEl.focus({ preventScroll: true });
              ensureCardVisible(targetEl);
              return true;
            } else if (!heroCarousel.element.hidden) {
              const heroBtns = heroCarousel.getFocusableElements();
              if (heroBtns.length) {
                heroBtns[0].focus();
                screen.scrollTop = 0;
                return true;
              }
            }
          } else if (key.direction === "down") {
            if (foundRowIdx < rows.length - 1) {
              const nextRowItems = rows[foundRowIdx + 1].items;
              const targetEl = nextRowItems[Math.min(foundColIdx, nextRowItems.length - 1)];
              targetEl.focus({ preventScroll: true });
              ensureCardVisible(targetEl);
              return true;
            } else if (cards.length > 0) {
              setSelectedCard(cards[0], true);
              return true;
            }
          }
        }
      }

      if (key.direction === "left" || key.direction === "right") {
        const headerNavIndex = topHeaderNav.indexOf(active);

        if (headerNavIndex !== -1) {
          const delta = key.direction === "left" ? -1 : 1;
          const nextNavIdx = headerNavIndex + delta;
          if (nextNavIdx >= 0 && nextNavIdx < topHeaderNav.length) {
            const nextTarget = topHeaderNav[nextNavIdx];
            if (nextTarget === searchInput && isTv()) {
              openCustomTvKeyboard(true);
            } else {
              nextTarget.focus();
            }
            return true;
          }
          if (key.direction === "left" && headerNavIndex === 0 && sidebarButtons.length) {
            sidebarButtons[0].focus();
            return true;
          }
          if (key.direction === "right" && active === searchInput && tvKeyboard && tvKeyboard.isOpen()) {
            tvKeyboard.focusFirstKey();
            return true;
          }
          return true;
        }

        // Inside hero carousel
        if (isHeroActive) {
          const heroBtns = heroCarousel.getFocusableElements();
          const currentHeroIdx = heroBtns.indexOf(active);
          if (currentHeroIdx !== -1) {
            if (key.direction === "left" && currentHeroIdx === 0 && sidebarButtons.length) {
              const activeSideBtn = sidebarButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || sidebarButtons[0];
              activeSideBtn.focus();
              return true;
            }
            const nextHeroIdx = currentHeroIdx + (key.direction === "left" ? -1 : 1);
            if (nextHeroIdx >= 0 && nextHeroIdx < heroBtns.length) {
              heroBtns[nextHeroIdx].focus();
              return true;
            } else if (key.direction === "right" && tvKeyboard && tvKeyboard.isOpen()) {
              tvKeyboard.focusFirstKey();
              return true;
            }
          }
          return true;
        }

        const activeIdx = getActiveCardIndex();
        if (activeIdx !== -1) {
          clearActionFocus();
          const cols = cachedColumnsCount || (isTv() ? 6 : 5);
          if (key.direction === "left" && (activeIdx % cols) === 0 && sidebarButtons.length) {
            const activeSideBtn = sidebarButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || sidebarButtons[0];
            activeSideBtn.focus();
            return true;
          }
          if (key.direction === "right" && tvKeyboard && tvKeyboard.isOpen()) {
            const isRightEdgeOfRow = ((activeIdx % cols) === cols - 1) || (activeIdx === cards.length - 1);
            if (isRightEdgeOfRow) {
              tvKeyboard.focusFirstKey();
              return true;
            }
          }
          const delta = key.direction === "left" ? -1 : 1;
          const nextIdx = Math.max(0, Math.min(cards.length - 1, activeIdx + delta));
          setSelectedCard(cards[nextIdx], true);
          return true;
        }
        return false;
      }

      if (key.direction === "up" || key.direction === "down") {
        const activeIdx = getActiveCardIndex();
        const cols = cachedColumnsCount || (isTv() ? 6 : 5);

        if (key.direction === "up") {
          if (isHeroActive) {
            focusPrimaryNav();
            return true;
          }

          if (activeIdx !== -1) {
            clearActionFocus();
            const targetIdx = activeIdx - cols;
            if (targetIdx >= 0) {
              setSelectedCard(cards[targetIdx], true);
              return true;
            } else {
              const rows = getVisibleCarouselRows();
              if (rows.length > 0) {
                const lastRow = rows[rows.length - 1];
                if (lastRow.items.length) {
                  lastRow.items[0].focus({ preventScroll: true });
                  ensureCardVisible(lastRow.items[0]);
                  return true;
                }
              }
              if (!heroCarousel.element.hidden) {
                const heroBtns = heroCarousel.getFocusableElements();
                if (heroBtns.length) {
                  heroBtns[0].focus();
                  screen.scrollTop = 0;
                  if (typeof window !== "undefined") {
                    window.scrollTo(0, 0);
                  }
                  return true;
                }
              }
              focusPrimaryNav();
              return true;
            }
          }
        } else if (key.direction === "down") {
          if (topHeaderNav.includes(active)) {
            if (active === searchInput && tvKeyboard && tvKeyboard.isOpen()) {
              tvKeyboard.focusFirstKey();
              return true;
            }
            if (!heroCarousel.element.hidden) {
              const heroBtns = heroCarousel.getFocusableElements();
              if (heroBtns.length) {
                heroBtns[0].focus();
                return true;
              }
            }
            if (cards.length > 0) {
              setSelectedCard(cards[activeCardIndex >= 0 ? activeCardIndex : 0], true);
              return true;
            }
          } else if (isHeroActive) {
            const rows = getVisibleCarouselRows();
            if (rows.length > 0 && rows[0].items.length > 0) {
              const firstCarouselCard = rows[0].items[0];
              firstCarouselCard.focus({ preventScroll: true });
              ensureCardVisible(firstCarouselCard);
              return true;
            }
            if (cards.length > 0) {
              setSelectedCard(cards[activeCardIndex] || cards[0], true);
              return true;
            }
          } else if (activeIdx !== -1) {
            clearActionFocus();
            const targetIdx = activeIdx + cols;
            if (targetIdx < cards.length) {
              setSelectedCard(cards[targetIdx], true);
              return true;
            } else if (hasMore && !isLoadingMore && activeTab !== "favorites" && activeTab !== "history") {
              loadMore();
              return true;
            }
            return true;
          }
        }
        return false;
      }

      return false;
    },
    onKeyUp() {
      return false;
    },
    showBackPrompt: showBackPrompt,
    getResult() {
      return currentResult;
    },
    openMovie(movieOrSlug) {
      if (typeof movieOrSlug === "string") {
        detailModal.open({ slug: movieOrSlug, title: "" });
      } else if (movieOrSlug && movieOrSlug.slug) {
        detailModal.open(movieOrSlug);
      }
    },
    closeDetail() {
      if (detailModal.isOpen()) {
        detailModal.close();
      }
    },
    isDetailOpen() {
      return detailModal.isOpen();
    },
    destroy() {
      destroyed = true;
      if (sentinelObserver) {
        sentinelObserver.disconnect();
        sentinelObserver = null;
      }
      if (scrollRafId) {
        window.cancelAnimationFrame(scrollRafId);
        scrollRafId = 0;
      }
      if (virtualScrollRaf) {
        window.cancelAnimationFrame(virtualScrollRaf);
        virtualScrollRaf = 0;
      }
      if (clockTimer) {
        window.clearInterval(clockTimer);
        clockTimer = 0;
      }
      if (mlModelIntervalTimer) {
        window.clearInterval(mlModelIntervalTimer);
        mlModelIntervalTimer = 0;
      }
      clearGrid();
      window.removeEventListener("resize", onWindowResize);
      screen.removeEventListener("scroll", onScreenScroll);
      window.clearTimeout(toastTimer);
      window.clearTimeout(searchDebounceTimer);
      if (tvKeyboard) {
        tvKeyboard.destroy();
      }
      heroCarousel.destroy();
      detailModal.destroy();
      cards = [];
      selectedCardEntry = null;
      currentActionEntry = null;
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

function isTextEntryElement(el) {
  if (!el || !el.tagName) {
    return false;
  }
  if (el.tagName === "TEXTAREA") {
    return true;
  }
  if (el.tagName === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    return type === "text" || type === "search" || type === "password" ||
      type === "email" || type === "url" || type === "tel" || type === "number";
  }
  return false;
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
      key === "XF86Back" || code === 10009 || code === 27 ||
      (code === 8 && !(event && isTextEntryElement(event.target))),
    isEscape: key === "Escape" || code === 27,
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
    const isInput = isTextEntryElement(event.target);
    if (isInput) {
      // In text input, allow normal typing, spaces, backspaces and text cursor navigation.
      // Delegate Escape, Back, ArrowDown, ArrowUp, ArrowLeft (at start), or Enter to screen navigation handler.
      const isBackKey = event.key === "Back" || event.key === "BrowserBack" || event.key === "XF86Back" ||
        event.keyCode === 10009 || event.key === "Escape" || event.keyCode === 27;
      const isDownKey = event.key === "ArrowDown" || event.keyCode === 40;
      const isUpKey = event.key === "ArrowUp" || event.keyCode === 38;
      const isEnterKey = event.key === "Enter" || event.keyCode === 13;
      const isLeftKey = (event.key === "ArrowLeft" || event.keyCode === 37) &&
        (event.target.selectionStart === 0 && event.target.selectionEnd === 0);

      const shouldDelegate = isBackKey || isDownKey || isUpKey || isEnterKey || isLeftKey;
      if (!shouldDelegate) {
        return;
      }
    }
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
registerModule("js/services/kkphim-api.js", function (requireModule) {
var fallbackPoster = requireModule("js/config/catalog-sources.js")["fallbackPoster"];
const BASE_URL = "https://phimapi.com";
const DEFAULT_CDN = "https://phimimg.com";
const VSMOV_BASE_URL = "https://vsmov.com/api";
const VSMOV_CDN = "https://vsmov.com/storage/images/";
const NGUONC_BASE_URL = "https://phim.nguonc.com";

const DEFAULT_TIMEOUT_MS = 5000;
const BACKUP_TIMEOUT_MS = 2500;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DETAIL_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const VSMOV_EMBED_REGEX = /^(https?:\/\/[^/]*streamvsmov\.com)\/video\/([0-9a-fA-F-]+)/i;

/**
 * Extracts a playable direct .m3u8 HLS stream URL from VSMov embed links
 * or ?url= wrapped player links.
 */
function extractDirectM3u8(embedUrl) {
  if (!embedUrl || typeof embedUrl !== "string") return "";
  const clean = embedUrl.trim();
  const vsmovMatch = clean.match(VSMOV_EMBED_REGEX);
  if (vsmovMatch) {
    const host = vsmovMatch[1].replace(/\/+$/, "");
    const uuid = vsmovMatch[2];
    return host + "/stream/" + uuid + "/master.m3u8";
  }
  if (clean.includes("url=")) {
    const after = clean.split("url=")[1].split("&")[0].trim();
    if (after.includes(".m3u8")) {
      try {
        return decodeURIComponent(after);
      } catch (_) {
        return after;
      }
    }
  }
  return "";
}

function buildImageUrl(url, cdnDomain) {
  if (!url || typeof url !== "string") {
    return fallbackPoster;
  }
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    return fallbackPoster;
  }
  if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
    return cleanUrl;
  }
  const domain = (cdnDomain || DEFAULT_CDN).replace(/\/+$/, "");
  const path = cleanUrl.replace(/^\/+/, "");
  return domain + "/" + path;
}

function normalizeMovie(item, cdnDomain, sourceName = "KKPhim") {
  if (!item || typeof item !== "object") {
    return null;
  }
  const slug = item.slug || (item._id ? String(item._id) : "");
  const title = item.name || item.title || item.origin_name || "Phim không tên";
  const rawPoster = item.poster_url || item.thumb_url || item.image || "";
  const rawThumb = item.thumb_url || item.poster_url || item.image || "";
  const poster = buildImageUrl(rawPoster, cdnDomain);
  const thumb = buildImageUrl(rawThumb, cdnDomain);
  const year = item.year ? String(item.year) : "";
  const quality = item.quality || "FHD";
  const lang = item.lang || item.language || "Vietsub";
  const episodeCurrent = item.episode_current || item.current_episode || item.episode_status || "";
  const time = item.time || "";
  const type = item.type || "";

  return {
    id: slug || String(title).toLowerCase().replace(/\s+/g, "-"),
    slug: slug,
    title: title,
    originTitle: item.origin_name || item.original_name || "",
    poster: poster,
    thumb: thumb,
    year: year,
    quality: quality,
    lang: lang,
    episodeCurrent: episodeCurrent,
    time: time,
    type: type,
    source: sourceName,
    playbackEnabled: true
  };
}

function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const fetchFn = (typeof window !== "undefined" && typeof window.fetch === "function")
    ? window.fetch.bind(window)
    : (typeof fetch === "function" ? fetch : null);

  if (fetchFn) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const options = controller ? { signal: controller.signal } : {};
    let timer = 0;
    const request = fetchFn(url, options).then(function (response) {
      if (!response.ok) {
        throw new Error("API trả về mã lỗi HTTP " + response.status);
      }
      return response.json();
    });
    const timeout = new Promise(function (_resolve, reject) {
      timer = setTimeout(function () {
        if (controller) {
          try { controller.abort(); } catch (_) {}
        }
        reject(new Error("Yêu cầu API đã hết thời gian chờ (timeout)."));
      }, timeoutMs);
    });
    return Promise.race([request, timeout]).then(function (data) {
      clearTimeout(timer);
      return data;
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  return new Promise(function (resolve, reject) {
    if (typeof XMLHttpRequest === "undefined") {
      reject(new Error("Môi trường không hỗ trợ fetch hoặc XMLHttpRequest."));
      return;
    }
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.timeout = timeoutMs;
    request.onload = function () {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText));
        } catch (parseError) {
          reject(new Error("Không thể phân tích dữ liệu JSON từ API."));
        }
      } else {
        reject(new Error("API trả về mã lỗi HTTP " + request.status));
      }
    };
    request.onerror = function () {
      reject(new Error("Lỗi kết nối mạng khi tải dữ liệu từ API."));
    };
    request.ontimeout = function () {
      reject(new Error("Yêu cầu API đã hết thời gian chờ (timeout)."));
    };
    request.send();
  });
}

function parseStandardEpisodeServers(episodesArray, sourcePrefix = "KKPhim") {
  if (!Array.isArray(episodesArray)) return [];
  const servers = [];
  for (let i = 0; i < episodesArray.length; i++) {
    const srv = episodesArray[i];
    if (!srv || typeof srv !== "object") continue;
    const rawName = (srv.server_name || "Server " + (i + 1)).replace(/\s+/g, " ").trim();
    const serverName = (sourcePrefix && !rawName.toLowerCase().includes(sourcePrefix.toLowerCase()))
      ? sourcePrefix + " · " + rawName
      : rawName;
    const dataItems = Array.isArray(srv.server_data) ? srv.server_data : (Array.isArray(srv.items) ? srv.items : []);
    const parsedData = [];
    for (let j = 0; j < dataItems.length; j++) {
      const ep = dataItems[j];
      if (!ep || typeof ep !== "object") continue;
      const name = ep.name || "Tập " + (j + 1);
      const slug = ep.slug || String(j);
      const rawM3u8 = (ep.link_m3u8 || ep.m3u8 || "").trim();
      const rawEmbed = (ep.link_embed || ep.embed || "").trim();
      const directM3u8 = rawM3u8 || extractDirectM3u8(rawEmbed);
      if (directM3u8 || rawEmbed) {
        parsedData.push({
          name: name,
          slug: slug,
          filename: ep.filename || name,
          link_m3u8: directM3u8 || rawEmbed,
          link_embed: rawEmbed
        });
      }
    }
    if (parsedData.length > 0) {
      servers.push({
        server_name: serverName,
        server_data: parsedData
      });
    }
  }
  return servers;
}

function parseNguoncEpisodeServers(episodesArray, sourcePrefix = "NguonC") {
  if (!Array.isArray(episodesArray)) return [];
  const servers = [];
  for (let i = 0; i < episodesArray.length; i++) {
    const srv = episodesArray[i];
    if (!srv || typeof srv !== "object") continue;
    const rawName = (srv.server_name || "Server " + (i + 1)).replace(/\s+/g, " ").trim();
    const serverName = (sourcePrefix && !rawName.toLowerCase().includes(sourcePrefix.toLowerCase()))
      ? sourcePrefix + " · " + rawName
      : rawName;
    const items = Array.isArray(srv.items) ? srv.items : (Array.isArray(srv.server_data) ? srv.server_data : []);
    const parsedData = [];
    for (let j = 0; j < items.length; j++) {
      const ep = items[j];
      if (!ep || typeof ep !== "object") continue;
      const name = ep.name || "Tập " + (j + 1);
      const slug = ep.slug || String(j);
      const m3u8 = (ep.m3u8 || ep.link_m3u8 || "").trim();
      const embed = (ep.embed || ep.link_embed || "").trim();
      const stream = m3u8 || extractDirectM3u8(embed) || embed;
      if (stream) {
        parsedData.push({
          name: name,
          slug: slug,
          filename: ep.filename || name,
          link_m3u8: stream,
          link_embed: embed
        });
      }
    }
    if (parsedData.length > 0) {
      servers.push({
        server_name: serverName,
        server_data: parsedData
      });
    }
  }
  return servers;
}

function createKkphimApi() {
  const searchCache = new Map();
  const detailCache = new Map();

  function pruneCaches() {
    const now = Date.now();
    for (const [k, v] of searchCache.entries()) {
      if (now - v.timestamp > SEARCH_CACHE_TTL_MS) searchCache.delete(k);
    }
    for (const [k, v] of detailCache.entries()) {
      if (now - v.timestamp > DETAIL_CACHE_TTL_MS) detailCache.delete(k);
    }
  }

  return {
    getCachedMovieDetail(slug) {
      if (!slug) return null;
      const cached = detailCache.get(slug.toLowerCase().trim());
      if (cached && (Date.now() - cached.timestamp < DETAIL_CACHE_TTL_MS)) {
        return cached.result;
      }
      return null;
    },

    getCachedSearch(keyword, page = 1) {
      if (!keyword) return null;
      const cacheKey = keyword.toLowerCase().trim() + ":" + page;
      const cached = searchCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS)) {
        return cached.result;
      }
      return null;
    },

    clearCache() {
      searchCache.clear();
      detailCache.clear();
    },

    getHome() {
      return fetchJson(BASE_URL + "/v1/api/home").then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          title: "Trending / Nổi bật"
        };
      });
    },

    getTrending(page) {
      const pageNum = page && page > 0 ? page : 1;
      if (pageNum === 1) {
        return this.getHome();
      }
      const category = (pageNum % 2 === 0) ? "phim-bo" : "phim-le";
      return fetchJson(BASE_URL + "/v1/api/danh-sach/" + category + "?page=" + Math.floor(pageNum / 2 + 1)).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          title: "Trending / Nổi bật"
        };
      });
    },

    getNewUpdated(page) {
      const pageNum = page && page > 0 ? page : 1;
      return fetchJson(BASE_URL + "/v1/api/danh-sach/phim-moi-cap-nhat?page=" + pageNum).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          pagination: data.params ? data.params.pagination : null,
          title: "Phim mới cập nhật"
        };
      });
    },

    getMoviesByCategory(categorySlug, page, limit) {
      const slug = (categorySlug || "phim-bo").trim();
      const pageNum = page && page > 0 ? page : 1;
      const limitNum = limit && limit > 0 ? limit : 24;
      const url = BASE_URL + "/v1/api/danh-sach/" + encodeURIComponent(slug) + "?page=" + pageNum + "&limit=" + limitNum;
      return fetchJson(url).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          pagination: data.params ? data.params.pagination : null,
          title: data.titlePage || "Danh sách phim"
        };
      });
    },

    getMoviesByGenre(genreSlug, page, limit) {
      const slug = (genreSlug || "hanh-dong").trim();
      const pageNum = page && page > 0 ? page : 1;
      const limitNum = limit && limit > 0 ? limit : 24;
      const url = BASE_URL + "/v1/api/the-loai/" + encodeURIComponent(slug) + "?page=" + pageNum + "&limit=" + limitNum;
      return fetchJson(url).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          pagination: data.params ? data.params.pagination : null,
          title: data.titlePage || "Thể loại phim"
        };
      });
    },

    /**
     * Dedicated VSMov / Phim4K API Search (from https://vsmov.com/api-document)
     */
    searchVsmov(keyword, limit = 20, page = 1) {
      const kw = (keyword || "").trim();
      if (!kw) return Promise.resolve([]);
      const url = VSMOV_BASE_URL + "/tim-kiem?keyword=" + encodeURIComponent(kw) + "&limit=" + limit + "&page=" + page;
      return fetchJson(url, BACKUP_TIMEOUT_MS).then(function (res) {
        const items = Array.isArray(res && res.items) ? res.items : (res && res.data && Array.isArray(res.data.items) ? res.data.items : []);
        const cdn = (res && res.pathImage) ? res.pathImage : VSMOV_CDN;
        return items.map(function (item) {
          return normalizeMovie(item, cdn, "Phim4K");
        }).filter(Boolean);
      }).catch(function () {
        return [];
      });
    },

    /**
     * High-Performance Multi-Source Search combining KKPhim, VSMov (Phim4K) and NguonC
     * with In-Memory Caching and fast non-blocking parallel resolution.
     */
    searchMovies(keyword, limit = 20, page = 1) {
      const kw = (keyword || "").trim();
      if (!kw) {
        return Promise.resolve({ movies: [], keyword: "", total: 0 });
      }
      pruneCaches();
      const cacheKey = kw.toLowerCase() + ":" + page + ":" + limit;
      const cached = searchCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS)) {
        return Promise.resolve(cached.result);
      }

      const limitNum = limit > 0 ? limit : 20;
      const pageNum = page > 0 ? page : 1;
      const encoded = encodeURIComponent(kw);

      const kkphimPromise = fetchJson(BASE_URL + "/v1/api/tim-kiem?keyword=" + encoded + "&limit=" + limitNum + "&page=" + pageNum, DEFAULT_TIMEOUT_MS)
        .catch(function () { return null; });

      const vsmovPromise = fetchJson(VSMOV_BASE_URL + "/tim-kiem?keyword=" + encoded + "&limit=" + limitNum + "&page=" + pageNum, BACKUP_TIMEOUT_MS)
        .catch(function () { return null; });

      const nguoncPromise = fetchJson(NGUONC_BASE_URL + "/api/films/search?keyword=" + encoded + "&page=" + pageNum, BACKUP_TIMEOUT_MS)
        .catch(function () { return null; });

      return Promise.all([kkphimPromise, vsmovPromise, nguoncPromise]).then(function ([kkRes, vsmovRes, nguoncRes]) {
        const kkData = kkRes && kkRes.data ? kkRes.data : {};
        const kkCdn = kkData.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const kkItems = Array.isArray(kkData.items) ? kkData.items : [];
        const kkMovies = kkItems.map(function (item) {
          return normalizeMovie(item, kkCdn, "KKPhim");
        }).filter(Boolean);

        const vsmovItems = vsmovRes && Array.isArray(vsmovRes.items) ? vsmovRes.items : (vsmovRes && vsmovRes.data && Array.isArray(vsmovRes.data.items) ? vsmovRes.data.items : []);
        const vsmovCdn = (vsmovRes && vsmovRes.pathImage) ? vsmovRes.pathImage : VSMOV_CDN;
        const vsmovMovies = vsmovItems.map(function (item) {
          return normalizeMovie(item, vsmovCdn, "Phim4K");
        }).filter(Boolean);

        const nguoncItems = nguoncRes && Array.isArray(nguoncRes.items) ? nguoncRes.items : [];
        const nguoncMovies = nguoncItems.map(function (item) {
          return normalizeMovie(item, NGUONC_BASE_URL, "NguonC");
        }).filter(Boolean);

        // Merge & deduplicate by slug / title
        const merged = [];
        const seen = new Set();
        for (const m of [...kkMovies, ...vsmovMovies, ...nguoncMovies]) {
          const key = (m.slug || m.title).toLowerCase().trim();
          if (key && !seen.has(key)) {
            seen.add(key);
            merged.push(m);
          }
        }

        const total = (kkData.params && kkData.params.pagination ? kkData.params.pagination.totalItems : merged.length) || merged.length;
        const result = {
          movies: merged,
          cdn: kkCdn,
          keyword: kw,
          total: Math.max(total, merged.length)
        };

        searchCache.set(cacheKey, { timestamp: Date.now(), result: result });
        return result;
      });
    },

    /**
     * Dedicated VSMov / Phim4K Detail Fetch (from https://vsmov.com/api-document)
     */
    getVsmovDetail(slug) {
      const cleanSlug = (slug || "").trim();
      if (!cleanSlug) return Promise.reject(new Error("Slug phim không hợp lệ."));
      return fetchJson(VSMOV_BASE_URL + "/phim/" + encodeURIComponent(cleanSlug), BACKUP_TIMEOUT_MS).then(function (res) {
        if (!res || !res.status || !res.movie) {
          throw new Error("Không tìm thấy thông tin phim trên VSMov.");
        }
        const movie = res.movie;
        const normalized = normalizeMovie(movie, res.pathImage || VSMOV_CDN, "Phim4K");
        normalized.content = movie.content || movie.description || "";
        normalized.actors = Array.isArray(movie.actor) ? movie.actor : [];
        normalized.categories = Array.isArray(movie.category) ? movie.category.map(function (c) { return c.name || c; }) : [];
        normalized.countries = Array.isArray(movie.country) ? movie.country.map(function (c) { return c.name || c; }) : [];
        normalized.episodeTotal = movie.episode_total || "";
        normalized.status = movie.status || "";

        const episodes = parseStandardEpisodeServers(res.episodes, "Phim4K");
        return {
          movie: normalized,
          episodes: episodes
        };
      });
    },

    /**
     * High-Speed Multi-Source Movie Detail Fetch:
     * Races and aggregates KKPhim, VSMov (Phim4K) and NguonC servers with In-Memory Caching (15m TTL).
     */
    getMovieDetail(slug) {
      const cleanSlug = (slug || "").trim();
      if (!cleanSlug) {
        return Promise.reject(new Error("Slug phim không hợp lệ."));
      }
      pruneCaches();
      const cached = detailCache.get(cleanSlug.toLowerCase());
      if (cached && (Date.now() - cached.timestamp < DETAIL_CACHE_TTL_MS)) {
        return Promise.resolve(cached.result);
      }

      const encoded = encodeURIComponent(cleanSlug);

      const kkphimPromise = fetchJson(BASE_URL + "/phim/" + encoded, DEFAULT_TIMEOUT_MS)
        .catch(function () { return null; });

      const vsmovPromise = fetchJson(VSMOV_BASE_URL + "/phim/" + encoded, BACKUP_TIMEOUT_MS)
        .catch(function () { return null; });

      const nguoncPromise = fetchJson(NGUONC_BASE_URL + "/api/film/" + encoded, BACKUP_TIMEOUT_MS)
        .catch(function () { return null; });

      return Promise.all([kkphimPromise, vsmovPromise, nguoncPromise]).then(function ([kkRes, vsmovRes, nguoncRes]) {
        const primaryRes = (kkRes && kkRes.movie) ? kkRes : (vsmovRes && vsmovRes.movie ? vsmovRes : nguoncRes);
        if (!primaryRes || !primaryRes.movie) {
          throw new Error("Không tìm thấy thông tin chi tiết phim từ bất kỳ máy chủ nào.");
        }

        const rawMovie = primaryRes.movie;
        const cdn = (kkRes && kkRes.movie) ? DEFAULT_CDN : ((vsmovRes && vsmovRes.movie) ? (vsmovRes.pathImage || VSMOV_CDN) : NGUONC_BASE_URL);
        const sourceName = (kkRes && kkRes.movie) ? "KKPhim" : ((vsmovRes && vsmovRes.movie) ? "Phim4K" : "NguonC");

        const normalized = normalizeMovie(rawMovie, cdn, sourceName);
        normalized.content = rawMovie.content || rawMovie.description || "";
        normalized.actors = Array.isArray(rawMovie.actor) ? rawMovie.actor : (typeof rawMovie.casts === "string" ? rawMovie.casts.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : []);
        normalized.categories = Array.isArray(rawMovie.category) ? rawMovie.category.map(function (c) { return c.name || c; }) : [];
        normalized.countries = Array.isArray(rawMovie.country) ? rawMovie.country.map(function (c) { return c.name || c; }) : [];
        normalized.episodeTotal = rawMovie.episode_total || rawMovie.total_episodes || "";
        normalized.status = rawMovie.status || "";

        // Combine servers from all working providers
        const allServers = [];
        const seenStreams = new Set();

        function addServerList(serverList) {
          for (let s = 0; s < serverList.length; s++) {
            const srv = serverList[s];
            if (!srv || !srv.server_data || srv.server_data.length === 0) continue;
            const firstStream = (srv.server_data[0].link_m3u8 || "").trim();
            if (firstStream && seenStreams.has(firstStream)) continue;
            if (firstStream) seenStreams.add(firstStream);
            allServers.push(srv);
          }
        }

        if (kkRes && Array.isArray(kkRes.episodes)) {
          addServerList(parseStandardEpisodeServers(kkRes.episodes, "KKPhim"));
        }
        if (vsmovRes && Array.isArray(vsmovRes.episodes)) {
          addServerList(parseStandardEpisodeServers(vsmovRes.episodes, "Phim4K"));
        }
        if (nguoncRes) {
          const nguoncEps = (nguoncRes.movie && Array.isArray(nguoncRes.movie.episodes)) ? nguoncRes.movie.episodes : (Array.isArray(nguoncRes.episodes) ? nguoncRes.episodes : []);
          addServerList(parseNguoncEpisodeServers(nguoncEps, "NguonC"));
        }

        const result = {
          movie: normalized,
          episodes: allServers
        };

        detailCache.set(cleanSlug.toLowerCase(), { timestamp: Date.now(), result: result });
        return result;
      });
    }
  };
}

return {BASE_URL: BASE_URL, DEFAULT_CDN: DEFAULT_CDN, VSMOV_BASE_URL: VSMOV_BASE_URL, VSMOV_CDN: VSMOV_CDN, NGUONC_BASE_URL: NGUONC_BASE_URL, extractDirectM3u8: extractDirectM3u8, buildImageUrl: buildImageUrl, normalizeMovie: normalizeMovie, createKkphimApi: createKkphimApi};
});
registerModule("js/services/favorites-service.js", function (requireModule) {
const STORAGE_KEY = "kkphim_favorites";

let cachedFavorites = null;
let cachedFavoritesSet = null;

function ensureCache() {
  if (cachedFavorites !== null && cachedFavoritesSet !== null) {
    return;
  }
  if (typeof window === "undefined" || !window.localStorage) {
    cachedFavorites = [];
    cachedFavoritesSet = new Set();
    return;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cachedFavorites = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Không thể đọc danh sách phim yêu thích:", error.message);
    cachedFavorites = [];
  }
  cachedFavoritesSet = new Set();
  for (let i = 0; i < cachedFavorites.length; i += 1) {
    if (cachedFavorites[i] && cachedFavorites[i].slug) {
      cachedFavoritesSet.add(cachedFavorites[i].slug);
    }
  }
}

function getFavorites() {
  ensureCache();
  return cachedFavorites;
}

function saveFavorites(list) {
  cachedFavorites = Array.isArray(list) ? list : [];
  cachedFavoritesSet = new Set();
  for (let i = 0; i < cachedFavorites.length; i += 1) {
    if (cachedFavorites[i] && cachedFavorites[i].slug) {
      cachedFavoritesSet.add(cachedFavorites[i].slug);
    }
  }
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedFavorites));
  } catch (error) {
    console.warn("Không thể lưu danh sách phim yêu thích:", error.message);
  }
}

function isFavorite(slug) {
  if (!slug) {
    return false;
  }
  ensureCache();
  return cachedFavoritesSet.has(slug);
}

function addFavorite(movie) {
  if (!movie || !movie.slug) {
    return false;
  }
  const list = getFavorites();
  const existingIndex = list.findIndex(function (item) {
    return item.slug === movie.slug;
  });
  const entry = {
    slug: movie.slug,
    name: movie.title || movie.name,
    title: movie.title || movie.name,
    poster_url: movie.poster || movie.poster_url,
    poster: movie.poster || movie.poster_url,
    thumb_url: movie.thumb || movie.thumb_url || movie.poster,
    thumb: movie.thumb || movie.thumb_url || movie.poster,
    year: movie.year || "",
    quality: movie.quality || "",
    lang: movie.lang || "",
    episode_current: movie.episodeCurrent || movie.episode_current || "",
    source: "KKPhim",
    playbackEnabled: true,
    addedAt: Date.now()
  };
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  }
  list.unshift(entry);
  if (list.length > 200) {
    list.length = 200;
  }
  saveFavorites(list);
  return true;
}

function removeFavorite(slug) {
  if (!slug) {
    return false;
  }
  const list = getFavorites();
  const filtered = list.filter(function (item) {
    return item.slug !== slug;
  });
  saveFavorites(filtered);
  return true;
}

function toggleFavorite(movie) {
  if (!movie || !movie.slug) {
    return false;
  }
  if (isFavorite(movie.slug)) {
    removeFavorite(movie.slug);
    return false;
  } else {
    addFavorite(movie);
    return true;
  }
}

function createFavoritesService() {
  return {
    getAll: getFavorites,
    has: isFavorite,
    add: addFavorite,
    remove: removeFavorite,
    toggle: toggleFavorite
  };
}

return {getFavorites: getFavorites, saveFavorites: saveFavorites, isFavorite: isFavorite, addFavorite: addFavorite, removeFavorite: removeFavorite, toggleFavorite: toggleFavorite, createFavoritesService: createFavoritesService};
});
registerModule("js/services/watch-history-service.js", function (requireModule) {
const HISTORY_STORAGE_KEY = "kkphim_watch_history";
const MAX_HISTORY_ITEMS = 40;

let cachedHistory = null;

function ensureHistoryCache() {
  if (cachedHistory !== null) {
    return;
  }
  if (typeof window === "undefined" || !window.localStorage) {
    cachedHistory = [];
    return;
  }
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cachedHistory = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Không thể đọc lịch sử xem phim:", err.message);
    cachedHistory = [];
  }
}

function getWatchHistory() {
  ensureHistoryCache();
  return cachedHistory;
}

function saveWatchHistoryList(list) {
  cachedHistory = Array.isArray(list) ? list : [];
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(cachedHistory));
  } catch (err) {
    console.warn("Không thể lưu lịch sử xem phim:", err.message);
  }
}

function getWatchHistoryItem(slug) {
  if (!slug) {
    return null;
  }
  const list = getWatchHistory();
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (item && (item.slug === slug || item.id === slug)) {
      return item;
    }
  }
  return null;
}

function getEpisodeResumeInfo(slug, episodeIndex) {
  const item = getWatchHistoryItem(slug);
  if (!item) {
    return null;
  }
  const targetEpIdx = typeof episodeIndex === "number"
    ? episodeIndex
    : (typeof item.currentEpisodeIndex === "number" ? item.currentEpisodeIndex : 0);
  const epKey = "ep_" + targetEpIdx;

  let curTime = 0;
  let durTime = 0;
  let epName = item.episodeName || ("Tập " + (targetEpIdx + 1));

  if (item.episodeProgress && item.episodeProgress[epKey]) {
    const epData = item.episodeProgress[epKey];
    curTime = typeof epData.currentTime === "number" ? epData.currentTime : 0;
    durTime = typeof epData.duration === "number" ? epData.duration : 0;
    if (epData.episodeName) {
      epName = epData.episodeName;
    }
  } else if (
    typeof episodeIndex !== "number" ||
    item.currentEpisodeIndex === targetEpIdx ||
    typeof item.currentEpisodeIndex !== "number"
  ) {
    curTime = typeof item.currentTime === "number" ? item.currentTime : 0;
    durTime = typeof item.duration === "number" ? item.duration : 0;
  }

  if (!Number.isFinite(curTime) || curTime <= 5) {
    return null;
  }

  // If the user already watched right up to the end of the episode (within last 12s), do not resume at the credits
  if (Number.isFinite(durTime) && durTime > 60 && curTime >= durTime - 12) {
    return null;
  }

  const progressPercent = durTime > 0
    ? Math.max(5, Math.min(98, Math.round((curTime / durTime) * 100)))
    : (item.progressPercent || 15);

  return {
    slug: item.slug || item.id,
    episodeIndex: targetEpIdx,
    episodeName: epName,
    currentTime: Math.floor(curTime),
    duration: Math.floor(durTime),
    progressPercent: progressPercent
  };
}

function enrichWatchHistoryMetadata(movie) {
  if (!movie || (!movie.slug && !movie.id)) {
    return false;
  }
  const slug = movie.slug || movie.id;
  const list = getWatchHistory();
  const idx = list.findIndex(function (item) {
    return item && (item.slug === slug || item.id === slug);
  });
  if (idx < 0) {
    return false;
  }
  const entry = list[idx];
  let changed = false;
  if (Array.isArray(movie.categories) && movie.categories.length && (!entry.categories || !entry.categories.length)) {
    entry.categories = movie.categories.slice();
    changed = true;
  }
  if (Array.isArray(movie.countries) && movie.countries.length && (!entry.countries || !entry.countries.length)) {
    entry.countries = movie.countries.slice();
    changed = true;
  }
  if (Array.isArray(movie.actors) && movie.actors.length && (!entry.actors || !entry.actors.length)) {
    entry.actors = movie.actors.slice(0, 10);
    changed = true;
  }
  if (movie.originTitle && !entry.originTitle) {
    entry.originTitle = movie.originTitle;
    changed = true;
  }
  if (movie.type && !entry.type) {
    entry.type = movie.type;
    changed = true;
  }
  if (changed) {
    saveWatchHistoryList(list);
  }
  return changed;
}

function saveWatchProgress(movie, currentTimeSec, durationSec) {
  if (!movie || (!movie.slug && !movie.id)) {
    return false;
  }
  const slug = movie.slug || movie.id;
  const list = getWatchHistory();
  const existingIdx = list.findIndex(function (item) {
    return item && (item.slug === slug || item.id === slug);
  });
  const prev = existingIdx >= 0 ? list[existingIdx] : null;

  const epIndex = typeof movie.currentEpisodeIndex === "number"
    ? movie.currentEpisodeIndex
    : (prev && typeof prev.currentEpisodeIndex === "number" ? prev.currentEpisodeIndex : 0);
  const epKey = "ep_" + epIndex;
  const prevEpData = (prev && prev.episodeProgress && prev.episodeProgress[epKey])
    ? prev.episodeProgress[epKey]
    : (prev && prev.currentEpisodeIndex === epIndex ? { currentTime: prev.currentTime, duration: prev.duration } : null);

  let curTime;
  if (typeof currentTimeSec === "number" && Number.isFinite(currentTimeSec) && currentTimeSec > 0) {
    curTime = Math.floor(currentTimeSec);
  } else if (prevEpData && typeof prevEpData.currentTime === "number" && prevEpData.currentTime > 0) {
    curTime = Math.floor(prevEpData.currentTime);
  } else if (typeof currentTimeSec === "number" && currentTimeSec === 0) {
    curTime = 0;
  } else {
    curTime = (prev && typeof prev.currentTime === "number") ? prev.currentTime : 120;
  }

  let durTime;
  if (
    typeof durationSec === "number" &&
    Number.isFinite(durationSec) &&
    durationSec > 0 &&
    (currentTimeSec > 0 || !prevEpData || !prevEpData.duration)
  ) {
    durTime = Math.floor(durationSec);
  } else if (prevEpData && typeof prevEpData.duration === "number" && prevEpData.duration > 0) {
    durTime = Math.floor(prevEpData.duration);
  } else if (prev && typeof prev.duration === "number" && prev.duration > 0) {
    durTime = Math.floor(prev.duration);
  } else {
    durTime = 2700;
  }

  const progress = durTime > 0 ? Math.max(5, Math.min(98, Math.round((curTime / durTime) * 100))) : 15;
  const remainingMin = Math.max(1, Math.round(Math.max(0, durTime - curTime) / 60));

  const seriesTitle = movie.seriesTitle || (prev && prev.seriesTitle) || (movie.title ? String(movie.title).split(" - ")[0] : "Phim");
  const episodeName = movie.episodeName || movie.episodeCurrent || (prevEpData && prevEpData.episodeName) || (prev && prev.episodeName) || "Tập 1";

  const episodeProgress = Object.assign({}, (prev && prev.episodeProgress) ? prev.episodeProgress : {});
  episodeProgress[epKey] = {
    episodeIndex: epIndex,
    episodeName: episodeName,
    currentTime: curTime,
    duration: durTime,
    progress: progress,
    updatedAt: Date.now()
  };

  const categories = (Array.isArray(movie.categories) && movie.categories.length)
    ? movie.categories.slice()
    : (prev && Array.isArray(prev.categories) ? prev.categories : []);
  const countries = (Array.isArray(movie.countries) && movie.countries.length)
    ? movie.countries.slice()
    : (prev && Array.isArray(prev.countries) ? prev.countries : []);
  const actors = (Array.isArray(movie.actors) && movie.actors.length)
    ? movie.actors.slice(0, 10)
    : (prev && Array.isArray(prev.actors) ? prev.actors : []);
  const episodesList = (Array.isArray(movie.episodesList) && movie.episodesList.length)
    ? movie.episodesList.slice(0, 120)
    : (prev && Array.isArray(prev.episodesList) ? prev.episodesList : []);

  const entry = {
    id: slug,
    slug: slug,
    title: seriesTitle,
    seriesTitle: seriesTitle,
    originTitle: movie.originTitle || (prev && prev.originTitle) || "",
    episodeName: episodeName,
    episodeCurrent: episodeName,
    currentEpisodeIndex: epIndex,
    poster: movie.poster || (prev && prev.poster) || "icon.png",
    thumb: movie.thumb || movie.poster || (prev && (prev.thumb || prev.poster)) || "icon.png",
    year: movie.year || (prev && prev.year) || "2026",
    quality: movie.quality || (prev && prev.quality) || "FHD",
    lang: movie.lang || (prev && prev.lang) || "Vietsub",
    type: movie.type || (prev && prev.type) || "",
    categories: categories,
    countries: countries,
    actors: actors,
    m3u8: movie.m3u8 || (prev && prev.m3u8) || "",
    fallbackEmbed: movie.fallbackEmbed || (prev && prev.fallbackEmbed) || "",
    serverName: movie.serverName || (prev && prev.serverName) || "Vietsub",
    episodesList: episodesList,
    episodeProgress: episodeProgress,
    currentTime: curTime,
    duration: durTime,
    progress: progress,
    progressPercent: progress,
    remainingText: "Còn " + remainingMin + " phút",
    playbackEnabled: true,
    source: movie.source || "KKPhim",
    updatedAt: Date.now()
  };

  if (existingIdx >= 0) {
    list.splice(existingIdx, 1);
  }
  list.unshift(entry);
  if (list.length > MAX_HISTORY_ITEMS) {
    list.length = MAX_HISTORY_ITEMS;
  }
  saveWatchHistoryList(list);
  return true;
}

function removeWatchHistory(slug) {
  if (!slug) {
    return false;
  }
  const list = getWatchHistory();
  const filtered = list.filter(function (item) {
    return item && item.slug !== slug && item.id !== slug;
  });
  saveWatchHistoryList(filtered);
  return true;
}

function clearWatchHistory() {
  saveWatchHistoryList([]);
}

function createWatchHistoryService() {
  return {
    getAll: getWatchHistory,
    getItem: getWatchHistoryItem,
    getEpisodeResumeInfo: getEpisodeResumeInfo,
    enrichMetadata: enrichWatchHistoryMetadata,
    saveProgress: saveWatchProgress,
    remove: removeWatchHistory,
    clear: clearWatchHistory
  };
}

return {getWatchHistory: getWatchHistory, saveWatchHistoryList: saveWatchHistoryList, getWatchHistoryItem: getWatchHistoryItem, getEpisodeResumeInfo: getEpisodeResumeInfo, enrichWatchHistoryMetadata: enrichWatchHistoryMetadata, saveWatchProgress: saveWatchProgress, removeWatchHistory: removeWatchHistory, clearWatchHistory: clearWatchHistory, createWatchHistoryService: createWatchHistoryService};
});
registerModule("js/services/google-trending-service.js", function (requireModule) {
const CACHE_KEY = "kkphim_google_trending_cache";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const IGNORE_PATTERNS = [
  "chiếu rạp", "chieu rap", "quốc gia", "quoc gia", "hôm nay", "hom nay",
  "mới nhất", "moi nhat", "trung quốc", "trung quoc", "hàn quốc", "han quoc",
  "thái lan", "thai lan", "việt nam", "viet nam", "tvb", "hk", "cgv", "lotte",
  "hoạt hình", "hoat hinh", "tổng tài", "tong tai", "2024", "2025", "2026", "2027",
  "xem phim", "phim", "phim hay", "phim mới", "phim bộ", "phim lẻ", "thuyết minh", "lồng tiếng"
];

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function getCachedTrending() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.movies) || !data.timestamp) {
      return null;
    }
    const age = Date.now() - Number(data.timestamp);
    if (age >= CACHE_TTL_MS) {
      return null;
    }
    return data.movies;
  } catch (err) {
    console.warn("Lỗi khi đọc cache Google Trending:", err);
    return null;
  }
}

function saveCachedTrending(movies) {
  const storage = getStorage();
  if (!storage || !Array.isArray(movies) || !movies.length) {
    return;
  }
  try {
    const record = {
      timestamp: Date.now(),
      movies: movies
    };
    storage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch (err) {
    console.warn("Lỗi khi lưu cache Google Trending:", err);
  }
}

function clearTrendingCache() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(CACHE_KEY);
  }
}

function extractKeywords(suggestions) {
  if (!Array.isArray(suggestions)) {
    return [];
  }
  const titles = [];
  const seen = new Set();

  for (let i = 0; i < suggestions.length; i += 1) {
    let s = String(suggestions[i] || "").toLowerCase().trim();
    if (/có bao nhiêu tập|co bao nhieu tap|lịch chiếu|lich chieu|review|tóm tắt|tom tat|diễn viên|dien vien|kết thúc|ket thuc|là ai|la ai/.test(s)) {
      continue;
    }
    s = s.replace(/^(xem\s+phim|phim\s+bộ|phim\s+lẻ|phim\s+hoạt\s+hình|phim)\s+/, "").trim();
    s = s.replace(/\s+(tập\s+\d+|tap\s+\d+|\d+\s*tập|\d+$|vietsub|thuyết minh|thuyet minh|lồng tiếng|long tieng|full|hd|fhd|3d|2d|anime|hoạt hình 3d|hoat hinh 3d|phần\s+\d+|phan\s+\d+|mới nhất|moi nhat|motphim|hhkungfu|yanhh|phimmoi|subnhanh|chillhay|rophim|bilutv|vieon|fpt).*$/, "").trim();

    let isIgnored = false;
    for (let j = 0; j < IGNORE_PATTERNS.length; j += 1) {
      if (s === IGNORE_PATTERNS[j] || (s.length < 10 && s.includes(IGNORE_PATTERNS[j]))) {
        isIgnored = true;
        break;
      }
    }

    if (!isIgnored && s.length >= 3 && !seen.has(s)) {
      seen.add(s);
      titles.push(s);
    }
  }

  return titles;
}

function fetchGoogleSuggestions(seed) {
  const query = encodeURIComponent(seed || "phim ");

  // Browser environment: Use JSONP to guarantee bypass of CORS restrictions
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    return new Promise(function (resolve) {
      const cbName = "__gSuggest_" + Math.random().toString(36).substring(2, 9);
      let timer = 0;

      function cleanup() {
        if (timer) {
          clearTimeout(timer);
        }
        try {
          delete window[cbName];
        } catch (_e) {
          window[cbName] = undefined;
        }
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      const script = document.createElement("script");
      timer = setTimeout(function () {
        cleanup();
        resolve([]);
      }, 5000);

      window[cbName] = function (data) {
        cleanup();
        resolve(Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []);
      };

      script.onerror = function () {
        cleanup();
        resolve([]);
      };

      script.src = "https://suggestqueries.google.com/complete/search?client=chrome&hl=vi&gl=vn&ie=utf-8&oe=utf-8&q=" + query + "&callback=" + cbName;
      (document.head || document.body || document.documentElement).appendChild(script);
    });
  }

  // Node.js or non-DOM test environment: fallback to fetch
  const fetchFn = (typeof window !== "undefined" && typeof window.fetch === "function")
    ? window.fetch.bind(window)
    : (typeof fetch === "function" ? fetch : null);

  if (!fetchFn) {
    return Promise.resolve([]);
  }

  return fetchFn("https://suggestqueries.google.com/complete/search?client=chrome&hl=vi&gl=vn&ie=utf-8&oe=utf-8&q=" + query)
    .then(function (res) {
      if (!res.ok) {
        return [];
      }
      return res.json();
    })
    .then(function (data) {
      return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    })
    .catch(function () {
      return [];
    });
}

function fetchGoogleTrending(kkphimApi, force) {
  if (!force) {
    const cached = getCachedTrending();
    if (cached && cached.length) {
      return Promise.resolve({
        movies: cached,
        isCached: true,
        source: "google-cache"
      });
    }
  }

  const seeds = ["xem phim ", "phim ", "phim bo ", "phim chieu rap "];

  return Promise.all(seeds.map(function (s) {
    return fetchGoogleSuggestions(s);
  })).then(function (results) {
    const allSuggestions = [];
    results.forEach(function (list) {
      if (Array.isArray(list)) {
        allSuggestions.push.apply(allSuggestions, list);
      }
    });

    const keywords = extractKeywords(allSuggestions);
    const topKeywords = keywords.slice(0, 15);

    if (!topKeywords.length) {
      return kkphimApi.getHome().then(function (res) {
        return {
          movies: res.movies || [],
          isCached: false,
          source: "kkphim-fallback"
        };
      });
    }

    return Promise.all(topKeywords.map(function (kw) {
      return kkphimApi.searchMovies(kw, 3, 1).then(function (res) {
        return res && Array.isArray(res.movies) ? res.movies : [];
      }).catch(function () {
        return [];
      });
    })).then(function (nestedMovies) {
      const trendingMovies = [];
      const seenSlugs = new Set();

      nestedMovies.forEach(function (list) {
        list.forEach(function (m) {
          const key = m.slug || m.id;
          if (key && !seenSlugs.has(key)) {
            seenSlugs.add(key);
            trendingMovies.push(m);
          }
        });
      });

      // If fewer than 24 movies, complement with KKPhim Home list so the grid is full
      if (trendingMovies.length < 24) {
        return kkphimApi.getHome().then(function (res) {
          const homeMovies = res && Array.isArray(res.movies) ? res.movies : [];
          homeMovies.forEach(function (hm) {
            const hKey = hm.slug || hm.id;
            if (hKey && !seenSlugs.has(hKey)) {
              seenSlugs.add(hKey);
              trendingMovies.push(hm);
            }
          });
          if (trendingMovies.length) {
            saveCachedTrending(trendingMovies);
          }
          return {
            movies: trendingMovies,
            isCached: false,
            source: "google"
          };
        }).catch(function () {
          if (trendingMovies.length) {
            saveCachedTrending(trendingMovies);
          }
          return {
            movies: trendingMovies,
            isCached: false,
            source: "google"
          };
        });
      }

      saveCachedTrending(trendingMovies);
      return {
        movies: trendingMovies,
        isCached: false,
        source: "google"
      };
    });
  }).catch(function (error) {
    console.warn("Lỗi khi tải Google Trending, chuyển sang danh sách KKPhim Home:", error);
    return kkphimApi.getHome().then(function (res) {
      return {
        movies: res.movies || [],
        isCached: false,
        source: "kkphim-fallback"
      };
    });
  });
}

function createGoogleTrendingService(kkphimApi) {
  return {
    getTrending(force) {
      return fetchGoogleTrending(kkphimApi, force);
    },
    getCached() {
      return getCachedTrending();
    },
    saveCached(movies) {
      saveCachedTrending(movies);
    },
    clearCache() {
      clearTrendingCache();
    },
    extractKeywords(suggestions) {
      return extractKeywords(suggestions);
    }
  };
}

return {getCachedTrending: getCachedTrending, saveCachedTrending: saveCachedTrending, clearTrendingCache: clearTrendingCache, extractKeywords: extractKeywords, fetchGoogleSuggestions: fetchGoogleSuggestions, fetchGoogleTrending: fetchGoogleTrending, createGoogleTrendingService: createGoogleTrendingService};
});
registerModule("js/services/ml-recommendation-service.js", function (requireModule) {
var getWatchHistory = requireModule("js/services/watch-history-service.js")["getWatchHistory"];
var getFavorites = requireModule("js/services/favorites-service.js")["getFavorites"];
var fetchGoogleSuggestions = requireModule("js/services/google-trending-service.js")["fetchGoogleSuggestions"];
var extractKeywords = requireModule("js/services/google-trending-service.js")["extractKeywords"];
const ML_INTERACTIONS_KEY = "kkphim_ml_interactions";
const ML_CACHE_KEY = "kkphim_ml_recommendations_cache";
const ML_CACHE_TTL_MS = 10 * 1000; // 10 seconds auto-refresh cycle
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days exponential time decay

const VIETNAMESE_STOPWORDS = new Set([
  "phim", "xem", "tap", "tập", "phan", "phần", "full", "hd", "fhd", "vietsub",
  "thuyet", "thuyết", "minh", "long", "lồng", "tieng", "tiếng", "cua", "của",
  "va", "và", "nhung", "những", "nguoi", "người", "trong", "ngoai", "ngoài",
  "cho", "voi", "với", "khi", "mot", "một", "hai", "ba", "bon", "nam", "sau",
  "bay", "tam", "chin", "muoi", "nam", "năm", "2020", "2021", "2022", "2023",
  "2024", "2025", "2026", "2027", "the", "of", "and", "in", "to", "a", "is",
  "season", "episode", "movie", "series", "online", "moi", "mới", "nhat", "nhất",
  "bo", "bộ", "le", "lẻ", "hay", "hot", "ung", "ứng", "con", "còn", "phu", "phút",
  "khong", "không", "duoc", "được", "den", "đến", "tu", "từ", "la", "là", "co", "có"
]);

// Keyword dictionary for Naive Bayes Latent Genre Classification
const GENRE_PRIORS_AND_KEYWORDS = [
  {
    slug: "hanh-dong",
    name: "Hành động",
    searchSeed: "hành động",
    keywords: [
      "hành động", "hanh dong", "võ thuật", "vo thuat", "đặc vụ", "dac vu",
      "sát thủ", "sat thu", "chiến", "chien", "truy sát", "truy sat", "biệt kích",
      "biet kich", "hình sự", "hinh su", "cảnh sát", "canh sat", "tội phạm", "toi pham",
      "băng đảng", "bang dang", "anh hùng", "anh hung", "iron man", "người sắt", "nguoi sat",
      "john wick", "fast", "mission", "vây hãm", "vay ham", "báo thù", "bao thu", "trả thù"
    ]
  },
  {
    slug: "co-trang",
    name: "Cổ trang",
    searchSeed: "cổ trang",
    keywords: [
      "cổ trang", "co trang", "tiên hiệp", "tien hiep", "kiếm hiệp", "kiem hiep",
      "tu tiên", "tu tien", "xuyên không", "xuyen khong", "trọng sinh", "trong sinh",
      "vương gia", "vuong gia", "hoàng hậu", "hoang hau", "cung đấu", "cung dau",
      "thần", "than", "giang hồ", "giang ho", "thiên cổ", "thien co", "đấu phá", "dau pha",
      "thế giới hoàn mỹ", "the gioi hoan my", "phàm nhân", "pham nhan", "cẩm", "cam",
      "hoa", "ngọc", "ngoc", "kim thoa", "trường tương tư", "truong tuong tu", "lâm giang"
    ]
  },
  {
    slug: "tinh-cam",
    name: "Tình cảm",
    searchSeed: "tình cảm",
    keywords: [
      "tình cảm", "tinh cam", "yêu", "yeu", "tình yêu", "tinh yeu", "lãng mạn", "lang man",
      "ngôn tình", "ngon tinh", "hôn nhân", "hon nhan", "tổng tài", "tong tai",
      "ngọt ngào", "ngot ngao", "em", "anh", "chồng", "chong", "vợ", "vo", "hẹn hò", "hen ho",
      "thanh xuân", "thanh xuan", "mùa hè", "mua he", "trái tim", "trai tim", "ánh trăng", "anh trang"
    ]
  },
  {
    slug: "hai-huoc",
    name: "Hài hước",
    searchSeed: "hài hước",
    keywords: [
      "hài", "hai", "hài hước", "hai huoc", "vui", "cười", "cuoi", "báo thủ", "bao thu",
      "gia đình", "gia dinh", "xóm", "xom", "làng", "lang", "quậy", "quay", "siêu lầy", "sieu lay"
    ]
  },
  {
    slug: "kinh-di",
    name: "Kinh dị",
    searchSeed: "kinh dị",
    keywords: [
      "kinh dị", "kinh di", "ma", "quỷ", "quy", "ác quỷ", "ac quy", "bóng đè", "bong de",
      "nguyền", "nguyen", "xác sống", "xac song", "zombie", "máu", "mau", "rùng rợn",
      "rung ron", "bí ẩn", "bi an", "ám ảnh", "am anh", "cô dâu ma", "co dau ma", "linh hồn"
    ]
  },
  {
    slug: "vien-tuong",
    name: "Viễn tưởng",
    searchSeed: "viễn tưởng",
    keywords: [
      "viễn tưởng", "vien tuong", "khoa học", "khoa hoc", "vũ trụ", "vu tru", "tương lai",
      "tuong lai", "dị năng", "di nang", "siêu nhiên", "sieu nhien", "quái vật", "quai vat",
      "robot", "ai", "không gian", "khong gian", "tận thế", "tan the", "avengers", "marvel",
      "transformer", "hành tinh", "hanh tinh"
    ]
  },
  {
    slug: "hoat-hinh",
    name: "Hoạt hình",
    searchSeed: "hoạt hình",
    keywords: [
      "hoạt hình", "hoat hinh", "anime", "one piece", "naruto", "conan", "dragon ball",
      "doraemon", "shin", "đấu la", "dau la", "vũ động", "vu dong", "tây hành", "tay hanh",
      "3d", "donghua", "chú thuật", "chu thuat", "thanh gươm", "thanh guom"
    ]
  }
];

let cachedInteractions = null;
let memoryRecommendationCache = null;

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function stripVietnameseAccents(str) {
  if (!str) {
    return "";
  }
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function tokenizeMovieText(text) {
  if (!text || typeof text !== "string") {
    return { unigrams: [], bigrams: [], phrases: [] };
  }
  const cleaned = text
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return { unigrams: [], bigrams: [], phrases: [] };
  }

  const rawWords = cleaned.split(" ");
  const unigrams = [];
  const validWords = [];

  for (let i = 0; i < rawWords.length; i += 1) {
    const w = rawWords[i].trim();
    const unaccented = stripVietnameseAccents(w);
    const isStopword = VIETNAMESE_STOPWORDS.has(w) || (w === unaccented && VIETNAMESE_STOPWORDS.has(unaccented));
    if (w.length >= 2 && !isStopword && !/^\d+$/.test(w)) {
      unigrams.push(w);
      validWords.push(w);
    }
  }

  const bigrams = [];
  const phrases = [];
  if (validWords.length >= 2 && validWords.length <= 4) {
    phrases.push(validWords.join(" "));
  } else if (validWords.length > 4) {
    phrases.push(validWords.slice(0, 3).join(" "));
  }
  for (let i = 0; i < validWords.length - 1; i += 1) {
    const bg = validWords[i] + " " + validWords[i + 1];
    bigrams.push(bg);
    if (bg.length >= 5 && phrases.indexOf(bg) === -1) {
      phrases.push(bg);
    }
  }
  if (validWords.length === 1 && validWords[0].length >= 4) {
    phrases.push(validWords[0]);
  }

  return {
    unigrams: unigrams,
    bigrams: bigrams,
    phrases: phrases
  };
}

function inferLatentGenres(movie) {
  const matched = [];
  const seen = new Set();

  if (movie && Array.isArray(movie.categories)) {
    for (let i = 0; i < movie.categories.length; i += 1) {
      const cat = movie.categories[i];
      const catName = typeof cat === "string" ? cat : (cat && cat.name ? cat.name : "");
      const catNorm = stripVietnameseAccents(catName).toLowerCase();
      for (let g = 0; g < GENRE_PRIORS_AND_KEYWORDS.length; g += 1) {
        const gDef = GENRE_PRIORS_AND_KEYWORDS[g];
        const gNorm = stripVietnameseAccents(gDef.name).toLowerCase();
        if (catNorm.includes(gNorm) || catNorm.includes(gDef.slug.replace("-", " "))) {
          if (!seen.has(gDef.slug)) {
            seen.add(gDef.slug);
            matched.push({ slug: gDef.slug, weight: 1.4 });
          }
        }
      }
    }
  }

  if (movie && movie.type === "hoathinh" && !seen.has("hoat-hinh")) {
    seen.add("hoat-hinh");
    matched.push({ slug: "hoat-hinh", weight: 1.5 });
  }

  const textBlob = [
    movie && movie.title ? movie.title : "",
    movie && movie.seriesTitle ? movie.seriesTitle : "",
    movie && movie.originTitle ? movie.originTitle : "",
    movie && movie.content ? String(movie.content).slice(0, 300) : ""
  ].join(" ").toLowerCase();

  const textUnaccented = stripVietnameseAccents(textBlob);

  for (let g = 0; g < GENRE_PRIORS_AND_KEYWORDS.length; g += 1) {
    const gDef = GENRE_PRIORS_AND_KEYWORDS[g];
    let hitCount = 0;
    for (let k = 0; k < gDef.keywords.length; k += 1) {
      const kw = gDef.keywords[k];
      if (textBlob.includes(kw) || textUnaccented.includes(kw)) {
        hitCount += 1;
      }
    }
    if (hitCount > 0 && !seen.has(gDef.slug)) {
      seen.add(gDef.slug);
      matched.push({
        slug: gDef.slug,
        weight: Math.min(1.5, 0.75 + hitCount * 0.25)
      });
    }
  }

  return matched;
}

function extractMovieFeatures(movie) {
  const features = Object.create(null);
  if (!movie || typeof movie !== "object") {
    return features;
  }

  function addFeature(key, value) {
    if (!key || !Number.isFinite(value)) {
      return;
    }
    features[key] = (features[key] || 0) + value;
  }

  const rawTitle = movie.seriesTitle || (movie.title ? String(movie.title).split(" - ")[0] : "");
  const titleTokens = tokenizeMovieText(rawTitle);
  const originTokens = tokenizeMovieText(movie.originTitle || "");

  // 1. Title Unigrams & Bigrams (TF-IDF style weighting: bigrams carry higher specificity)
  titleTokens.unigrams.forEach(function (u) {
    addFeature("term:" + u, 1.0);
    const unacc = stripVietnameseAccents(u);
    if (unacc !== u && unacc.length >= 3) {
      addFeature("term_ascii:" + unacc, 0.7);
    }
  });

  titleTokens.bigrams.forEach(function (bg) {
    addFeature("bigram:" + bg, 1.8);
  });

  originTokens.unigrams.forEach(function (u) {
    if (u.length >= 3) {
      addFeature("origin:" + u, 0.9);
    }
  });

  originTokens.bigrams.forEach(function (bg) {
    addFeature("origin_bg:" + bg, 1.4);
  });

  // 2. Latent & Explicit Genres
  const genres = inferLatentGenres(movie);
  genres.forEach(function (g) {
    addFeature("genre:" + g.slug, g.weight * 2.2);
  });

  // 3. Countries
  if (Array.isArray(movie.countries)) {
    movie.countries.forEach(function (c) {
      const cName = stripVietnameseAccents(typeof c === "string" ? c : (c && c.name ? c.name : "")).toLowerCase().trim();
      if (cName) {
        addFeature("country:" + cName, 1.5);
      }
    });
  }

  // 4. Actors
  if (Array.isArray(movie.actors)) {
    movie.actors.slice(0, 6).forEach(function (actor) {
      const aName = String(actor || "").toLowerCase().trim();
      if (aName && aName.length >= 3) {
        addFeature("actor:" + aName, 1.6);
      }
    });
  }

  // 5. Movie Type (series vs single vs hoathinh)
  if (movie.type) {
    addFeature("type:" + String(movie.type).toLowerCase(), 1.2);
  } else if (movie.episodeCurrent && /tập|tap|\d+\/\d+/i.test(movie.episodeCurrent)) {
    addFeature("type:series", 0.9);
  }

  // 6. Language preference (Vietsub / Thuyết minh / Lồng tiếng)
  if (movie.lang) {
    const langNorm = stripVietnameseAccents(movie.lang).toLowerCase();
    if (langNorm.includes("thuyet minh")) {
      addFeature("lang:thuyet-minh", 1.1);
    }
    if (langNorm.includes("long tieng")) {
      addFeature("lang:long-tieng", 1.1);
    }
    if (langNorm.includes("vietsub")) {
      addFeature("lang:vietsub", 0.8);
    }
  }

  // 7. Release Year Era
  const yr = parseInt(movie.year, 10);
  if (!isNaN(yr) && yr > 1980) {
    if (yr >= 2025) {
      addFeature("era:2025_plus", 1.0);
    } else if (yr >= 2020) {
      addFeature("era:2020_2024", 0.8);
    } else {
      addFeature("era:classic", 0.7);
    }
  }

  return features;
}

function getInteractionsList() {
  if (cachedInteractions !== null) {
    return cachedInteractions;
  }
  const storage = getStorage();
  if (!storage) {
    cachedInteractions = [];
    return cachedInteractions;
  }
  try {
    const raw = storage.getItem(ML_INTERACTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cachedInteractions = Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    cachedInteractions = [];
  }
  return cachedInteractions;
}

function saveInteractionsList(list) {
  cachedInteractions = Array.isArray(list) ? list.slice(0, 50) : [];
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(ML_INTERACTIONS_KEY, JSON.stringify(cachedInteractions));
  } catch (_) {}
}

function invalidateMlRecommendationCache() {
  memoryRecommendationCache = null;
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(ML_CACHE_KEY);
    } catch (_) {}
  }
}

function recordUserMovieInteraction(movie, interactionType) {
  if (!movie || (!movie.slug && !movie.id && !movie.title)) {
    return;
  }
  const list = getInteractionsList();
  const slug = movie.slug || movie.id || "";
  const seriesTitle = movie.seriesTitle || (movie.title ? String(movie.title).split(" - ")[0] : "");
  const filtered = list.filter(function (item) {
    return !(item && slug && item.slug === slug);
  });
  filtered.unshift({
    type: interactionType || "view",
    slug: slug,
    title: seriesTitle,
    originTitle: movie.originTitle || "",
    categories: Array.isArray(movie.categories) ? movie.categories.slice(0, 6) : [],
    countries: Array.isArray(movie.countries) ? movie.countries.slice(0, 4) : [],
    actors: Array.isArray(movie.actors) ? movie.actors.slice(0, 5) : [],
    movieType: movie.type || "",
    year: movie.year || "",
    lang: movie.lang || "",
    timestamp: Date.now()
  });
  saveInteractionsList(filtered);
  invalidateMlRecommendationCache();
}

function recordUserSearchQuery(keyword) {
  const kw = String(keyword || "").trim();
  if (kw.length < 2) {
    return;
  }
  const list = getInteractionsList();
  const filtered = list.filter(function (item) {
    return !(item && item.type === "search" && String(item.query).toLowerCase() === kw.toLowerCase());
  });
  filtered.unshift({
    type: "search",
    query: kw,
    timestamp: Date.now()
  });
  saveInteractionsList(filtered);
  invalidateMlRecommendationCache();
}

function computeTimeDecay(timestampMs) {
  if (!timestampMs || !Number.isFinite(timestampMs)) {
    return 0.85;
  }
  const elapsed = Math.max(0, Date.now() - timestampMs);
  return Math.max(0.25, Math.exp(-elapsed / HALF_LIFE_MS));
}

function trainUserPreferenceModel(customHistory, customFavorites, customInteractions) {
  const history = Array.isArray(customHistory) ? customHistory : getWatchHistory();
  const favorites = Array.isArray(customFavorites) ? customFavorites : getFavorites();
  const interactions = Array.isArray(customInteractions) ? customInteractions : getInteractionsList();

  const rawWeights = Object.create(null);
  const genreScores = Object.create(null);
  const queryCandidates = [];
  const seenQuerySet = new Set();
  const watchedSlugs = new Set();
  const completedSlugs = new Set();
  const favoriteSlugs = new Set();

  function addWeight(featureKey, delta) {
    if (!featureKey || !Number.isFinite(delta)) {
      return;
    }
    rawWeights[featureKey] = (rawWeights[featureKey] || 0) + delta;
    if (featureKey.indexOf("genre:") === 0) {
      const gSlug = featureKey.slice(6);
      genreScores[gSlug] = (genreScores[gSlug] || 0) + delta;
    }
  }

  function pushQueryCandidate(phrase, score) {
    if (!phrase || typeof phrase !== "string") {
      return;
    }
    const clean = phrase.trim();
    const norm = clean.toLowerCase();
    if (clean.length < 2 || VIETNAMESE_STOPWORDS.has(norm) || seenQuerySet.has(norm)) {
      return;
    }
    seenQuerySet.add(norm);
    queryCandidates.push({ query: clean, score: score });
  }

  // 1. Train on Watch History (Implicit Feedback: Watch duration + completion ratio + recency)
  history.forEach(function (item, idx) {
    if (!item) {
      return;
    }
    const slug = item.slug || item.id;
    if (slug) {
      watchedSlugs.add(slug);
      if ((item.progressPercent && item.progressPercent >= 90) || (item.duration > 60 && item.currentTime >= item.duration - 30)) {
        completedSlugs.add(slug);
      }
    }

    const progressRatio = Math.max(0.1, Math.min(1, (Number(item.progressPercent || item.progress) || 25) / 85));
    const watchBonus = (item.currentTime && item.currentTime > 300) ? 0.5 : 0;
    const rankDecay = Math.max(0.4, 1 - idx * 0.04);
    const timeDecay = computeTimeDecay(item.updatedAt);
    const sampleWeight = (1.1 + 1.5 * progressRatio + watchBonus) * timeDecay * rankDecay;

    const itemFeatures = extractMovieFeatures(item);
    const keys = Object.keys(itemFeatures);
    for (let k = 0; k < keys.length; k += 1) {
      const fKey = keys[k];
      addWeight(fKey, itemFeatures[fKey] * sampleWeight);
    }

    const titleText = item.seriesTitle || (item.title ? String(item.title).split(" - ")[0] : "");
    const tokens = tokenizeMovieText(titleText);
    if (tokens.phrases.length > 0) {
      pushQueryCandidate(tokens.phrases[0], sampleWeight * 2.2);
    }
    if (tokens.bigrams.length > 0) {
      pushQueryCandidate(tokens.bigrams[0], sampleWeight * 1.9);
    } else if (tokens.unigrams.length > 0) {
      pushQueryCandidate(tokens.unigrams[0], sampleWeight * 1.4);
    }
    if (Array.isArray(item.actors) && item.actors.length > 0 && item.actors[0].length >= 4) {
      pushQueryCandidate(item.actors[0], sampleWeight * 1.5);
    }
  });

  // 2. Train on Favorites (Explicit Positive Feedback: High positive weight)
  favorites.forEach(function (fav, idx) {
    if (!fav) {
      return;
    }
    const slug = fav.slug || fav.id;
    if (slug) {
      favoriteSlugs.add(slug);
    }
    const timeDecay = computeTimeDecay(fav.addedAt);
    const rankDecay = Math.max(0.5, 1 - idx * 0.03);
    const sampleWeight = 2.6 * timeDecay * rankDecay;

    const favFeatures = extractMovieFeatures(fav);
    const keys = Object.keys(favFeatures);
    for (let k = 0; k < keys.length; k += 1) {
      const fKey = keys[k];
      addWeight(fKey, favFeatures[fKey] * sampleWeight);
    }

    const titleText = fav.title || fav.name || "";
    const tokens = tokenizeMovieText(titleText);
    if (tokens.bigrams.length > 0) {
      pushQueryCandidate(tokens.bigrams[0], sampleWeight * 2.3);
    } else if (tokens.phrases.length > 0) {
      pushQueryCandidate(tokens.phrases[0], sampleWeight * 2.0);
    } else if (tokens.unigrams.length > 0) {
      pushQueryCandidate(tokens.unigrams[0], sampleWeight * 1.5);
    }
  });

  // 3. Train on User Interactions (Search Queries & Detail Modal Views)
  interactions.forEach(function (inter, idx) {
    if (!inter) {
      return;
    }
    const timeDecay = computeTimeDecay(inter.timestamp);
    const rankDecay = Math.max(0.35, 1 - idx * 0.05);

    if (inter.type === "search" && inter.query) {
      const sWeight = 1.6 * timeDecay * rankDecay;
      pushQueryCandidate(inter.query, sWeight * 2.4);
      const qTokens = tokenizeMovieText(inter.query);
      qTokens.unigrams.forEach(function (u) {
        addWeight("term:" + u, sWeight * 1.3);
      });
      qTokens.bigrams.forEach(function (bg) {
        addWeight("bigram:" + bg, sWeight * 1.9);
      });
      const fakeMovie = { title: inter.query };
      inferLatentGenres(fakeMovie).forEach(function (g) {
        addWeight("genre:" + g.slug, sWeight * 1.8);
      });
    } else {
      const vWeight = 1.2 * timeDecay * rankDecay;
      const vFeatures = extractMovieFeatures(inter);
      const keys = Object.keys(vFeatures);
      for (let k = 0; k < keys.length; k += 1) {
        addWeight(keys[k], vFeatures[keys[k]] * vWeight);
      }
      const tokens = tokenizeMovieText(inter.title || "");
      if (tokens.bigrams.length > 0) {
        pushQueryCandidate(tokens.bigrams[0], vWeight * 1.7);
      }
    }
  });

  // L2 Normalization of User Centroid Vector
  let normSq = 0;
  const featureKeys = Object.keys(rawWeights);
  for (let i = 0; i < featureKeys.length; i += 1) {
    const val = rawWeights[featureKeys[i]];
    normSq += val * val;
  }
  const l2Norm = normSq > 0 ? Math.sqrt(normSq) : 1;
  const normalizedVector = Object.create(null);
  for (let i = 0; i < featureKeys.length; i += 1) {
    const k = featureKeys[i];
    normalizedVector[k] = rawWeights[k] / l2Norm;
  }

  // Rank genres by Bayesian posterior affinity
  const rankedGenres = Object.keys(genreScores)
    .map(function (gSlug) {
      return { slug: gSlug, score: genreScores[gSlug] };
    })
    .sort(function (a, b) {
      return b.score - a.score;
    });

  // Supplement query candidates with top predicted genre seeds
  rankedGenres.slice(0, 3).forEach(function (gObj) {
    const gDef = GENRE_PRIORS_AND_KEYWORDS.find(function (item) {
      return item.slug === gObj.slug;
    });
    if (gDef && gDef.searchSeed) {
      pushQueryCandidate(gDef.searchSeed, gObj.score * 0.9);
    }
  });

  queryCandidates.sort(function (a, b) {
    return b.score - a.score;
  });

  const isColdStart = history.length === 0 && favorites.length === 0 && interactions.length === 0;

  return {
    isColdStart: isColdStart,
    vector: normalizedVector,
    rawWeights: rawWeights,
    l2Norm: l2Norm,
    rankedGenres: rankedGenres,
    queryCandidates: queryCandidates,
    watchedSlugs: watchedSlugs,
    completedSlugs: completedSlugs,
    favoriteSlugs: favoriteSlugs,
    signalCount: history.length + favorites.length + interactions.length
  };
}

function buildHistoryGoogleSeeds(customHistory, customFavorites, customInteractions, userProfile) {
  const history = Array.isArray(customHistory) ? customHistory : getWatchHistory();
  const favorites = Array.isArray(customFavorites) ? customFavorites : getFavorites();
  const interactions = Array.isArray(customInteractions) ? customInteractions : getInteractionsList();
  const profile = userProfile || trainUserPreferenceModel(history, favorites, interactions);

  const seeds = [];
  const seenNorm = new Set();

  function addSeed(rawSeed) {
    if (!rawSeed || typeof rawSeed !== "string") {
      return;
    }
    const clean = rawSeed.replace(/\s+/g, " ").trim();
    if (clean.length < 4) {
      return;
    }
    const norm = stripVietnameseAccents(clean).toLowerCase();
    if (seenNorm.has(norm)) {
      return;
    }
    seenNorm.add(norm);
    seeds.push(clean);
  }

  // 1. Build Google Suggest seeds from recent Watch History titles, prefixes, genres, and actors
  history.slice(0, 5).forEach(function (item) {
    if (!item) {
      return;
    }
    const rawTitle = item.seriesTitle || (item.title ? String(item.title).split(" - ")[0] : "");
    const cleanedTitle = rawTitle.replace(/\([^)]*\)/g, "").trim();
    if (cleanedTitle.length >= 2) {
      const tokens = tokenizeMovieText(cleanedTitle);
      if (tokens.unigrams.length >= 2) {
        addSeed("phim " + tokens.unigrams[0] + " ");
      }
      if (tokens.bigrams.length > 0 && tokens.unigrams.length > 2) {
        addSeed("phim " + tokens.bigrams[0] + " ");
      }
      addSeed("phim " + cleanedTitle + " ");
    }
    if (Array.isArray(item.categories) && item.categories.length >= 2) {
      const c0 = typeof item.categories[0] === "string" ? item.categories[0] : (item.categories[0] && item.categories[0].name ? item.categories[0].name : "");
      const c1 = typeof item.categories[1] === "string" ? item.categories[1] : (item.categories[1] && item.categories[1].name ? item.categories[1].name : "");
      if (c0 && c1) {
        addSeed("phim " + c0.toLowerCase() + " " + c1.toLowerCase() + " ");
      }
    }
    if (Array.isArray(item.actors) && item.actors.length > 0 && item.actors[0].length >= 4) {
      addSeed("phim " + item.actors[0] + " ");
    }
  });

  // 2. Build seeds from Favorites
  favorites.slice(0, 3).forEach(function (fav) {
    if (!fav) {
      return;
    }
    const favTitle = (fav.title || fav.name || "").replace(/\([^)]*\)/g, "").trim();
    if (favTitle.length >= 2) {
      addSeed("phim " + favTitle + " ");
      const tokens = tokenizeMovieText(favTitle);
      if (tokens.bigrams.length > 0) {
        addSeed("phim " + tokens.bigrams[0] + " ");
      }
    }
  });

  // 3. Build seeds from recent User Searches / Interactions
  interactions.slice(0, 4).forEach(function (inter) {
    if (!inter) {
      return;
    }
    if (inter.type === "search" && inter.query) {
      const q = String(inter.query).trim();
      addSeed(q.toLowerCase().indexOf("phim") === 0 ? (q + " ") : ("phim " + q + " "));
    } else if (inter.title) {
      const tokens = tokenizeMovieText(inter.title);
      if (tokens.bigrams.length > 0) {
        addSeed("phim " + tokens.bigrams[0] + " ");
      }
    }
  });

  // 4. Add top latent genre seed for discovery
  if (profile.rankedGenres && profile.rankedGenres.length > 0) {
    const topGenre = GENRE_PRIORS_AND_KEYWORDS.find(function (g) {
      return g.slug === profile.rankedGenres[0].slug;
    });
    if (topGenre && topGenre.searchSeed) {
      addSeed("phim " + topGenre.searchSeed + " ");
    }
  }

  if (!seeds.length) {
    return ["phim bo hay ", "phim moi ", "phim hanh dong ", "phim co trang "];
  }

  return seeds.slice(0, 5);
}

function enrichProfileWithGoogleKeywords(userProfile, googleKeywords) {
  const profile = userProfile || trainUserPreferenceModel();
  if (!Array.isArray(googleKeywords) || !googleKeywords.length) {
    return profile;
  }

  const rawWeights = Object.assign(Object.create(null), profile.rawWeights || {});
  const googleExpandedSet = new Set(profile.googleExpandedKeywords || []);

  googleKeywords.forEach(function (kw, idx) {
    if (!kw || typeof kw !== "string") {
      return;
    }
    const cleanKw = kw.trim();
    if (cleanKw.length < 3) {
      return;
    }
    googleExpandedSet.add(cleanKw.toLowerCase());
    const rankWeight = Math.max(0.45, 1.35 - idx * 0.1);
    const tokens = tokenizeMovieText(cleanKw);

    tokens.unigrams.forEach(function (u) {
      const key = "term:" + u;
      rawWeights[key] = (rawWeights[key] || 0) + rankWeight * 0.95;
      const unacc = stripVietnameseAccents(u);
      if (unacc !== u && unacc.length >= 3) {
        const asciiKey = "term_ascii:" + unacc;
        rawWeights[asciiKey] = (rawWeights[asciiKey] || 0) + rankWeight * 0.65;
      }
    });

    tokens.bigrams.forEach(function (bg) {
      const key = "bigram:" + bg;
      rawWeights[key] = (rawWeights[key] || 0) + rankWeight * 1.65;
    });

    inferLatentGenres({ title: cleanKw }).forEach(function (g) {
      const gKey = "genre:" + g.slug;
      rawWeights[gKey] = (rawWeights[gKey] || 0) + g.weight * rankWeight * 1.4;
    });
  });

  // Re-normalize L2 User Centroid Vector with Google-enriched features
  let normSq = 0;
  const fKeys = Object.keys(rawWeights);
  for (let i = 0; i < fKeys.length; i += 1) {
    const val = rawWeights[fKeys[i]];
    normSq += val * val;
  }
  const l2Norm = normSq > 0 ? Math.sqrt(normSq) : 1;
  const normalizedVector = Object.create(null);
  for (let i = 0; i < fKeys.length; i += 1) {
    const k = fKeys[i];
    normalizedVector[k] = rawWeights[k] / l2Norm;
  }

  profile.rawWeights = rawWeights;
  profile.vector = normalizedVector;
  profile.l2Norm = l2Norm;
  profile.googleExpandedKeywords = Array.from(googleExpandedSet);
  return profile;
}

function fetchGoogleRelatedQueriesFromHistory(userProfile, options) {
  const customHistory = options && options.history ? options.history : null;
  const customFavorites = options && options.favorites ? options.favorites : null;
  const customInteractions = options && options.interactions ? options.interactions : null;
  const suggestFn = (options && typeof options.suggestFn === "function") ? options.suggestFn : fetchGoogleSuggestions;
  const maxKeywords = (options && options.maxKeywords > 0) ? options.maxKeywords : 8;

  const profile = userProfile || trainUserPreferenceModel(customHistory, customFavorites, customInteractions);
  const seeds = buildHistoryGoogleSeeds(customHistory, customFavorites, customInteractions, profile);

  return Promise.all(seeds.map(function (seed) {
    return Promise.resolve(suggestFn(seed)).catch(function () {
      return [];
    });
  })).then(function (suggestionLists) {
    const rawSuggestions = [];
    suggestionLists.forEach(function (list) {
      if (Array.isArray(list)) {
        rawSuggestions.push.apply(rawSuggestions, list);
      }
    });

    const extracted = extractKeywords(rawSuggestions);
    const cleanedKeywords = [];
    const seen = new Set();

    for (let i = 0; i < extracted.length && cleanedKeywords.length < maxKeywords; i += 1) {
      const kw = String(extracted[i] || "").trim();
      const norm = stripVietnameseAccents(kw).toLowerCase();
      if (kw.length >= 3 && !VIETNAMESE_STOPWORDS.has(norm) && !seen.has(norm)) {
        seen.add(norm);
        cleanedKeywords.push(kw);
      }
    }

    enrichProfileWithGoogleKeywords(profile, cleanedKeywords);

    return {
      seeds: seeds,
      googleKeywords: cleanedKeywords,
      enrichedProfile: profile
    };
  }).catch(function () {
    return {
      seeds: seeds,
      googleKeywords: [],
      enrichedProfile: profile
    };
  });
}

function predictSearchQueries(userProfile, maxQueries) {
  const limit = maxQueries && maxQueries > 0 ? maxQueries : 5;
  const profile = userProfile || trainUserPreferenceModel();

  if (profile.isColdStart || !profile.queryCandidates.length) {
    // Cold-Start exploration seeds
    return ["hành động", "cổ trang", "tình cảm", "viễn tưởng", "hoạt hình"].slice(0, limit);
  }

  const selected = [];
  const seen = new Set();

  for (let i = 0; i < profile.queryCandidates.length && selected.length < limit; i += 1) {
    const q = profile.queryCandidates[i].query;
    const norm = stripVietnameseAccents(q).toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      selected.push(q);
    }
  }

  // Ensure diversity by adding top genre seed if slots remain
  const defaultSeeds = ["cổ trang", "hành động", "tình cảm", "hoạt hình", "kinh dị"];
  for (let i = 0; i < defaultSeeds.length && selected.length < limit; i += 1) {
    const s = defaultSeeds[i];
    const norm = stripVietnameseAccents(s).toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      selected.push(s);
    }
  }

  return selected;
}

function scoreMovieWithModel(movie, userProfile) {
  if (!movie || typeof movie !== "object") {
    return { score: 0, matchPercent: 75 };
  }
  const profile = userProfile || trainUserPreferenceModel();
  const movieFeatures = extractMovieFeatures(movie);
  const mKeys = Object.keys(movieFeatures);

  if (!mKeys.length) {
    return { score: 0.1, matchPercent: 78 };
  }

  // Compute Movie L2 Norm and Dot Product with User Centroid Vector
  let dotProduct = 0;
  let movieNormSq = 0;
  let genreAffinityBonus = 0;

  for (let i = 0; i < mKeys.length; i += 1) {
    const k = mKeys[i];
    const mVal = movieFeatures[k];
    movieNormSq += mVal * mVal;

    if (profile.vector && profile.vector[k]) {
      dotProduct += profile.vector[k] * mVal;
    }
    if (k.indexOf("genre:") === 0 && profile.rawWeights && profile.rawWeights[k]) {
      genreAffinityBonus += 0.08;
    }
  }

  const movieNorm = movieNormSq > 0 ? Math.sqrt(movieNormSq) : 1;
  const cosineSim = profile.isColdStart ? 0.45 : (dotProduct / movieNorm);

  // Google Query Expansion Match Bonus (when movie title/origin matches Google related queries)
  let googleExpansionBonus = 0;
  if (movie.googleQueryMatched) {
    googleExpansionBonus += 0.09;
  } else if (Array.isArray(profile.googleExpandedKeywords) && profile.googleExpandedKeywords.length > 0) {
    const titleNorm = stripVietnameseAccents((movie.seriesTitle || movie.title || "") + " " + (movie.originTitle || "")).toLowerCase();
    for (let g = 0; g < profile.googleExpandedKeywords.length; g += 1) {
      const gNorm = stripVietnameseAccents(profile.googleExpandedKeywords[g]).toLowerCase();
      if (gNorm.length >= 4 && titleNorm.indexOf(gNorm) !== -1) {
        googleExpansionBonus += 0.07;
        break;
      }
    }
  }

  // Quality & Recency Prior
  let qualityPrior = 0;
  const yr = parseInt(movie.year, 10);
  if (!isNaN(yr)) {
    if (yr >= 2025) {
      qualityPrior += 0.08;
    } else if (yr >= 2022) {
      qualityPrior += 0.04;
    }
  }
  if (movie.quality && /4k|fhd|hd/i.test(movie.quality)) {
    qualityPrior += 0.04;
  }

  // Novelty / Diversity Penalty for already completed movies
  const slug = movie.slug || movie.id || "";
  let noveltyAdjustment = 0;
  if (slug && profile.completedSlugs && profile.completedSlugs.has(slug)) {
    noveltyAdjustment -= 0.35;
  } else if (slug && profile.watchedSlugs && profile.watchedSlugs.has(slug)) {
    noveltyAdjustment -= 0.12;
  }

  const rawScore = Math.max(0.05, cosineSim * 0.78 + Math.min(0.22, genreAffinityBonus) + googleExpansionBonus + qualityPrior + noveltyAdjustment);

  // Calibrated sigmoid mapping into [82%, 99%] match percentage
  const calibrated = 1 / (1 + Math.exp(-4.2 * (rawScore - 0.22)));
  const matchPercent = Math.max(80, Math.min(99, Math.round(78 + calibrated * 21)));

  return {
    score: Number(rawScore.toFixed(4)),
    cosineSimilarity: Number(cosineSim.toFixed(4)),
    matchPercent: matchPercent
  };
}

function buildProfileSignature(profile) {
  const topQueries = predictSearchQueries(profile, 4).join("|");
  const topGenres = (profile.rankedGenres || []).slice(0, 3).map(function (g) { return g.slug; }).join(",");
  return profile.signalCount + ":" + topGenres + ":" + topQueries;
}

function getMlRecommendations(kkphimApi, options) {
  const force = Boolean(options && options.force);
  const maxResults = (options && options.limit > 0) ? options.limit : 16;
  const profile = trainUserPreferenceModel();
  const signature = buildProfileSignature(profile);

  if (!force && memoryRecommendationCache) {
    const age = Date.now() - memoryRecommendationCache.timestamp;
    if (age < ML_CACHE_TTL_MS && memoryRecommendationCache.signature === signature && memoryRecommendationCache.movies.length) {
      return Promise.resolve({
        movies: memoryRecommendationCache.movies.slice(0, maxResults),
        queries: memoryRecommendationCache.queries,
        googleQueries: memoryRecommendationCache.googleQueries || [],
        googleSeeds: memoryRecommendationCache.googleSeeds || [],
        topGenres: memoryRecommendationCache.topGenres,
        isColdStart: profile.isColdStart,
        isCached: true
      });
    }
  }

  return fetchGoogleRelatedQueriesFromHistory(profile, options).then(function (googleEnrichment) {
    const googleKeywords = (googleEnrichment && Array.isArray(googleEnrichment.googleKeywords))
      ? googleEnrichment.googleKeywords
      : [];
    const googleSeeds = (googleEnrichment && Array.isArray(googleEnrichment.googleSeeds || googleEnrichment.seeds))
      ? (googleEnrichment.googleSeeds || googleEnrichment.seeds)
      : [];

    const baseQueries = predictSearchQueries(profile, 4);
    const mergedQueries = [];
    const seenQueryNorm = new Set();
    const googleQueryNormSet = new Set();

    function addCombinedQuery(q, isFromGoogle) {
      if (!q || typeof q !== "string") {
        return;
      }
      const clean = q.trim();
      const norm = stripVietnameseAccents(clean).toLowerCase();
      if (!clean || seenQueryNorm.has(norm)) {
        return;
      }
      seenQueryNorm.add(norm);
      if (isFromGoogle) {
        googleQueryNormSet.add(norm);
      }
      mergedQueries.push(clean);
    }

    // Interleave on-device ML queries and Google-expanded related movie queries
    baseQueries.slice(0, 3).forEach(function (q) {
      addCombinedQuery(q, false);
    });
    googleKeywords.slice(0, 4).forEach(function (gq) {
      addCombinedQuery(gq, true);
    });
    baseQueries.slice(3).forEach(function (q) {
      addCombinedQuery(q, false);
    });

    const activeQueries = mergedQueries.slice(0, 7);
    const topGenreSlug = (profile.rankedGenres && profile.rankedGenres.length > 0)
      ? profile.rankedGenres[0].slug
      : "hanh-dong";

    const searchTasks = activeQueries.map(function (kw) {
      if (!kkphimApi || typeof kkphimApi.searchMovies !== "function") {
        return Promise.resolve([]);
      }
      const kwNorm = stripVietnameseAccents(kw).toLowerCase();
      const isGoogleSource = googleQueryNormSet.has(kwNorm);
      return kkphimApi.searchMovies(kw, 6, 1).then(function (res) {
        const list = (res && Array.isArray(res.movies)) ? res.movies : [];
        if (!isGoogleSource) {
          return list;
        }
        return list.map(function (m) {
          return Object.assign({}, m, { googleQueryMatched: kw });
        });
      }).catch(function () {
        return [];
      });
    });

    if (kkphimApi && typeof kkphimApi.getMoviesByGenre === "function") {
      searchTasks.push(
        kkphimApi.getMoviesByGenre(topGenreSlug, 1, 12).then(function (res) {
          return (res && Array.isArray(res.movies)) ? res.movies : [];
        }).catch(function () {
          return [];
        })
      );
    }

    return Promise.all(searchTasks).then(function (resultsLists) {
      const candidateMap = new Map();
      resultsLists.forEach(function (list) {
        if (!Array.isArray(list)) {
          return;
        }
        list.forEach(function (movie) {
          if (!movie) {
            return;
          }
          const key = movie.slug || movie.id;
          if (!key) {
            return;
          }
          if (!candidateMap.has(key)) {
            candidateMap.set(key, movie);
          } else if (movie.googleQueryMatched && !candidateMap.get(key).googleQueryMatched) {
            candidateMap.set(key, Object.assign({}, candidateMap.get(key), {
              googleQueryMatched: movie.googleQueryMatched
            }));
          }
        });
      });

      const candidates = Array.from(candidateMap.values());

      function finalizeCandidates(movieList) {
        const scored = movieList.map(function (movie) {
          const evaluation = scoreMovieWithModel(movie, profile);
          const enriched = Object.assign({}, movie, {
            mlScore: evaluation.score,
            mlMatchPercent: evaluation.matchPercent
          });
          return enriched;
        });

        scored.sort(function (a, b) {
          return b.mlScore - a.mlScore;
        });

        const finalMovies = scored.slice(0, maxResults);
        const topGenres = (profile.rankedGenres || []).slice(0, 3).map(function (g) { return g.slug; });

        if (scored.length > 0) {
          memoryRecommendationCache = {
            timestamp: Date.now(),
            signature: signature,
            movies: scored,
            queries: activeQueries,
            googleQueries: googleKeywords,
            googleSeeds: googleSeeds,
            topGenres: topGenres
          };
        }

        return {
          movies: finalMovies,
          queries: activeQueries,
          googleQueries: googleKeywords,
          googleSeeds: googleSeeds,
          topGenres: topGenres,
          isColdStart: profile.isColdStart,
          isCached: false
        };
      }

      if (candidates.length >= 10 || !kkphimApi || typeof kkphimApi.getMoviesByCategory !== "function") {
        return finalizeCandidates(candidates);
      }

      // Fallback enrichment if search returned fewer than 10 items
      return kkphimApi.getMoviesByCategory("phim-le", 1, 14).then(function (res) {
        const extra = (res && Array.isArray(res.movies)) ? res.movies : [];
        extra.forEach(function (m) {
          const key = m && (m.slug || m.id);
          if (key && !candidateMap.has(key)) {
            candidateMap.set(key, m);
          }
        });
        return finalizeCandidates(Array.from(candidateMap.values()));
      }).catch(function () {
        return finalizeCandidates(candidates);
      });
    });
  });
}

function createMlRecommendationService(kkphimApi) {
  return {
    trainModel: trainUserPreferenceModel,
    predictQueries: predictSearchQueries,
    buildGoogleSeeds: buildHistoryGoogleSeeds,
    expandWithGoogle: fetchGoogleRelatedQueriesFromHistory,
    enrichProfileWithGoogle: enrichProfileWithGoogleKeywords,
    scoreMovie: scoreMovieWithModel,
    extractFeatures: extractMovieFeatures,
    inferGenres: inferLatentGenres,
    recordInteraction: recordUserMovieInteraction,
    recordSearch: recordUserSearchQuery,
    invalidateCache: invalidateMlRecommendationCache,
    getRecommendations(options) {
      return getMlRecommendations(kkphimApi, options);
    }
  };
}

return {stripVietnameseAccents: stripVietnameseAccents, tokenizeMovieText: tokenizeMovieText, inferLatentGenres: inferLatentGenres, extractMovieFeatures: extractMovieFeatures, invalidateMlRecommendationCache: invalidateMlRecommendationCache, recordUserMovieInteraction: recordUserMovieInteraction, recordUserSearchQuery: recordUserSearchQuery, trainUserPreferenceModel: trainUserPreferenceModel, buildHistoryGoogleSeeds: buildHistoryGoogleSeeds, enrichProfileWithGoogleKeywords: enrichProfileWithGoogleKeywords, fetchGoogleRelatedQueriesFromHistory: fetchGoogleRelatedQueriesFromHistory, predictSearchQueries: predictSearchQueries, scoreMovieWithModel: scoreMovieWithModel, getMlRecommendations: getMlRecommendations, createMlRecommendationService: createMlRecommendationService};
});
registerModule("js/home/movie-detail-modal.js", function (requireModule) {
var isFavorite = requireModule("js/services/favorites-service.js")["isFavorite"];
var toggleFavorite = requireModule("js/services/favorites-service.js")["toggleFavorite"];
var getWatchHistoryItem = requireModule("js/services/watch-history-service.js")["getWatchHistoryItem"];
var getEpisodeResumeInfo = requireModule("js/services/watch-history-service.js")["getEpisodeResumeInfo"];
var enrichWatchHistoryMetadata = requireModule("js/services/watch-history-service.js")["enrichWatchHistoryMetadata"];
var recordUserMovieInteraction = requireModule("js/services/ml-recommendation-service.js")["recordUserMovieInteraction"];
var fallbackPoster = requireModule("js/config/catalog-sources.js")["fallbackPoster"];
var buildMovieUrl = requireModule("js/utils/url.js")["buildMovieUrl"];
var copyTextToClipboard = requireModule("js/utils/url.js")["copyTextToClipboard"];
var formatTime = requireModule("js/utils/format-time.js")["formatTime"];
function cleanHtmlContent(html) {
  if (!html) {
    return "Chưa có mô tả nội dung cho phim này.";
  }
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "Chưa có mô tả nội dung.";
}

function createMovieDetailModal(parentContainer, kkphimApi, options) {
  const overlay = document.createElement("div");
  overlay.className = "movie-detail-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Chi tiết phim");

  const modal = document.createElement("div");
  modal.className = "movie-detail-modal";
  overlay.appendChild(modal);

  let disposed = false;
  let currentMovie = null;
  let detailData = null;
  let activeServerIndex = 0;
  let focusableElements = [];
  let currentFocusIndex = 0;

  let cachedCloseBtn = null;
  let cachedResumeBtn = null;
  let cachedFavBtn = null;
  let cachedShareBtn = null;
  let cachedServerTabs = [];
  let cachedEpisodeBtns = [];
  let cachedEpContainer = null;
  let cachedGridCols = 5;

  function getGridCols() {
    return cachedGridCols || 5;
  }

  function updateFocusables() {
    focusableElements = Array.from(modal.querySelectorAll('button:not([disabled]), [tabindex="0"]'));
  }

  function updateModalLayoutCache() {
    cachedCloseBtn = modal.querySelector(".movie-detail-close");
    cachedResumeBtn = modal.querySelector(".movie-detail-resume-btn");
    cachedFavBtn = modal.querySelector(".movie-detail-fav-btn");
    cachedShareBtn = modal.querySelector(".movie-detail-share-btn");
    cachedServerTabs = Array.from(modal.querySelectorAll(".movie-server-tab"));
    cachedEpisodeBtns = Array.from(modal.querySelectorAll(".movie-episode-btn"));
    cachedEpContainer = modal.querySelector(".movie-episodes-container");
    const epGrid = modal.querySelector(".movie-detail-episodes-grid");
    const width = (typeof window !== "undefined" ? window.innerWidth : 0) || 1280;
    let detectedCols = width <= 767 ? 4 : 5;
    if (epGrid && typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      const tpl = window.getComputedStyle(epGrid).gridTemplateColumns;
      if (tpl && tpl !== "none") {
        const parts = tpl.trim().split(/\s+/).filter(Boolean);
        if (parts.length > 0) {
          detectedCols = parts.length;
        }
      }
    }
    cachedGridCols = detectedCols;
    updateFocusables();
  }

  function setFocus(index) {
    if (!focusableElements.length) {
      updateFocusables();
    }
    if (!focusableElements.length) {
      return;
    }
    currentFocusIndex = Math.max(0, Math.min(focusableElements.length - 1, index));
    focusableElements[currentFocusIndex].focus();
  }

  function renderLoading(movie) {
    modal.innerHTML = "" +
      '<div class="movie-detail-header">' +
        '<button type="button" class="movie-detail-close" aria-label="Đóng chi tiết">×</button>' +
      '</div>' +
      '<div class="movie-detail-loading">' +
        '<div class="loader-spinner" aria-hidden="true">' +
          '<svg class="spinner-svg" viewBox="0 0 50 50">' +
            '<circle class="spinner-track" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>' +
            '<circle class="spinner-circle" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>' +
          '</svg>' +
        '</div>' +
        '<p class="movie-detail-loading-text">Đang tải thông tin phim "' + (movie.title || "") + '"...</p>' +
      '</div>';

    const closeBtn = modal.querySelector(".movie-detail-close");
    closeBtn.addEventListener("click", close);
    closeBtn.focus();
  }

  function renderError(message) {
    modal.innerHTML = "" +
      '<div class="movie-detail-header">' +
        '<button type="button" class="movie-detail-close" aria-label="Đóng chi tiết">×</button>' +
      '</div>' +
      '<div class="movie-detail-error">' +
        '<p class="movie-detail-error-message">' + (message || "Không thể tải thông tin phim.") + '</p>' +
        '<button type="button" class="movie-detail-btn movie-detail-btn-retry">Thử lại</button>' +
      '</div>';

    const closeBtn = modal.querySelector(".movie-detail-close");
    closeBtn.addEventListener("click", close);
    const retryBtn = modal.querySelector(".movie-detail-btn-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        loadDetail(currentMovie.slug);
      });
      retryBtn.focus();
    }
  }

  function renderDetail(data) {
    detailData = data;
    const movie = data.movie;
    const episodes = data.episodes || [];
    const favActive = isFavorite(movie.slug);

    enrichWatchHistoryMetadata(movie);
    recordUserMovieInteraction(movie, "view");

    const historyItem = getWatchHistoryItem(movie.slug);
    const resumeInfo = getEpisodeResumeInfo(movie.slug);

    let badgesHtml = "";
    if (movie.quality) {
      badgesHtml += '<span class="movie-badge badge-quality">' + movie.quality + '</span>';
    }
    if (movie.year) {
      badgesHtml += '<span class="movie-badge badge-year">' + movie.year + '</span>';
    }
    if (movie.lang) {
      badgesHtml += '<span class="movie-badge badge-lang">' + movie.lang + '</span>';
    }
    if (movie.episodeCurrent) {
      badgesHtml += '<span class="movie-badge badge-episode">' + movie.episodeCurrent + '</span>';
    }

    const descText = cleanHtmlContent(movie.content);

    // Server tabs HTML
    let serverTabsHtml = "";
    if (episodes.length > 0) {
      serverTabsHtml = '<div class="movie-detail-servers" role="tablist" aria-label="Danh sách server">';
      episodes.forEach(function (srv, idx) {
        const isActive = idx === activeServerIndex;
        serverTabsHtml += '<button type="button" class="movie-server-tab' + (isActive ? ' is-active' : '') + '" role="tab" aria-selected="' + (isActive ? 'true' : 'false') + '" data-server-index="' + idx + '">' + (srv.server_name || ('Server ' + (idx + 1))) + '</button>';
      });
      serverTabsHtml += '</div>';
    }

    // Episode list HTML
    const currentServer = episodes[activeServerIndex] || episodes[0];
    const serverData = (currentServer && Array.isArray(currentServer.server_data)) ? currentServer.server_data : [];

    let episodesHtml = "";
    if (serverData.length > 0) {
      episodesHtml = '<div class="movie-detail-episodes-grid" role="group" aria-label="Danh sách tập">';
      serverData.forEach(function (ep, epIdx) {
        const epResume = getEpisodeResumeInfo(movie.slug, epIdx);
        const isCurrentEp = Boolean(historyItem && historyItem.currentEpisodeIndex === epIdx);
        const extraClass = (isCurrentEp ? " is-current-episode" : "") + (epResume ? " is-watched-episode" : "");
        const epLabel = ep.name || ("Tập " + (epIdx + 1));
        const timeHint = epResume ? (' · ' + formatTime(epResume.currentTime)) : '';
        episodesHtml += '<button type="button" class="movie-episode-btn' + extraClass + '" data-ep-index="' + epIdx + '" data-m3u8="' + (ep.link_m3u8 || '') + '" data-embed="' + (ep.link_embed || '') + '" data-ep-name="' + (ep.name || '') + '" title="' + epLabel + timeHint + '">' + epLabel + '</button>';
      });
      episodesHtml += '</div>';
    } else {
      episodesHtml = '<p class="movie-episodes-empty">Chưa có tập phim nào trên server này.</p>';
    }

    let resumeBtnHtml = "";
    if (resumeInfo && serverData.length > 0 && resumeInfo.episodeIndex < serverData.length) {
      const resumeEpLabel = serverData[resumeInfo.episodeIndex].name || resumeInfo.episodeName || ("Tập " + (resumeInfo.episodeIndex + 1));
      resumeBtnHtml = '' +
        '<button type="button" class="movie-detail-btn movie-detail-resume-btn" data-ep-index="' + resumeInfo.episodeIndex + '">' +
          '<span class="resume-icon">▶</span> ' +
          '<span class="resume-label">Tiếp tục ' + resumeEpLabel + ' (' + formatTime(resumeInfo.currentTime) + ')</span>' +
        '</button>';
    }

    modal.innerHTML = "" +
      '<div class="movie-detail-backdrop">' +
        '<img class="movie-backdrop-img" src="' + (movie.poster || fallbackPoster) + '" alt="" aria-hidden="true">' +
        '<div class="movie-backdrop-gradient"></div>' +
      '</div>' +
      '<div class="movie-detail-header">' +
        '<button type="button" class="movie-detail-close" aria-label="Đóng chi tiết">×</button>' +
      '</div>' +
      '<div class="movie-detail-body">' +
        '<div class="movie-detail-poster-wrap">' +
          '<img class="movie-detail-poster" src="' + (movie.poster || fallbackPoster) + '" alt="' + (movie.title || '') + '">' +
        '</div>' +
        '<div class="movie-detail-info">' +
          '<h1 class="movie-detail-title">' + (movie.title || '') + '</h1>' +
          (movie.originTitle ? '<h2 class="movie-detail-origin">' + movie.originTitle + '</h2>' : '') +
          '<div class="movie-detail-badges">' + badgesHtml + '</div>' +
          '<p class="movie-detail-desc">' + descText + '</p>' +
          '<div class="movie-detail-actions">' +
            resumeBtnHtml +
            '<button type="button" class="movie-detail-btn movie-detail-fav-btn' + (favActive ? ' is-favorite' : '') + '" aria-pressed="' + (favActive ? 'true' : 'false') + '">' +
              '<span class="fav-icon">' + (favActive ? '♥' : '♡') + '</span> ' +
              '<span class="fav-label">' + (favActive ? 'Đã yêu thích' : 'Thêm vào yêu thích') + '</span>' +
            '</button>' +
            '<button type="button" class="movie-detail-btn movie-detail-share-btn" aria-label="Chia sẻ phim">' +
              '<span class="share-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> ' +
              '<span class="share-label">Chia sẻ</span>' +
            '</button>' +
          '</div>' +
          '<div class="movie-detail-section-title">Chọn tập phim:</div>' +
          serverTabsHtml +
          '<div class="movie-episodes-container">' + episodesHtml + '</div>' +
        '</div>' +
      '</div>';

    // Bind Close
    const closeBtn = modal.querySelector(".movie-detail-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", close);
    }

    // Modal Toast
    function showModalToast(message) {
      let toastEl = modal.querySelector(".movie-detail-toast");
      if (!toastEl) {
        toastEl = document.createElement("div");
        toastEl.className = "movie-detail-toast";
        modal.appendChild(toastEl);
      }
      toastEl.textContent = message;
      toastEl.classList.add("is-visible");
      window.clearTimeout(toastEl._timer);
      toastEl._timer = window.setTimeout(function () {
        toastEl.classList.remove("is-visible");
      }, 2400);
    }

    // Bind Share button
    const shareBtn = modal.querySelector(".movie-detail-share-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", function () {
        const shareUrl = buildMovieUrl(movie.slug);
        copyTextToClipboard(shareUrl).then(function (success) {
          showModalToast(success ? "Đã sao chép liên kết phim!" : "Không thể sao chép liên kết.");
        });
      });
    }

    // Bind Favorite toggle
    const favBtn = modal.querySelector(".movie-detail-fav-btn");
    if (favBtn) {
      favBtn.addEventListener("click", function () {
        const nowFav = toggleFavorite(movie);
        favBtn.classList.toggle("is-favorite", nowFav);
        favBtn.setAttribute("aria-pressed", nowFav ? "true" : "false");
        const iconSpan = favBtn.querySelector(".fav-icon");
        const labelSpan = favBtn.querySelector(".fav-label");
        if (iconSpan) {
          iconSpan.textContent = nowFav ? "♥" : "♡";
        }
        if (labelSpan) {
          labelSpan.textContent = nowFav ? "Đã yêu thích" : "Thêm vào yêu thích";
        }
        if (options && typeof options.onFavoritesChanged === "function") {
          options.onFavoritesChanged(movie, nowFav);
        }
      });
    }

    // Bind Server tabs
    const serverTabs = modal.querySelectorAll(".movie-server-tab");
    serverTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        const newIdx = parseInt(tab.dataset.serverIndex, 10);
        if (newIdx !== activeServerIndex) {
          activeServerIndex = newIdx;
          renderDetail(detailData);
        }
      });
    });

    function launchEpisodeAtIndex(epIndex) {
      const epObj = serverData[epIndex];
      if (!epObj) {
        return;
      }
      const m3u8Url = epObj.link_m3u8 || epObj.link_embed;
      if (!m3u8Url) {
        alert("Tập phim này hiện không có đường dẫn phát.");
        return;
      }

      const serverName = currentServer ? currentServer.server_name : "Vietsub";
      const epResume = getEpisodeResumeInfo(movie.slug, epIndex);
      const playbackMovie = {
        id: movie.slug + "-" + (epObj.slug || epIndex),
        slug: movie.slug,
        seriesTitle: movie.title,
        originTitle: movie.originTitle || "",
        episodeName: epObj.name,
        title: movie.title + " - " + epObj.name,
        poster: movie.poster,
        thumb: movie.thumb || movie.poster,
        year: movie.year || "",
        quality: movie.quality || "",
        lang: movie.lang || "",
        type: movie.type || "",
        categories: Array.isArray(movie.categories) ? movie.categories : [],
        countries: Array.isArray(movie.countries) ? movie.countries : [],
        actors: Array.isArray(movie.actors) ? movie.actors : [],
        m3u8: m3u8Url,
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
        currentEpisodeIndex: epIndex,
        resumeTime: epResume ? epResume.currentTime : 0,
        serverName: serverName
      };

      close(true);
      if (options && typeof options.onSelectEpisode === "function") {
        options.onSelectEpisode(playbackMovie);
      }
    }

    // Bind Resume button
    const resumeBtn = modal.querySelector(".movie-detail-resume-btn");
    if (resumeBtn) {
      resumeBtn.addEventListener("click", function () {
        const epIdx = parseInt(resumeBtn.dataset.epIndex, 10);
        launchEpisodeAtIndex(isNaN(epIdx) ? 0 : epIdx);
      });
    }

    // Bind Episode buttons
    const episodeBtns = modal.querySelectorAll(".movie-episode-btn");
    episodeBtns.forEach(function (epBtn) {
      epBtn.addEventListener("click", function () {
        const epIndex = parseInt(epBtn.dataset.epIndex, 10);
        launchEpisodeAtIndex(epIndex);
      });
    });

    // Set initial focus: current/watched episode button, or resume/favorite button if no episodes
    updateModalLayoutCache();
    const isMobileView = (typeof window !== "undefined" && window.innerWidth <= 767) ||
      (typeof document !== "undefined" && document.body && document.body.getAttribute("data-device") === "mobile");
    const defaultEpIdx = (currentMovie && typeof currentMovie.currentEpisodeIndex === "number" && currentMovie.currentEpisodeIndex > 0)
      ? currentMovie.currentEpisodeIndex
      : (historyItem && typeof historyItem.currentEpisodeIndex === "number" ? historyItem.currentEpisodeIndex : 0);
    const initialEpIdx = Math.max(0, Math.min(cachedEpisodeBtns.length - 1, defaultEpIdx));
    const targetEpBtn = cachedEpisodeBtns.length ? cachedEpisodeBtns[initialEpIdx] : null;
    if (isMobileView) {
      modal.scrollTop = 0;
      if (resumeBtn) {
        resumeBtn.focus({ preventScroll: true });
      } else if (targetEpBtn) {
        targetEpBtn.focus({ preventScroll: true });
      } else if (favBtn) {
        favBtn.focus({ preventScroll: true });
      } else if (closeBtn) {
        closeBtn.focus({ preventScroll: true });
      }
      modal.scrollTop = 0;
    } else if (resumeBtn) {
      resumeBtn.focus();
    } else if (targetEpBtn) {
      targetEpBtn.focus();
      if (typeof targetEpBtn.scrollIntoView === "function") {
        targetEpBtn.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    } else if (favBtn) {
      favBtn.focus();
    } else if (closeBtn) {
      closeBtn.focus();
    }
  }

  function loadDetail(slug) {
    const cached = (typeof kkphimApi.getCachedMovieDetail === "function") ? kkphimApi.getCachedMovieDetail(slug) : null;
    if (cached) {
      renderDetail(cached);
      return;
    }
    renderLoading(currentMovie);
    kkphimApi.getMovieDetail(slug).then(function (data) {
      if (disposed) {
        return;
      }
      renderDetail(data);
    }).catch(function (error) {
      if (disposed) {
        return;
      }
      renderError(error.message || "Không thể tải thông tin chi tiết phim.");
    });
  }

  function open(movie) {
    currentMovie = movie;
    activeServerIndex = 0;
    detailData = null;
    parentContainer.appendChild(overlay);
    if (options && typeof options.onOpen === "function") {
      options.onOpen(movie);
    }
    loadDetail(movie.slug);
  }

  function close(silent) {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (silent !== true && options && typeof options.onClose === "function") {
      options.onClose();
    }
  }

  function onKeyDown(event, key) {
    if (key.isBack || key.isEscape) {
      close();
      return true;
    }

    if (key.direction === "left" || key.direction === "right" || key.direction === "up" || key.direction === "down") {
      if (!focusableElements.length) {
        updateFocusables();
      }
      if (!focusableElements.length) {
        return true;
      }
      const activeEl = document.activeElement;
      let currentIndex = focusableElements.indexOf(activeEl);
      if (currentIndex === -1) {
        if (cachedEpisodeBtns.length > 0) {
          const fallbackEpIdx = (currentMovie && typeof currentMovie.currentEpisodeIndex === "number")
            ? Math.max(0, Math.min(cachedEpisodeBtns.length - 1, currentMovie.currentEpisodeIndex))
            : 0;
          cachedEpisodeBtns[fallbackEpIdx].focus();
        } else {
          setFocus(0);
        }
        return true;
      }

      // Use cached elements to avoid repeated DOM queries & layout thrashing on every key press
      const closeBtn = cachedCloseBtn;
      const resumeBtn = cachedResumeBtn;
      const favBtn = cachedFavBtn;
      const shareBtn = cachedShareBtn;
      const serverTabs = cachedServerTabs;
      const episodeBtns = cachedEpisodeBtns;
      const epContainer = cachedEpContainer;

      function ensureEpVisible(btn) {
        if (!btn) return;
        if (typeof btn.scrollIntoView === "function") {
          btn.scrollIntoView({ block: "nearest", inline: "nearest" });
        } else if (epContainer) {
          const cRect = epContainer.getBoundingClientRect();
          const bRect = btn.getBoundingClientRect();
          if (bRect.top < cRect.top) {
            epContainer.scrollTop -= (cRect.top - bRect.top + 10);
          } else if (bRect.bottom > cRect.bottom) {
            epContainer.scrollTop += (bRect.bottom - cRect.bottom + 10);
          }
        }
      }

      const cols = cachedGridCols || (episodeBtns.length < 2 ? 1 : 5);

      if (key.direction === "down") {
        if (activeEl === closeBtn) {
          if (resumeBtn) {
            resumeBtn.focus();
          } else if (favBtn) {
            favBtn.focus();
          } else if (shareBtn) {
            shareBtn.focus();
          } else if (serverTabs.length > 0) {
            serverTabs[0].focus();
          } else if (episodeBtns.length > 0) {
            episodeBtns[0].focus();
            ensureEpVisible(episodeBtns[0]);
          }
          return true;
        } else if (activeEl === resumeBtn || activeEl === favBtn || activeEl === shareBtn) {
          if (serverTabs.length > 0) {
            serverTabs[0].focus();
          } else if (episodeBtns.length > 0) {
            episodeBtns[0].focus();
            ensureEpVisible(episodeBtns[0]);
          }
          return true;
        } else if (serverTabs.includes(activeEl)) {
          if (episodeBtns.length > 0) {
            episodeBtns[0].focus();
            ensureEpVisible(episodeBtns[0]);
          }
          return true;
        } else if (episodeBtns.includes(activeEl)) {
          const epIdx = episodeBtns.indexOf(activeEl);
          const cols = getGridCols();
          let nextIdx = epIdx + cols;
          if (nextIdx >= episodeBtns.length) {
            const currentRow = Math.floor(epIdx / cols);
            const maxRow = Math.floor((episodeBtns.length - 1) / cols);
            if (currentRow < maxRow) {
              nextIdx = episodeBtns.length - 1;
            } else {
              return true;
            }
          }
          episodeBtns[nextIdx].focus();
          ensureEpVisible(episodeBtns[nextIdx]);
          return true;
        }
      } else if (key.direction === "up") {
        if (episodeBtns.includes(activeEl)) {
          const epIdx = episodeBtns.indexOf(activeEl);
          const cols = getGridCols();
          const nextIdx = epIdx - cols;
          if (nextIdx >= 0) {
            episodeBtns[nextIdx].focus();
            ensureEpVisible(episodeBtns[nextIdx]);
          } else if (serverTabs.length > 0) {
            serverTabs[Math.min(activeServerIndex, serverTabs.length - 1)].focus();
          } else if (resumeBtn) {
            resumeBtn.focus();
          } else if (shareBtn && focusableElements.indexOf(shareBtn) !== -1) {
            shareBtn.focus();
          } else if (favBtn) {
            favBtn.focus();
          }
          return true;
        } else if (serverTabs.includes(activeEl)) {
          if (resumeBtn) {
            resumeBtn.focus();
          } else if (shareBtn && focusableElements.indexOf(shareBtn) !== -1) {
            shareBtn.focus();
          } else if (favBtn) {
            favBtn.focus();
          } else if (closeBtn) {
            closeBtn.focus();
          }
          return true;
        } else if (activeEl === resumeBtn || activeEl === favBtn || activeEl === shareBtn) {
          if (closeBtn) {
            closeBtn.focus();
          }
          return true;
        }
      } else if (key.direction === "left") {
        if (activeEl === shareBtn) {
          if (favBtn) {
            favBtn.focus();
          } else if (resumeBtn) {
            resumeBtn.focus();
          }
          return true;
        } else if (activeEl === favBtn && resumeBtn) {
          resumeBtn.focus();
          return true;
        } else if (episodeBtns.includes(activeEl)) {
          const epIdx = episodeBtns.indexOf(activeEl);
          if (epIdx > 0) {
            episodeBtns[epIdx - 1].focus();
            ensureEpVisible(episodeBtns[epIdx - 1]);
          }
          return true;
        } else if (serverTabs.includes(activeEl)) {
          const sIdx = serverTabs.indexOf(activeEl);
          if (sIdx > 0) {
            serverTabs[sIdx - 1].focus();
          }
          return true;
        } else {
          const delta = -1;
          const nextIdx = currentIndex + delta;
          if (nextIdx >= 0 && nextIdx < focusableElements.length) {
            focusableElements[nextIdx].focus();
          }
          return true;
        }
      } else if (key.direction === "right") {
        if (activeEl === resumeBtn) {
          if (favBtn) {
            favBtn.focus();
          } else if (shareBtn) {
            shareBtn.focus();
          }
          return true;
        } else if (activeEl === favBtn) {
          if (shareBtn) {
            shareBtn.focus();
          }
          return true;
        } else if (episodeBtns.includes(activeEl)) {
          const epIdx = episodeBtns.indexOf(activeEl);
          if (epIdx < episodeBtns.length - 1) {
            episodeBtns[epIdx + 1].focus();
            ensureEpVisible(episodeBtns[epIdx + 1]);
          }
          return true;
        } else if (serverTabs.includes(activeEl)) {
          const sIdx = serverTabs.indexOf(activeEl);
          if (sIdx < serverTabs.length - 1) {
            serverTabs[sIdx + 1].focus();
          }
          return true;
        } else {
          const delta = 1;
          const nextIdx = currentIndex + delta;
          if (nextIdx >= 0 && nextIdx < focusableElements.length) {
            focusableElements[nextIdx].focus();
          }
          return true;
        }
      }
    }

    if (key.isSelect) {
      const activeEl = document.activeElement;
      if (activeEl && modal.contains(activeEl) && typeof activeEl.click === "function") {
        activeEl.click();
        return true;
      }
    }

    return false;
  }

  function destroy() {
    disposed = true;
    close(true);
  }

  return {
    open: open,
    close: close,
    isOpen: function () {
      return Boolean(overlay.parentNode);
    },
    onKeyDown: onKeyDown,
    destroy: destroy
  };
}

return {createMovieDetailModal: createMovieDetailModal};
});
registerModule("js/utils/url.js", function (requireModule) {
function parseRoute(search, hash) {
  let movieSlug = null;
  let ep = null;

  if (search) {
    try {
      const params = new URLSearchParams(search);
      if (params.has("movie")) {
        movieSlug = params.get("movie");
      }
      if (params.has("ep")) {
        ep = params.get("ep");
      }
    } catch (_) {}
  }

  if (!movieSlug && hash) {
    const cleanHash = hash.replace(/^[#/]+/, "");
    if (cleanHash.includes("movie=")) {
      try {
        const queryStr = cleanHash.includes("?") ? cleanHash.split("?")[1] : cleanHash;
        const hashParams = new URLSearchParams(queryStr);
        if (hashParams.has("movie")) {
          movieSlug = hashParams.get("movie");
        }
        if (hashParams.has("ep")) {
          ep = hashParams.get("ep");
        }
      } catch (_) {}
    } else {
      const parts = cleanHash.split("/");
      const movieIdx = parts.indexOf("movie");
      if (movieIdx !== -1 && parts[movieIdx + 1]) {
        movieSlug = parts[movieIdx + 1];
        const epIdx = parts.indexOf("ep");
        if (epIdx !== -1 && parts[epIdx + 1]) {
          ep = parts[epIdx + 1];
        }
      }
    }
  }

  return {
    movieSlug: movieSlug ? decodeURIComponent(movieSlug).trim() : null,
    ep: ep ? decodeURIComponent(ep).trim() : null
  };
}

function getDeviceQueryPrefix(sep) {
  if (typeof window === "undefined" || !window.location || !window.location.search) {
    return "";
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const dev = (params.get("device") || "").toLowerCase().trim();
    if (dev === "tv" || dev === "mobile" || dev === "desktop") {
      return (sep || "?") + "device=" + encodeURIComponent(dev);
    }
  } catch (_) {}
  return "";
}

function buildMovieUrl(slug) {
  const base = (typeof window !== "undefined" && window.location) ?
    (window.location.origin + window.location.pathname) : "";
  const devParam = getDeviceQueryPrefix("&");
  return base + "?movie=" + encodeURIComponent(slug) + devParam;
}

function buildEpisodeUrl(slug, ep) {
  const base = (typeof window !== "undefined" && window.location) ?
    (window.location.origin + window.location.pathname) : "";
  const devParam = getDeviceQueryPrefix("&");
  return base + "?movie=" + encodeURIComponent(slug) + "&ep=" + encodeURIComponent(ep) + devParam;
}

function buildHomeUrl() {
  const base = (typeof window !== "undefined" && window.location) ?
    (window.location.origin + window.location.pathname) : "";
  return base + getDeviceQueryPrefix("?");
}

function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text).then(function () {
      return true;
    }).catch(function () {
      return fallbackCopy(text);
    });
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  if (typeof document === "undefined") {
    return false;
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return Boolean(successful);
  } catch (_) {
    return false;
  }
}

return {parseRoute: parseRoute, buildMovieUrl: buildMovieUrl, buildEpisodeUrl: buildEpisodeUrl, buildHomeUrl: buildHomeUrl, copyTextToClipboard: copyTextToClipboard};
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
registerModule("js/home/hero-carousel.js", function (requireModule) {
var fallbackPoster = requireModule("js/config/catalog-sources.js")["fallbackPoster"];
var isFavorite = requireModule("js/services/favorites-service.js")["isFavorite"];
var toggleFavorite = requireModule("js/services/favorites-service.js")["toggleFavorite"];
function stripHtmlTags(html) {
  if (!html || typeof html !== "string") {
    return "";
  }
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function createHeroCarousel(parentContainer, actionsHandler) {
  const container = document.createElement("section");
  container.className = "home-hero-carousel";
  container.setAttribute("aria-label", "Phim tâm điểm nổi bật");

  let movies = [];
  let currentIndex = 0;
  let autoTimer = 0;
  let userInteracting = false;
  let destroyed = false;
  const detailCache = new Map();

  const slidesWrap = document.createElement("div");
  slidesWrap.className = "hero-slides-wrap";

  const controlsWrap = document.createElement("div");
  controlsWrap.className = "hero-controls-bar";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "hero-SubNav-arrow hero-arrow-prev";
  prevBtn.tabIndex = -1;
  prevBtn.setAttribute("aria-label", "Phim nổi bật trước");
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "hero-SubNav-arrow hero-arrow-next";
  nextBtn.tabIndex = -1;
  nextBtn.setAttribute("aria-label", "Phim nổi bật tiếp theo");
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

  const indicatorsWrap = document.createElement("div");
  indicatorsWrap.className = "hero-indicators";
  indicatorsWrap.setAttribute("role", "tablist");
  indicatorsWrap.setAttribute("aria-label", "Chỉ mục phim nổi bật");

  prevBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    userInteracting = true;
    prevSlide();
    resetAutoSlide();
  });

  nextBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    userInteracting = true;
    nextSlide();
    resetAutoSlide();
  });

  controlsWrap.appendChild(prevBtn);
  controlsWrap.appendChild(indicatorsWrap);
  controlsWrap.appendChild(nextBtn);

  container.appendChild(slidesWrap);
  container.appendChild(controlsWrap);

  container.addEventListener("mouseenter", function () {
    userInteracting = true;
    stopAutoSlide();
  });
  container.addEventListener("mouseleave", function () {
    userInteracting = false;
    startAutoSlide();
  });
  container.addEventListener("focusin", function () {
    userInteracting = true;
    stopAutoSlide();
  });
  container.addEventListener("focusout", function (e) {
    if (!container.contains(e.relatedTarget)) {
      userInteracting = false;
      startAutoSlide();
    }
  });

  function getSlideElements() {
    return Array.from(slidesWrap.querySelectorAll(".hero-slide"));
  }

  function getIndicatorElements() {
    return Array.from(indicatorsWrap.querySelectorAll(".hero-dot"));
  }

  function loadSlideImage(slide) {
    if (!slide) {
      return;
    }
    const img = slide.querySelector(".hero-backdrop-img");
    if (img && !img.getAttribute("src") && img.dataset.src) {
      img.src = img.dataset.src;
    }
  }

  function updateActiveSlideUI() {
    const slides = getSlideElements();
    const dots = getIndicatorElements();

    // Only fetch the visible slide and the next one; avoids downloading every large backdrop at once.
    loadSlideImage(slides[currentIndex]);
    loadSlideImage(slides[(currentIndex + 1) % Math.max(1, slides.length)]);

    slides.forEach(function (slide, idx) {
      const isAct = idx === currentIndex;
      slide.classList.toggle("is-active", isAct);
      slide.setAttribute("aria-hidden", isAct ? "false" : "true");
      const buttons = slide.querySelectorAll("button");
      buttons.forEach(function (btn) {
        btn.tabIndex = isAct ? 0 : -1;
      });
    });

    dots.forEach(function (dot, idx) {
      const isAct = idx === currentIndex;
      dot.classList.toggle("is-active", isAct);
      dot.setAttribute("aria-selected", isAct ? "true" : "false");
    });
  }

  function goToSlide(index) {
    if (!movies.length) {
      return;
    }
    currentIndex = (index + movies.length) % movies.length;
    updateActiveSlideUI();
  }

  function nextSlide() {
    goToSlide(currentIndex + 1);
  }

  function prevSlide() {
    goToSlide(currentIndex - 1);
  }

  function startAutoSlide() {
    stopAutoSlide();
    if (movies.length <= 1 || destroyed || container.hidden || userInteracting) {
      return;
    }
    autoTimer = window.setTimeout(function () {
      nextSlide();
      startAutoSlide();
    }, 7000);
  }

  function stopAutoSlide() {
    if (autoTimer) {
      window.clearTimeout(autoTimer);
      autoTimer = 0;
    }
  }

  function resetAutoSlide() {
    stopAutoSlide();
    if (!userInteracting) {
      startAutoSlide();
    }
  }

  function formatHeroMetadata(movie) {
    const parts = [];
    parts.push(movie.year || "2026");
    if (movie.lang) {
      const cleanLang = String(movie.lang).includes("+")
        ? movie.lang
        : (String(movie.lang).toLowerCase().includes("vietsub") && !String(movie.lang).toLowerCase().includes("thuyết")
            ? movie.lang + " + Thuyết Minh"
            : movie.lang);
      parts.push(cleanLang);
    } else {
      parts.push("Vietsub + Thuyết Minh");
    }
    if (movie.episodeCurrent) {
      parts.push(movie.episodeCurrent);
    } else if (movie.time) {
      parts.push(movie.time);
    } else {
      parts.push("Tập mới");
    }
    if (movie.time && movie.episodeCurrent && !String(movie.episodeCurrent).includes(movie.time)) {
      parts.push(movie.time);
    }
    return parts;
  }

  function getDefaultDescription(movie) {
    if (movie.content) {
      const cleaned = stripHtmlTags(movie.content);
      if (cleaned.length > 20) {
        return cleaned;
      }
    }
    const cached = movie.slug ? detailCache.get(movie.slug) : null;
    if (cached && cached.desc) {
      return cached.desc;
    }
    const origin = movie.originTitle ? (" (" + movie.originTitle + ")") : "";
    return "Một câu chuyện vượt thời gian đầy kịch tính và cảm xúc" + origin + ". Giữa những biến động của số phận, liệu họ có thể vượt qua thử thách để ở bên nhau?";
  }

  function syncFavoriteButtonsForSlide(slide, isNowFav) {
    const mylistBtn = slide.querySelector(".hero-btn-mylist");
    const favBtn = slide.querySelector(".hero-btn-fav");
    if (mylistBtn) {
      mylistBtn.classList.toggle("is-favorite", isNowFav);
      mylistBtn.setAttribute("aria-pressed", isNowFav ? "true" : "false");
      const labelEl = mylistBtn.querySelector(".hero-mylist-label");
      const iconEl = mylistBtn.querySelector(".hero-mylist-icon");
      if (labelEl) {
        labelEl.textContent = isNowFav ? "Đã trong danh sách" : "Thêm vào danh sách";
      }
      if (iconEl) {
        iconEl.innerHTML = isNowFav
          ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      }
    }
    if (favBtn) {
      favBtn.classList.toggle("is-favorite", isNowFav);
      favBtn.setAttribute("aria-label", isNowFav ? "Bỏ yêu thích" : "Thêm yêu thích");
      const icon = favBtn.querySelector(".hero-fav-icon");
      if (icon) {
        icon.innerHTML = isNowFav
          ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
          : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
      }
    }
  }

  function buildSlide(movie, rank) {
    const slide = document.createElement("article");
    slide.className = "hero-slide";
    slide.dataset.index = String(rank - 1);
    slide.dataset.slug = movie.slug || movie.id || "";

    const bgImage = movie.thumb || movie.poster || fallbackPoster;
    const posterImage = movie.poster || movie.thumb || fallbackPoster;
    const favActive = isFavorite(movie.slug || movie.id);
    const qualityText = (movie.quality && String(movie.quality).trim()) ? movie.quality : "FHD";
    const metaParts = formatHeroMetadata(movie);
    const metaHtml = metaParts.map(function (part, idx) {
      return '<span class="hero-meta-item">' + part + '</span>' +
        (idx < metaParts.length - 1 ? '<span class="hero-meta-dot" aria-hidden="true">•</span>' : '');
    }).join("");

    const desc = getDefaultDescription(movie);

    slide.innerHTML = "" +
      '<div class="hero-backdrop">' +
        '<img class="hero-backdrop-img" data-src="' + bgImage + '" data-poster="' + posterImage + '" alt="" aria-hidden="true" decoding="async">' +
        '<div class="hero-gradient-top"></div>' +
        '<div class="hero-gradient-left"></div>' +
        '<div class="hero-gradient-bottom"></div>' +
      '</div>' +
      '<div class="hero-content">' +
        '<div class="hero-badge-row">' +
          '<span class="movie-badge badge-quality hero-quality-badge">' + qualityText + '</span>' +
        '</div>' +
        '<h2 class="hero-title">' + (movie.title || "Ngọc Điểm Thú") + '</h2>' +
        '<div class="hero-meta-row" aria-label="Thông tin phim">' + metaHtml + '</div>' +
        '<p class="hero-desc hero-overview">' + desc + '</p>' +
        '<div class="hero-actions">' +
          '<button type="button" class="home-action primary-home-action hero-btn hero-action-btn hero-btn-play">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
            '<span>Xem ngay</span>' +
          '</button>' +
          '<button type="button" class="home-action secondary-home-action hero-btn hero-action-btn hero-btn-detail hero-btn-mylist' + (favActive ? ' is-favorite' : '') + '" aria-pressed="' + (favActive ? 'true' : 'false') + '" aria-label="Thêm vào danh sách">' +
            '<span class="hero-mylist-icon" aria-hidden="true">' +
              (favActive
                ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
                : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>') +
            '</span>' +
            '<span class="hero-mylist-label">' + (favActive ? 'Đã trong danh sách' : 'Thêm vào danh sách') + '</span>' +
            '<span class="hero-mobile-action-caption">Thêm vào</span>' +
          '</button>' +
          '<button type="button" class="hero-btn-fav' + (favActive ? ' is-favorite' : '') + '" aria-label="' + (favActive ? 'Bỏ yêu thích' : 'Thêm yêu thích') + '">' +
            '<span class="hero-fav-icon" aria-hidden="true">' +
              (favActive
                ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>') +
            '</span>' +
            '<span class="hero-mobile-action-caption">Yêu thích</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    const backdropImg = slide.querySelector(".hero-backdrop-img");
    if (backdropImg) {
      let triedPoster = false;
      backdropImg.addEventListener("error", function () {
        if (!triedPoster && posterImage && posterImage !== bgImage) {
          triedPoster = true;
          backdropImg.src = posterImage;
        } else {
          backdropImg.src = fallbackPoster;
        }
      });
    }

    // Bind Play Button
    const playBtn = slide.querySelector(".hero-btn-play");
    playBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof actionsHandler.onPlayMovie === "function") {
        actionsHandler.onPlayMovie(movie);
      }
    });

    // Bind Add to List Button
    const mylistBtn = slide.querySelector(".hero-btn-mylist");
    mylistBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      const isNowFav = toggleFavorite(movie);
      syncFavoriteButtonsForSlide(slide, isNowFav);
      if (typeof actionsHandler.onFavoriteToggle === "function") {
        actionsHandler.onFavoriteToggle(movie, isNowFav);
      }
    });

    // Bind Favorite Heart Button
    const favBtn = slide.querySelector(".hero-btn-fav");
    favBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      const isNowFav = toggleFavorite(movie);
      syncFavoriteButtonsForSlide(slide, isNowFav);
      if (typeof actionsHandler.onFavoriteToggle === "function") {
        actionsHandler.onFavoriteToggle(movie, isNowFav);
      }
    });

    // Clicking title or description opens movie detail
    const titleEl = slide.querySelector(".hero-title");
    if (titleEl) {
      titleEl.style.cursor = "pointer";
      titleEl.addEventListener("click", function () {
        if (typeof actionsHandler.onOpenDetail === "function") {
          actionsHandler.onOpenDetail(movie);
        }
      });
    }

    return slide;
  }

  function enrichSlideDescriptions(kkphimApi) {
    if (!kkphimApi || typeof kkphimApi.getMovieDetail !== "function") {
      return;
    }
    movies.slice(0, 3).forEach(function (movie) {
      if (!movie || !movie.slug || detailCache.has(movie.slug)) {
        return;
      }
      kkphimApi.getMovieDetail(movie.slug).then(function (res) {
        if (destroyed || !res || !res.movie) {
          return;
        }
        const cleaned = stripHtmlTags(res.movie.content);
        if (cleaned && cleaned.length > 20) {
          detailCache.set(movie.slug, { desc: cleaned });
          const slide = slidesWrap.querySelector('.hero-slide[data-slug="' + movie.slug + '"]');
          if (slide) {
            const descEl = slide.querySelector(".hero-desc");
            if (descEl) {
              descEl.textContent = cleaned;
            }
          }
        }
      }).catch(function () {});
    });
  }

  function setMovies(newMovies, kkphimApi) {
    if (!newMovies || !newMovies.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    movies = newMovies.slice(0, 5);
    currentIndex = 0;

    while (slidesWrap.firstChild) {
      slidesWrap.removeChild(slidesWrap.firstChild);
    }
    while (indicatorsWrap.firstChild) {
      indicatorsWrap.removeChild(indicatorsWrap.firstChild);
    }

    movies.forEach(function (movie, idx) {
      const slide = buildSlide(movie, idx + 1);
      slidesWrap.appendChild(slide);

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hero-dot" + (idx === 0 ? " is-active" : "");
      dot.tabIndex = -1;
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", "Chuyển đến phim " + (idx + 1));
      dot.addEventListener("click", function (e) {
        e.stopPropagation();
        userInteracting = true;
        goToSlide(idx);
        resetAutoSlide();
      });
      indicatorsWrap.appendChild(dot);
    });

    updateActiveSlideUI();
    startAutoSlide();
    enrichSlideDescriptions(kkphimApi);
  }

  function refreshFavoriteStates() {
    const slides = getSlideElements();
    slides.forEach(function (slide, idx) {
      const movie = movies[idx];
      if (!movie) {
        return;
      }
      const isFav = isFavorite(movie.slug || movie.id);
      syncFavoriteButtonsForSlide(slide, isFav);
    });
  }

  function getFocusableElements() {
    const slides = getSlideElements();
    const activeSlide = slides[currentIndex];
    if (!activeSlide) {
      return [];
    }
    return Array.from(activeSlide.querySelectorAll("button:not([disabled])"));
  }

  function destroy() {
    destroyed = true;
    stopAutoSlide();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }

  return {
    element: container,
    setMovies: setMovies,
    nextSlide: nextSlide,
    prevSlide: prevSlide,
    goToSlide: goToSlide,
    refreshFavoriteStates: refreshFavoriteStates,
    getFocusableElements: getFocusableElements,
    startAutoSlide: startAutoSlide,
    stopAutoSlide: stopAutoSlide,
    destroy: destroy
  };
}

return {createHeroCarousel: createHeroCarousel};
});
registerModule("js/home/movie-carousel.js", function (requireModule) {
var fallbackPoster = requireModule("js/config/catalog-sources.js")["fallbackPoster"];
var isFavorite = requireModule("js/services/favorites-service.js")["isFavorite"];
var toggleFavorite = requireModule("js/services/favorites-service.js")["toggleFavorite"];
var lazyLoadImage = requireModule("js/utils/lazy-image.js")["lazyLoadImage"];
var formatTime = requireModule("js/utils/format-time.js")["formatTime"];
const GENRE_CATEGORIES = [
  {
    slug: "hanh-dong",
    name: "Hành động",
    subtitle: "Kịch tính & mãn nhãn",
    accent: "#E50920",
    iconSvg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
  },
  {
    slug: "tinh-cam",
    name: "Tình cảm",
    subtitle: "Lãng mạn & sâu lắng",
    accent: "#EC4899",
    iconSvg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
  },
  {
    slug: "co-trang",
    name: "Cổ trang",
    subtitle: "Kiếm hiệp & tiên hiệp",
    accent: "#F59E0B",
    iconSvg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></svg>'
  },
  {
    slug: "hai-huoc",
    name: "Hài hước",
    subtitle: "Giải trí sảng khoái",
    accent: "#10B981",
    iconSvg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
  },
  {
    slug: "kinh-di",
    name: "Kinh dị",
    subtitle: "Bí ẩn & rùng rợn",
    accent: "#8B5CF6",
    iconSvg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>'
  },
  {
    slug: "vien-tuong",
    name: "Khoa học viễn tưởng",
    subtitle: "Thế giới tương lai",
    accent: "#06B6D4",
    iconSvg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>'
  }
];

function createCarouselMovieCard(movie, options) {
  const isTop10 = Boolean(options && options.isTop10);
  const rank = (options && typeof options.rank === "number") ? options.rank : 0;

  const card = document.createElement("article");
  card.className = "carousel-movie-card" + (isTop10 ? " is-top10-card" : "");
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", (isTop10 ? ("Top " + rank + ": ") : "") + (movie.title || "Phim"));
  card.dataset.slug = movie.slug || movie.id || "";

  const posterWrap = document.createElement("div");
  posterWrap.className = "carousel-poster-wrap";

  const img = document.createElement("img");
  img.className = "carousel-poster-img";
  img.alt = "";
  img.decoding = "async";
  img.width = 220;
  img.height = 330;
  const posterUrl = (!movie.poster || movie.poster === fallbackPoster) ? (movie.thumb || fallbackPoster) : movie.poster;
  let triedThumb = false;
  let usedFallback = posterUrl === fallbackPoster;
  img.addEventListener("error", function onErr() {
    if (!triedThumb && movie.thumb && movie.thumb !== posterUrl) {
      triedThumb = true;
      img.src = movie.thumb;
      return;
    }
    if (usedFallback) {
      img.removeEventListener("error", onErr);
      return;
    }
    usedFallback = true;
    img.classList.add("is-fallback");
    img.src = fallbackPoster;
  });

  if (rank > 0 && rank <= 8) {
    img.loading = "lazy";
    img.src = posterUrl;
  } else {
    lazyLoadImage(img, posterUrl);
  }

  const shade = document.createElement("div");
  shade.className = "carousel-poster-shade";
  shade.setAttribute("aria-hidden", "true");

  // Top-left Quality Badge (FHD / 4K)
  const badgesWrap = document.createElement("div");
  badgesWrap.className = "carousel-card-badges";
  const qBadge = document.createElement("span");
  qBadge.className = "carousel-badge carousel-badge-quality";
  qBadge.textContent = (movie.quality && String(movie.quality).trim()) ? movie.quality : "FHD";
  badgesWrap.appendChild(qBadge);

  // Top-right Favorite Button
  const favBtn = document.createElement("button");
  favBtn.type = "button";
  const initialFav = isFavorite(movie.slug || movie.id);
  favBtn.className = "carousel-card-fav" + (initialFav ? " is-favorite" : "");
  favBtn.tabIndex = -1;
  favBtn.setAttribute("aria-label", initialFav ? "Bỏ yêu thích" : "Thêm yêu thích");
  favBtn.innerHTML = '<span class="card-fav-icon">' + (initialFav ? "♥" : "♡") + '</span>';
  favBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    const isNowFav = toggleFavorite(movie);
    favBtn.classList.toggle("is-favorite", isNowFav);
    favBtn.setAttribute("aria-label", isNowFav ? "Bỏ yêu thích" : "Thêm yêu thích");
    const icon = favBtn.querySelector(".card-fav-icon");
    if (icon) {
      icon.textContent = isNowFav ? "♥" : "♡";
    }
    if (options && typeof options.onFavoriteToggle === "function") {
      options.onFavoriteToggle(movie, isNowFav);
    }
  });

  // Bottom overlay info (Title + Episode / Year)
  const overlayInfo = document.createElement("div");
  overlayInfo.className = "carousel-card-overlay-info";

  if (isTop10 && rank > 0) {
    const rankEl = document.createElement("span");
    rankEl.className = "top10-rank-number";
    rankEl.textContent = String(rank);
    rankEl.setAttribute("aria-hidden", "true");
    overlayInfo.appendChild(rankEl);
  }

  const textGroup = document.createElement("div");
  textGroup.className = "carousel-card-text-group";

  const titleEl = document.createElement("h3");
  titleEl.className = "carousel-card-title";
  titleEl.textContent = movie.title || "Phim";

  const metaEl = document.createElement("p");
  metaEl.className = "carousel-card-meta";
  if (movie.mlMatchPercent) {
    const tail = movie.episodeCurrent || movie.year || movie.lang || "Đề xuất";
    metaEl.textContent = movie.mlMatchPercent + "% phù hợp • " + tail;
  } else if (movie.episodeCurrent) {
    metaEl.textContent = movie.episodeCurrent + (movie.year ? (" • " + movie.year) : "");
  } else if (movie.year) {
    metaEl.textContent = movie.year + (movie.lang ? (" • " + movie.lang) : "");
  } else {
    metaEl.textContent = movie.lang || "Vietsub";
  }

  textGroup.appendChild(titleEl);
  textGroup.appendChild(metaEl);
  overlayInfo.appendChild(textGroup);

  posterWrap.appendChild(img);
  posterWrap.appendChild(shade);
  posterWrap.appendChild(badgesWrap);
  posterWrap.appendChild(favBtn);
  posterWrap.appendChild(overlayInfo);

  card.appendChild(posterWrap);

  card.addEventListener("click", function (e) {
    if (e.target === favBtn || favBtn.contains(e.target)) {
      return;
    }
    if (options && typeof options.onCardClick === "function") {
      options.onCardClick(movie);
    }
  });

  return {
    element: card,
    favButton: favBtn,
    movie: movie
  };
}

function createMovieCarouselSection(config, callbacks) {
  const section = document.createElement("section");
  section.className = "home-carousel-section" + (config.isTop10 ? " is-top10-section" : "");
  section.dataset.sectionId = config.id || "";
  section.setAttribute("aria-label", config.title || "Danh sách phim");

  const header = document.createElement("div");
  header.className = "carousel-section-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "carousel-title-wrap";

  const titleEl = document.createElement("h2");
  titleEl.className = "carousel-section-title";
  titleEl.innerHTML = '<span>' + (config.title || "Phim") + '</span><span class="carousel-title-chevron" aria-hidden="true">›</span>';
  titleWrap.appendChild(titleEl);

  const viewAllBtn = document.createElement("button");
  viewAllBtn.type = "button";
  viewAllBtn.className = "carousel-view-all-btn";
  viewAllBtn.tabIndex = -1;
  viewAllBtn.innerHTML = '<span>Xem tất cả</span><span aria-hidden="true">›</span>';
  viewAllBtn.addEventListener("click", function () {
    if (callbacks && typeof callbacks.onViewAll === "function") {
      callbacks.onViewAll(config);
    }
  });
  titleEl.addEventListener("click", function () {
    if (callbacks && typeof callbacks.onViewAll === "function") {
      callbacks.onViewAll(config);
    }
  });

  header.appendChild(titleWrap);
  header.appendChild(viewAllBtn);

  const body = document.createElement("div");
  body.className = "carousel-body";

  const prevArrow = document.createElement("button");
  prevArrow.type = "button";
  prevArrow.className = "carousel-nav-arrow carousel-arrow-prev";
  prevArrow.tabIndex = -1;
  prevArrow.setAttribute("aria-label", "Cuộn sang trái");
  prevArrow.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';

  const nextArrow = document.createElement("button");
  nextArrow.type = "button";
  nextArrow.className = "carousel-nav-arrow carousel-arrow-next";
  nextArrow.tabIndex = -1;
  nextArrow.setAttribute("aria-label", "Cuộn sang phải");
  nextArrow.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

  const track = document.createElement("div");
  track.className = "carousel-track";
  track.setAttribute("role", "list");

  prevArrow.addEventListener("click", function () {
    const scrollAmount = Math.max(320, Math.round(track.clientWidth * 0.78));
    track.scrollBy({ left: -scrollAmount, behavior: "smooth" });
  });

  nextArrow.addEventListener("click", function () {
    const scrollAmount = Math.max(320, Math.round(track.clientWidth * 0.78));
    track.scrollBy({ left: scrollAmount, behavior: "smooth" });
  });

  body.appendChild(prevArrow);
  body.appendChild(track);
  body.appendChild(nextArrow);

  section.appendChild(header);
  section.appendChild(body);

  let cardEntries = [];

  function renderSkeleton(count) {
    while (track.firstChild) {
      track.removeChild(track.firstChild);
    }
    cardEntries = [];
    const num = count || 6;
    for (let i = 0; i < num; i += 1) {
      const skel = document.createElement("div");
      skel.className = "carousel-movie-card is-skeleton";
      skel.setAttribute("aria-hidden", "true");
      skel.innerHTML = '<div class="carousel-poster-wrap"><div class="skeleton-shimmer"></div></div>';
      track.appendChild(skel);
    }
  }

  function setMovies(movies) {
    while (track.firstChild) {
      track.removeChild(track.firstChild);
    }
    cardEntries = [];

    if (!movies || !movies.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const limit = config.isTop10 ? 10 : (config.maxItems || 14);
    const list = movies.slice(0, limit);

    list.forEach(function (movie, idx) {
      const entry = createCarouselMovieCard(movie, {
        isTop10: Boolean(config.isTop10),
        rank: idx + 1,
        onCardClick: function (m) {
          if (callbacks && typeof callbacks.onSelectMovie === "function") {
            callbacks.onSelectMovie(m);
          }
        },
        onFavoriteToggle: function (m, isFav) {
          if (callbacks && typeof callbacks.onFavoriteToggle === "function") {
            callbacks.onFavoriteToggle(m, isFav);
          }
        }
      });
      entry.element.dataset.carouselIndex = String(idx);
      track.appendChild(entry.element);
      cardEntries.push(entry);
    });
  }

  function updateFavoriteStates() {
    cardEntries.forEach(function (entry) {
      if (!entry.favButton || !entry.movie) {
        return;
      }
      const isFav = isFavorite(entry.movie.slug || entry.movie.id);
      entry.favButton.classList.toggle("is-favorite", isFav);
      entry.favButton.setAttribute("aria-label", isFav ? "Bỏ yêu thích" : "Thêm yêu thích");
      const icon = entry.favButton.querySelector(".card-fav-icon");
      if (icon) {
        icon.textContent = isFav ? "♥" : "♡";
      }
    });
  }

  function getFocusableCards() {
    return cardEntries.map(function (c) { return c.element; }).filter(Boolean);
  }

  renderSkeleton(6);

  return {
    id: config.id,
    element: section,
    track: track,
    setMovies: setMovies,
    renderSkeleton: renderSkeleton,
    updateFavoriteStates: updateFavoriteStates,
    getFocusableCards: getFocusableCards
  };
}

function createContinueWatchingSection(callbacks) {
  const section = document.createElement("section");
  section.className = "home-carousel-section continue-watching-section";
  section.dataset.sectionId = "continue-watching";
  section.setAttribute("aria-label", "Tiếp tục xem");
  section.hidden = true;

  const header = document.createElement("div");
  header.className = "carousel-section-header";

  const titleEl = document.createElement("h2");
  titleEl.className = "carousel-section-title";
  titleEl.innerHTML = '<span>Tiếp tục xem</span><span class="carousel-title-chevron" aria-hidden="true">›</span>';
  header.appendChild(titleEl);

  const track = document.createElement("div");
  track.className = "carousel-track continue-watching-track";
  track.setAttribute("role", "list");

  section.appendChild(header);
  section.appendChild(track);

  let cardElements = [];

  function setItems(historyItems) {
    while (track.firstChild) {
      track.removeChild(track.firstChild);
    }
    cardElements = [];

    if (!historyItems || !historyItems.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    historyItems.slice(0, 10).forEach(function (item) {
      const card = document.createElement("article");
      card.className = "continue-watching-card";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Tiếp tục xem " + (item.title || "Phim") + " " + (item.episodeName || ""));

      const thumbUrl = item.thumb || item.poster || fallbackPoster;
      const isInitialFallback = thumbUrl === fallbackPoster;
      const rawProgress = (item.progress !== undefined && item.progress !== null)
        ? Number(item.progress)
        : Number(item.progressPercent);
      const progressPct = Math.max(5, Math.min(98, rawProgress || 25));
      const timeLabel = (typeof item.currentTime === "number" && item.currentTime > 5)
        ? ("Xem tiếp " + formatTime(item.currentTime) + " • " + (item.remainingText || "Đang xem"))
        : (item.remainingText || "Đang xem");

      card.innerHTML = "" +
        '<div class="continue-thumb-wrap">' +
          '<img class="continue-thumb-img' + (isInitialFallback ? ' is-fallback' : '') + '" src="' + thumbUrl + '" alt="" loading="lazy" decoding="async">' +
          '<div class="continue-thumb-shade"></div>' +
          '<div class="continue-play-badge" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
          '</div>' +
          '<span class="continue-ep-badge">' + (item.episodeName || "Tập 1") + '</span>' +
          '<button type="button" class="continue-remove-btn" tabindex="-1" aria-label="Xóa khỏi lịch sử xem">×</button>' +
          '<div class="continue-progress-track" aria-hidden="true">' +
            '<div class="continue-progress-fill" style="width:' + progressPct + '%"></div>' +
          '</div>' +
        '</div>' +
        '<div class="continue-card-info">' +
          '<h3 class="continue-card-title">' + (item.title || "Phim") + '</h3>' +
          '<p class="continue-card-meta">' + timeLabel + '</p>' +
        '</div>';

      const img = card.querySelector(".continue-thumb-img");
      if (img) {
        let triedPoster = false;
        img.addEventListener("error", function () {
          if (!triedPoster && item.poster && item.poster !== thumbUrl && item.poster !== fallbackPoster) {
            triedPoster = true;
            img.src = item.poster;
            return;
          }
          img.classList.add("is-fallback");
          img.src = fallbackPoster;
        });
      }

      const removeBtn = card.querySelector(".continue-remove-btn");
      if (removeBtn) {
        removeBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (callbacks && typeof callbacks.onRemoveItem === "function") {
            callbacks.onRemoveItem(item);
          }
        });
      }

      card.addEventListener("click", function (e) {
        if (removeBtn && (e.target === removeBtn || removeBtn.contains(e.target))) {
          return;
        }
        if (callbacks && typeof callbacks.onResumeItem === "function") {
          callbacks.onResumeItem(item);
        }
      });

      track.appendChild(card);
      cardElements.push(card);
    });
  }

  function getFocusableCards() {
    return section.hidden ? [] : cardElements;
  }

  return {
    id: "continue-watching",
    element: section,
    setItems: setItems,
    getFocusableCards: getFocusableCards
  };
}

function createGenreSection(callbacks) {
  const section = document.createElement("section");
  section.className = "home-carousel-section genre-browsing-section";
  section.dataset.sectionId = "genres";
  section.setAttribute("aria-label", "Thể loại phim");

  const header = document.createElement("div");
  header.className = "carousel-section-header";

  const titleEl = document.createElement("h2");
  titleEl.className = "carousel-section-title";
  titleEl.innerHTML = '<span>Thể loại</span><span class="carousel-title-chevron" aria-hidden="true">›</span>';
  header.appendChild(titleEl);

  const grid = document.createElement("div");
  grid.className = "genre-cards-track";
  grid.setAttribute("role", "list");

  const genreCards = [];
  const bgImages = [];

  GENRE_CATEGORIES.forEach(function (genre) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "genre-card";
    card.dataset.genreSlug = genre.slug;
    card.style.setProperty("--genre-accent", genre.accent);
    card.setAttribute("aria-label", "Thể loại " + genre.name);

    card.innerHTML = "" +
      '<div class="genre-card-bg">' +
        '<img class="genre-card-bg-img" src="' + fallbackPoster + '" alt="" loading="lazy" decoding="async">' +
        '<div class="genre-card-overlay"></div>' +
      '</div>' +
      '<div class="genre-card-content">' +
        '<span class="genre-card-icon" aria-hidden="true">' + genre.iconSvg + '</span>' +
        '<div class="genre-card-text">' +
          '<span class="genre-card-name">' + genre.name + '</span>' +
          '<span class="genre-card-sub">' + genre.subtitle + '</span>' +
        '</div>' +
      '</div>';

    const bgImg = card.querySelector(".genre-card-bg-img");
    bgImages.push(bgImg);

    card.addEventListener("click", function () {
      if (callbacks && typeof callbacks.onSelectGenre === "function") {
        callbacks.onSelectGenre(genre);
      }
    });

    grid.appendChild(card);
    genreCards.push(card);
  });

  section.appendChild(header);
  section.appendChild(grid);

  function updateBackdropsFromMovies(movies) {
    if (!movies || !movies.length) {
      return;
    }
    bgImages.forEach(function (img, idx) {
      if (!img) {
        return;
      }
      const m = movies[(idx * 2) % movies.length];
      if (m && (m.thumb || m.poster)) {
        img.src = m.thumb || m.poster;
      }
    });
  }

  function getFocusableCards() {
    return genreCards;
  }

  return {
    id: "genres",
    element: section,
    updateBackdropsFromMovies: updateBackdropsFromMovies,
    getFocusableCards: getFocusableCards
  };
}

return {GENRE_CATEGORIES: GENRE_CATEGORIES, createCarouselMovieCard: createCarouselMovieCard, createMovieCarouselSection: createMovieCarouselSection, createContinueWatchingSection: createContinueWatchingSection, createGenreSection: createGenreSection};
});
registerModule("js/utils/lazy-image.js", function (requireModule) {
const PLACEHOLDER_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
let observer = null;

function getObserver() {
  if (observer || typeof IntersectionObserver === "undefined") {
    return observer;
  }
  observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) {
        return;
      }
      const img = entry.target;
      observer.unobserve(img);
      const url = img.dataset.lazySrc;
      if (url) {
        delete img.dataset.lazySrc;
        img.src = url;
      }
    });
  }, { rootMargin: "320px 260px 320px 260px" });
  return observer;
}

// Defers loading of an image until it is near the viewport. Works inside
// horizontally scrolling carousels (unlike native loading="lazy" in some WebViews).
function lazyLoadImage(img, url) {
  if (!img || !url) {
    return;
  }
  const obs = getObserver();
  if (!obs) {
    img.src = url;
    return;
  }
  if (!img.getAttribute("src")) {
    img.src = PLACEHOLDER_SRC;
  }
  img.dataset.lazySrc = url;
  obs.observe(img);
}

function cancelLazyImage(img) {
  if (!img) {
    return;
  }
  delete img.dataset.lazySrc;
  if (observer) {
    observer.unobserve(img);
  }
}

return {lazyLoadImage: lazyLoadImage, cancelLazyImage: cancelLazyImage};
});
registerModule("js/home/tv-search-keyboard.js", function (requireModule) {
const KEY_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"]
];

const QUICK_TAGS = [
  "Tiên hiệp",
  "Cổ trang",
  "Hành động",
  "Hoạt hình",
  "Hàn Quốc",
  "Tổng tài"
];

function createTvSearchKeyboard(container, callbacks) {
  const panel = document.createElement("aside");
  panel.className = "tv-keyboard-panel";
  panel.setAttribute("aria-label", "Bàn phím tìm kiếm TV");
  panel.hidden = true;

  let currentValue = "";
  let isOpenState = false;
  let activeSection = "grid"; // "actions" | "grid" | "tags" | "footer"
  let actionCol = 0; // 0: space, 1: backspace, 2: clear
  let gridRow = 1; // Default to Q row
  let gridCol = 0;
  let tagIndex = 0;

  // Header with live query preview
  const header = document.createElement("div");
  header.className = "tv-kb-header";

  const headerTop = document.createElement("div");
  headerTop.className = "tv-kb-header-top";

  const badge = document.createElement("span");
  badge.className = "tv-kb-badge";
  badge.textContent = "BÀN PHÍM TV (QWERTY)";

  const hint = document.createElement("span");
  hint.className = "tv-kb-hint";
  hint.textContent = "← Chọn phim · Back để đóng";

  headerTop.appendChild(badge);
  headerTop.appendChild(hint);

  const previewBox = document.createElement("div");
  previewBox.className = "tv-kb-preview";

  const previewIcon = document.createElement("span");
  previewIcon.className = "tv-kb-preview-icon";
  previewIcon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';

  const previewContent = document.createElement("div");
  previewContent.className = "tv-kb-preview-content";

  const previewText = document.createElement("span");
  previewText.className = "tv-kb-preview-text";

  const cursor = document.createElement("span");
  cursor.className = "tv-kb-cursor";
  cursor.setAttribute("aria-hidden", "true");

  const previewPlaceholder = document.createElement("span");
  previewPlaceholder.className = "tv-kb-preview-placeholder";
  previewPlaceholder.textContent = "Nhập tên phim, diễn viên...";

  previewContent.appendChild(previewText);
  previewContent.appendChild(cursor);
  previewContent.appendChild(previewPlaceholder);

  previewBox.appendChild(previewIcon);
  previewBox.appendChild(previewContent);

  header.appendChild(headerTop);
  header.appendChild(previewBox);

  // Top utility actions: Space, Backspace, Clear
  const actionsRow = document.createElement("div");
  actionsRow.className = "tv-kb-actions";

  const spaceBtn = document.createElement("button");
  spaceBtn.type = "button";
  spaceBtn.className = "tv-kb-key tv-kb-action-key";
  spaceBtn.innerHTML = '<span class="tv-kb-action-icon">␣</span><span>Dấu cách</span>';
  spaceBtn.setAttribute("aria-label", "Dấu cách");

  const backspaceBtn = document.createElement("button");
  backspaceBtn.type = "button";
  backspaceBtn.className = "tv-kb-key tv-kb-action-key";
  backspaceBtn.innerHTML = '<span class="tv-kb-action-icon">⌫</span><span>Xóa</span>';
  backspaceBtn.setAttribute("aria-label", "Xóa ký tự");

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "tv-kb-key tv-kb-action-key";
  clearBtn.innerHTML = '<span class="tv-kb-action-icon">✕</span><span>Xóa hết</span>';
  clearBtn.setAttribute("aria-label", "Xóa toàn bộ");

  const actionButtons = [spaceBtn, backspaceBtn, clearBtn];
  actionButtons.forEach(function (btn, idx) {
    btn.addEventListener("focus", function () {
      activeSection = "actions";
      actionCol = idx;
    });
    actionsRow.appendChild(btn);
  });

  spaceBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    appendChar(" ");
  });

  backspaceBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    backspace();
  });

  clearBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    clearAll();
  });

  // Main QWERTY character rows
  const keysGrid = document.createElement("div");
  keysGrid.className = "tv-kb-qwerty";
  const gridButtons = [];

  KEY_ROWS.forEach(function (rowChars, rIdx) {
    const rowEl = document.createElement("div");
    rowEl.className = "tv-kb-row";
    const rowArr = [];
    rowChars.forEach(function (ch, cIdx) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tv-kb-key tv-kb-char-key";
      btn.textContent = ch.toUpperCase();
      btn.dataset.char = ch;
      btn.dataset.row = String(rIdx);
      btn.dataset.col = String(cIdx);
      btn.addEventListener("focus", function () {
        activeSection = "grid";
        gridRow = rIdx;
        gridCol = cIdx;
      });
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        appendChar(ch);
      });
      rowEl.appendChild(btn);
      rowArr.push(btn);
    });
    keysGrid.appendChild(rowEl);
    gridButtons.push(rowArr);
  });

  // Quick Suggestion Tags
  const tagsSection = document.createElement("div");
  tagsSection.className = "tv-kb-tags-section";

  const tagsLabel = document.createElement("p");
  tagsLabel.className = "tv-kb-tags-label";
  tagsLabel.textContent = "Từ khóa phổ biến";

  const tagsWrap = document.createElement("div");
  tagsWrap.className = "tv-kb-tags";
  const tagButtons = [];

  QUICK_TAGS.forEach(function (tag, idx) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tv-kb-tag";
    btn.textContent = tag;
    btn.addEventListener("focus", function () {
      activeSection = "tags";
      tagIndex = idx;
    });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setQuery(tag, true);
    });
    tagsWrap.appendChild(btn);
    tagButtons.push(btn);
  });

  tagsSection.appendChild(tagsLabel);
  tagsSection.appendChild(tagsWrap);

  // Footer Close / Done button
  const footer = document.createElement("div");
  footer.className = "tv-kb-footer";

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "tv-kb-submit-btn";
  submitBtn.textContent = "Xem kết quả phim";
  submitBtn.addEventListener("focus", function () {
    activeSection = "footer";
  });
  submitBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (callbacks && typeof callbacks.onSubmit === "function") {
      callbacks.onSubmit(currentValue);
    }
  });

  footer.appendChild(submitBtn);

  panel.appendChild(header);
  panel.appendChild(actionsRow);
  panel.appendChild(keysGrid);
  panel.appendChild(tagsSection);
  panel.appendChild(footer);
  container.appendChild(panel);

  function updatePreviewUI() {
    if (currentValue && currentValue.length > 0) {
      previewText.textContent = currentValue;
      previewText.hidden = false;
      previewPlaceholder.hidden = true;
    } else {
      previewText.textContent = "";
      previewText.hidden = true;
      previewPlaceholder.hidden = false;
    }
  }

  updatePreviewUI();

  function setQuery(val, notify) {
    currentValue = val || "";
    updatePreviewUI();
    if (notify && callbacks && typeof callbacks.onChange === "function") {
      callbacks.onChange(currentValue);
    }
  }

  function appendChar(ch) {
    if (ch === " " && (!currentValue || currentValue.endsWith(" "))) {
      return;
    }
    setQuery(currentValue + ch, true);
  }

  function backspace() {
    if (!currentValue) {
      return;
    }
    setQuery(currentValue.slice(0, -1), true);
  }

  function clearAll() {
    if (!currentValue) {
      return;
    }
    setQuery("", true);
  }

  function focusCurrentTarget() {
    if (!isOpenState) {
      return;
    }
    if (activeSection === "actions") {
      const target = actionButtons[Math.max(0, Math.min(actionButtons.length - 1, actionCol))];
      if (target) {
        target.focus({ preventScroll: true });
      }
    } else if (activeSection === "grid") {
      const r = Math.max(0, Math.min(gridButtons.length - 1, gridRow));
      const c = Math.max(0, Math.min(gridButtons[r].length - 1, gridCol));
      gridRow = r;
      gridCol = c;
      const target = gridButtons[r][c];
      if (target) {
        target.focus({ preventScroll: true });
      }
    } else if (activeSection === "tags") {
      const target = tagButtons[Math.max(0, Math.min(tagButtons.length - 1, tagIndex))];
      if (target) {
        target.focus({ preventScroll: true });
      }
    } else if (activeSection === "footer") {
      submitBtn.focus({ preventScroll: true });
    }
  }

  function open(initialValue, focusKey) {
    if (typeof initialValue === "string") {
      currentValue = initialValue;
      updatePreviewUI();
    }
    isOpenState = true;
    panel.hidden = false;
    panel.classList.add("is-open");
    container.classList.add("is-keyboard-open");
    if (focusKey) {
      activeSection = "grid";
      gridRow = 1; // Row 1: Q W E R T Y U I O P
      gridCol = 0; // 'Q'
      focusCurrentTarget();
    }
  }

  function close() {
    if (!isOpenState) {
      return;
    }
    isOpenState = false;
    panel.classList.remove("is-open");
    panel.hidden = true;
    container.classList.remove("is-keyboard-open");
    if (callbacks && typeof callbacks.onClose === "function") {
      callbacks.onClose();
    }
  }

  function onKeyDown(event, key) {
    if (!isOpenState) {
      return false;
    }

    if (key.isBack || key.isEscape) {
      close();
      return true;
    }

    if (key.isSelect) {
      const active = document.activeElement;
      if (active && panel.contains(active) && typeof active.click === "function") {
        active.click();
        return true;
      }
      focusCurrentTarget();
      return true;
    }

    const dir = key.direction;
    if (!dir) {
      if (event && event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        appendChar(event.key);
        return true;
      }
      if (event && event.key === "Backspace") {
        backspace();
        return true;
      }
      return false;
    }

    if (activeSection === "actions") {
      if (dir === "left") {
        if (actionCol > 0) {
          actionCol -= 1;
          focusCurrentTarget();
        } else if (callbacks && typeof callbacks.onMoveLeftToGrid === "function") {
          callbacks.onMoveLeftToGrid();
        }
        return true;
      }
      if (dir === "right") {
        if (actionCol < actionButtons.length - 1) {
          actionCol += 1;
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "up") {
        if (callbacks && typeof callbacks.onMoveUpToHeader === "function") {
          callbacks.onMoveUpToHeader();
        }
        return true;
      }
      if (dir === "down") {
        activeSection = "grid";
        gridRow = 0;
        gridCol = Math.min(KEY_ROWS[0].length - 1, actionCol * 3 + 1);
        focusCurrentTarget();
        return true;
      }
    } else if (activeSection === "grid") {
      const rowLen = KEY_ROWS[gridRow].length;
      if (dir === "left") {
        if (gridCol > 0) {
          gridCol -= 1;
          focusCurrentTarget();
        } else if (callbacks && typeof callbacks.onMoveLeftToGrid === "function") {
          callbacks.onMoveLeftToGrid();
        }
        return true;
      }
      if (dir === "right") {
        if (gridCol < rowLen - 1) {
          gridCol += 1;
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "up") {
        if (gridRow > 0) {
          const prevLen = KEY_ROWS[gridRow - 1].length;
          const offset = Math.floor((prevLen - rowLen) / 2);
          gridRow -= 1;
          gridCol = Math.max(0, Math.min(prevLen - 1, gridCol + offset));
          focusCurrentTarget();
        } else {
          activeSection = "actions";
          actionCol = Math.min(2, Math.floor((gridCol / rowLen) * 3));
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "down") {
        if (gridRow < KEY_ROWS.length - 1) {
          const nextLen = KEY_ROWS[gridRow + 1].length;
          const offset = Math.floor((rowLen - nextLen) / 2);
          gridRow += 1;
          gridCol = Math.max(0, Math.min(nextLen - 1, gridCol - offset));
          focusCurrentTarget();
        } else {
          activeSection = "tags";
          tagIndex = Math.min(2, Math.floor((gridCol / rowLen) * 3));
          focusCurrentTarget();
        }
        return true;
      }
    } else if (activeSection === "tags") {
      const tagCols = 3;
      const tRow = Math.floor(tagIndex / tagCols);
      const tCol = tagIndex % tagCols;

      if (dir === "left") {
        if (tCol > 0) {
          tagIndex -= 1;
          focusCurrentTarget();
        } else if (callbacks && typeof callbacks.onMoveLeftToGrid === "function") {
          callbacks.onMoveLeftToGrid();
        }
        return true;
      }
      if (dir === "right") {
        if (tCol < tagCols - 1 && tagIndex + 1 < tagButtons.length) {
          tagIndex += 1;
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "up") {
        if (tRow > 0) {
          tagIndex -= tagCols;
          focusCurrentTarget();
        } else {
          activeSection = "grid";
          gridRow = KEY_ROWS.length - 1;
          const bottomRowLen = KEY_ROWS[gridRow].length;
          gridCol = Math.min(bottomRowLen - 1, tCol * 2 + 1);
          focusCurrentTarget();
        }
        return true;
      }
      if (dir === "down") {
        if (tRow === 0 && tagIndex + tagCols < tagButtons.length) {
          tagIndex += tagCols;
          focusCurrentTarget();
        } else {
          activeSection = "footer";
          focusCurrentTarget();
        }
        return true;
      }
    } else if (activeSection === "footer") {
      if (dir === "left") {
        if (callbacks && typeof callbacks.onMoveLeftToGrid === "function") {
          callbacks.onMoveLeftToGrid();
        }
        return true;
      }
      if (dir === "up") {
        activeSection = "tags";
        tagIndex = 3;
        focusCurrentTarget();
        return true;
      }
    }

    return true;
  }

  return {
    element: panel,
    isOpen: function () {
      return isOpenState;
    },
    open,
    close,
    setValue: function (val) {
      setQuery(val, false);
    },
    focusFirstKey: function () {
      if (!isOpenState) {
        open(currentValue, true);
      } else {
        focusCurrentTarget();
      }
    },
    contains: function (el) {
      return Boolean(el && panel.contains(el));
    },
    onKeyDown,
    destroy: function () {
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}

return {createTvSearchKeyboard: createTvSearchKeyboard};
});
registerModule("js/utils/device.js", function (requireModule) {
function detectDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "desktop";
  }

  if (window.location && window.location.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const forced = (params.get("device") || "").toLowerCase().trim();
      if (forced === "tv" || forced === "mobile" || forced === "desktop") {
        return forced;
      }
    } catch (_) {}
  }

  const ua = navigator.userAgent || "";

  // 1. Smart TV detection (Samsung Tizen, LG webOS, Android TV, etc.)
  const isTV = Boolean(
    window.tizen ||
    window.webOS ||
    /SmartTV|Tizen|webOS|HbbTV|NetCast|BRAVIA|Viera|AppleTV|Roku|LargeScreen|GoogleTV|AndroidTV/i.test(ua)
  );
  if (isTV) {
    return "tv";
  }

  // 2. Mobile / Phone detection (Android, iOS, mobile user agents or touch screens under 1024px)
  const isMobile = Boolean(
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i.test(ua) ||
    (('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)) &&
      window.matchMedia && window.matchMedia("(max-width: 1024px)").matches)
  );
  if (isMobile) {
    return "mobile";
  }

  // 3. Desktop / PC
  return "desktop";
}

const currentDevice = detectDevice();

return {detectDevice: detectDevice, currentDevice: currentDevice};
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
var createMediaSessionManager = requireModule("js/player/media-session-manager.js")["createMediaSessionManager"];
var getActiveSubtitleText = requireModule("js/player/subtitle-parser.js")["getActiveSubtitleText"];
var activateFocusedElement = requireModule("js/navigation/remote-navigation.js")["activateFocusedElement"];
var focusNext = requireModule("js/navigation/remote-navigation.js")["focusNext"];
var formatTime = requireModule("js/utils/format-time.js")["formatTime"];
var currentDevice = requireModule("js/utils/device.js")["currentDevice"];
var buildEpisodeUrl = requireModule("js/utils/url.js")["buildEpisodeUrl"];
var copyTextToClipboard = requireModule("js/utils/url.js")["copyTextToClipboard"];
var saveWatchProgress = requireModule("js/services/watch-history-service.js")["saveWatchProgress"];
var getEpisodeResumeInfo = requireModule("js/services/watch-history-service.js")["getEpisodeResumeInfo"];
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
    '<div class="topbar-left">' +
    '<button class="player-back-button" type="button" aria-label="Quay lại"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
    '<button class="brand home-return-button" type="button" aria-label="Return to movie catalog"><img src="icon.png" alt="">' +
    '<span>BACU<span class="brand-accent">Flix</span></span></button></div>' +
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
  let pendingResumeTime = 0;

  function resolveResumeTimeForEpisode(epIndex) {
    if (typeof currentMovie.resumeTime === "number" && currentMovie.resumeTime > 5) {
      const explicitTime = Math.floor(currentMovie.resumeTime);
      currentMovie.resumeTime = 0;
      return explicitTime;
    }
    const slug = currentMovie.slug || currentMovie.id;
    const resumeInfo = getEpisodeResumeInfo(slug, epIndex);
    if (resumeInfo && typeof resumeInfo.currentTime === "number" && resumeInfo.currentTime > 5) {
      return resumeInfo.currentTime;
    }
    return 0;
  }

  function applyPendingResume() {
    if (disposed || !pendingResumeTime || pendingResumeTime <= 5) {
      return;
    }
    const range = playback.getRange();
    const dur = (range && range.end > range.start) ? range.end : (Number.isFinite(video.duration) ? video.duration : 0);
    if (dur <= 0 && video.readyState < 1) {
      return;
    }
    let targetTime = pendingResumeTime;
    if (dur > 30 && targetTime >= dur - 12) {
      pendingResumeTime = 0;
      return;
    }
    if (dur > 0) {
      targetTime = Math.max(0, Math.min(dur - 5, targetTime));
    }
    try {
      video.currentTime = targetTime;
      if (Math.abs(video.currentTime - targetTime) < 3 || video.seeking) {
        const resumedAt = targetTime;
        pendingResumeTime = 0;
        pendingSeekTime = resumedAt;
        ignoreTimelineUntil = Date.now() + 1200;
        updateTimeline();
        showStatus("Đã tiếp tục phát từ " + formatTime(resumedAt));
      }
    } catch (_) {}
  }

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

  let nativeFullscreen = false;

  function getNativeScreenMode() {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) {
      return null;
    }
    if (typeof cap.registerPlugin === "function") {
      try {
        return cap.registerPlugin("ScreenMode");
      } catch (_) {}
    }
    return cap.Plugins && cap.Plugins.ScreenMode ? cap.Plugins.ScreenMode : null;
  }

  function isFullscreenActive() {
    return Boolean(
      nativeFullscreen ||
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
    const nativeScreenMode = getNativeScreenMode();
    if (nativeScreenMode) {
      nativeFullscreen = !nativeFullscreen;
      updateFullscreenControl();
      const task = nativeFullscreen ? nativeScreenMode.enter() : nativeScreenMode.exit();
      if (task && typeof task.catch === "function") {
        task.catch(function (error) {
          console.warn("Native fullscreen failed:", error);
        });
      }
      return;
    }
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
    if (video && video.currentTime > 3) {
      saveWatchProgress(currentMovie, video.currentTime, video.duration);
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
    currentMovie.episodeName = ep.name;
    currentMovie.m3u8 = streamUrl;
    currentMovie.currentEpisodeIndex = index;
    pendingResumeTime = resolveResumeTimeForEpisode(index);
    saveWatchProgress(currentMovie, pendingResumeTime > 0 ? pendingResumeTime : 0, 2700);
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
    mediaSessionManager.updateMetadata(currentMovie);
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
      if (controlsVisible || stage.classList.contains("controls-visible")) {
        window.clearTimeout(controlsTimer);
        hideControls(true);
        if (key.isEscape) {
          return true;
        }
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

  let lastHistorySaveTime = 0;

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
      const now = Date.now();
      if (now - lastHistorySaveTime > 4000 && video.currentTime > 3 && !pendingResumeTime) {
        lastHistorySaveTime = now;
        saveWatchProgress(currentMovie, video.currentTime, video.duration);
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
      if (mediaSessionManager) {
        mediaSessionManager.notifyError();
      }
      scheduleHide();
    },
    onPlaying() {
      mediaStarted = true;
      autoplayBlocked = false;
      hideLoader();
      playButton.hidden = true;
      stage.classList.remove("playback-error");
      status.dataset.visible = "false";
      applyPendingResume();
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

  const mediaSessionManager = createMediaSessionManager({
    video: video,
    controller: {
      play: function () {
        playButton.hidden = true;
        autoplayBlocked = false;
        playback.play();
      },
      pause: function () {
        playback.pause();
      },
      stop: function () {
        if (video && video.currentTime > 3 && !pendingResumeTime) {
          saveWatchProgress(currentMovie, video.currentTime, video.duration);
        }
        playback.pause();
      },
      seekBy: function (deltaSeconds) {
        seekController.seekBy(deltaSeconds);
      },
      seekTo: function (targetSeconds) {
        pendingSeekTime = targetSeconds;
        ignoreTimelineUntil = Date.now() + 1200;
        playback.seek(targetSeconds);
        updateTimeline();
        updateSubtitleDisplay(targetSeconds);
      },
      nextTrack: function () {
        if (episodesList && currentEpisodeIndex + 1 < episodesList.length) {
          playEpisode(currentEpisodeIndex + 1);
        }
      },
      previousTrack: function () {
        if (episodesList && currentEpisodeIndex > 0) {
          playEpisode(currentEpisodeIndex - 1);
        } else {
          playback.seek(0);
          updateTimeline();
        }
      },
      getCurrentTime: function () {
        return getEffectiveCurrentTime();
      },
      getDuration: function () {
        const range = playback.getRange();
        return (range && range.end > range.start) ? (range.end - range.start) : (Number.isFinite(video.duration) ? video.duration : 0);
      },
      getNavigationState: function () {
        const hasMultiple = Boolean(episodesList && episodesList.length > 1);
        return {
          hasPrev: hasMultiple && currentEpisodeIndex > 0,
          hasNext: hasMultiple && (currentEpisodeIndex + 1 < episodesList.length)
        };
      }
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
  listen(root.querySelector(".player-back-button"), "click", function () {
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
    if (video.currentTime > 3 && !pendingResumeTime) {
      lastHistorySaveTime = Date.now();
      saveWatchProgress(currentMovie, video.currentTime, video.duration);
    }
  });
  listen(video, "pause", function () {
    if (video.currentTime > 3 && !pendingResumeTime) {
      lastHistorySaveTime = Date.now();
      saveWatchProgress(currentMovie, video.currentTime, video.duration);
    }
  });
  listen(video, "loadedmetadata", function () {
    applyPendingResume();
  });
  listen(video, "waiting", function () {
    showLoader("Buffering...");
  });
  listen(video, "canplay", function () {
    hideLoader();
    applyPendingResume();
  });
  listen(video, "playing", function () {
    hideLoader();
    applyPendingResume();
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
      if (video && video.currentTime > 3 && !pendingResumeTime) {
        saveWatchProgress(currentMovie, video.currentTime, video.duration);
      }
    }
  });
  listen(window, "pagehide", function () {
    if (video && video.currentTime > 3 && !pendingResumeTime) {
      saveWatchProgress(currentMovie, video.currentTime, video.duration);
    }
  });

  updateSoundControl(video.muted, video.volume);
  updatePlaybackControl({ paused: video.paused });
  updateTimeline();
  initSubtitles();
  updateFullscreenControl();
  updateNextButtonState();
  pendingResumeTime = resolveResumeTimeForEpisode(currentEpisodeIndex);
  saveWatchProgress(currentMovie, pendingResumeTime > 0 ? pendingResumeTime : 0, 2700);
  showLoader("Loading movie...");
  mediaSessionManager.updateMetadata(currentMovie);
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
      if (video && video.currentTime > 3) {
        saveWatchProgress(currentMovie, video.currentTime, video.duration);
      }
      disposed = true;
      mediaSessionManager.destroy();
      hideLoader();
      unlockLandscape();
      if (nativeFullscreen) {
        nativeFullscreen = false;
        const nativeScreenMode = getNativeScreenMode();
        if (nativeScreenMode) {
          try {
            nativeScreenMode.exit();
          } catch (_) {}
        }
      }
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
  initialProgressPerSecond: 0.015,
  accelerationPerSecondSquared: 0.035,
  maximumProgressPerSecond: 0.16
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
  let isDirectScrub = false;
  let heldSource = null;
  let pressedKeys = [];
  let disposed = false;
  let lastTapTimestamp = 0;
  let tapCount = 0;
  let keyWatchdogTimer = 0;
  let keyRepeatCount = 0;
  const INITIAL_WATCHDOG_TIMEOUT_MS = 650;
  const REPEAT_WATCHDOG_TIMEOUT_MS = 180;

  function clearKeyWatchdog() {
    if (keyWatchdogTimer) {
      window.clearTimeout(keyWatchdogTimer);
      keyWatchdogTimer = 0;
    }
  }

  function resetKeyWatchdog() {
    clearKeyWatchdog();
    const timeout = keyRepeatCount > 1 ? REPEAT_WATCHDOG_TIMEOUT_MS : INITIAL_WATCHDOG_TIMEOUT_MS;
    keyWatchdogTimer = window.setTimeout(function () {
      keyWatchdogTimer = 0;
      if (pressedKeys.length || scrubbing) {
        pressedKeys = [];
        finish(true);
      }
    }, timeout);
  }

  function cancelFrame() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function progressToTime(progress) {
    const range = options.getRange();
    if (!range) {
      return 0;
    }
    return range.start + progress * (range.end - range.start);
  }

  function animate(timestamp) {
    frame = 0;
    if (!scrubbing || !direction || disposed) {
      return;
    }

    const frameDuration = lastFrame ? Math.min(0.2, Math.max(0, (timestamp - lastFrame) / 1000)) : 0.016;
    lastFrame = timestamp;
    elapsed += frameDuration;

    if (elapsed < 0.18) {
      const canWait = direction > 0 ? previewProgress < 1 : previewProgress > 0;
      if (canWait) {
        frame = window.requestAnimationFrame(animate);
      }
      return;
    }

    const currentSpeed = Math.min(
      speed.maximumProgressPerSecond,
      speed.initialProgressPerSecond + speed.accelerationPerSecondSquared * elapsed
    );
    const distance = currentSpeed * frameDuration;

    previewProgress = Math.max(0, Math.min(1, previewProgress + direction * distance));
    moved = moved || previewProgress !== startProgress;

    const range = options.getRange();
    const rangeDuration = (range && Number.isFinite(range.end) && Number.isFinite(range.start)) ?
      Math.max(1, range.end - range.start) : 1;
    const baseStartTime = range ? (range.start + startProgress * rangeDuration) : 0;
    const time = progressToTime(previewProgress);

    const meta = {
      direction: direction,
      isHolding: true,
      elapsed: elapsed,
      percentage: previewProgress * 100,
      deltaSeconds: Math.round(time - baseStartTime),
      targetTime: time
    };
    options.onPreview(previewProgress, time, meta);

    const canContinue = direction > 0 ? previewProgress < 1 : previewProgress > 0;
    if (canContinue) {
      frame = window.requestAnimationFrame(animate);
    }
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
      isDirectScrub = false;
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
    const canMove = direction > 0 ? previewProgress < 1 : previewProgress > 0;
    if (!frame && canMove) {
      frame = window.requestAnimationFrame(animate);
    }
  }

  function finish(commit) {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    clearKeyWatchdog();
    cancelFrame();
    if (!scrubbing) {
      heldSource = null;
      pressedKeys = [];
      keyRepeatCount = 0;
      return false;
    }

    const range = options.getRange();
    const rangeDuration = (range && Number.isFinite(range.end) && Number.isFinite(range.start)) ?
      Math.max(1, range.end - range.start) : 1;
    const baseStartTime = range ? (range.start + startProgress * rangeDuration) : options.getCurrentTime();

    let shouldCommit = commit;
    let finalTime = progressToTime(previewProgress);
    let isTapAction = false;

    if (commit) {
      if (!isDirectScrub && direction !== 0 && (!moved || elapsed < 0.18)) {
        isTapAction = true;
        const now = Date.now();
        if (now - lastTapTimestamp < 650) {
          tapCount = Math.min(5, tapCount + 1);
        } else {
          tapCount = 1;
        }
        lastTapTimestamp = now;

        const stepMultipliers = [0.01, 0.02, 0.04, 0.06, 0.08];
        const stepPct = stepMultipliers[Math.min(tapCount - 1, stepMultipliers.length - 1)];
        const minStepSeconds = 10 * tapCount;
        const effectiveSeconds = Math.max(minStepSeconds, rangeDuration * stepPct);

        const deltaProgress = effectiveSeconds / rangeDuration;
        previewProgress = Math.max(0, Math.min(1, startProgress + direction * deltaProgress));
        finalTime = progressToTime(previewProgress);
        moved = true;
      } else {
        tapCount = 0;
      }
    }

    const wasDirect = isDirectScrub;
    isDirectScrub = false;
    scrubbing = false;
    const finishedDirection = direction;
    direction = 0;
    heldSource = null;
    pressedKeys = [];
    keyRepeatCount = 0;

    const meta = {
      direction: finishedDirection,
      isTap: isTapAction,
      tapCount: tapCount,
      percentage: previewProgress * 100,
      deltaSeconds: Math.round(finalTime - baseStartTime),
      targetTime: finalTime,
      isDirect: wasDirect
    };

    if (shouldCommit && (moved || wasDirect)) {
      options.onPreview(previewProgress, finalTime, meta);
      options.onCommit(finalTime, meta);
      return true;
    } else {
      options.onPreview(previewProgress, finalTime, meta);
      return false;
    }
  }

  return {
    pressKey(nextDirection, key) {
      const index = pressedKeys.indexOf(key);
      if (index === -1) {
        pressedKeys.push(key);
      }
      if (scrubbing) {
        keyRepeatCount++;
      } else {
        keyRepeatCount = 1;
      }
      begin(nextDirection, null);
      resetKeyWatchdog();
    },
    releaseKey(key) {
      clearKeyWatchdog();
      const index = pressedKeys.indexOf(key);
      if (index !== -1) {
        pressedKeys.splice(index, 1);
      }
      if (pressedKeys.length) {
        const lastKey = pressedKeys[pressedKeys.length - 1];
        begin(lastKey === "left" || lastKey === "rewind" ? -1 : 1, null);
        resetKeyWatchdog();
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
      const rangeDuration = range.end - range.start;
      const currentTime = options.getCurrentTime();
      const targetTime = Math.max(range.start, Math.min(range.end, currentTime + seconds));
      const progress = (targetTime - range.start) / rangeDuration;
      const meta = {
        direction: seconds < 0 ? -1 : 1,
        isTap: true,
        percentage: progress * 100,
        deltaSeconds: Math.round(targetTime - currentTime),
        targetTime: targetTime
      };
      if (typeof options.onPreview === "function") {
        options.onPreview(progress, targetTime, meta);
      }
      options.onCommit(targetTime, meta);
    },
    setPreview(progress) {
      if (scrubbing && !isDirectScrub) {
        finish(false);
      }
      const range = options.getRange();
      if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
        return;
      }
      const wasDirect = isDirectScrub;
      scrubbing = true;
      isDirectScrub = true;
      previewProgress = Math.max(0, Math.min(1, progress));
      if (!wasDirect) {
        startProgress = Math.max(0, Math.min(1,
          (options.getCurrentTime() - range.start) / (range.end - range.start)));
      }
      moved = true;
      direction = previewProgress >= startProgress ? 1 : -1;
      elapsed = 0;
      heldSource = null;
      const finalTime = progressToTime(previewProgress);
      const meta = {
        direction: direction,
        percentage: previewProgress * 100,
        deltaSeconds: Math.round(finalTime - (range.start + startProgress * (range.end - range.start))),
        targetTime: finalTime,
        isDirect: true
      };
      options.onPreview(previewProgress, finalTime, meta);
    },
    isScrubbing() {
      return scrubbing;
    },
    commitPreview() {
      finish(true);
    },
    cancel() {
      clearKeyWatchdog();
      isDirectScrub = false;
      finish(false);
    },
    isHolding(source) {
      return heldSource === source && (scrubbing || holdTimer !== 0);
    },
    destroy() {
      disposed = true;
      clearKeyWatchdog();
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
registerModule("js/player/media-session-manager.js", function (requireModule) {
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

function createMediaSessionManager(options) {
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

return {createMediaSessionManager: createMediaSessionManager};
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
