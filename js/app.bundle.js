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
        window.history.pushState({ screen: "movie-detail", movieSlug: movie.slug }, "", buildMovieUrl(movie.slug));
      }
    },
    onCloseDetail: function () {
      if (typeof window !== "undefined" && window.history && window.history.pushState) {
        window.history.pushState({ screen: "catalog" }, "", buildHomeUrl());
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
    autoOpenSlug: options && options.autoOpenSlug ? options.autoOpenSlug : null
  });

  setActiveScreen("catalog", homeScreen);

  if (typeof window !== "undefined" && window.history && window.history.replaceState) {
    if (options && options.autoOpenSlug) {
      window.history.replaceState({ screen: "movie-detail", movieSlug: options.autoOpenSlug }, "", buildMovieUrl(options.autoOpenSlug));
    } else {
      window.history.replaceState({ screen: "catalog" }, "", buildHomeUrl());
    }
  }
}

function handlePlayerBack() {
  const prevMovie = NavigationState.selectedMovie;
  if (prevMovie && prevMovie.slug) {
    showHome({ autoOpenSlug: prevMovie.slug });
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
    window.history.pushState({ screen: "player", movieSlug: slug, ep: epNum }, "", buildEpisodeUrl(slug, epNum));
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
var createGoogleTrendingService = requireModule("js/services/google-trending-service.js")["createGoogleTrendingService"];
var createMovieDetailModal = requireModule("js/home/movie-detail-modal.js")["createMovieDetailModal"];
var createHeroCarousel = requireModule("js/home/hero-carousel.js")["createHeroCarousel"];
var currentDevice = requireModule("js/utils/device.js")["currentDevice"];
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
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", movie.title);
  card.dataset.movieId = movie.id;

  const image = document.createElement("img");
  image.className = "catalog-poster";
  image.alt = "";
  image.decoding = "async";
  image.loading = "lazy";
  image.width = 200;
  image.height = 300;
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

  // Badges container
  const badges = document.createElement("div");
  badges.className = "catalog-card-badges";

  if (movie.quality) {
    const qBadge = document.createElement("span");
    qBadge.className = "catalog-badge catalog-badge-quality";
    qBadge.textContent = movie.quality;
    badges.appendChild(qBadge);
  }
  if (movie.lang) {
    const lBadge = document.createElement("span");
    lBadge.className = "catalog-badge catalog-badge-lang";
    lBadge.textContent = movie.lang;
    badges.appendChild(lBadge);
  }
  if (movie.episodeCurrent) {
    const eBadge = document.createElement("span");
    eBadge.className = "catalog-badge catalog-badge-episode";
    eBadge.textContent = movie.episodeCurrent;
    badges.appendChild(eBadge);
  }

  // Quick favorite button
  const favBtn = document.createElement("button");
  favBtn.type = "button";
  favBtn.className = "catalog-card-fav" + (isFavorite(movie.slug || movie.id) ? " is-favorite" : "");
  favBtn.setAttribute("aria-label", isFavorite(movie.slug || movie.id) ? "Bỏ yêu thích" : "Thêm yêu thích");
  favBtn.tabIndex = -1;
  favBtn.innerHTML = '<span class="card-fav-icon">' + (isFavorite(movie.slug || movie.id) ? "♥" : "♡") + '</span>';
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

  const details = document.createElement("div");
  details.className = "catalog-card-details";
  const title = document.createElement("h2");
  title.className = "catalog-card-title";
  title.textContent = movie.title;
  const source = document.createElement("p");
  source.className = "catalog-card-source";
  source.textContent = movie.year ? (movie.source + " · " + movie.year) : (movie.source || "KKPhim");

  const play = document.createElement("button");
  play.type = "button";
  play.className = "home-action primary-home-action catalog-play" + (movie.playbackEnabled ? "" : " is-unavailable");
  play.tabIndex = -1;
  play.setAttribute("aria-label", (movie.playbackEnabled ? "Chi tiết / Xem " : "Playback unavailable for ") + movie.title);

  const playIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  playIcon.setAttribute("class", "catalog-play-icon");
  playIcon.setAttribute("viewBox", "0 0 24 24");
  playIcon.setAttribute("width", "18");
  playIcon.setAttribute("height", "18");
  playIcon.setAttribute("fill", "currentColor");
  playIcon.setAttribute("aria-hidden", "true");
  const playPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  playPath.setAttribute("d", "M8 5v14l11-7z");
  playIcon.appendChild(playPath);

  const playText = document.createElement("span");
  playText.className = "catalog-play-label";
  playText.textContent = movie.playbackEnabled ? "Chi tiết" : "Unavailable";

  play.appendChild(playIcon);
  play.appendChild(playText);

  const cardEntry = { element: card, playButton: play, favButton: favBtn, movie: movie };

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
  card.appendChild(image);
  card.appendChild(badges);
  card.appendChild(favBtn);
  card.appendChild(details);
  return cardEntry;
}

function createHomeScreen(root, catalogService, actionsHandler, options) {
  const screen = document.createElement("section");
  screen.className = "home-screen catalog-screen";
  screen.setAttribute("aria-label", "BACUFlix KKPhim movie catalog");

  function isTv() {
    return currentDevice === "tv" ||
      (root && root.getAttribute("data-device") === "tv") ||
      (document.documentElement && document.documentElement.getAttribute("data-device") === "tv") ||
      (typeof window !== "undefined" && Boolean(window.tizen || window.webOS));
  }

  const kkphimApi = createKkphimApi();
  const googleTrendingService = createGoogleTrendingService(kkphimApi);

  let toastTimer = 0;
  let searchDebounceTimer = 0;
  let destroyed = false;
  let refreshing = false;
  let activeTab = "new"; // "new" | "trending" | "favorites" | "search"
  let previousTab = "new";
  let currentSearchQuery = "";
  let currentResult = null;
  let cards = [];
  let activeCardIndex = 0;
  let selectedCardEntry = null;
  let currentActionEntry = null;
  let isProgrammaticFocus = false;
  let cachedColumnsCount = 1;

  // Virtual Scrolling State: only elements in the visible window are mounted in the DOM
  const mountedIndices = new Set();
  let currentStartRow = -1;
  let currentEndRow = -1;
  let virtualScrollRaf = 0;

  // Pagination / Infinite scroll state
  let currentPage = 1;
  let isLoadingMore = false;
  let hasMore = true;

  // Detail Modal instance
  const detailModal = createMovieDetailModal(screen, kkphimApi, {
    onSelectEpisode: function (playbackMovie) {
      if (typeof actionsHandler.onSelect === "function") {
        actionsHandler.onSelect(playbackMovie);
      }
    },
    onFavoritesChanged: function () {
      if (activeTab === "favorites") {
        loadTab("favorites", true);
      } else {
        updateCardFavStates();
      }
    },
    onOpen: function (movie) {
      if (typeof actionsHandler.onOpenDetail === "function") {
        actionsHandler.onOpenDetail(movie);
      }
    },
    onClose: function () {
      if (selectedCardEntry) {
        setSelectedCard(selectedCardEntry, true);
      }
      if (typeof actionsHandler.onCloseDetail === "function") {
        actionsHandler.onCloseDetail();
      }
    }
  });

  if (options && options.autoOpenSlug) {
    detailModal.open({ slug: options.autoOpenSlug, title: "" });
  }

  // Hero Section Carousel (Netflix-style)
  const heroCarousel = createHeroCarousel(screen, {
    onPlayMovie: function (movie) {
      if (movie.slug) {
        detailModal.open(movie);
      } else if (movie.playbackEnabled) {
        actionsHandler.onSelect(movie);
      }
    },
    onOpenDetail: function (movie) {
      if (movie.slug) {
        detailModal.open(movie);
      } else {
        actionsHandler.onSelect(movie);
      }
    },
    onFavoriteToggle: function (_movie, _isFav) {
      if (activeTab === "favorites") {
        loadTab("favorites", true);
      } else {
        updateCardFavStates();
      }
    }
  });

  function updateCardFavStates() {
    cards.forEach(function (cardEntry) {
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
    if (isTv()) {
      cachedColumnsCount = 5;
      return;
    }
    const width = (typeof window !== "undefined" ? window.innerWidth : 0) || (root && root.clientWidth) || 1280;
    if (width <= 540) {
      cachedColumnsCount = 2;
    } else if (width <= 840) {
      cachedColumnsCount = 3;
    } else if (width <= 1200) {
      cachedColumnsCount = 4;
    } else {
      cachedColumnsCount = 5;
    }
  }

  function ensureCardVisible(cardElement) {
    if (!cardElement || !screen) {
      return;
    }
    const containerRect = screen.getBoundingClientRect();
    const cardRect = cardElement.getBoundingClientRect();
    const bufferTop = 20;
    const bufferBottom = 24;
    const bufferLeft = 16;
    const bufferRight = 16;

    const isAbove = cardRect.top < containerRect.top + bufferTop;
    const isBelow = cardRect.bottom > containerRect.bottom - bufferBottom;
    const isLeft = cardRect.left < containerRect.left + bufferLeft;
    const isRight = cardRect.right > containerRect.right - bufferRight;

    if (!isAbove && !isBelow && !isLeft && !isRight) {
      return;
    }

    if (isAbove) {
      screen.scrollTop += (cardRect.top - containerRect.top - bufferTop);
    } else if (isBelow) {
      screen.scrollTop += (cardRect.bottom - containerRect.bottom + bufferBottom);
    }

    if (isLeft) {
      screen.scrollLeft += (cardRect.left - containerRect.left - bufferLeft);
    } else if (isRight) {
      screen.scrollLeft += (cardRect.right - containerRect.right + bufferRight);
    }
  }

  function clearActionFocus() {
    if (currentActionEntry) {
      currentActionEntry.element.classList.remove("has-action-focus");
      currentActionEntry.playButton.tabIndex = -1;
      currentActionEntry = null;
    }
  }

  function setSelectedCard(targetEntry, focusElement) {
    if (!targetEntry) {
      if (selectedCardEntry) {
        selectedCardEntry.element.classList.remove("is-selected", "movie-card--selected");
        clearActionFocus();
        selectedCardEntry = null;
      }
      return;
    }

    if (typeof targetEntry.index === "number") {
      ensureCardInWindow(targetEntry.index);
    }

    clearActionFocus();

    if (selectedCardEntry !== targetEntry) {
      if (selectedCardEntry) {
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
    if (selectedCardEntry && (selectedCardEntry.element === active || selectedCardEntry.playButton === active || selectedCardEntry.element.contains(active))) {
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
    for (let i = 0; i < cards.length; i += 1) {
      if (cards[i].element === active || cards[i].playButton === active || cards[i].element.contains(active)) {
        selectedCardEntry = cards[i];
        activeCardIndex = i;
        return i;
      }
    }
    const isHeader = (tabButtons && tabButtons.includes(active)) || (searchInput && (active === searchInput || searchInput.contains(active))) || (searchClear && active === searchClear);
    const isHero = heroCarousel && heroCarousel.element && heroCarousel.element.contains(active);
    if (!isHeader && !isHero) {
      if (activeCardIndex >= 0 && activeCardIndex < cards.length) {
        return activeCardIndex;
      }
      return 0;
    }
    return -1;
  }

  // Create Header UI
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

  // Tabs: Mới | Trending | Yêu thích | Của tôi
  const navTabs = document.createElement("nav");
  navTabs.className = "home-nav-tabs";
  navTabs.setAttribute("aria-label", "Mục chính");

  const tabConfigs = [
    { id: "new", label: "Mới" },
    { id: "trending", label: "Trending" },
    { id: "favorites", label: "Yêu thích" }
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
      switchTab(tab.id);
    });
    navTabs.appendChild(btn);
    tabButtons.push(btn);
  });

  // Search input & Clear
  const searchBox = document.createElement("div");
  searchBox.className = "home-search-box";

  const searchIcon = document.createElement("span");
  searchIcon.className = "home-search-icon";
  searchIcon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "home-search-input";
  searchInput.placeholder = "Tìm kiếm phim...";
  searchInput.setAttribute("aria-label", "Tìm kiếm phim");
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;

  const searchClear = document.createElement("button");
  searchClear.type = "button";
  searchClear.className = "home-search-clear";
  searchClear.textContent = "×";
  searchClear.setAttribute("aria-label", "Xóa tìm kiếm");
  searchClear.hidden = true;

  searchBox.appendChild(searchIcon);
  searchBox.appendChild(searchInput);
  searchBox.appendChild(searchClear);

  searchInput.addEventListener("input", function () {
    const val = searchInput.value.trim();
    searchClear.hidden = !val;
    window.clearTimeout(searchDebounceTimer);
    if (!val) {
      if (activeTab === "search") {
        switchTab(previousTab || "new");
      }
      return;
    }
    searchDebounceTimer = window.setTimeout(function () {
      executeSearch(val);
    }, 450);
  });

  searchInput.addEventListener("keydown", function (e) {
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

  searchClear.addEventListener("click", function () {
    searchInput.value = "";
    searchClear.hidden = true;
    switchTab(previousTab || "new");
    searchInput.focus();
  });

  header.appendChild(brand);
  header.appendChild(navTabs);
  header.appendChild(searchBox);

  const heading = document.createElement("h1");
  heading.className = "catalog-heading";
  heading.textContent = "Phim mới cập nhật";

  const message = document.createElement("p");
  message.className = "catalog-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

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
    if (isTv()) {
      return {
        cardHeight: 600,
        gap: 28,
        rowHeight: 628,
        cols: 5
      };
    }
    const width = (typeof window !== "undefined" ? window.innerWidth : 0) || (root && root.clientWidth) || 1280;
    let cols = 5;
    let gap = 24;
    let baseCardHeight = 390;

    if (width <= 540) {
      cols = 2;
      gap = 12;
      const cardWidth = Math.max(140, (width - 28 - gap) / 2);
      baseCardHeight = Math.round(cardWidth * 1.5 + 75);
    } else if (width <= 840) {
      cols = 3;
      gap = 16;
      const cardWidth = Math.max(160, (width - 48 - gap * 2) / 3);
      baseCardHeight = Math.round(cardWidth * 1.5 + 85);
    } else if (width <= 1200) {
      cols = 4;
      gap = 20;
      const cardWidth = Math.max(180, (width - 64 - gap * 3) / 4);
      baseCardHeight = Math.round(cardWidth * 1.5 + 90);
    } else {
      cols = 5;
      gap = 24;
      const cardWidth = Math.max(180, (width - width * 0.08 - gap * 4) / 5);
      baseCardHeight = Math.round(cardWidth * 1.5 + 90);
    }

    if (width !== cachedMeasuredWidth || !cachedMeasuredCardHeight) {
      cachedMeasuredWidth = width;
      cachedMeasuredCardHeight = baseCardHeight;
      if (cards.length > 0) {
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
    }

    return {
      cardHeight: cachedMeasuredCardHeight,
      gap: gap,
      rowHeight: cachedMeasuredCardHeight + gap,
      cols: cols
    };
  }

  function mountRange(startIndex, endIndex) {
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
      mountedIndices.delete(idx);
    }

    // Insert from endIndex down to startIndex so anchor is always the next card
    for (let i = endIndex; i >= startIndex; i -= 1) {
      if (!mountedIndices.has(i) && cards[i] && cards[i].element) {
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
        grid.insertBefore(cards[i].element, anchor);
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

    if (cards.length <= 25) {
      topSpacer.style.display = "none";
      bottomSpacer.style.display = "none";
      mountRange(0, cards.length - 1);
      currentStartRow = 0;
      currentEndRow = totalRows - 1;
      return;
    }

    const gridTop = grid.offsetTop || 0;
    const viewportHeight = screen.clientHeight || window.innerHeight || 800;
    const scrollTop = screen.scrollTop || 0;
    const relativeScroll = Math.max(0, scrollTop - gridTop);

    const bufferRows = 6;
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
    mountRange(startIndex, endIndex);
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

  // Loading more indicator (infinite scroll)
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

  // Mount elements to screen in order: Header -> Hero Carousel -> Heading -> Grid
  screen.appendChild(header);
  screen.appendChild(heroCarousel.element);
  screen.appendChild(heading);
  screen.appendChild(message);
  screen.appendChild(notice);
  screen.appendChild(grid);
  screen.appendChild(loadingMoreEl);
  screen.appendChild(hint);
  screen.appendChild(toast);

  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }
  root.appendChild(screen);

  function createCardActions() {
    return {
      onSelect: actionsHandler.onSelect,
      onPlaybackUnavailable: actionsHandler.onPlaybackUnavailable,
      onOpenDetail: function (m) {
        if (m.slug) {
          detailModal.open(m);
        } else {
          actionsHandler.onSelect(m);
        }
      },
      onFavoriteToggle: function (_m, _isFav) {
        if (activeTab === "favorites") {
          loadTab("favorites", true);
        }
      },
      onCardClick: function (entry) {
        if (entry.movie && entry.movie.slug) {
          detailModal.open(entry.movie);
        } else if (entry.movie && entry.movie.playbackEnabled) {
          actionsHandler.onSelect(entry.movie);
        } else {
          activateStageB(entry);
        }
      }
    };
  }

  function render(result) {
    currentResult = result;
    clearGrid();
    cards = [];
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
        message.textContent = "Chưa có phim nào trong danh sách Yêu thích. Hãy khám phá và chọn ♥ để thêm phim!";
      } else if (activeTab === "search") {
        message.textContent = 'Không tìm thấy phim phù hợp với từ khóa "' + currentSearchQuery + '".';
      } else {
        message.textContent = "Hiện không có phim nào trong mục này.";
      }
      return;
    }

    message.textContent = result.movies.length + (result.movies.length === 1 ? " phim" : " phim");
    let targetCard = null;
    const cardActions = createCardActions();

    result.movies.forEach(function (movie, idx) {
      const cardEntry = makeMovieCard(movie, cardActions);
      cardEntry.index = idx;
      cardEntry.element.dataset.cardIndex = idx;

      cardEntry.element.addEventListener("focus", function () {
        if (isProgrammaticFocus) {
          return;
        }
        if (document.activeElement === cardEntry.element) {
          setSelectedCard(cardEntry, false);
        }
      });

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
      const isHeaderActive = (tabButtons && tabButtons.includes(active)) || active === searchInput;
      const isHeroActive = heroCarousel.element && heroCarousel.element.contains(active);

      if (hasHero) {
        // With hero banner active: keep Card 0 selected but do NOT steal focus or scroll away from Hero
        setSelectedCard(targetCard || cards[0], false);
        if (!isHeaderActive && !isHeroActive) {
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
        // Without hero (favorites / search): focus first card if not typing in header
        setSelectedCard(targetCard || cards[0], !isHeaderActive);
      }
    }
  }

  function appendMovies(newMovies) {
    if (!newMovies || !newMovies.length) {
      return;
    }
    const cardActions = createCardActions();
    let appendedCount = 0;
    let startIndex = cards.length;

    newMovies.forEach(function (movie) {
      // Deduplicate by slug or id
      const exists = cards.some(function (c) {
        return (movie.slug && c.movie.slug === movie.slug) || (movie.id && c.movie.id === movie.id);
      });
      if (exists) {
        return;
      }

      const cardEntry = makeMovieCard(movie, cardActions);
      cardEntry.index = startIndex;
      cardEntry.element.dataset.cardIndex = startIndex;
      startIndex += 1;

      cardEntry.element.addEventListener("focus", function () {
        if (isProgrammaticFocus) {
          return;
        }
        if (document.activeElement === cardEntry.element) {
          setSelectedCard(cardEntry, false);
        }
      });

      cards.push(cardEntry);
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
    if (activeTab === "favorites") {
      return;
    }

    isLoadingMore = true;
    loadingMoreEl.hidden = false;
    const nextPage = currentPage + 1;

    let promise;
    if (activeTab === "new") {
      promise = kkphimApi.getNewUpdated(nextPage);
    } else if (activeTab === "trending") {
      promise = kkphimApi.getTrending(nextPage);
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

  // IntersectionObserver for smooth off-main-thread infinite scroll detection
  let sentinelObserver = null;
  if (typeof IntersectionObserver !== "undefined") {
    sentinelObserver = new IntersectionObserver(function (entries) {
      if (entries[0] && entries[0].isIntersecting) {
        if (!isLoadingMore && hasMore && !destroyed && activeTab !== "favorites") {
          loadMore();
        }
      }
    }, {
      root: screen,
      rootMargin: "600px 0px"
    });
    sentinelObserver.observe(loadingMoreEl);
  }

  // Throttled scroll listener using requestAnimationFrame for zero layout thrashing
  let scrollRafId = 0;
  let lastVirtualScrollTop = 0;
  function onScreenScroll() {
    const st = screen.scrollTop || 0;
    if (Math.abs(st - lastVirtualScrollTop) > 300) {
      lastVirtualScrollTop = st;
      updateVirtualWindow();
    } else {
      scheduleVirtualUpdate();
    }
    if (sentinelObserver || scrollRafId || isLoadingMore || !hasMore || destroyed || activeTab === "favorites") {
      return;
    }
    scrollRafId = window.requestAnimationFrame(function () {
      scrollRafId = 0;
      if (isLoadingMore || !hasMore || destroyed || activeTab === "favorites") {
        return;
      }
      const scrollBottom = screen.scrollHeight - screen.scrollTop - screen.clientHeight;
      if (scrollBottom < 400) {
        loadMore();
      }
    });
  }
  screen.addEventListener("scroll", onScreenScroll, { passive: true });

  function updateTabButtonsUI() {
    tabButtons.forEach(function (btn) {
      const isAct = btn.dataset.tabId === activeTab;
      btn.classList.toggle("is-active", isAct);
      btn.setAttribute("aria-selected", isAct ? "true" : "false");
    });
  }

  function switchTab(tabId) {
    if (activeTab !== "search") {
      previousTab = activeTab;
    }
    activeTab = tabId;
    currentPage = 1;
    hasMore = true;
    isLoadingMore = false;
    loadingMoreEl.hidden = true;
    updateTabButtonsUI();

    if (tabId !== "search") {
      currentSearchQuery = "";
      if (searchInput.value) {
        searchInput.value = "";
        searchClear.hidden = true;
      }
    }

    // Show hero carousel only on "new" and "trending" tabs, hide on favorites and search
    const showHero = (tabId === "new" || tabId === "trending");
    heroCarousel.element.hidden = !showHero;
    if (showHero) {
      heroCarousel.startAutoSlide();
    } else {
      heroCarousel.stopAutoSlide();
    }

    if (tabId === "new") {
      heading.textContent = "Phim mới cập nhật";
    } else if (tabId === "trending") {
      heading.textContent = "Phim đang thịnh hành (Google Trends)";
    } else if (tabId === "favorites") {
      heading.textContent = "Phim yêu thích của bạn";
    }

    loadTab(tabId, false);
  }

  function executeSearch(keyword) {
    const kw = (keyword || "").trim();
    if (!kw) {
      return;
    }
    if (activeTab !== "search") {
      previousTab = activeTab;
    }
    activeTab = "search";
    currentPage = 1;
    hasMore = true;
    isLoadingMore = false;
    loadingMoreEl.hidden = true;
    currentSearchQuery = kw;

    tabButtons.forEach(function (btn) {
      btn.classList.remove("is-active");
    });
    heroCarousel.element.hidden = true;
    heroCarousel.stopAutoSlide();
    heading.textContent = 'Kết quả tìm kiếm cho: "' + kw + '"';
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
    if (refreshing || destroyed) {
      return;
    }
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
        return { movies: res.movies || [], errors: [], diagnostics: [], failedAll: false };
      });
    } else if (tabId === "trending") {
      promise = googleTrendingService.getTrending(force).then(function (res) {
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
    } else {
      promise = Promise.resolve({ movies: [], errors: [], diagnostics: [], failedAll: false });
    }

    promise.then(function (result) {
      if (!destroyed) {
        render(result);
      }
    }).catch(function (error) {
      if (!destroyed) {
        render({
          movies: [],
          errors: [{ message: error.message || "Không thể tải dữ liệu phim." }],
          diagnostics: [],
          failedAll: true
        });
      }
    }).then(function () {
      refreshing = false;
      if (!destroyed) {
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

  function refresh(_force) {
    if (activeTab === "search") {
      if (currentSearchQuery) {
        executeSearch(currentSearchQuery);
      }
    } else {
      loadTab(activeTab, true);
    }
  }

  function onWindowResize() {
    updateColumnsCount();
    updateVirtualWindow();
  }
  window.addEventListener("resize", onWindowResize);

  // Initial load: Fetch trending for Hero Carousel & display "new" tab
  googleTrendingService.getTrending(false).then(function (res) {
    if (destroyed) {
      return;
    }
    if (res && res.movies && res.movies.length) {
      heroCarousel.setMovies(res.movies);
      // Focus hero action button on open
      const active = document.activeElement;
      const isHeaderFocused = (tabButtons && tabButtons.includes(active)) || active === searchInput;
      if (!isHeaderFocused) {
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
    console.warn("Lỗi tải hero banner:", err);
  });

  switchTab("new");

  return {
    onKeyDown(event, key) {
      if (detailModal.isOpen()) {
        return detailModal.onKeyDown(event, key);
      }

      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");

      // While typing in search or any input: NEVER intercept characters, backspaces or spaces!
      if (isTyping) {
        if (key.isEscape || key.isBack) {
          active.blur();
          const activeTabBtn = tabButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || tabButtons[0];
          activeTabBtn.focus();
          return true;
        }
        if (key.direction === "left") {
          active.blur();
          tabButtons[tabButtons.length - 1].focus();
          return true;
        }
        if (key.direction === "up") {
          active.blur();
          const activeTabBtn = tabButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || tabButtons[0];
          activeTabBtn.focus();
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
        if (currentActionEntry || (selectedCardEntry && selectedCardEntry.element.classList.contains("has-action-focus"))) {
          cancelStageB(currentActionEntry || selectedCardEntry);
          return true;
        }
        const activeIdx = getActiveCardIndex();
        if (activeIdx !== -1) {
          const cardEntry = cards[activeIdx];
          if (document.activeElement === cardEntry.playButton || cardEntry.element.classList.contains("has-action-focus")) {
            cancelStageB(cardEntry);
            return true;
          }
        }
        if (activeTab === "search" && searchInput.value) {
          searchInput.value = "";
          searchClear.hidden = true;
          switchTab(previousTab || "new");
          return true;
        }
        if (!key.isRepeat) {
          actionsHandler.onBack();
        }
        return true;
      }

      const topHeaderNav = tabButtons.concat([searchInput]);
      const isHeaderActive = topHeaderNav.includes(active) || active === searchClear;
      const isHeroActive = heroCarousel.element && heroCarousel.element.contains(active);

      if (!isHeaderActive && !isHeroActive) {
        const hasHero = !heroCarousel.element.hidden;
        const heroBtns = hasHero ? heroCarousel.getFocusableElements() : [];
        if (hasHero && heroBtns.length && (!active || active === document.body || active === document.documentElement || active === screen || active === root) && screen.scrollTop < 200) {
          heroBtns[0].focus();
        } else {
          let activeIdx = getActiveCardIndex();
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
        if (tabButtons.includes(active)) {
          active.click();
          return true;
        }
        if (active === searchClear) {
          searchClear.click();
          return true;
        }
        if (heroCarousel.element.contains(active)) {
          if (typeof active.click === "function") {
            active.click();
            return true;
          }
        }
        const activeIdx = getActiveCardIndex();
        if (activeIdx !== -1) {
          const cardEntry = cards[activeIdx];
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

      if (key.direction === "left" || key.direction === "right") {
        const topHeaderNav = tabButtons.concat([searchInput]);
        const headerNavIndex = topHeaderNav.indexOf(active);

        if (headerNavIndex !== -1) {
          const delta = key.direction === "left" ? -1 : 1;
          const nextNavIdx = headerNavIndex + delta;
          if (nextNavIdx >= 0 && nextNavIdx < topHeaderNav.length) {
            topHeaderNav[nextNavIdx].focus();
            return true;
          }
          return true;
        }

        // Inside hero carousel
        if (heroCarousel.element.contains(active)) {
          const heroBtns = heroCarousel.getFocusableElements();
          const currentHeroIdx = heroBtns.indexOf(active);
          if (currentHeroIdx !== -1) {
            const nextHeroIdx = currentHeroIdx + (key.direction === "left" ? -1 : 1);
            if (nextHeroIdx >= 0 && nextHeroIdx < heroBtns.length) {
              heroBtns[nextHeroIdx].focus();
              return true;
            }
          }
          return true;
        }

        const activeIdx = getActiveCardIndex();
        if (activeIdx !== -1) {
          clearActionFocus();
          const delta = key.direction === "left" ? -1 : 1;
          const nextIdx = Math.max(0, Math.min(cards.length - 1, activeIdx + delta));
          if (nextIdx !== activeIdx) {
            setSelectedCard(cards[nextIdx], true);
          } else {
            setSelectedCard(cards[activeIdx], true);
          }
          return true;
        }
        return false;
      }

      if (key.direction === "up" || key.direction === "down") {
        const activeIdx = getActiveCardIndex();
        const cols = cachedColumnsCount || (isTv() ? 5 : 4);
        const topHeaderNav = tabButtons.concat([searchInput]);

        if (key.direction === "up") {
          // Inside hero carousel -> go up to header nav
          if (heroCarousel.element.contains(active)) {
            const activeTabBtn = tabButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || tabButtons[0];
            activeTabBtn.focus();
            return true;
          }

          if (activeIdx !== -1) {
            clearActionFocus();
            const targetIdx = activeIdx - cols;
            if (targetIdx >= 0) {
              setSelectedCard(cards[targetIdx], true);
              return true;
            } else {
              // Top row of cards: go to hero if visible, else to header
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
              const activeTabBtn = tabButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || tabButtons[0];
              activeTabBtn.focus();
              return true;
            }
          }
        } else if (key.direction === "down") {
          // From header nav -> down to hero or cards
          if (topHeaderNav.includes(active)) {
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
          } else if (heroCarousel.element.contains(active)) {
            // From hero -> down to cards
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
            } else if (hasMore && !isLoadingMore && (activeTab === "new" || activeTab === "trending" || activeTab === "search")) {
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
      clearGrid();
      window.removeEventListener("resize", onWindowResize);
      screen.removeEventListener("scroll", onScreenScroll);
      window.clearTimeout(toastTimer);
      window.clearTimeout(searchDebounceTimer);
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
      (code === 8 && !(event && event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA"))),
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
    const isInput = event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA");
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
const REQUEST_TIMEOUT_MS = 12000;

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

function normalizeMovie(item, cdnDomain) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const slug = item.slug || (item._id ? String(item._id) : "");
  const title = item.name || item.title || item.origin_name || "Phim không tên";
  const poster = buildImageUrl(item.poster_url || item.thumb_url, cdnDomain);
  const thumb = buildImageUrl(item.thumb_url || item.poster_url, cdnDomain);
  const year = item.year ? String(item.year) : "";
  const quality = item.quality || "";
  const lang = item.lang || "";
  const episodeCurrent = item.episode_current || "";
  const time = item.time || "";
  const type = item.type || "";

  return {
    id: slug,
    slug: slug,
    title: title,
    originTitle: item.origin_name || "",
    poster: poster,
    thumb: thumb,
    year: year,
    quality: quality,
    lang: lang,
    episodeCurrent: episodeCurrent,
    time: time,
    type: type,
    source: "KKPhim",
    playbackEnabled: true
  };
}

function fetchJson(url) {
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
          controller.abort();
        }
        reject(new Error("Yêu cầu API đã hết thời gian chờ (timeout)."));
      }, REQUEST_TIMEOUT_MS);
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
    request.timeout = REQUEST_TIMEOUT_MS;
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
      reject(new Error("Lỗi kết nối mạng khi tải dữ liệu từ KKPhim API."));
    };
    request.ontimeout = function () {
      reject(new Error("Yêu cầu API đã hết thời gian chờ (timeout)."));
    };
    request.send();
  });
}

function createKkphimApi() {
  return {
    getHome() {
      return fetchJson(BASE_URL + "/v1/api/home").then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn);
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
          return normalizeMovie(item, cdn);
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
          return normalizeMovie(item, cdn);
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          pagination: data.params ? data.params.pagination : null,
          title: "Phim mới cập nhật"
        };
      });
    },

    searchMovies(keyword, limit, page) {
      const kw = (keyword || "").trim();
      if (!kw) {
        return Promise.resolve({ movies: [], keyword: "", total: 0 });
      }
      const limitNum = limit && limit > 0 ? limit : 20;
      const pageNum = page && page > 0 ? page : 1;
      const url = BASE_URL + "/v1/api/tim-kiem?keyword=" + encodeURIComponent(kw) + "&limit=" + limitNum + "&page=" + pageNum;
      return fetchJson(url).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn);
        }).filter(Boolean);
        const total = data.params && data.params.pagination ? data.params.pagination.totalItems : movies.length;
        return {
          movies: movies,
          cdn: cdn,
          keyword: kw,
          total: total
        };
      });
    },

    getMovieDetail(slug) {
      const cleanSlug = (slug || "").trim();
      if (!cleanSlug) {
        return Promise.reject(new Error("Slug phim không hợp lệ."));
      }
      const url = BASE_URL + "/phim/" + encodeURIComponent(cleanSlug);
      return fetchJson(url).then(function (res) {
        if (!res || (!res.status && res.status !== "success") || !res.movie) {
          throw new Error("Không tìm thấy thông tin phim.");
        }
        const movie = res.movie;
        const episodes = Array.isArray(res.episodes) ? res.episodes : [];
        const cdn = DEFAULT_CDN;
        const normalized = normalizeMovie(movie, cdn);
        normalized.content = movie.content || "";
        normalized.actors = Array.isArray(movie.actor) ? movie.actor : [];
        normalized.categories = Array.isArray(movie.category) ? movie.category.map(function (c) { return c.name || c; }) : [];
        normalized.countries = Array.isArray(movie.country) ? movie.country.map(function (c) { return c.name || c; }) : [];
        normalized.episodeTotal = movie.episode_total || "";
        normalized.status = movie.status || "";

        return {
          movie: normalized,
          episodes: episodes
        };
      });
    }
  };
}

return {buildImageUrl: buildImageUrl, normalizeMovie: normalizeMovie, createKkphimApi: createKkphimApi};
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
    s = s.replace(/^(xem\s+phim|phim)\s+/, "").trim();
    s = s.replace(/\s+(tập\s+\d+|tap\s+\d+|vietsub|thuyết minh|thuyet minh|lồng tiếng|long tieng|full|hd|phần\s+\d+|phan\s+\d+|mới nhất|motphim).*$/, "").trim();

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

      script.src = "https://suggestqueries.google.com/complete/search?client=chrome&hl=vi&gl=vn&q=" + query + "&callback=" + cbName;
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

  return fetchFn("https://suggestqueries.google.com/complete/search?client=chrome&hl=vi&gl=vn&q=" + query)
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
registerModule("js/home/movie-detail-modal.js", function (requireModule) {
var isFavorite = requireModule("js/services/favorites-service.js")["isFavorite"];
var toggleFavorite = requireModule("js/services/favorites-service.js")["toggleFavorite"];
var fallbackPoster = requireModule("js/config/catalog-sources.js")["fallbackPoster"];
var buildMovieUrl = requireModule("js/utils/url.js")["buildMovieUrl"];
var copyTextToClipboard = requireModule("js/utils/url.js")["copyTextToClipboard"];
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
    cachedFavBtn = modal.querySelector(".movie-detail-fav-btn");
    cachedShareBtn = modal.querySelector(".movie-detail-share-btn");
    cachedServerTabs = Array.from(modal.querySelectorAll(".movie-server-tab"));
    cachedEpisodeBtns = Array.from(modal.querySelectorAll(".movie-episode-btn"));
    cachedEpContainer = modal.querySelector(".movie-episodes-container");
    const width = (typeof window !== "undefined" ? window.innerWidth : 0) || 1280;
    cachedGridCols = width <= 480 ? 3 : (width <= 768 ? 4 : 5);
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
        episodesHtml += '<button type="button" class="movie-episode-btn" data-ep-index="' + epIdx + '" data-m3u8="' + (ep.link_m3u8 || '') + '" data-embed="' + (ep.link_embed || '') + '" data-ep-name="' + (ep.name || '') + '">' + (ep.name || ('Tập ' + (epIdx + 1))) + '</button>';
      });
      episodesHtml += '</div>';
    } else {
      episodesHtml = '<p class="movie-episodes-empty">Chưa có tập phim nào trên server này.</p>';
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

    // Bind Episode buttons
    const episodeBtns = modal.querySelectorAll(".movie-episode-btn");
    episodeBtns.forEach(function (epBtn) {
      epBtn.addEventListener("click", function () {
        const epIndex = parseInt(epBtn.dataset.epIndex, 10);
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
        const playbackMovie = {
          id: movie.slug + "-" + (epObj.slug || epIndex),
          slug: movie.slug,
          seriesTitle: movie.title,
          episodeName: epObj.name,
          title: movie.title + " - " + epObj.name,
          poster: movie.poster,
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
          serverName: serverName
        };

        close();
        if (options && typeof options.onSelectEpisode === "function") {
          options.onSelectEpisode(playbackMovie);
        }
      });
    });

    // Set initial focus: first episode button, or favorite button if no episodes
    updateModalLayoutCache();
    const firstEp = cachedEpisodeBtns.length ? cachedEpisodeBtns[0] : null;
    if (firstEp) {
      firstEp.focus();
    } else if (favBtn) {
      favBtn.focus();
    } else if (closeBtn) {
      closeBtn.focus();
    }
  }

  function loadDetail(slug) {
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

  function close() {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (options && typeof options.onClose === "function") {
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
        setFocus(0);
        return true;
      }

      // Use cached elements to avoid repeated DOM queries & layout thrashing on every key press
      const closeBtn = cachedCloseBtn;
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
          if (favBtn) {
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
        } else if (activeEl === favBtn || activeEl === shareBtn) {
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
          } else if (shareBtn && focusableElements.indexOf(shareBtn) !== -1) {
            shareBtn.focus();
          } else if (favBtn) {
            favBtn.focus();
          }
          return true;
        } else if (serverTabs.includes(activeEl)) {
          if (shareBtn && focusableElements.indexOf(shareBtn) !== -1) {
            shareBtn.focus();
          } else if (favBtn) {
            favBtn.focus();
          } else if (closeBtn) {
            closeBtn.focus();
          }
          return true;
        } else if (activeEl === favBtn || activeEl === shareBtn) {
          if (closeBtn) {
            closeBtn.focus();
          }
          return true;
        }
      } else if (key.direction === "left") {
        if (activeEl === shareBtn) {
          if (favBtn) {
            favBtn.focus();
          }
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
        if (activeEl === favBtn) {
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
      if (activeEl && typeof activeEl.click === "function") {
        activeEl.click();
        return true;
      }
    }

    return false;
  }

  function destroy() {
    disposed = true;
    close();
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

function buildMovieUrl(slug) {
  const base = (typeof window !== "undefined" && window.location) ?
    (window.location.origin + window.location.pathname) : "";
  return base + "?movie=" + encodeURIComponent(slug);
}

function buildEpisodeUrl(slug, ep) {
  const base = (typeof window !== "undefined" && window.location) ?
    (window.location.origin + window.location.pathname) : "";
  return base + "?movie=" + encodeURIComponent(slug) + "&ep=" + encodeURIComponent(ep);
}

function buildHomeUrl() {
  return (typeof window !== "undefined" && window.location) ?
    (window.location.origin + window.location.pathname) : "";
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
registerModule("js/home/hero-carousel.js", function (requireModule) {
var fallbackPoster = requireModule("js/config/catalog-sources.js")["fallbackPoster"];
var isFavorite = requireModule("js/services/favorites-service.js")["isFavorite"];
var toggleFavorite = requireModule("js/services/favorites-service.js")["toggleFavorite"];
function createHeroCarousel(parentContainer, actionsHandler) {
  const container = document.createElement("section");
  container.className = "home-hero-carousel";
  container.setAttribute("aria-label", "Phim thịnh hành nổi bật");

  let movies = [];
  let currentIndex = 0;
  let autoTimer = 0;
  let destroyed = false;

  const slidesWrap = document.createElement("div");
  slidesWrap.className = "hero-slides-wrap";

  const indicatorsWrap = document.createElement("div");
  indicatorsWrap.className = "hero-indicators";

  container.appendChild(slidesWrap);
  container.appendChild(indicatorsWrap);

  container.addEventListener("mouseenter", stopAutoSlide);
  container.addEventListener("mouseleave", startAutoSlide);

  function getSlideElements() {
    return Array.from(slidesWrap.querySelectorAll(".hero-slide"));
  }

  function getIndicatorElements() {
    return Array.from(indicatorsWrap.querySelectorAll(".hero-dot"));
  }

  function updateActiveSlideUI() {
    const slides = getSlideElements();
    const dots = getIndicatorElements();

    slides.forEach(function (slide, idx) {
      const isAct = idx === currentIndex;
      slide.classList.toggle("is-active", isAct);
      slide.setAttribute("aria-hidden", isAct ? "false" : "true");
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
    if (movies.length <= 1 || destroyed || container.hidden) {
      return;
    }
    autoTimer = window.setTimeout(function () {
      nextSlide();
      startAutoSlide();
    }, 6500);
  }

  function stopAutoSlide() {
    if (autoTimer) {
      window.clearTimeout(autoTimer);
      autoTimer = 0;
    }
  }

  function resetAutoSlide() {
    stopAutoSlide();
    startAutoSlide();
  }

  function buildSlide(movie, rank) {
    const slide = document.createElement("article");
    slide.className = "hero-slide";
    slide.dataset.index = rank - 1;

    const bgImage = movie.thumb || movie.poster || fallbackPoster;
    const favActive = isFavorite(movie.slug || movie.id);

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

    const desc = movie.originTitle ? (movie.originTitle + " · " + (movie.year || "") + " · " + (movie.time || "")) : "Khám phá bộ phim nổi bật hàng đầu hôm nay trên BACUFlix.";

    slide.innerHTML = "" +
      '<div class="hero-backdrop">' +
        '<img class="hero-backdrop-img" src="' + bgImage + '" alt="" aria-hidden="true">' +
        '<div class="hero-gradient-top"></div>' +
        '<div class="hero-gradient-left"></div>' +
        '<div class="hero-gradient-bottom"></div>' +
      '</div>' +
      '<div class="hero-content">' +
        '<div class="hero-trending-tag">' +
          '<span class="hero-fire-icon">🔥</span> TOP ' + rank + ' THỊNH HÀNH HÔM NAY' +
        '</div>' +
        '<h2 class="hero-title">' + (movie.title || "Phim nổi bật") + '</h2>' +
        '<div class="hero-badges">' + badgesHtml + '</div>' +
        '<p class="hero-desc">' + desc + '</p>' +
        '<div class="hero-actions">' +
          '<button type="button" class="home-action primary-home-action hero-btn hero-btn-play">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '<span>Xem ngay</span>' +
          '</button>' +
          '<button type="button" class="home-action secondary-home-action hero-btn hero-btn-detail">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
            '<span>Chi tiết</span>' +
          '</button>' +
          '<button type="button" class="hero-btn-fav' + (favActive ? ' is-favorite' : '') + '" aria-label="' + (favActive ? 'Bỏ yêu thích' : 'Thêm yêu thích') + '">' +
            '<span class="hero-fav-icon">' + (favActive ? '♥' : '♡') + '</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    // Bind Play Button
    const playBtn = slide.querySelector(".hero-btn-play");
    playBtn.addEventListener("click", function () {
      if (typeof actionsHandler.onPlayMovie === "function") {
        actionsHandler.onPlayMovie(movie);
      }
    });

    // Bind Detail Button
    const detailBtn = slide.querySelector(".hero-btn-detail");
    detailBtn.addEventListener("click", function () {
      if (typeof actionsHandler.onOpenDetail === "function") {
        actionsHandler.onOpenDetail(movie);
      }
    });

    // Bind Favorite Button
    const favBtn = slide.querySelector(".hero-btn-fav");
    favBtn.addEventListener("click", function () {
      const isNowFav = toggleFavorite(movie);
      favBtn.classList.toggle("is-favorite", isNowFav);
      favBtn.setAttribute("aria-label", isNowFav ? "Bỏ yêu thích" : "Thêm yêu thích");
      const icon = favBtn.querySelector(".hero-fav-icon");
      if (icon) {
        icon.textContent = isNowFav ? "♥" : "♡";
      }
      if (typeof actionsHandler.onFavoriteToggle === "function") {
        actionsHandler.onFavoriteToggle(movie, isNowFav);
      }
    });

    return slide;
  }

  function setMovies(newMovies) {
    if (!newMovies || !newMovies.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    movies = newMovies.slice(0, 5); // Take top 5 for hero carousel
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
      dot.setAttribute("aria-label", "Chuyển đến phim " + (idx + 1));
      dot.addEventListener("click", function () {
        goToSlide(idx);
        resetAutoSlide();
      });
      indicatorsWrap.appendChild(dot);
    });

    updateActiveSlideUI();
    startAutoSlide();
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
    getFocusableElements: getFocusableElements,
    startAutoSlide: startAutoSlide,
    stopAutoSlide: stopAutoSlide,
    destroy: destroy
  };
}

return {createHeroCarousel: createHeroCarousel};
});
registerModule("js/utils/device.js", function (requireModule) {
function detectDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "desktop";
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
var getActiveSubtitleText = requireModule("js/player/subtitle-parser.js")["getActiveSubtitleText"];
var activateFocusedElement = requireModule("js/navigation/remote-navigation.js")["activateFocusedElement"];
var focusNext = requireModule("js/navigation/remote-navigation.js")["focusNext"];
var formatTime = requireModule("js/utils/format-time.js")["formatTime"];
var currentDevice = requireModule("js/utils/device.js")["currentDevice"];
var buildEpisodeUrl = requireModule("js/utils/url.js")["buildEpisodeUrl"];
var copyTextToClipboard = requireModule("js/utils/url.js")["copyTextToClipboard"];
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
    '<span class="control-symbol" aria-hidden="true"><svg class="control-icon" viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></span>' +
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

    overlay.classList.remove("is-active");
    void overlay.offsetWidth;
    overlay.classList.add("is-active");

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
      : Math.max(0, Math.min(1, (playback.getCurrentTime() - range.start) / (range.end - range.start)));
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
    if (!nextEpisodeButton) {
      return;
    }
    const hasMultiple = episodesList && episodesList.length > 1;
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
    if (nowPlayingTitle) {
      nowPlayingTitle.textContent = newFullTitle;
    }
    showLoader("Đang tải " + ep.name + "...");
    showStatus("Đang phát " + ep.name);
    updateNextButtonState();
    if (typeof window !== "undefined" && window.history && window.history.replaceState) {
      const epNum = index + 1;
      const movieSlug = currentMovie.slug || currentMovie.id;
      if (movieSlug) {
        window.history.replaceState({ screen: "player", movieSlug: movieSlug, ep: epNum }, "", buildEpisodeUrl(movieSlug, epNum));
      }
    }
    playback.start(streamUrl);
    scheduleHide(3000);
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

    if (key.direction === "left" || key.direction === "right") {
      const secondaryButtons = [
        root.querySelector("#volume-down-button"),
        root.querySelector("#volume-up-button"),
        root.querySelector("#subtitle-button"),
        root.querySelector("#fullscreen-button"),
        root.querySelector("#next-episode-button"),
        root.querySelector("#share-button")
      ];
      if (inControls && secondaryButtons.includes(target)) {
        focusControl(key.direction);
        return true;
      }
      seekController.pressKey(key.direction === "left" ? -1 : 1, key.direction);
      showControls(false);
      scheduleHide();
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
      showControls(false);
      scheduleHide();
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
      seekController.releaseKey(source.id);
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
      if (!seeking && !video.seeking) {
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
      if (episodesList && episodesList.length > 1 && currentEpisodeIndex + 1 < episodesList.length) {
        startAutoNextCountdown();
      }
    }
  });

  const seekController = createSeekController({
    getRange: playback.getRange,
    getCurrentTime: playback.getCurrentTime,
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
      playback.seek(time);
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
    seeking = false;
    const range = playback.getRange();
    if (range) {
      seekController.setPreview(Number(seekBar.value) / 1000);
    }
    seekController.commitPreview();
  }

  listen(seekBar, "input", function () {
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
  updateNextButtonState();
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
    cancelFrame();
    if (!scrubbing) {
      heldSource = null;
      pressedKeys = [];
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
    commitPreview() {
      finish(true);
    },
    cancel() {
      isDirectScrub = false;
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
