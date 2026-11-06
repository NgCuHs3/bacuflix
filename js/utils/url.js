export function parseRoute(search, hash) {
  let movieSlug = null;
  let ep = null;

  if (search) {
    try {
      const params = new URLSearchParams(search);
      if (params.has("movie")) {
        movieSlug = params.get("movie");
      }
      if (params.has("ep")) {
        ep = params.get("ep");
      }
    } catch (_) {}
  }

  if (!movieSlug && hash) {
    const cleanHash = hash.replace(/^[#/]+/, "");
    if (cleanHash.includes("movie=")) {
      try {
        const queryStr = cleanHash.includes("?") ? cleanHash.split("?")[1] : cleanHash;
        const hashParams = new URLSearchParams(queryStr);
        if (hashParams.has("movie")) {
          movieSlug = hashParams.get("movie");
        }
        if (hashParams.has("ep")) {
          ep = hashParams.get("ep");
        }
      } catch (_) {}
    } else {
      const parts = cleanHash.split("/");
      const movieIdx = parts.indexOf("movie");
      if (movieIdx !== -1 && parts[movieIdx + 1]) {
        movieSlug = parts[movieIdx + 1];
        const epIdx = parts.indexOf("ep");
        if (epIdx !== -1 && parts[epIdx + 1]) {
          ep = parts[epIdx + 1];
        }
      }
    }
  }

  return {
    movieSlug: movieSlug ? decodeURIComponent(movieSlug).trim() : null,
    ep: ep ? decodeURIComponent(ep).trim() : null
  };
}

function getDeviceQueryPrefix(sep) {
  if (typeof window === "undefined" || !window.location || !window.location.search) {
    return "";
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const dev = (params.get("device") || "").toLowerCase().trim();
    if (dev === "tv" || dev === "mobile" || dev === "desktop") {
      return (sep || "?") + "device=" + encodeURIComponent(dev);
    }
  } catch (_) {}
  return "";
}

export function buildMovieUrl(slug) {
  const base = (typeof window !== "undefined" && window.location) ?
    (window.location.origin + window.location.pathname) : "";
  const devParam = getDeviceQueryPrefix("&");
  return base + "?movie=" + encodeURIComponent(slug) + devParam;
}

export function buildEpisodeUrl(slug, ep) {
  const base = (typeof window !== "undefined" && window.location) ?
    (window.location.origin + window.location.pathname) : "";
  const devParam = getDeviceQueryPrefix("&");
  return base + "?movie=" + encodeURIComponent(slug) + "&ep=" + encodeURIComponent(ep) + devParam;
}

export function buildHomeUrl() {
  const base = (typeof window !== "undefined" && window.location) ?
    (window.location.origin + window.location.pathname) : "";
  return base + getDeviceQueryPrefix("?");
}

export function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text).then(function () {
      return true;
    }).catch(function () {
      return fallbackCopy(text);
    });
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  if (typeof document === "undefined") {
    return false;
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return Boolean(successful);
  } catch (_) {
    return false;
  }
}
