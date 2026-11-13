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
  resolveSubtitleUrl
} from "../js/config/api-config.js";
import { createKkphimApi, BASE_URL } from "../js/services/kkphim-api.js";

console.log("Starting Frontend Proxy Configuration Integration Tests...");

// 1. Default configuration checks (Proxy enabled by default)
assert.equal(getApiBaseUrl(), PROXY_API_BASE_URL, "Default API base URL should be https://bacuflix-proxy.vercel.app");
assert.equal(BASE_URL, "https://phimapi.com", "BASE_URL constant should remain https://phimapi.com for compatibility");
assert.equal(isProxyStreamingEnabled(), true, "Proxy streaming should be enabled by default");

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

console.log("✓ Default proxy configuration verified.");

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

// 3. Reset back to default proxy
setApiBaseUrl("");
assert.equal(getApiBaseUrl(), DEFAULT_API_BASE_URL, "Should revert to default proxy API base URL");
assert.equal(isProxyStreamingEnabled(), true, "Proxy streaming should revert to enabled");
assert.equal(resolveStreamUrl(domesticStream), domesticStream, "Domestic stream URL should remain direct");
assert.equal(resolveStreamUrl(externalStream), proxiedExternalStream, "External stream URL should revert to proxied URL");
assert.equal(resolveSubtitleUrl(directSub), proxiedSub, "Subtitle URL should revert to proxied URL");

console.log("✓ Reversion to default proxy verified.");

console.log("\nALL FRONTEND PROXY CONFIGURATION INTEGRATION TESTS PASSED SUCCESSFULLY!\n");
