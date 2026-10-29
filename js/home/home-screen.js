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
    onClose: function () {
      if (selectedCardEntry) {
        setSelectedCard(selectedCardEntry, true);
      }
    }
  });

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
    if (cards.length < 2) {
      cachedColumnsCount = 1;
      return;
    }
    const firstTop = cards[0].element.offsetTop;
    let count = cards.length;
    for (let i = 1; i < cards.length; i += 1) {
      if (cards[i].element.offsetTop > firstTop) {
        count = i;
        break;
      }
    }
    cachedColumnsCount = count > 1 ? count : 4;
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

    clearActionFocus();

    if (selectedCardEntry !== targetEntry) {
      if (selectedCardEntry) {
        selectedCardEntry.element.classList.remove("is-selected", "movie-card--selected");
      }
      selectedCardEntry = targetEntry;
      targetEntry.element.classList.add("is-selected", "movie-card--selected");
      const foundIdx = cards.indexOf(targetEntry);
      if (foundIdx !== -1) {
        activeCardIndex = foundIdx;
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
  searchIcon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 11.99 14 9.5 14z"/></svg>';

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
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
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

      cardEntry.element.addEventListener("focus", function () {
        if (isProgrammaticFocus) {
          return;
        }
        if (document.activeElement === cardEntry.element) {
          setSelectedCard(cardEntry, false);
        }
      });

      grid.appendChild(cardEntry.element);
      cards.push(cardEntry);

      if (options && options.selectedMovieId && movie.id === options.selectedMovieId) {
        targetCard = cardEntry;
        activeCardIndex = idx;
      }
    });

    if (result.notice) {
      notice.textContent = result.notice;
      notice.hidden = false;
    }

    if (cards.length > 0) {
      updateColumnsCount();
      const active = document.activeElement;
      const isHeaderActive = (tabButtons && tabButtons.includes(active)) || active === searchInput || (heroCarousel && heroCarousel.element && heroCarousel.element.contains(active));
      setSelectedCard(targetCard || cards[0], !isHeaderActive);
    }
  }

  function appendMovies(newMovies) {
    if (!newMovies || !newMovies.length) {
      return;
    }
    const cardActions = createCardActions();
    let appendedCount = 0;

    newMovies.forEach(function (movie) {
      // Deduplicate by slug or id
      const exists = cards.some(function (c) {
        return (movie.slug && c.movie.slug === movie.slug) || (movie.id && c.movie.id === movie.id);
      });
      if (exists) {
        return;
      }

      const cardEntry = makeMovieCard(movie, cardActions);
      cardEntry.element.addEventListener("focus", function () {
        if (isProgrammaticFocus) {
          return;
        }
        if (document.activeElement === cardEntry.element) {
          setSelectedCard(cardEntry, false);
        }
      });

      grid.appendChild(cardEntry.element);
      cards.push(cardEntry);
      appendedCount += 1;
    });

    if (appendedCount > 0) {
      updateColumnsCount();
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

  function onScreenScroll() {
    if (isLoadingMore || !hasMore || destroyed) {
      return;
    }
    if (activeTab === "favorites") {
      return;
    }
    const scrollBottom = screen.scrollHeight - screen.scrollTop - screen.clientHeight;
    if (scrollBottom < 380) {
      loadMore();
    }
  }
  screen.addEventListener("scroll", onScreenScroll);

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
  }
  window.addEventListener("resize", onWindowResize);

  // Initial load: Fetch trending for Hero Carousel & display "new" tab
  googleTrendingService.getTrending(false).then(function (res) {
    if (destroyed) {
      return;
    }
    if (res && res.movies && res.movies.length) {
      heroCarousel.setMovies(res.movies);
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
        let activeIdx = getActiveCardIndex();
        if (activeIdx === -1 && cards.length > 0) {
          const fallbackIdx = (activeCardIndex >= 0 && activeCardIndex < cards.length) ? activeCardIndex : 0;
          setSelectedCard(cards[fallbackIdx], true);
        } else if (cards.length > 0 && (!active || active === document.body || active === document.documentElement || active === screen || active === root)) {
          const idxToFocus = activeIdx >= 0 ? activeIdx : 0;
          setSelectedCard(cards[idxToFocus], true);
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
    destroy() {
      destroyed = true;
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
