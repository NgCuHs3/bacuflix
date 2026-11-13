import assert from "node:assert/strict";

// Mock localStorage for Node test environment
const mockStore = new Map();
global.window = {
  localStorage: {
    getItem(k) { return mockStore.get(k) || null; },
    setItem(k, v) { mockStore.set(k, String(v)); },
    removeItem(k) { mockStore.delete(k); }
  }
};

import {
  DEFAULT_API_BASE_URL,
  ORIGINAL_API_BASE_URL,
  PROXY_API_BASE_URL,
  getApiBaseUrl,
  setApiBaseUrl,
  isProxyStreamingEnabled,
  setProxyStreamingEnabled,
  resolveStreamUrl,
  resolveSubtitleUrl,
  pingApiServer,
  detectBestApiBaseUrl
} from "../js/config/api-config.js";
import { createKkphimApi, BASE_URL } from "../js/services/kkphim-api.js";

console.log("Starting Frontend Proxy Configuration Integration Tests...");

// 1. Initial configuration checks (Original server is default target before detection)
assert.equal(DEFAULT_API_BASE_URL, ORIGINAL_API_BASE_URL, "Default API base URL should be https://phimapi.com");
assert.equal(BASE_URL, "https://phimapi.com", "BASE_URL constant should remain https://phimapi.com for compatibility");

// Explicitly set proxy to test proxy behaviors
setApiBaseUrl(PROXY_API_BASE_URL);
assert.equal(getApiBaseUrl(), PROXY_API_BASE_URL, "getApiBaseUrl should return proxy URL when set");
assert.equal(isProxyStreamingEnabled(), true, "Proxy streaming should be enabled when proxy is active");

// Domestic CDN streams (phim1280.tv, kvp726.com) must NOT be proxied through US cloud proxies
const domesticStream = "https://s2.phim1280.tv/20231021/index.m3u8";
assert.equal(
  resolveStreamUrl(domesticStream),
  domesticStream,
  "Domestic stream CDN URL should remain direct to prevent geo-blocking 404"
);

// Non-domestic external streams should be proxied when proxy is enabled
const externalStream = "https://media.example.com/video/index.m3u8";
const proxiedExternalStream = resolveStreamUrl(externalStream);
assert.equal(
  proxiedExternalStream,
  "https://bacuflix-proxy.vercel.app/api/proxy?url=" + encodeURIComponent(externalStream),
  "Non-domestic stream URL should be proxied by default"
);

// Idempotent: should not double-proxy
assert.equal(
  resolveStreamUrl(proxiedExternalStream),
  proxiedExternalStream,
  "Already proxied stream URL should not be wrapped again"
);

const directSub = "https://subtitle.123embed.net/sub.srt";
const proxiedSub = resolveSubtitleUrl(directSub);
assert.equal(
  proxiedSub,
  "https://bacuflix-proxy.vercel.app/api/proxy?url=" + encodeURIComponent(directSub),
  "Subtitle URL should be proxied by default"
);

console.log("✓ Proxy configuration verified.");

// 2. Switching to Original Upstream (Direct without proxy)
setApiBaseUrl(ORIGINAL_API_BASE_URL);

assert.equal(getApiBaseUrl(), ORIGINAL_API_BASE_URL, "getApiBaseUrl() should return the original API URL");
assert.equal(isProxyStreamingEnabled(), false, "Proxy streaming should be disabled when original URL is explicitly set");

const api = createKkphimApi();
assert.equal(api.getBaseUrl(), ORIGINAL_API_BASE_URL, "KKPhim API instance should use the original URL");
assert.equal(resolveStreamUrl(domesticStream), domesticStream, "Domestic stream URL should not be proxied when original URL is selected");
assert.equal(resolveStreamUrl(externalStream), externalStream, "External stream URL should not be proxied when original URL is selected");
assert.equal(resolveSubtitleUrl(directSub), directSub, "Subtitle URL should not be proxied when original URL is selected");

console.log("✓ Switching to original upstream verified.");

// 3. Reset back to default
setApiBaseUrl("");
assert.equal(getApiBaseUrl(), DEFAULT_API_BASE_URL, "Should revert to default API base URL");

console.log("✓ Reversion to default verified.");

// 4. Test Server Ping & Fallback detection
// Mock global fetch to test auto-fallback when original server is unreachable
const originalFetch = global.fetch;
global.fetch = async (url) => {
  if (url.includes("phimapi.com")) {
    throw new Error("DNS resolution blocked by ISP");
  }
  return { ok: true, json: async () => ({ status: true }) };
};

const detectedUrl = await detectBestApiBaseUrl(500);
assert.equal(detectedUrl, PROXY_API_BASE_URL, "Should automatically detect and switch to proxy when original is blocked");
assert.equal(getApiBaseUrl(), PROXY_API_BASE_URL, "Active URL should be updated to proxy");

// Restore fetch
global.fetch = originalFetch;
setApiBaseUrl("");

console.log("✓ Server ping & automatic proxy fallback verified.");

console.log("\nALL FRONTEND PROXY CONFIGURATION INTEGRATION TESTS PASSED SUCCESSFULLY!\n");
