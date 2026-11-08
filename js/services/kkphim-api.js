import { fallbackPoster } from "../config/catalog-sources.js";

export const BASE_URL = "https://phimapi.com";
export const DEFAULT_CDN = "https://phimimg.com";
export const VSMOV_BASE_URL = "https://vsmov.com/api";
export const VSMOV_CDN = "https://vsmov.com/storage/images/";
export const NGUONC_BASE_URL = "https://phim.nguonc.com";

const DEFAULT_TIMEOUT_MS = 5000;
const BACKUP_TIMEOUT_MS = 2500;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DETAIL_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const VSMOV_EMBED_REGEX = /^(https?:\/\/[^/]*streamvsmov\.com)\/video\/([0-9a-fA-F-]+)/i;

/**
 * Extracts a playable direct .m3u8 HLS stream URL from VSMov embed links
 * or ?url= wrapped player links.
 */
export function extractDirectM3u8(embedUrl) {
  if (!embedUrl || typeof embedUrl !== "string") return "";
  const clean = embedUrl.trim();
  const vsmovMatch = clean.match(VSMOV_EMBED_REGEX);
  if (vsmovMatch) {
    const host = vsmovMatch[1].replace(/\/+$/, "");
    const uuid = vsmovMatch[2];
    return host + "/stream/" + uuid + "/master.m3u8";
  }
  if (clean.includes("url=")) {
    const after = clean.split("url=")[1].split("&")[0].trim();
    if (after.includes(".m3u8")) {
      try {
        return decodeURIComponent(after);
      } catch (_) {
        return after;
      }
    }
  }
  return "";
}

export function buildImageUrl(url, cdnDomain) {
  if (!url || typeof url !== "string") {
    return fallbackPoster;
  }
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    return fallbackPoster;
  }
  if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
    return cleanUrl;
  }
  const domain = (cdnDomain || DEFAULT_CDN).replace(/\/+$/, "");
  const path = cleanUrl.replace(/^\/+/, "");
  return domain + "/" + path;
}

export function normalizeMovie(item, cdnDomain, sourceName = "KKPhim") {
  if (!item || typeof item !== "object") {
    return null;
  }
  const slug = item.slug || (item._id ? String(item._id) : "");
  const title = item.name || item.title || item.origin_name || "Phim không tên";
  const rawPoster = item.poster_url || item.thumb_url || item.image || "";
  const rawThumb = item.thumb_url || item.poster_url || item.image || "";
  const poster = buildImageUrl(rawPoster, cdnDomain);
  const thumb = buildImageUrl(rawThumb, cdnDomain);
  const year = item.year ? String(item.year) : "";
  const quality = item.quality || "FHD";
  const lang = item.lang || item.language || "Vietsub";
  const episodeCurrent = item.episode_current || item.current_episode || item.episode_status || "";
  const time = item.time || "";
  const type = item.type || "";

  return {
    id: slug || String(title).toLowerCase().replace(/\s+/g, "-"),
    slug: slug,
    title: title,
    originTitle: item.origin_name || item.original_name || "",
    poster: poster,
    thumb: thumb,
    year: year,
    quality: quality,
    lang: lang,
    episodeCurrent: episodeCurrent,
    time: time,
    type: type,
    source: sourceName,
    playbackEnabled: true
  };
}

function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const fetchFn = (typeof window !== "undefined" && typeof window.fetch === "function")
    ? window.fetch.bind(window)
    : (typeof fetch === "function" ? fetch : null);

  if (fetchFn) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const options = controller ? { signal: controller.signal } : {};
    let timer = 0;
    const request = fetchFn(url, options).then(function (response) {
      if (!response.ok) {
        throw new Error("API trả về mã lỗi HTTP " + response.status);
      }
      return response.json();
    });
    const timeout = new Promise(function (_resolve, reject) {
      timer = setTimeout(function () {
        if (controller) {
          try { controller.abort(); } catch (_) {}
        }
        reject(new Error("Yêu cầu API đã hết thời gian chờ (timeout)."));
      }, timeoutMs);
    });
    return Promise.race([request, timeout]).then(function (data) {
      clearTimeout(timer);
      return data;
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  return new Promise(function (resolve, reject) {
    if (typeof XMLHttpRequest === "undefined") {
      reject(new Error("Môi trường không hỗ trợ fetch hoặc XMLHttpRequest."));
      return;
    }
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.timeout = timeoutMs;
    request.onload = function () {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText));
        } catch (parseError) {
          reject(new Error("Không thể phân tích dữ liệu JSON từ API."));
        }
      } else {
        reject(new Error("API trả về mã lỗi HTTP " + request.status));
      }
    };
    request.onerror = function () {
      reject(new Error("Lỗi kết nối mạng khi tải dữ liệu từ API."));
    };
    request.ontimeout = function () {
      reject(new Error("Yêu cầu API đã hết thời gian chờ (timeout)."));
    };
    request.send();
  });
}

