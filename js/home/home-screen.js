import { activateFocusedElement, focusNext } from "../navigation/remote-navigation.js";
import { fallbackPoster } from "../config/catalog-sources.js";
import { createKkphimApi } from "../services/kkphim-api.js";
import { isFavorite, toggleFavorite, getFavorites } from "../services/favorites-service.js";
import { createGoogleTrendingService } from "../services/google-trending-service.js";
import { createMovieDetailModal } from "./movie-detail-modal.js";
import { createHeroCarousel } from "./hero-carousel.js";
import { createTvSearchKeyboard } from "./tv-search-keyboard.js";
import { currentDevice } from "../utils/device.js";

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

  // Badges container
  const badges = document.createElement("div");
  badges.className = "catalog-card-badges";

  if (movie.quality) {
    const qBadge = document.createElement("span");
    qBadge.className = "catalog-badge catalog-badge-quality";
    qBadge.textContent = movie.quality;
    badges.appendChild(qBadge);
  }
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
  if (movie.year) {
    metaParts.push(movie.year);
  }
  if (movie.lang) {
    metaParts.push(movie.lang);
  } else if (movie.source) {
    metaParts.push(movie.source);
  }
  const source = document.createElement("p");
  source.className = "catalog-card-source";
  source.textContent = metaParts.length ? metaParts.join(" • ") : "KKPhim";

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

