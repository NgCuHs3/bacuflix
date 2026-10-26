import { catalogSources, fallbackPoster } from "../config/catalog-sources.js";
import { parseMovieMarkdown } from "../data/movie-markdown-parser.js";

const CACHE_KEY = "bacuflix.movie-catalog.v1";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;

function readCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn("Unable to read the movie catalog cache:", error.message);
    return {};
  }
}

function writeCache(cache) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("Unable to save the movie catalog cache:", error.message);
  }
}

function errorMessage(error) {
  return error && error.message ? error.message : "Catalog request failed.";
}

function fetchText(url, forceRefresh) {
  if (typeof window.fetch === "function") {
    const controller = typeof window.AbortController === "function" ? new window.AbortController() : null;
    const options = controller ? { signal: controller.signal } : {};
    if (forceRefresh) {
      options.cache = "no-cache";
    }
    let timer = 0;
    const request = window.fetch(url, options).then(function (response) {
      if (!response.ok) {
        throw new Error("Catalog request returned HTTP " + response.status + ".");
      }
      return response.text();
    });
    const timeout = new Promise(function (_resolve, reject) {
      timer = window.setTimeout(function () {
        if (controller) {
          controller.abort();
        }
        reject(new Error("Catalog request timed out."));
      }, REQUEST_TIMEOUT_MS);
    });
    return Promise.race([request, timeout]).then(function (text) {
      window.clearTimeout(timer);
      return text;
    }, function (error) {
      window.clearTimeout(timer);
      throw error;
    });
  }

  return new Promise(function (resolve, reject) {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.timeout = REQUEST_TIMEOUT_MS;
    request.onload = function () {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.responseText);
      } else {
        reject(new Error("Catalog request returned HTTP " + request.status + "."));
      }
    };
    request.onerror = function () {
      reject(new Error("Network error while loading the movie catalog."));
    };
    request.ontimeout = function () {
      reject(new Error("Catalog request timed out."));
    };
    request.send();
  });
}

function mergeMovies(sourceResults) {
  const seen = Object.create(null);
  const movies = [];
  sourceResults.forEach(function (result) {
    result.movies.forEach(function (movie) {
      if (!seen[movie.m3u8]) {
        seen[movie.m3u8] = true;
        movies.push(movie);
      }
    });
  });
  return movies;
}

export function createCatalogService(sources) {
  const configuredSources = (sources || catalogSources).slice();
  let inFlight = null;
  let lastResult = null;

  try {
    const cached = readCache();
    const initialResults = configuredSources.map(function (source) {
      const saved = cached[source.id] && cached[source.id].url === source.url ? cached[source.id] : null;
      if (saved && typeof saved.markdown === "string") {
        const parsed = parseMovieMarkdown(saved.markdown, {
          catalogSourceId: source.id,
          fallbackPoster: fallbackPoster,
          playbackEnabled: source.playbackEnabled
        });
        return { movies: parsed.movies, diagnostics: parsed.diagnostics, cached: true };
      }
      return { movies: [], diagnostics: [], cached: false };
    });
    const initialMovies = mergeMovies(initialResults);
    if (initialMovies.length) {
      lastResult = {
        movies: initialMovies,
        errors: [],
        diagnostics: [],
        failedAll: false,
        cached: true
      };
    }
  } catch (error) {
    // Ignore cache bootstrap errors
  }

  return {
    getLastResult() {
      return lastResult;
    },
    load(forceRefresh) {
      if (inFlight) {
        return inFlight;
      }

      const cached = readCache();
      const now = Date.now();
      const requests = configuredSources.map(function (source) {
        const saved = cached[source.id] && cached[source.id].url === source.url ?
          cached[source.id] : null;
        if (!forceRefresh && saved && now - saved.savedAt < CACHE_TTL_MS) {
          const parsed = parseMovieMarkdown(saved.markdown, {
            catalogSourceId: source.id,
            fallbackPoster: fallbackPoster,
            playbackEnabled: source.playbackEnabled
          });
          return Promise.resolve({
            movies: parsed.movies,
            diagnostics: parsed.diagnostics,
            cached: true
          });
        }

        return fetchText(source.url, forceRefresh).then(function (markdown) {
          const parsed = parseMovieMarkdown(markdown, {
            catalogSourceId: source.id,
            fallbackPoster: fallbackPoster,
            playbackEnabled: source.playbackEnabled
          });
          if (!parsed.movies.length) {
            return {
              movies: [],
              diagnostics: parsed.diagnostics,
              cached: false,
              error: "Catalog contains no valid movie entries."
            };
          }
          cached[source.id] = { url: source.url, markdown: markdown, savedAt: Date.now() };
          return {
            movies: parsed.movies,
            diagnostics: parsed.diagnostics,
            cached: false
          };
        }).catch(function (error) {
          const stale = cached[source.id];
          if (stale) {
            const parsedStale = parseMovieMarkdown(stale.markdown, {
              catalogSourceId: source.id,
              fallbackPoster: fallbackPoster,
              playbackEnabled: source.playbackEnabled
            });
            return {
              movies: parsedStale.movies,
              diagnostics: parsedStale.diagnostics,
              cached: true,
              error: errorMessage(error)
            };
          }
          return {
            movies: [],
            diagnostics: [],
            cached: false,
            error: errorMessage(error)
          };
        });
      });

      const operation = Promise.all(requests).then(function (results) {
        writeCache(cached);
        const errors = [];
        const diagnostics = [];
        results.forEach(function (result, index) {
          if (result.error) {
            errors.push({ sourceId: configuredSources[index].id, message: result.error });
          }
          result.diagnostics.forEach(function (diagnostic) {
            diagnostics.push({
              sourceId: configuredSources[index].id,
              entry: diagnostic.entry,
              message: diagnostic.message
            });
          });
        });
        const movies = mergeMovies(results);
        lastResult = {
          movies: movies,
          errors: errors,
          diagnostics: diagnostics,
          failedAll: movies.length === 0 && errors.length > 0,
          cached: results.every(function (result) { return result.cached; })
        };
        return lastResult;
      });
      inFlight = operation.then(function (result) {
        inFlight = null;
        return result;
      }, function (error) {
        inFlight = null;
        throw error;
      });
      return inFlight;
    }
  };
}
