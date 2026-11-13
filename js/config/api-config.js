export const ORIGINAL_API_BASE_URL = "https://phimapi.com";
export const PROXY_API_BASE_URL = "https://bacuflix-proxy.vercel.app";
export const DEFAULT_API_BASE_URL = ORIGINAL_API_BASE_URL;
export const DEFAULT_CDN_URL = "https://phimimg.com";

let currentApiBaseUrl = "";
let currentProxyStreaming = null;
let activeDetectionPromise = null;

export function pingApiServer(url = ORIGINAL_API_BASE_URL, timeoutMs = 2000) {
  const fetchFn = (typeof window !== "undefined" && typeof window.fetch === "function")
    ? window.fetch.bind(window)
    : (typeof fetch === "function" ? fetch : null);

  if (!fetchFn) {
    return Promise.resolve(false);
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer = 0;
  const target = (url || ORIGINAL_API_BASE_URL).replace(/\/+$/, "");
  const pingReq = fetchFn(target + "/v1/api/home", {
    method: "GET",
    signal: controller ? controller.signal : undefined
  }).then(function (res) {
    return Boolean(res && res.ok);
  }).catch(function () {
    return false;
  });

  const timeoutReq = new Promise(function (resolve) {
    timer = setTimeout(function () {
      if (controller) {
        try { controller.abort(); } catch (_) {}
      }
      resolve(false);
    }, timeoutMs);
  });

  return Promise.race([pingReq, timeoutReq]).then(function (result) {
    clearTimeout(timer);
    return Boolean(result);
  });
}

export function detectBestApiBaseUrl(timeoutMs = 2000) {
  if (activeDetectionPromise) {
    return activeDetectionPromise;
  }

  activeDetectionPromise = (async function () {
    // 1. If explicitly configured by user via query param or localStorage, respect it
    if (typeof window !== "undefined") {
      if (window.location && window.location.search) {
        try {
          const params = new URLSearchParams(window.location.search);
          const q = params.get("proxy") || params.get("api");
          if (q && (q.startsWith("http://") || q.startsWith("https://"))) {
            const url = q.replace(/\/+$/, "");
            setApiBaseUrl(url);
            return url;
          }
        } catch (_) {}
      }
      if (window.BACUFLIX_CONFIG && typeof window.BACUFLIX_CONFIG.API_BASE_URL === "string" && window.BACUFLIX_CONFIG.API_BASE_URL.trim()) {
        const url = window.BACUFLIX_CONFIG.API_BASE_URL.trim().replace(/\/+$/, "");
        setApiBaseUrl(url);
        return url;
      }
      if (window.localStorage) {
        try {
          const stored = window.localStorage.getItem("bacuflix_api_base_url");
          if (stored && stored.trim()) {
            const url = stored.trim().replace(/\/+$/, "");
            setApiBaseUrl(url);
            return url;
          }
        } catch (_) {}
      }
    }

    // 2. Ping original movie server (phimapi.com) first
    const isOriginalReachable = await pingApiServer(ORIGINAL_API_BASE_URL, timeoutMs);
    if (isOriginalReachable) {
      setApiBaseUrl(ORIGINAL_API_BASE_URL);
      return ORIGINAL_API_BASE_URL;
    }

    // 3. Fallback to proxy server if original server is unreachable or DNS blocked
    setApiBaseUrl(PROXY_API_BASE_URL);
    return PROXY_API_BASE_URL;
  })();

  return activeDetectionPromise;
}

// Automatically trigger server ping and best URL detection in browser on startup
if (typeof window !== "undefined") {
  try {
    detectBestApiBaseUrl();
  } catch (_) {}
}

export function getApiBaseUrl() {
  if (currentApiBaseUrl) {
    return currentApiBaseUrl;
  }

  // 1. Check window.location query parameter (?proxy=... or ?api=...)
  if (typeof window !== "undefined" && window.location && window.location.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryProxy = params.get("proxy") || params.get("api");
      if (queryProxy && (queryProxy.startsWith("http://") || queryProxy.startsWith("https://"))) {
        return queryProxy.replace(/\/+$/, "");
      }
    } catch (_) {}
  }

  // 2. Check window.BACUFLIX_CONFIG or window.BACUFLIX_API_BASE_URL
  if (typeof window !== "undefined") {
    if (window.BACUFLIX_CONFIG && typeof window.BACUFLIX_CONFIG.API_BASE_URL === "string") {
      const configured = window.BACUFLIX_CONFIG.API_BASE_URL.trim();
      if (configured) {
        return configured.replace(/\/+$/, "");
      }
    }
    if (typeof window.BACUFLIX_API_BASE_URL === "string" && window.BACUFLIX_API_BASE_URL.trim()) {
      return window.BACUFLIX_API_BASE_URL.trim().replace(/\/+$/, "");
    }
  }

  // 3. Check localStorage
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = window.localStorage.getItem("bacuflix_api_base_url") ||
        window.localStorage.getItem("bacuflix_proxy_url");
      if (stored && typeof stored === "string" && stored.trim()) {
        return stored.trim().replace(/\/+$/, "");
      }
    } catch (_) {}
  }

  // 4. Check Node process.env in test/server environments
  if (typeof process !== "undefined" && process.env) {
    const envUrl = process.env.BACUFLIX_API_BASE_URL || process.env.BACUFLIX_PROXY_URL;
    if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
      return envUrl.trim().replace(/\/+$/, "");
    }
  }

  return DEFAULT_API_BASE_URL;
}