export function createHomeScreen(root, catalogService, actionsHandler, options) {
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
  let cachedColumnsCount = 5;
  let cachedGridTop = 0;
  let tvKeyboard = null;

  // Virtual Scrolling State: only elements in the visible window are mounted in the DOM
  const mountedIndices = new Set();
  let currentStartRow = -1;
  let currentEndRow = -1;
  let virtualScrollRaf = 0;

  // Pagination / Infinite scroll state
  let currentPage = 1;
  let isLoadingMore = false;
  let hasMore = true;

  const cardActions = {
    onSelect: actionsHandler.onSelect,
    onPlaybackUnavailable: actionsHandler.onPlaybackUnavailable,
    onOpenDetail: function (m) {
      if (tvKeyboard && tvKeyboard.isOpen()) {
        tvKeyboard.close();
      }
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
    detailModal.open({
      slug: options.autoOpenSlug,
      title: "",
      currentEpisodeIndex: typeof options.autoOpenEpisodeIndex === "number" ? options.autoOpenEpisodeIndex : 0
    });
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
      cachedColumnsCount = kbOpen ? 3 : 5;
      return;
    }
    const width = (typeof window !== "undefined" ? window.innerWidth : 0) || (root && root.clientWidth) || 1280;
    if (width <= 540) {
      cachedColumnsCount = 2;
    } else if (width <= 840) {
      cachedColumnsCount = kbOpen ? 2 : 3;
    } else if (width <= 1200) {
      cachedColumnsCount = kbOpen ? 3 : 4;
    } else {
      cachedColumnsCount = kbOpen ? 3 : 5;
    }
  }

  function ensureCardVisible(cardElement) {
    if (!cardElement || !screen) {
      return;
    }
    const containerRect = screen.getBoundingClientRect();
    const cardRect = cardElement.getBoundingClientRect();
    const bufferTop = 110;
    const bufferBottom = 40;

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
    const isHero = heroCarousel && heroCarousel.element && heroCarousel.element.contains(active);
    const isKb = tvKeyboard && tvKeyboard.contains(active);
    if (!isHeader && !isHero && !isKb) {
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

  // Tabs: Mới | Trending | Yêu thích
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
      if (tvKeyboard && tvKeyboard.isOpen()) {
        tvKeyboard.close();
      }
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
  if (isTv()) {
    // Prevent native TV system IME keyboard from ever opening
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
    const kbOpen = Boolean(tvKeyboard && tvKeyboard.isOpen());
    if (isTv()) {
      const tvCols = kbOpen ? 3 : 5;
      const tvCardHeight = kbOpen ? 460 : 520;
      const tvGap = kbOpen ? 22 : 26;
      return {
        cardHeight: tvCardHeight,
        gap: tvGap,
        rowHeight: tvCardHeight + tvGap,
        cols: tvCols
      };
    }
    const width = (typeof window !== "undefined" ? window.innerWidth : 0) || (root && root.clientWidth) || 1280;
    let cols = kbOpen ? 3 : 5;
    let gap = 22;
    let baseCardHeight = 380;

    if (width <= 540) {
      cols = 2;
      gap = 12;
      const cardWidth = Math.max(140, (width - 28 - gap) / 2);
      baseCardHeight = Math.round(cardWidth * 1.5 + 68);
    } else if (width <= 840) {
      cols = kbOpen ? 2 : 3;
      gap = 16;
      const cardWidth = Math.max(160, (width - 48 - gap * 2) / cols);
      baseCardHeight = Math.round(cardWidth * 1.5 + 74);
    } else if (width <= 1200) {
      cols = kbOpen ? 3 : 4;
      gap = 20;
      const cardWidth = Math.max(180, (width - 64 - gap * (cols - 1)) / cols);
      baseCardHeight = Math.round(cardWidth * 1.5 + 78);
    } else {
      cols = kbOpen ? 3 : 5;
      gap = 22;
      const effectiveWidth = kbOpen ? width * 0.6 : width * 0.92;
      const cardWidth = Math.max(180, (effectiveWidth - gap * (cols - 1)) / cols);
      baseCardHeight = Math.round(cardWidth * 1.5 + 78);
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
    const posterKeepMargin = (cols || 5) * 4;
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

    // Insert from endIndex down to startIndex so anchor is always the next card
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

    if (cards.length <= 20) {
      topSpacer.style.display = "none";
      bottomSpacer.style.display = "none";
      mountRange(0, cards.length - 1, layout.cols);
      currentStartRow = 0;
      currentEndRow = totalRows - 1;
      return;
    }

    if (!cachedGridTop) {
      cachedGridTop = grid.offsetTop || 200;
    }
    const viewportHeight = screen.clientHeight || window.innerHeight || 1080;
    const scrollTop = screen.scrollTop || 0;
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

  // Mount Netflix-style Right-Side Custom TV Search Keyboard
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
        tabButtons[tabButtons.length - 1].focus();
      }
    },
    onMoveUpToHeader: function () {
      tabButtons[tabButtons.length - 1].focus();
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
        message.textContent = "Chưa có phim nào trong danh sách Yêu thích. Hãy khám phá và chọn ♥ để thêm phim!";
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
      const isHeaderActive = (tabButtons && tabButtons.includes(active)) || active === searchInput || (tvKeyboard && tvKeyboard.contains(active));
      const isHeroActive = heroCarousel.element && heroCarousel.element.contains(active);

      if (hasHero) {
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
    if (Math.abs(st - lastVirtualScrollTop) > 360) {
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
    updateTabButtonsUI();

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

    // Show hero carousel only on "new" and "trending" tabs, hide on favorites and search or when keyboard is open
    const showHero = (tabId === "new" || tabId === "trending") && !(tvKeyboard && tvKeyboard.isOpen());
    heroCarousel.element.hidden = !showHero;
    if (showHero) {
      heroCarousel.startAutoSlide();
    } else {
      heroCarousel.stopAutoSlide();
    }

    if (tabId === "new") {
      heading.textContent = "Phim mới cập nhật";
    } else if (tabId === "trending") {
      heading.textContent = "Phim đang thịnh hành";
    } else if (tabId === "favorites") {
      heading.textContent = "Danh sách Yêu thích";
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
    cachedGridTop = 0;
    currentSearchQuery = kw;

    tabButtons.forEach(function (btn) {
      btn.classList.remove("is-active");
    });
    heroCarousel.element.hidden = true;
    heroCarousel.stopAutoSlide();
    heading.textContent = 'Kết quả tìm kiếm: "' + kw + '"';
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
    cachedMeasuredWidth = 0;
    cachedGridTop = 0;
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
      const active = document.activeElement;
      const isHeaderFocused = (tabButtons && tabButtons.includes(active)) || active === searchInput || (tvKeyboard && tvKeyboard.contains(active));
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
    console.warn("Lỗi tải hero banner:", err);
  });

  switchTab("new");

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
        if (tvKeyboard && tvKeyboard.isOpen()) {
          tvKeyboard.close();
          const activeTabBtn = tabButtons.find(function (b) { return b.dataset.tabId === activeTab; }) || tabButtons[0];
          activeTabBtn.focus();
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
        if (active === searchInput) {
          openCustomTvKeyboard(true);
          return true;
        }
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
          if (key.direction === "right" && active === searchInput && tvKeyboard && tvKeyboard.isOpen()) {
            tvKeyboard.focusFirstKey();
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
          const cols = cachedColumnsCount || (isTv() ? 5 : 4);
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
        const cols = cachedColumnsCount || (isTv() ? 5 : 4);

        if (key.direction === "up") {
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
          } else if (heroCarousel.element.contains(active)) {
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
