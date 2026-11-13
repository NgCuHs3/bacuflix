export const PROXY_API_BASE_URL = "https://bacuflix-proxy.vercel.app";
export const ORIGINAL_API_BASE_URL = "https://phimapi.com";
export const DEFAULT_API_BASE_URL = PROXY_API_BASE_URL;
export const DEFAULT_CDN_URL = "https://phimimg.com";

let currentApiBaseUrl = "";
let currentProxyStreaming = null;

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
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem("bacuflix_api_base_url");
      } catch (_) {}
    }
    return;
  }
  const clean = url.trim().replace(/\/+$/, "");
  currentApiBaseUrl = clean;
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
