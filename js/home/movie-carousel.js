import { fallbackPoster } from "../config/catalog-sources.js";
import { isFavorite, toggleFavorite } from "../services/favorites-service.js";
import { lazyLoadImage } from "../utils/lazy-image.js";

export const GENRE_CATEGORIES = [
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

export function createCarouselMovieCard(movie, options) {
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
  const posterUrl = (!movie.poster || movie.poster === fallbackPoster) ? fallbackPoster : movie.poster;
  let usedFallback = posterUrl === fallbackPoster;
  img.addEventListener("error", function onErr() {
    if (usedFallback) {
      img.removeEventListener("error", onErr);
      return;
    }
    usedFallback = true;
    img.classList.add("is-fallback");
    img.src = fallbackPoster;
  });
  lazyLoadImage(img, posterUrl);

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
  if (movie.episodeCurrent) {
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

export function createMovieCarouselSection(config, callbacks) {
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

export function createContinueWatchingSection(callbacks) {
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
      const progressPct = Math.max(5, Math.min(98, Number(item.progress) || 25));

      card.innerHTML = "" +
        '<div class="continue-thumb-wrap">' +
          '<img class="continue-thumb-img" src="' + thumbUrl + '" alt="" loading="lazy" decoding="async">' +
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
          '<p class="continue-card-meta">' + (item.remainingText || "Đang xem") + '</p>' +
        '</div>';

      const img = card.querySelector(".continue-thumb-img");
      if (img) {
        img.addEventListener("error", function () {
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

export function createGenreSection(callbacks) {
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
