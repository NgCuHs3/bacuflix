import { fallbackPoster } from "../config/catalog-sources.js";
import { isFavorite, toggleFavorite } from "../services/favorites-service.js";

export function createHeroCarousel(parentContainer, actionsHandler) {
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