export function setApiBaseUrl(url) {
  if (!url || typeof url !== "string") {
    currentApiBaseUrl = "";
    activeDetectionPromise = null;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem("bacuflix_api_base_url");
      } catch (_) {}
    }
    return;
  }
  const clean = url.trim().replace(/\/+$/, "");
  currentApiBaseUrl = clean;
  activeDetectionPromise = Promise.resolve(clean);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem("bacuflix_api_base_url", clean);
    } catch (_) {}
  }
}

export function isProxyStreamingEnabled() {
  if (typeof currentProxyStreaming === "boolean") {
    return currentProxyStreaming;
  }

  // If using the proxy base URL (or any custom proxy), streaming proxy is enabled
  const activeBaseUrl = getApiBaseUrl();
  if (activeBaseUrl !== ORIGINAL_API_BASE_URL) {
    return true;
  }

  if (typeof window !== "undefined") {
    if (window.BACUFLIX_CONFIG && typeof window.BACUFLIX_CONFIG.PROXY_STREAMING === "boolean") {
      return window.BACUFLIX_CONFIG.PROXY_STREAMING;
    }
    if (window.localStorage) {
      try {
        const stored = window.localStorage.getItem("bacuflix_proxy_streaming");
        if (stored === "true") return true;
        if (stored === "false") return false;
      } catch (_) {}
    }
  }

  return false;
}

export function setProxyStreamingEnabled(enabled) {
  currentProxyStreaming = Boolean(enabled);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem("bacuflix_proxy_streaming", String(Boolean(enabled)));
    } catch (_) {}
  }
}

export const DOMESTIC_STREAM_HOSTS = [
  "phim1280.tv",
  "kvp726.com",
  "kkphimplayer6.com",
  "apiaz.xyz",
  "abfedgecanme.com",
  "streamc.xyz",
  "streamvsmov.com",
  "vsmov.com",
  "opstream.com",
  "opstream1.com",
  "opstream2.com",
  "opstream3.com",
  "bytefury.top"
];

export function isDomesticStream(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return DOMESTIC_STREAM_HOSTS.some(d => host === d || host.endsWith("." + d));
  } catch (_) {
    const lower = url.toLowerCase();
    return DOMESTIC_STREAM_HOSTS.some(d => lower.includes(d));
  }
}

export function resolveStreamUrl(streamUrl) {
  if (!streamUrl || typeof streamUrl !== "string") {
    return "";
  }
  const clean = streamUrl.trim();
  if (!clean) {
    return "";
  }

  // Domestic stream CDNs (phim1280.tv, kvp726.com, streamc.xyz, etc.) enforce strict IP geo-blocking
  // and require direct connection from domestic devices. Routing them through international cloud proxies
  // (like Vercel in the US) breaks playback with 404 errors. They already have CORS enabled.
  if (isDomesticStream(clean)) {
    return clean;
  }

  // If not enabled or already a proxied URL, return as-is
  if (!isProxyStreamingEnabled() || clean.includes("/api/proxy?url=")) {
    return clean;
  }

  // Only proxy external HTTP/HTTPS streams
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    const proxyBase = getApiBaseUrl().replace(/\/+$/, "");
    return proxyBase + "/api/proxy?url=" + encodeURIComponent(clean);
  }

  return clean;
}

export function resolveSubtitleUrl(subtitleUrl) {
  if (!subtitleUrl || typeof subtitleUrl !== "string") {
    return "";
  }
  const clean = subtitleUrl.trim();
  if (!clean) {
    return "";
  }

  if (!isProxyStreamingEnabled() || clean.includes("/api/proxy?url=")) {
    return clean;
  }

  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    const proxyBase = getApiBaseUrl().replace(/\/+$/, "");
    return proxyBase + "/api/proxy?url=" + encodeURIComponent(clean);
  }

  return clean;
}