function parseStandardEpisodeServers(episodesArray, sourcePrefix = "KKPhim") {
  if (!Array.isArray(episodesArray)) return [];
  const servers = [];
  for (let i = 0; i < episodesArray.length; i++) {
    const srv = episodesArray[i];
    if (!srv || typeof srv !== "object") continue;
    const rawName = (srv.server_name || "Server " + (i + 1)).replace(/\s+/g, " ").trim();
    const serverName = (sourcePrefix && !rawName.toLowerCase().includes(sourcePrefix.toLowerCase()))
      ? sourcePrefix + " · " + rawName
      : rawName;
    const dataItems = Array.isArray(srv.server_data) ? srv.server_data : (Array.isArray(srv.items) ? srv.items : []);
    const parsedData = [];
    for (let j = 0; j < dataItems.length; j++) {
      const ep = dataItems[j];
      if (!ep || typeof ep !== "object") continue;
      const name = ep.name || "Tập " + (j + 1);
      const slug = ep.slug || String(j);
      const rawM3u8 = (ep.link_m3u8 || ep.m3u8 || "").trim();
      const rawEmbed = (ep.link_embed || ep.embed || "").trim();
      const directM3u8 = rawM3u8 || extractDirectM3u8(rawEmbed);
      if (directM3u8 || rawEmbed) {
        parsedData.push({
          name: name,
          slug: slug,
          filename: ep.filename || name,
          link_m3u8: directM3u8 || rawEmbed,
          link_embed: rawEmbed
        });
      }
    }
    if (parsedData.length > 0) {
      servers.push({
        server_name: serverName,
        server_data: parsedData
      });
    }
  }
  return servers;
}

function parseNguoncEpisodeServers(episodesArray, sourcePrefix = "NguonC") {
  if (!Array.isArray(episodesArray)) return [];
  const servers = [];
  for (let i = 0; i < episodesArray.length; i++) {
    const srv = episodesArray[i];
    if (!srv || typeof srv !== "object") continue;
    const rawName = (srv.server_name || "Server " + (i + 1)).replace(/\s+/g, " ").trim();
    const serverName = (sourcePrefix && !rawName.toLowerCase().includes(sourcePrefix.toLowerCase()))
      ? sourcePrefix + " · " + rawName
      : rawName;
    const items = Array.isArray(srv.items) ? srv.items : (Array.isArray(srv.server_data) ? srv.server_data : []);
    const parsedData = [];
    for (let j = 0; j < items.length; j++) {
      const ep = items[j];
      if (!ep || typeof ep !== "object") continue;
      const name = ep.name || "Tập " + (j + 1);
      const slug = ep.slug || String(j);
      const m3u8 = (ep.m3u8 || ep.link_m3u8 || "").trim();
      const embed = (ep.embed || ep.link_embed || "").trim();
      const stream = m3u8 || extractDirectM3u8(embed) || embed;
      if (stream) {
        parsedData.push({
          name: name,
          slug: slug,
          filename: ep.filename || name,
          link_m3u8: stream,
          link_embed: embed
        });
      }
    }
    if (parsedData.length > 0) {
      servers.push({
        server_name: serverName,
        server_data: parsedData
      });
    }
  }
  return servers;
}

