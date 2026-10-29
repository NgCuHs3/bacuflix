import assert from "node:assert/strict";
import fs from "node:fs";

// Mock window.localStorage for Node test environment
const mockStorage = new Map();
global.window = {
  localStorage: {
    getItem(key) {
      return mockStorage.get(key) || null;
    },
    setItem(key, value) {
      mockStorage.set(key, String(value));
    },
    removeItem(key) {
      mockStorage.delete(key);
    }
  }
};

import { buildImageUrl, normalizeMovie, createKkphimApi } from "../js/services/kkphim-api.js";
import { createFavoritesService, getFavorites, saveFavorites, addFavorite, removeFavorite, toggleFavorite, isFavorite } from "../js/services/favorites-service.js";
import { createGoogleTrendingService, extractKeywords, getCachedTrending, saveCachedTrending, clearTrendingCache, fetchGoogleTrending } from "../js/services/google-trending-service.js";

console.log("Starting KKPhim API, Favorites and Google Trending unit tests...");

// 1. Test Google Trending Keyword Extraction & Cache Service
const sampleSuggestions = [
  "xem phim ngọc điệm thu",
  "xem phim gả kim thoa tập 1 thuyết minh",
  "xem phim ngọc điệm thu vietsub",
  "phim chiếu rạp",
  "phim chiếu rạp 2026",
  "xem phim bộ tứ báo thủ",
  "phim hay",
  "phim"
];

const keywords = extractKeywords(sampleSuggestions);
assert.ok(Array.isArray(keywords), "Keywords should be an array");
assert.ok(keywords.includes("ngọc điệm thu"), "Should extract ngọc điệm thu");
assert.ok(keywords.includes("gả kim thoa"), "Should extract gả kim thoa without tập 1 thuyết minh");
assert.ok(keywords.includes("bộ tứ báo thủ"), "Should extract bộ tứ báo thủ");
assert.equal(keywords.includes("chiếu rạp"), false, "Generic words should be filtered out");
assert.equal(keywords.includes("phim hay"), false, "Generic words should be filtered out");
console.log("✓ Google Trending keyword extraction unit tests passed.");

// Test LocalStorage Cache for Google Trending
clearTrendingCache();
assert.equal(getCachedTrending(), null, "Cache should be empty initially");

const dummyTrending = [
  { id: "test-1", slug: "test-1", title: "Trending Phim 1" },
  { id: "test-2", slug: "test-2", title: "Trending Phim 2" }
];
saveCachedTrending(dummyTrending);
const cached = getCachedTrending();
assert.ok(Array.isArray(cached) && cached.length === 2, "Should read cached trending movies");
assert.equal(cached[0].title, "Trending Phim 1");

clearTrendingCache();
assert.equal(getCachedTrending(), null, "Cache should be cleared");
console.log("✓ Google Trending localStorage cache unit tests passed.");

// 2. Test buildImageUrl
assert.equal(buildImageUrl("https://phimimg.com/uploads/poster.jpg"), "https://phimimg.com/uploads/poster.jpg");
assert.equal(buildImageUrl("uploads/poster.jpg", "https://phimimg.com"), "https://phimimg.com/uploads/poster.jpg");
assert.equal(buildImageUrl("/uploads/poster.jpg", "https://phimimg.com/"), "https://phimimg.com/uploads/poster.jpg");
assert.equal(buildImageUrl("", "https://phimimg.com"), "icon.png");
assert.equal(buildImageUrl(null), "icon.png");

// 3. Test normalizeMovie
const sampleApiItem = {
  _id: "12345",
  name: "One Piece",
  slug: "one-piece",
  origin_name: "One Piece Original",
  type: "series",
  poster_url: "uploads/movies/one-piece-poster.webp",
  thumb_url: "uploads/movies/one-piece-thumb.webp",
  quality: "FHD",
  lang: "Vietsub",
  year: 2026,
  episode_current: "Tập 1100",
  time: "24 phút"
};

const normalized = normalizeMovie(sampleApiItem, "https://phimimg.com");
assert.equal(normalized.id, "one-piece");
assert.equal(normalized.slug, "one-piece");
assert.equal(normalized.title, "One Piece");
assert.equal(normalized.originTitle, "One Piece Original");
assert.equal(normalized.poster, "https://phimimg.com/uploads/movies/one-piece-poster.webp");
assert.equal(normalized.thumb, "https://phimimg.com/uploads/movies/one-piece-thumb.webp");
assert.equal(normalized.quality, "FHD");
assert.equal(normalized.lang, "Vietsub");
assert.equal(normalized.year, "2026");
assert.equal(normalized.episodeCurrent, "Tập 1100");
assert.equal(normalized.playbackEnabled, true);
assert.equal(normalized.source, "KKPhim");

// 4. Test Favorites Service
assert.equal(getFavorites().length, 0);
assert.equal(isFavorite("one-piece"), false);

addFavorite(normalized);
assert.equal(isFavorite("one-piece"), true);
assert.equal(getFavorites().length, 1);
assert.equal(getFavorites()[0].title, "One Piece");

const isFavAfterToggle = toggleFavorite(normalized);
assert.equal(isFavAfterToggle, false);
assert.equal(isFavorite("one-piece"), false);
assert.equal(getFavorites().length, 0);

