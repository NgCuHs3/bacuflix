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

export function getFavorites() {
  ensureCache();
  return cachedFavorites;
}

export function saveFavorites(list) {
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

export function isFavorite(slug) {
  if (!slug) {
    return false;
  }
  ensureCache();
  return cachedFavoritesSet.has(slug);
}

export function addFavorite(movie) {
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

export function removeFavorite(slug) {
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

export function toggleFavorite(movie) {
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

export function createFavoritesService() {
  return {
    getAll: getFavorites,
    has: isFavorite,
    add: addFavorite,
    remove: removeFavorite,
    toggle: toggleFavorite
  };
}
