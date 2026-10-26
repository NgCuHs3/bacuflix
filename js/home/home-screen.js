import { activateFocusedElement, focusNext } from "../navigation/remote-navigation.js";

function makeButton(className, text, label) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = text;
  button.setAttribute("aria-label", label || text);
  return button;
}

function makeArtwork(movie, className) {
  const artwork = document.createElement("div");
  artwork.className = className;
  const image = document.createElement("img");
  image.src = movie.artwork;
  image.alt = "";
  artwork.appendChild(image);
  return artwork;
}

export function createHomeScreen(root, movies, actionsHandler) {
  if (!movies.length) {
    throw new Error("The BACUFlix catalog must include at least one movie.");
  }

  const featured = movies[0];
  const screen = document.createElement("section");
  screen.className = "home-screen";
  screen.setAttribute("aria-label", "BACUFlix home");
  let toastTimer = 0;
  let infoTimer = 0;

  const header = document.createElement("header");
  header.className = "home-header";
  header.innerHTML =
    '<a class="home-brand" href="#" aria-label="BACUFlix home">' +
    '<img src="icon.png" alt=""><span>BACU<span>Flix</span></span></a>' +
    '<span class="home-nav-current">HOME</span>';
  header.querySelector(".home-brand").addEventListener("click", function (event) {
    event.preventDefault();
  });

  const hero = document.createElement("section");
  hero.className = "home-feature";
  const heroArt = makeArtwork(featured, "feature-artwork");
  heroArt.setAttribute("aria-hidden", "true");

  const featureCopy = document.createElement("div");
  featureCopy.className = "feature-copy";
  const category = document.createElement("span");
  category.className = "feature-category";
  category.textContent = featured.category || "FEATURED";
  const title = document.createElement("h1");
  title.textContent = featured.title;
  const subtitle = document.createElement("p");
  subtitle.className = "feature-subtitle";
  subtitle.textContent = featured.subtitle;
  const description = document.createElement("p");
  description.className = "feature-description";
  description.textContent = featured.description;
  const actions = document.createElement("div");
  actions.className = "feature-actions";
  actions.dataset.focusGroup = "feature";
  const play = makeButton("home-action primary-home-action", "▶  Play now", "Play " + featured.title);
  const info = makeButton("home-action secondary-home-action", "More info");
  info.addEventListener("click", function () {
    description.classList.toggle("is-emphasized");
    window.clearTimeout(infoTimer);
    infoTimer = window.setTimeout(function () {
      description.classList.remove("is-emphasized");
    }, 1800);
  });
  play.addEventListener("click", function () {
    actionsHandler.onSelect(featured);
  });
  actions.appendChild(play);
  actions.appendChild(info);
  featureCopy.appendChild(category);
  featureCopy.appendChild(title);
  featureCopy.appendChild(subtitle);
  featureCopy.appendChild(description);
  featureCopy.appendChild(actions);
  hero.appendChild(heroArt);
  hero.appendChild(featureCopy);

  const library = document.createElement("section");
  library.className = "home-library";
  const libraryHeading = document.createElement("h2");
  libraryHeading.textContent = "Watch on BACUFlix";
  const row = document.createElement("div");
  row.className = "movie-row";
  row.dataset.focusGroup = "library";

  movies.forEach(function (movie) {
    const card = makeButton("movie-card", "", "Play " + movie.title);
    card.dataset.movieId = movie.id;
    const artwork = makeArtwork(movie, "movie-artwork");
    const cardTitle = document.createElement("span");
    cardTitle.className = "movie-card-title";
    cardTitle.textContent = movie.title;
    card.appendChild(artwork);
    card.appendChild(cardTitle);
    card.addEventListener("click", function () {
      actionsHandler.onSelect(movie);
    });
    row.appendChild(card);
  });
  library.appendChild(libraryHeading);
  library.appendChild(row);

  const hint = document.createElement("p");
  hint.className = "home-remote-hint";
  hint.textContent = "Use the directional buttons to explore · Press OK to play";
  const toast = document.createElement("p");
  toast.className = "home-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;
  screen.appendChild(header);
  screen.appendChild(hero);
  screen.appendChild(library);
  screen.appendChild(hint);
  screen.appendChild(toast);
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }
  root.appendChild(screen);

  const groups = {
    feature: Array.prototype.slice.call(actions.querySelectorAll("button")),
    library: Array.prototype.slice.call(row.querySelectorAll("button"))
  };
  groups.feature[0].focus();

  function focusGroup(name, first) {
    const items = groups[name] || [];
    if (items.length) {
      (first ? items[0] : items[items.length - 1]).focus();
    }
  }

  return {
    onKeyDown(event, key) {
      if (key.isBack) {
        if (key.isRepeat) {
          return true;
        }
        actionsHandler.onBack();
        return true;
      }
      const active = document.activeElement;
      const all = groups.feature.concat(groups.library);
      if (key.direction === "left" || key.direction === "right") {
        focusNext(all, active, key.direction);
        return true;
      }
      if (key.direction === "up" || key.direction === "down") {
        if (groups.library.indexOf(active) !== -1 || active === groups.feature[0] || active === groups.feature[1]) {
          focusGroup(key.direction === "up" ? "feature" : "library", true);
        }
        return true;
      }
      if (key.isSelect) {
        activateFocusedElement(active);
        return true;
      }
      return false;
    },
    onKeyUp() {
      return false;
    },
    showBackPrompt(message) {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = window.setTimeout(function () {
        toast.hidden = true;
      }, 2200);
    },
    destroy() {
      window.clearTimeout(toastTimer);
      window.clearTimeout(infoTimer);
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
    }
  };
}
