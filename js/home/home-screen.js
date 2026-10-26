import { activateFocusedElement, focusNext } from "../navigation/remote-navigation.js";
import { fallbackPoster } from "../config/catalog-sources.js";

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

  const details = document.createElement("div");
  details.className = "catalog-card-details";
  const title = document.createElement("h2");
  title.className = "catalog-card-title";
  title.textContent = movie.title;
  const source = document.createElement("p");
  source.className = "catalog-card-source";
  source.textContent = movie.source;

  const play = document.createElement("button");
  play.type = "button";
  play.className = "home-action primary-home-action catalog-play" + (movie.playbackEnabled ? "" : " is-unavailable");
  play.tabIndex = -1;
  play.setAttribute("aria-label", (movie.playbackEnabled ? "Play " : "Playback unavailable for ") + movie.title);

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
  playText.textContent = movie.playbackEnabled ? "Play" : "Unavailable";

  play.appendChild(playIcon);
  play.appendChild(playText);

  const cardEntry = { element: card, playButton: play, movie: movie };

  if (movie.playbackEnabled) {
    play.addEventListener("click", function (event) {
      event.stopPropagation();
      actionsHandler.onSelect(movie);
    });
  } else {
    play.title = "Playback is disabled until an authorized stream source is configured.";
    play.addEventListener("click", function (event) {
      event.stopPropagation();
      actionsHandler.onPlaybackUnavailable(movie);
    });
  }

  card.addEventListener("click", function (event) {
    if (event.target === play || play.contains(event.target)) {
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
  card.appendChild(details);
  return cardEntry;
}

export function createHomeScreen(root, catalogService, actionsHandler, options) {
  const screen = document.createElement("section");
  screen.className = "home-screen catalog-screen";
  screen.setAttribute("aria-label", "BACUFlix movie catalog");
  let toastTimer = 0;
  let destroyed = false;
  let refreshing = false;
  let currentResult = null;
  let cards = [];
  let activeCardIndex = 0;
  let selectedCardEntry = null;
  let currentActionEntry = null;
  let isProgrammaticFocus = false;
  let cachedColumnsCount = 1;

  function updateColumnsCount() {
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
    cachedColumnsCount = count || 1;
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
    return -1;
  }

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
    cards = [];
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
    let targetCard = null;
    result.movies.forEach(function (movie, idx) {
      const cardEntry = makeMovieCard(movie, {
        onSelect: actionsHandler.onSelect,
        onPlaybackUnavailable: actionsHandler.onPlaybackUnavailable,
        onCardClick: function (entry) {
          activateStageB(entry);
        }
      });
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
    if (result.errors.length) {
      notice.textContent = "Some catalogs could not be refreshed. Showing available saved movies.";
      notice.hidden = false;
    } else if (result.diagnostics.length) {
      notice.textContent = result.diagnostics.length + " invalid catalog entr" +
        (result.diagnostics.length === 1 ? "y was" : "ies were") + " skipped.";
      notice.hidden = false;
    }

    if (cards.length > 0) {
      updateColumnsCount();
      setSelectedCard(targetCard || cards[0], false);
    }
  }

  function onWindowResize() {
    updateColumnsCount();
  }
  window.addEventListener("resize", onWindowResize);

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
            if (matchIndex >= 0 && cards[matchIndex]) {
              setSelectedCard(cards[matchIndex], true);
              return;
            }
          }
          if (cards.length) {
            setSelectedCard(cards[activeCardIndex] || cards[0], true);
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

  return {
    onKeyDown(event, key) {
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
        if (!key.isRepeat) {
          actionsHandler.onBack();
        }
        return true;
      }

      if (key.isSelect) {
        const active = document.activeElement;
        if (active === refreshButton) {
          refresh(true);
          return true;
        }
        const activeIdx = getActiveCardIndex();
        if (activeIdx !== -1) {
          const cardEntry = cards[activeIdx];
          if (active === cardEntry.playButton || currentActionEntry === cardEntry) {
            if (cardEntry.movie.playbackEnabled) {
              actionsHandler.onSelect(cardEntry.movie);
            } else {
              actionsHandler.onPlaybackUnavailable(cardEntry.movie);
            }
            return true;
          } else {
            activateStageB(cardEntry);
            return true;
          }
        }
        return false;
      }

      if (key.direction === "left" || key.direction === "right") {
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
        } else if (document.activeElement === refreshButton && key.direction === "right" && cards.length > 0) {
          setSelectedCard(cards[0], true);
          return true;
        }
        return false;
      }

      if (key.direction === "up" || key.direction === "down") {
        const active = document.activeElement;
        const activeIdx = getActiveCardIndex();
        const cols = cachedColumnsCount || 1;

        if (key.direction === "up") {
          if (activeIdx !== -1) {
            clearActionFocus();
            const targetIdx = activeIdx - cols;
            if (targetIdx >= 0) {
              setSelectedCard(cards[targetIdx], true);
              return true;
            } else {
              refreshButton.focus();
              return true;
            }
          }
        } else if (key.direction === "down") {
          if (active === refreshButton && cards.length > 0) {
            setSelectedCard(cards[activeCardIndex] || cards[0], true);
            return true;
          } else if (activeIdx !== -1) {
            clearActionFocus();
            const targetIdx = activeIdx + cols;
            if (targetIdx < cards.length) {
              setSelectedCard(cards[targetIdx], true);
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
      window.clearTimeout(toastTimer);
      cards = [];
      selectedCardEntry = null;
      currentActionEntry = null;
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
    }
  };
}
