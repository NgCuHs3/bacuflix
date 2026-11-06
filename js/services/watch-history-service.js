const HISTORY_STORAGE_KEY = "kkphim_watch_history";
const MAX_HISTORY_ITEMS = 40;

let cachedHistory = null;

function ensureHistoryCache() {
  if (cachedHistory !== null) {
    return;
  }
  if (typeof window === "undefined" || !window.localStorage) {
    cachedHistory = [];
    return;
  }
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cachedHistory = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Không thể đọc lịch sử xem phim:", err.message);
    cachedHistory = [];
  }
}

export function getWatchHistory() {
  ensureHistoryCache();
  return cachedHistory;
}

export function saveWatchHistoryList(list) {
  cachedHistory = Array.isArray(list) ? list : [];
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(cachedHistory));
  } catch (err) {
    console.warn("Không thể lưu lịch sử xem phim:", err.message);
  }
}

export function getWatchHistoryItem(slug) {
  if (!slug) {
    return null;
  }
  const list = getWatchHistory();
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (item && (item.slug === slug || item.id === slug)) {
      return item;
    }
  }
  return null;
}

export function getEpisodeResumeInfo(slug, episodeIndex) {
  const item = getWatchHistoryItem(slug);
  if (!item) {
    return null;
  }
  const targetEpIdx = typeof episodeIndex === "number"
    ? episodeIndex
    : (typeof item.currentEpisodeIndex === "number" ? item.currentEpisodeIndex : 0);
  const epKey = "ep_" + targetEpIdx;

  let curTime = 0;
  let durTime = 0;
  let epName = item.episodeName || ("Tập " + (targetEpIdx + 1));

  if (item.episodeProgress && item.episodeProgress[epKey]) {
    const epData = item.episodeProgress[epKey];
    curTime = typeof epData.currentTime === "number" ? epData.currentTime : 0;
    durTime = typeof epData.duration === "number" ? epData.duration : 0;
    if (epData.episodeName) {
      epName = epData.episodeName;
    }
  } else if (
    typeof episodeIndex !== "number" ||
    item.currentEpisodeIndex === targetEpIdx ||
    typeof item.currentEpisodeIndex !== "number"
  ) {
    curTime = typeof item.currentTime === "number" ? item.currentTime : 0;
    durTime = typeof item.duration === "number" ? item.duration : 0;
  }

  if (!Number.isFinite(curTime) || curTime <= 5) {
    return null;
  }

  // If the user already watched right up to the end of the episode (within last 12s), do not resume at the credits
  if (Number.isFinite(durTime) && durTime > 60 && curTime >= durTime - 12) {
    return null;
  }

  const progressPercent = durTime > 0
    ? Math.max(5, Math.min(98, Math.round((curTime / durTime) * 100)))
    : (item.progressPercent || 15);

  return {
    slug: item.slug || item.id,
    episodeIndex: targetEpIdx,
    episodeName: epName,
    currentTime: Math.floor(curTime),
    duration: Math.floor(durTime),
    progressPercent: progressPercent
  };
}

export function enrichWatchHistoryMetadata(movie) {
  if (!movie || (!movie.slug && !movie.id)) {
    return false;
  }
  const slug = movie.slug || movie.id;
  const list = getWatchHistory();
  const idx = list.findIndex(function (item) {
    return item && (item.slug === slug || item.id === slug);
  });
  if (idx < 0) {
    return false;
  }
  const entry = list[idx];
  let changed = false;
  if (Array.isArray(movie.categories) && movie.categories.length && (!entry.categories || !entry.categories.length)) {
    entry.categories = movie.categories.slice();
    changed = true;
  }
  if (Array.isArray(movie.countries) && movie.countries.length && (!entry.countries || !entry.countries.length)) {
    entry.countries = movie.countries.slice();
    changed = true;
  }
  if (Array.isArray(movie.actors) && movie.actors.length && (!entry.actors || !entry.actors.length)) {
    entry.actors = movie.actors.slice(0, 10);
    changed = true;
  }
  if (movie.originTitle && !entry.originTitle) {
    entry.originTitle = movie.originTitle;
    changed = true;
  }
  if (movie.type && !entry.type) {
    entry.type = movie.type;
    changed = true;
  }
  if (changed) {
    saveWatchHistoryList(list);
  }
  return changed;
}

