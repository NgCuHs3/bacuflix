import { activateFocusedElement, focusNext } from "../navigation/remote-navigation.js";
import { fallbackPoster } from "../config/catalog-sources.js";
import { createKkphimApi } from "../services/kkphim-api.js";
import { isFavorite, toggleFavorite, getFavorites } from "../services/favorites-service.js";
import { createGoogleTrendingService } from "../services/google-trending-service.js";
import { createMovieDetailModal } from "./movie-detail-modal.js";
import { createHeroCarousel } from "./hero-carousel.js";
import { currentDevice } from "../utils/device.js";

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
