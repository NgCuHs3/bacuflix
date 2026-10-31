import { fallbackPoster } from "../config/catalog-sources.js";
import { isFavorite, toggleFavorite } from "../services/favorites-service.js";

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

export function createHeroCarousel(parentContainer, actionsHandler) {
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
