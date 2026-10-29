const CACHE_KEY = "kkphim_google_trending_cache";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const IGNORE_PATTERNS = [
  "chiếu rạp", "chieu rap", "quốc gia", "quoc gia", "hôm nay", "hom nay",
  "mới nhất", "moi nhat", "trung quốc", "trung quoc", "hàn quốc", "han quoc",
  "thái lan", "thai lan", "việt nam", "viet nam", "tvb", "hk", "cgv", "lotte",
  "hoạt hình", "hoat hinh", "tổng tài", "tong tai", "2024", "2025", "2026", "2027",
  "xem phim", "phim", "phim hay", "phim mới", "phim bộ", "phim lẻ", "thuyết minh", "lồng tiếng"
];

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function getCachedTrending() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.movies) || !data.timestamp) {
      return null;
    }
    const age = Date.now() - Number(data.timestamp);
    if (age >= CACHE_TTL_MS) {
      return null;
    }
    return data.movies;
  } catch (err) {
    console.warn("Lỗi khi đọc cache Google Trending:", err);
    return null;
  }
}

export function saveCachedTrending(movies) {
  const storage = getStorage();
  if (!storage || !Array.isArray(movies) || !movies.length) {
    return;
  }
  try {
    const record = {
      timestamp: Date.now(),
      movies: movies
    };
    storage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch (err) {
    console.warn("Lỗi khi lưu cache Google Trending:", err);
  }
}

export function clearTrendingCache() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(CACHE_KEY);
  }
}

export function extractKeywords(suggestions) {
  if (!Array.isArray(suggestions)) {
    return [];
  }
  const titles = [];
  const seen = new Set();

  for (let i = 0; i < suggestions.length; i += 1) {
    let s = String(suggestions[i] || "").toLowerCase().trim();
    s = s.replace(/^(xem\s+phim|phim)\s+/, "").trim();
    s = s.replace(/\s+(tập\s+\d+|tap\s+\d+|vietsub|thuyết minh|thuyet minh|lồng tiếng|long tieng|full|hd|phần\s+\d+|phan\s+\d+|mới nhất|motphim).*$/, "").trim();

    let isIgnored = false;
    for (let j = 0; j < IGNORE_PATTERNS.length; j += 1) {
      if (s === IGNORE_PATTERNS[j] || (s.length < 10 && s.includes(IGNORE_PATTERNS[j]))) {
        isIgnored = true;
        break;
      }
    }

    if (!isIgnored && s.length >= 3 && !seen.has(s)) {
      seen.add(s);
      titles.push(s);
    }
  }

  return titles;
}

export function fetchGoogleSuggestions(seed) {
  const query = encodeURIComponent(seed || "phim ");

  // Browser environment: Use JSONP to guarantee bypass of CORS restrictions
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    return new Promise(function (resolve) {
      const cbName = "__gSuggest_" + Math.random().toString(36).substring(2, 9);
      let timer = 0;

      function cleanup() {
        if (timer) {
          clearTimeout(timer);
        }
        try {
          delete window[cbName];
        } catch (_e) {
          window[cbName] = undefined;
        }
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      const script = document.createElement("script");
      timer = setTimeout(function () {
        cleanup();
        resolve([]);
      }, 5000);

      window[cbName] = function (data) {
        cleanup();
        resolve(Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []);
      };

      script.onerror = function () {
        cleanup();
        resolve([]);
      };

      script.src = "https://suggestqueries.google.com/complete/search?client=chrome&hl=vi&gl=vn&q=" + query + "&callback=" + cbName;
      (document.head || document.body || document.documentElement).appendChild(script);
    });
  }

  // Node.js or non-DOM test environment: fallback to fetch
  const fetchFn = (typeof window !== "undefined" && typeof window.fetch === "function")
    ? window.fetch.bind(window)
    : (typeof fetch === "function" ? fetch : null);

  if (!fetchFn) {
    return Promise.resolve([]);
  }

  return fetchFn("https://suggestqueries.google.com/complete/search?client=chrome&hl=vi&gl=vn&q=" + query)
    .then(function (res) {
      if (!res.ok) {
        return [];
      }
      return res.json();
    })
    .then(function (data) {
      return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    })
    .catch(function () {
      return [];
    });
}

export function fetchGoogleTrending(kkphimApi, force) {
  if (!force) {
    const cached = getCachedTrending();
    if (cached && cached.length) {
      return Promise.resolve({
        movies: cached,
        isCached: true,
        source: "google-cache"
      });
    }
  }

  const seeds = ["xem phim ", "phim ", "phim bo ", "phim chieu rap "];

  return Promise.all(seeds.map(function (s) {
    return fetchGoogleSuggestions(s);
  })).then(function (results) {
    const allSuggestions = [];
    results.forEach(function (list) {
      if (Array.isArray(list)) {
        allSuggestions.push.apply(allSuggestions, list);
      }
    });

    const keywords = extractKeywords(allSuggestions);
    const topKeywords = keywords.slice(0, 15);

    if (!topKeywords.length) {
      return kkphimApi.getHome().then(function (res) {
        return {
          movies: res.movies || [],
          isCached: false,
          source: "kkphim-fallback"
        };
      });
    }

    return Promise.all(topKeywords.map(function (kw) {
      return kkphimApi.searchMovies(kw, 3, 1).then(function (res) {
        return res && Array.isArray(res.movies) ? res.movies : [];
      }).catch(function () {
        return [];
      });
    })).then(function (nestedMovies) {
      const trendingMovies = [];
      const seenSlugs = new Set();

      nestedMovies.forEach(function (list) {
        list.forEach(function (m) {
          const key = m.slug || m.id;
          if (key && !seenSlugs.has(key)) {
            seenSlugs.add(key);
            trendingMovies.push(m);
          }
        });
      });

      // If fewer than 24 movies, complement with KKPhim Home list so the grid is full
      if (trendingMovies.length < 24) {
        return kkphimApi.getHome().then(function (res) {
          const homeMovies = res && Array.isArray(res.movies) ? res.movies : [];
          homeMovies.forEach(function (hm) {
            const hKey = hm.slug || hm.id;
            if (hKey && !seenSlugs.has(hKey)) {
              seenSlugs.add(hKey);
              trendingMovies.push(hm);
            }
          });
          if (trendingMovies.length) {
            saveCachedTrending(trendingMovies);
          }
          return {
            movies: trendingMovies,
            isCached: false,
            source: "google"
          };
        }).catch(function () {
          if (trendingMovies.length) {
            saveCachedTrending(trendingMovies);
          }
          return {
            movies: trendingMovies,
            isCached: false,
            source: "google"
          };
        });
      }

      saveCachedTrending(trendingMovies);
      return {
        movies: trendingMovies,
        isCached: false,
        source: "google"
      };
    });
  }).catch(function (error) {
    console.warn("Lỗi khi tải Google Trending, chuyển sang danh sách KKPhim Home:", error);
    return kkphimApi.getHome().then(function (res) {
      return {
        movies: res.movies || [],
        isCached: false,
        source: "kkphim-fallback"
      };
    });
  });
}

export function createGoogleTrendingService(kkphimApi) {
  return {
    getTrending(force) {
      return fetchGoogleTrending(kkphimApi, force);
    },
    getCached() {
      return getCachedTrending();
    },
    saveCached(movies) {
      saveCachedTrending(movies);
    },
    clearCache() {
      clearTrendingCache();
    },
    extractKeywords(suggestions) {
      return extractKeywords(suggestions);
    }
  };
}
