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

  const curTime = (typeof currentTimeSec === "number" && Number.isFinite(currentTimeSec) && currentTimeSec >= 0)
    ? Math.floor(currentTimeSec)
    : (prev && typeof prev.currentTime === "number" ? prev.currentTime : 120);
  const durTime = (typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0)
    ? Math.floor(durationSec)
    : (prev && typeof prev.duration === "number" && prev.duration > 0 ? prev.duration : 2700);

  const progress = durTime > 0 ? Math.max(5, Math.min(98, Math.round((curTime / durTime) * 100))) : 15;
  const remainingMin = Math.max(1, Math.round((durTime - curTime) / 60));

  const seriesTitle = movie.seriesTitle || (prev && prev.seriesTitle) || (movie.title ? String(movie.title).split(" - ")[0] : "Phim");
  const episodeName = movie.episodeName || movie.episodeCurrent || (prev && prev.episodeName) || "Tập 1";

  const entry = {
    id: slug,
    slug: slug,
    title: seriesTitle,
    seriesTitle: seriesTitle,
    episodeName: episodeName,
    episodeCurrent: episodeName,
    currentEpisodeIndex: typeof movie.currentEpisodeIndex === "number" ? movie.currentEpisodeIndex : (prev && typeof prev.currentEpisodeIndex === "number" ? prev.currentEpisodeIndex : 0),
    poster: movie.poster || (prev && prev.poster) || "icon.png",
    thumb: movie.thumb || movie.poster || (prev && (prev.thumb || prev.poster)) || "icon.png",
    year: movie.year || (prev && prev.year) || "2026",
    quality: movie.quality || (prev && prev.quality) || "FHD",
    lang: movie.lang || (prev && prev.lang) || "Vietsub",
    m3u8: movie.m3u8 || (prev && prev.m3u8) || "",
    fallbackEmbed: movie.fallbackEmbed || (prev && prev.fallbackEmbed) || "",
    serverName: movie.serverName || (prev && prev.serverName) || "Vietsub",
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
    saveProgress: saveWatchProgress,
    remove: removeWatchHistory,
    clear: clearWatchHistory
  };
}
