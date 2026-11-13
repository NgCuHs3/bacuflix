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

const directStream = "https://s2.phim1280.tv/20231021/index.m3u8";
const proxiedStream = resolveStreamUrl(directStream);
assert.equal(
  proxiedStream,
  "https://bacuflix-proxy.vercel.app/api/proxy?url=" + encodeURIComponent(directStream),
  "Stream URL should be proxied by default"
);

// Idempotent: should not double-proxy
assert.equal(
  resolveStreamUrl(proxiedStream),
  proxiedStream,
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
assert.equal(resolveStreamUrl(directStream), directStream, "Stream URL should not be proxied when original URL is selected");
assert.equal(resolveSubtitleUrl(directSub), directSub, "Subtitle URL should not be proxied when original URL is selected");

console.log("✓ Switching to original upstream verified.");

// 3. Reset back to default proxy
setApiBaseUrl("");
assert.equal(getApiBaseUrl(), DEFAULT_API_BASE_URL, "Should revert to default proxy API base URL");
assert.equal(isProxyStreamingEnabled(), true, "Proxy streaming should revert to enabled");
assert.equal(resolveStreamUrl(directStream), proxiedStream, "Stream URL should revert to proxied URL");
assert.equal(resolveSubtitleUrl(directSub), proxiedSub, "Subtitle URL should revert to proxied URL");

console.log("✓ Reversion to default proxy verified.");

console.log("\nALL FRONTEND PROXY CONFIGURATION INTEGRATION TESTS PASSED SUCCESSFULLY!\n");