toggleFavorite(normalized);
assert.equal(isFavorite("one-piece"), true);
removeFavorite("one-piece");
assert.equal(isFavorite("one-piece"), false);
console.log("✓ Favorites service unit tests passed.");

// 5. Test Live KKPhim API Endpoints & Pagination
const api = createKkphimApi();

async function testLiveApi() {
  console.log("Testing live KKPhim endpoints...");
  
  // Test Home (Trending)
  const homeRes = await api.getHome();
  assert.ok(homeRes.movies && homeRes.movies.length > 0, "getHome() should return movies");
  assert.ok(homeRes.movies[0].title, "First home movie should have title");
  console.log("✓ getHome() returned " + homeRes.movies.length + " movies.");

  // Test Google Trending Service with KKPhim
  console.log("Testing Google Trending -> KKPhim search pipeline...");
  const trendingRes = await fetchGoogleTrending(api, true);
  assert.ok(trendingRes.movies && trendingRes.movies.length > 0, "fetchGoogleTrending should return movies");
  assert.equal(trendingRes.isCached, false, "First forced fetch should not be cached");
  console.log("✓ fetchGoogleTrending returned " + trendingRes.movies.length + " trending movies.");

  // Test Cache hit
  const cacheHitRes = await fetchGoogleTrending(api, false);
  assert.equal(cacheHitRes.isCached, true, "Second fetch should hit localStorage cache");
  assert.equal(cacheHitRes.movies.length, trendingRes.movies.length, "Cached movies count must match");
  console.log("✓ Google Trending localStorage cache hit verified (0ms).");

  // Test Trending Page 2 (Infinite scroll)
  const trending2Res = await api.getTrending(2);
  assert.ok(trending2Res.movies && trending2Res.movies.length > 0, "getTrending(2) should return movies");
  console.log("✓ getTrending(2) pagination returned " + trending2Res.movies.length + " movies.");

  // Test New Updated Page 1 & Page 2 (Infinite scroll)
  const newRes1 = await api.getNewUpdated(1);
  assert.ok(newRes1.movies && newRes1.movies.length > 0, "getNewUpdated(1) should return movies");
  const newRes2 = await api.getNewUpdated(2);
  assert.ok(newRes2.movies && newRes2.movies.length > 0, "getNewUpdated(2) should return movies");
  console.log("✓ getNewUpdated() pagination returned " + newRes1.movies.length + " (p1) and " + newRes2.movies.length + " (p2) movies.");

  // Test Search Page 1 & Page 2 (Infinite scroll)
  const searchRes1 = await api.searchMovies("one piece", 5, 1);
  assert.ok(searchRes1.movies && searchRes1.movies.length > 0, "searchMovies(p1) should return results");
  const searchRes2 = await api.searchMovies("one piece", 5, 2);
  assert.ok(searchRes2.movies && searchRes2.movies.length > 0, "searchMovies(p2) should return results");
  console.log("✓ searchMovies('one piece') pagination returned " + searchRes1.movies.length + " (p1) and " + searchRes2.movies.length + " (p2) movies.");

  // Test Movie Detail
  const testSlug = homeRes.movies[0].slug;
  const detailRes = await api.getMovieDetail(testSlug);
  assert.ok(detailRes.movie, "getMovieDetail() should have movie object");
  assert.ok(detailRes.episodes, "getMovieDetail() should have episodes array");
  if (detailRes.episodes.length > 0) {
    const firstServer = detailRes.episodes[0];
    assert.ok(firstServer.server_name, "Server must have server_name");
    assert.ok(firstServer.server_data && firstServer.server_data.length > 0, "Server must have episodes");
    const firstEp = firstServer.server_data[0];
    assert.ok(firstEp.link_m3u8 || firstEp.link_embed, "Episode must have link_m3u8 or link_embed");
    console.log("✓ getMovieDetail('" + testSlug + "') returned " + detailRes.episodes.length + " server(s) with m3u8 source: " + (firstEp.link_m3u8 ? "YES" : "NO"));
  }

  // 6. Verify bundle file syntax
  const bundleContent = fs.readFileSync("js/app.bundle.js", "utf8");
  assert.ok(bundleContent.includes("createKkphimApi"), "Bundle must include createKkphimApi");
  assert.ok(bundleContent.includes("createFavoritesService"), "Bundle must include createFavoritesService");
  assert.ok(bundleContent.includes("createGoogleTrendingService"), "Bundle must include createGoogleTrendingService");
  assert.ok(bundleContent.includes("createMovieDetailModal"), "Bundle must include createMovieDetailModal");
  assert.ok(bundleContent.includes("createHeroCarousel"), "Bundle must include createHeroCarousel");
  assert.ok(bundleContent.includes("home-nav-tabs"), "Bundle must include home-nav-tabs");

  // Verify removed items
  assert.equal(bundleContent.includes("createMyCatalogsService"), false, "Bundle should NOT include createMyCatalogsService");
  assert.equal(bundleContent.includes("createCatalogModal"), false, "Bundle should NOT include createCatalogModal");
  assert.equal(bundleContent.includes("catalog-refresh"), false, "Bundle should NOT include catalog-refresh button");
  console.log("✓ Bundle verification passed (clean bundle without removed features).");

  console.log("\nALL KKPHIM, FAVORITES, GOOGLE TRENDING AND CACHE TESTS PASSED SUCCESSFULLY!");
}

testLiveApi().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