export function saveWatchProgress(movie, currentTimeSec, durationSec) {
  if (!movie || (!movie.slug && !movie.id)) {
    return false;
  }
  const slug = movie.slug || movie.id;
  const list = getWatchHistory();
  const existingIdx = list.findIndex(function (item) {
    return item && (item.slug === slug || item.id === slug);
  });
  const prev = existingIdx >= 0 ? list[existingIdx] : null;

  const epIndex = typeof movie.currentEpisodeIndex === "number"
    ? movie.currentEpisodeIndex
    : (prev && typeof prev.currentEpisodeIndex === "number" ? prev.currentEpisodeIndex : 0);
  const epKey = "ep_" + epIndex;
  const prevEpData = (prev && prev.episodeProgress && prev.episodeProgress[epKey])
    ? prev.episodeProgress[epKey]
    : (prev && prev.currentEpisodeIndex === epIndex ? { currentTime: prev.currentTime, duration: prev.duration } : null);

  let curTime;
  if (typeof currentTimeSec === "number" && Number.isFinite(currentTimeSec) && currentTimeSec > 0) {
    curTime = Math.floor(currentTimeSec);
  } else if (prevEpData && typeof prevEpData.currentTime === "number" && prevEpData.currentTime > 0) {
    curTime = Math.floor(prevEpData.currentTime);
  } else if (typeof currentTimeSec === "number" && currentTimeSec === 0) {
    curTime = 0;
  } else {
    curTime = (prev && typeof prev.currentTime === "number") ? prev.currentTime : 120;
  }

  let durTime;
  if (
    typeof durationSec === "number" &&
    Number.isFinite(durationSec) &&
    durationSec > 0 &&
    (currentTimeSec > 0 || !prevEpData || !prevEpData.duration)
  ) {
    durTime = Math.floor(durationSec);
  } else if (prevEpData && typeof prevEpData.duration === "number" && prevEpData.duration > 0) {
    durTime = Math.floor(prevEpData.duration);
  } else if (prev && typeof prev.duration === "number" && prev.duration > 0) {
    durTime = Math.floor(prev.duration);
  } else {
    durTime = 2700;
  }

  const progress = durTime > 0 ? Math.max(5, Math.min(98, Math.round((curTime / durTime) * 100))) : 15;
  const remainingMin = Math.max(1, Math.round(Math.max(0, durTime - curTime) / 60));

  const seriesTitle = movie.seriesTitle || (prev && prev.seriesTitle) || (movie.title ? String(movie.title).split(" - ")[0] : "Phim");
  const episodeName = movie.episodeName || movie.episodeCurrent || (prevEpData && prevEpData.episodeName) || (prev && prev.episodeName) || "Tập 1";

  const episodeProgress = Object.assign({}, (prev && prev.episodeProgress) ? prev.episodeProgress : {});
  episodeProgress[epKey] = {
    episodeIndex: epIndex,
    episodeName: episodeName,
    currentTime: curTime,
    duration: durTime,
    progress: progress,
    updatedAt: Date.now()
  };

  const categories = (Array.isArray(movie.categories) && movie.categories.length)
    ? movie.categories.slice()
    : (prev && Array.isArray(prev.categories) ? prev.categories : []);
  const countries = (Array.isArray(movie.countries) && movie.countries.length)
    ? movie.countries.slice()
    : (prev && Array.isArray(prev.countries) ? prev.countries : []);
  const actors = (Array.isArray(movie.actors) && movie.actors.length)
    ? movie.actors.slice(0, 10)
    : (prev && Array.isArray(prev.actors) ? prev.actors : []);
  const episodesList = (Array.isArray(movie.episodesList) && movie.episodesList.length)
    ? movie.episodesList.slice(0, 120)
    : (prev && Array.isArray(prev.episodesList) ? prev.episodesList : []);

  const entry = {
    id: slug,
    slug: slug,
    title: seriesTitle,
    seriesTitle: seriesTitle,
    originTitle: movie.originTitle || (prev && prev.originTitle) || "",
    episodeName: episodeName,
    episodeCurrent: episodeName,
    currentEpisodeIndex: epIndex,
    poster: movie.poster || (prev && prev.poster) || "icon.png",
    thumb: movie.thumb || movie.poster || (prev && (prev.thumb || prev.poster)) || "icon.png",
    year: movie.year || (prev && prev.year) || "2026",
    quality: movie.quality || (prev && prev.quality) || "FHD",
    lang: movie.lang || (prev && prev.lang) || "Vietsub",
    type: movie.type || (prev && prev.type) || "",
    categories: categories,
    countries: countries,
    actors: actors,
    m3u8: movie.m3u8 || (prev && prev.m3u8) || "",
    fallbackEmbed: movie.fallbackEmbed || (prev && prev.fallbackEmbed) || "",
    serverName: movie.serverName || (prev && prev.serverName) || "Vietsub",
    episodesList: episodesList,
    episodeProgress: episodeProgress,
    currentTime: curTime,
    duration: durTime,
    progress: progress,
    progressPercent: progress,
    remainingText: "Còn " + remainingMin + " phút",
    playbackEnabled: true,
    source: movie.source || "KKPhim",
    updatedAt: Date.now()
  };

  if (existingIdx >= 0) {
    list.splice(existingIdx, 1);
  }
  list.unshift(entry);
  if (list.length > MAX_HISTORY_ITEMS) {
    list.length = MAX_HISTORY_ITEMS;
  }
  saveWatchHistoryList(list);
  return true;
}

export function removeWatchHistory(slug) {
  if (!slug) {
    return false;
  }
  const list = getWatchHistory();
  const filtered = list.filter(function (item) {
    return item && item.slug !== slug && item.id !== slug;
  });
  saveWatchHistoryList(filtered);
  return true;
}

export function clearWatchHistory() {
  saveWatchHistoryList([]);
}

export function createWatchHistoryService() {
  return {
    getAll: getWatchHistory,
    getItem: getWatchHistoryItem,
    getEpisodeResumeInfo: getEpisodeResumeInfo,
    enrichMetadata: enrichWatchHistoryMetadata,
    saveProgress: saveWatchProgress,
    remove: removeWatchHistory,
    clear: clearWatchHistory
  };
}
