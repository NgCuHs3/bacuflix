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

export function createHomeScreen(root, catalogService, actionsHandler, options) {
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