export function createKkphimApi() {
  const searchCache = new Map();
  const detailCache = new Map();

  function pruneCaches() {
    const now = Date.now();
    for (const [k, v] of searchCache.entries()) {
      if (now - v.timestamp > SEARCH_CACHE_TTL_MS) searchCache.delete(k);
    }
    for (const [k, v] of detailCache.entries()) {
      if (now - v.timestamp > DETAIL_CACHE_TTL_MS) detailCache.delete(k);
    }
  }

  return {
    getCachedMovieDetail(slug) {
      if (!slug) return null;
      const cached = detailCache.get(slug.toLowerCase().trim());
      if (cached && (Date.now() - cached.timestamp < DETAIL_CACHE_TTL_MS)) {
        return cached.result;
      }
      return null;
    },

    getCachedSearch(keyword, page = 1) {
      if (!keyword) return null;
      const cacheKey = keyword.toLowerCase().trim() + ":" + page;
      const cached = searchCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS)) {
        return cached.result;
      }
      return null;
    },

    clearCache() {
      searchCache.clear();
      detailCache.clear();
    },

    getHome() {
      return fetchJson(BASE_URL + "/v1/api/home").then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          title: "Trending / Nổi bật"
        };
      });
    },

    getTrending(page) {
      const pageNum = page && page > 0 ? page : 1;
      if (pageNum === 1) {
        return this.getHome();
      }
      const category = (pageNum % 2 === 0) ? "phim-bo" : "phim-le";
      return fetchJson(BASE_URL + "/v1/api/danh-sach/" + category + "?page=" + Math.floor(pageNum / 2 + 1)).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          title: "Trending / Nổi bật"
        };
      });
    },

    getNewUpdated(page) {
      const pageNum = page && page > 0 ? page : 1;
      return fetchJson(BASE_URL + "/v1/api/danh-sach/phim-moi-cap-nhat?page=" + pageNum).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          pagination: data.params ? data.params.pagination : null,
          title: "Phim mới cập nhật"
        };
      });
    },

    getMoviesByCategory(categorySlug, page, limit) {
      const slug = (categorySlug || "phim-bo").trim();
      const pageNum = page && page > 0 ? page : 1;
      const limitNum = limit && limit > 0 ? limit : 24;
      const url = BASE_URL + "/v1/api/danh-sach/" + encodeURIComponent(slug) + "?page=" + pageNum + "&limit=" + limitNum;
      return fetchJson(url).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          pagination: data.params ? data.params.pagination : null,
          title: data.titlePage || "Danh sách phim"
        };
      });
    },

    getMoviesByGenre(genreSlug, page, limit) {
      const slug = (genreSlug || "hanh-dong").trim();
      const pageNum = page && page > 0 ? page : 1;
      const limitNum = limit && limit > 0 ? limit : 24;
      const url = BASE_URL + "/v1/api/the-loai/" + encodeURIComponent(slug) + "?page=" + pageNum + "&limit=" + limitNum;
      return fetchJson(url).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn, "KKPhim");
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          pagination: data.params ? data.params.pagination : null,
          title: data.titlePage || "Thể loại phim"
        };
      });
    },

    /**
     * Dedicated VSMov / Phim4K API Search (from https://vsmov.com/api-document)
     */
    searchVsmov(keyword, limit = 20, page = 1) {
      const kw = (keyword || "").trim();
      if (!kw) return Promise.resolve([]);
      const url = VSMOV_BASE_URL + "/tim-kiem?keyword=" + encodeURIComponent(kw) + "&limit=" + limit + "&page=" + page;
      return fetchJson(url, BACKUP_TIMEOUT_MS).then(function (res) {
        const items = Array.isArray(res && res.items) ? res.items : (res && res.data && Array.isArray(res.data.items) ? res.data.items : []);
        const cdn = (res && res.pathImage) ? res.pathImage : VSMOV_CDN;
        return items.map(function (item) {
          return normalizeMovie(item, cdn, "Phim4K");
        }).filter(Boolean);
      }).catch(function () {
        return [];
      });
    },

    /**
     * High-Performance Multi-Source Search combining KKPhim, VSMov (Phim4K) and NguonC
     * with In-Memory Caching and fast non-blocking parallel resolution.
     */
    searchMovies(keyword, limit = 20, page = 1) {
      const kw = (keyword || "").trim();
      if (!kw) {
        return Promise.resolve({ movies: [], keyword: "", total: 0 });
      }
      pruneCaches();
      const cacheKey = kw.toLowerCase() + ":" + page + ":" + limit;
      const cached = searchCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS)) {
        return Promise.resolve(cached.result);
      }

      const limitNum = limit > 0 ? limit : 20;
      const pageNum = page > 0 ? page : 1;
      const encoded = encodeURIComponent(kw);

      const kkphimPromise = fetchJson(BASE_URL + "/v1/api/tim-kiem?keyword=" + encoded + "&limit=" + limitNum + "&page=" + pageNum, DEFAULT_TIMEOUT_MS)
        .catch(function () { return null; });

      const vsmovPromise = fetchJson(VSMOV_BASE_URL + "/tim-kiem?keyword=" + encoded + "&limit=" + limitNum + "&page=" + pageNum, BACKUP_TIMEOUT_MS)
        .catch(function () { return null; });

      const nguoncPromise = fetchJson(NGUONC_BASE_URL + "/api/films/search?keyword=" + encoded + "&page=" + pageNum, BACKUP_TIMEOUT_MS)
        .catch(function () { return null; });

      return Promise.all([kkphimPromise, vsmovPromise, nguoncPromise]).then(function ([kkRes, vsmovRes, nguoncRes]) {
        const kkData = kkRes && kkRes.data ? kkRes.data : {};
        const kkCdn = kkData.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const kkItems = Array.isArray(kkData.items) ? kkData.items : [];
        const kkMovies = kkItems.map(function (item) {
          return normalizeMovie(item, kkCdn, "KKPhim");
        }).filter(Boolean);

        const vsmovItems = vsmovRes && Array.isArray(vsmovRes.items) ? vsmovRes.items : (vsmovRes && vsmovRes.data && Array.isArray(vsmovRes.data.items) ? vsmovRes.data.items : []);
        const vsmovCdn = (vsmovRes && vsmovRes.pathImage) ? vsmovRes.pathImage : VSMOV_CDN;
        const vsmovMovies = vsmovItems.map(function (item) {
          return normalizeMovie(item, vsmovCdn, "Phim4K");
        }).filter(Boolean);

        const nguoncItems = nguoncRes && Array.isArray(nguoncRes.items) ? nguoncRes.items : [];
        const nguoncMovies = nguoncItems.map(function (item) {
          return normalizeMovie(item, NGUONC_BASE_URL, "NguonC");
        }).filter(Boolean);

        // Merge & deduplicate by slug / title
        const merged = [];
        const seen = new Set();
        for (const m of [...kkMovies, ...vsmovMovies, ...nguoncMovies]) {
          const key = (m.slug || m.title).toLowerCase().trim();
          if (key && !seen.has(key)) {
            seen.add(key);
            merged.push(m);
          }
        }

        const total = (kkData.params && kkData.params.pagination ? kkData.params.pagination.totalItems : merged.length) || merged.length;
        const result = {
          movies: merged,
          cdn: kkCdn,
          keyword: kw,
          total: Math.max(total, merged.length)
        };

        searchCache.set(cacheKey, { timestamp: Date.now(), result: result });
        return result;
      });
    },

    /**
     * Dedicated VSMov / Phim4K Detail Fetch (from https://vsmov.com/api-document)
     */
    getVsmovDetail(slug) {
      const cleanSlug = (slug || "").trim();
      if (!cleanSlug) return Promise.reject(new Error("Slug phim không hợp lệ."));
      return fetchJson(VSMOV_BASE_URL + "/phim/" + encodeURIComponent(cleanSlug), BACKUP_TIMEOUT_MS).then(function (res) {
        if (!res || !res.status || !res.movie) {
          throw new Error("Không tìm thấy thông tin phim trên VSMov.");
        }
        const movie = res.movie;
        const normalized = normalizeMovie(movie, res.pathImage || VSMOV_CDN, "Phim4K");
        normalized.content = movie.content || movie.description || "";
        normalized.actors = Array.isArray(movie.actor) ? movie.actor : [];
        normalized.categories = Array.isArray(movie.category) ? movie.category.map(function (c) { return c.name || c; }) : [];
        normalized.countries = Array.isArray(movie.country) ? movie.country.map(function (c) { return c.name || c; }) : [];
        normalized.episodeTotal = movie.episode_total || "";
        normalized.status = movie.status || "";

        const episodes = parseStandardEpisodeServers(res.episodes, "Phim4K");
        return {
          movie: normalized,
          episodes: episodes
        };
      });
    },

    /**
     * High-Speed Multi-Source Movie Detail Fetch:
     * Races and aggregates KKPhim, VSMov (Phim4K) and NguonC servers with In-Memory Caching (15m TTL).
     */
    getMovieDetail(slug) {
      const cleanSlug = (slug || "").trim();
      if (!cleanSlug) {
        return Promise.reject(new Error("Slug phim không hợp lệ."));
      }
      pruneCaches();
      const cached = detailCache.get(cleanSlug.toLowerCase());
      if (cached && (Date.now() - cached.timestamp < DETAIL_CACHE_TTL_MS)) {
        return Promise.resolve(cached.result);
      }

      const encoded = encodeURIComponent(cleanSlug);

      const kkphimPromise = fetchJson(BASE_URL + "/phim/" + encoded, DEFAULT_TIMEOUT_MS)
        .catch(function () { return null; });

      const vsmovPromise = fetchJson(VSMOV_BASE_URL + "/phim/" + encoded, BACKUP_TIMEOUT_MS)
        .catch(function () { return null; });

      const nguoncPromise = fetchJson(NGUONC_BASE_URL + "/api/film/" + encoded, BACKUP_TIMEOUT_MS)
        .catch(function () { return null; });

      return Promise.all([kkphimPromise, vsmovPromise, nguoncPromise]).then(function ([kkRes, vsmovRes, nguoncRes]) {
        const primaryRes = (kkRes && kkRes.movie) ? kkRes : (vsmovRes && vsmovRes.movie ? vsmovRes : nguoncRes);
        if (!primaryRes || !primaryRes.movie) {
          throw new Error("Không tìm thấy thông tin chi tiết phim từ bất kỳ máy chủ nào.");
        }

        const rawMovie = primaryRes.movie;
        const cdn = (kkRes && kkRes.movie) ? DEFAULT_CDN : ((vsmovRes && vsmovRes.movie) ? (vsmovRes.pathImage || VSMOV_CDN) : NGUONC_BASE_URL);
        const sourceName = (kkRes && kkRes.movie) ? "KKPhim" : ((vsmovRes && vsmovRes.movie) ? "Phim4K" : "NguonC");

        const normalized = normalizeMovie(rawMovie, cdn, sourceName);
        normalized.content = rawMovie.content || rawMovie.description || "";
        normalized.actors = Array.isArray(rawMovie.actor) ? rawMovie.actor : (typeof rawMovie.casts === "string" ? rawMovie.casts.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : []);
        normalized.categories = Array.isArray(rawMovie.category) ? rawMovie.category.map(function (c) { return c.name || c; }) : [];
        normalized.countries = Array.isArray(rawMovie.country) ? rawMovie.country.map(function (c) { return c.name || c; }) : [];
        normalized.episodeTotal = rawMovie.episode_total || rawMovie.total_episodes || "";
        normalized.status = rawMovie.status || "";

        // Combine servers from all working providers
        const allServers = [];
        const seenStreams = new Set();

        function addServerList(serverList) {
          for (let s = 0; s < serverList.length; s++) {
            const srv = serverList[s];
            if (!srv || !srv.server_data || srv.server_data.length === 0) continue;
            const firstStream = (srv.server_data[0].link_m3u8 || "").trim();
            if (firstStream && seenStreams.has(firstStream)) continue;
            if (firstStream) seenStreams.add(firstStream);
            allServers.push(srv);
          }
        }

        if (kkRes && Array.isArray(kkRes.episodes)) {
          addServerList(parseStandardEpisodeServers(kkRes.episodes, "KKPhim"));
        }
        if (vsmovRes && Array.isArray(vsmovRes.episodes)) {
          addServerList(parseStandardEpisodeServers(vsmovRes.episodes, "Phim4K"));
        }
        if (nguoncRes) {
          const nguoncEps = (nguoncRes.movie && Array.isArray(nguoncRes.movie.episodes)) ? nguoncRes.movie.episodes : (Array.isArray(nguoncRes.episodes) ? nguoncRes.episodes : []);
          addServerList(parseNguoncEpisodeServers(nguoncEps, "NguonC"));
        }

        const result = {
          movie: normalized,
          episodes: allServers
        };

        detailCache.set(cleanSlug.toLowerCase(), { timestamp: Date.now(), result: result });
        return result;
      });
    }
  };
}
