import { fallbackPoster } from "../config/catalog-sources.js";

const BASE_URL = "https://phimapi.com";
const DEFAULT_CDN = "https://phimimg.com";
const REQUEST_TIMEOUT_MS = 12000;

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

export function normalizeMovie(item, cdnDomain) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const slug = item.slug || (item._id ? String(item._id) : "");
  const title = item.name || item.title || item.origin_name || "Phim không tên";
  const poster = buildImageUrl(item.poster_url || item.thumb_url, cdnDomain);
  const thumb = buildImageUrl(item.thumb_url || item.poster_url, cdnDomain);
  const year = item.year ? String(item.year) : "";
  const quality = item.quality || "";
  const lang = item.lang || "";
  const episodeCurrent = item.episode_current || "";
  const time = item.time || "";
  const type = item.type || "";

  return {
    id: slug,
    slug: slug,
    title: title,
    originTitle: item.origin_name || "",
    poster: poster,
    thumb: thumb,
    year: year,
    quality: quality,
    lang: lang,
    episodeCurrent: episodeCurrent,
    time: time,
    type: type,
    source: "KKPhim",
    playbackEnabled: true
  };
}

function fetchJson(url) {
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
          controller.abort();
        }
        reject(new Error("Yêu cầu API đã hết thời gian chờ (timeout)."));
      }, REQUEST_TIMEOUT_MS);
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
    request.timeout = REQUEST_TIMEOUT_MS;
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
      reject(new Error("Lỗi kết nối mạng khi tải dữ liệu từ KKPhim API."));
    };
    request.ontimeout = function () {
      reject(new Error("Yêu cầu API đã hết thời gian chờ (timeout)."));
    };
    request.send();
  });
}

export function createKkphimApi() {
  return {
    getHome() {
      return fetchJson(BASE_URL + "/v1/api/home").then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn);
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
          return normalizeMovie(item, cdn);
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
          return normalizeMovie(item, cdn);
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
          return normalizeMovie(item, cdn);
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
          return normalizeMovie(item, cdn);
        }).filter(Boolean);
        return {
          movies: movies,
          cdn: cdn,
          pagination: data.params ? data.params.pagination : null,
          title: data.titlePage || "Thể loại phim"
        };
      });
    },

    searchMovies(keyword, limit, page) {
      const kw = (keyword || "").trim();
      if (!kw) {
        return Promise.resolve({ movies: [], keyword: "", total: 0 });
      }
      const limitNum = limit && limit > 0 ? limit : 20;
      const pageNum = page && page > 0 ? page : 1;
      const url = BASE_URL + "/v1/api/tim-kiem?keyword=" + encodeURIComponent(kw) + "&limit=" + limitNum + "&page=" + pageNum;
      return fetchJson(url).then(function (res) {
        const data = res && res.data ? res.data : {};
        const cdn = data.APP_DOMAIN_CDN_IMAGE || DEFAULT_CDN;
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const movies = rawItems.map(function (item) {
          return normalizeMovie(item, cdn);
        }).filter(Boolean);
        const total = data.params && data.params.pagination ? data.params.pagination.totalItems : movies.length;
        return {
          movies: movies,
          cdn: cdn,
          keyword: kw,
          total: total
        };
      });
    },

    getMovieDetail(slug) {
      const cleanSlug = (slug || "").trim();
      if (!cleanSlug) {
        return Promise.reject(new Error("Slug phim không hợp lệ."));
      }
      const url = BASE_URL + "/phim/" + encodeURIComponent(cleanSlug);
      return fetchJson(url).then(function (res) {
        if (!res || (!res.status && res.status !== "success") || !res.movie) {
          throw new Error("Không tìm thấy thông tin phim.");
        }
        const movie = res.movie;
        const episodes = Array.isArray(res.episodes) ? res.episodes : [];
        const cdn = DEFAULT_CDN;
        const normalized = normalizeMovie(movie, cdn);
        normalized.content = movie.content || "";
        normalized.actors = Array.isArray(movie.actor) ? movie.actor : [];
        normalized.categories = Array.isArray(movie.category) ? movie.category.map(function (c) { return c.name || c; }) : [];
        normalized.countries = Array.isArray(movie.country) ? movie.country.map(function (c) { return c.name || c; }) : [];
        normalized.episodeTotal = movie.episode_total || "";
        normalized.status = movie.status || "";

        return {
          movie: normalized,
          episodes: episodes
        };
      });
    }
  };
}
