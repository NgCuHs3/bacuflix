import assert from "node:assert/strict";
import { createSeekController } from "../js/player/seek-controller.js";
import { parseRoute, buildMovieUrl, buildEpisodeUrl, buildHomeUrl } from "../js/utils/url.js";

console.log("Starting Seek Controller & URL Deep Linking Tests...");

// --- 1. URL parsing & building tests ---
{
  const r1 = parseRoute("?movie=one-piece", "");
  assert.equal(r1.movieSlug, "one-piece");
  assert.equal(r1.ep, null);

  const r2 = parseRoute("?movie=one-piece&ep=5", "");
  assert.equal(r2.movieSlug, "one-piece");
  assert.equal(r2.ep, "5");

  const r3 = parseRoute("", "#/movie/naruto/ep/12");
  assert.equal(r3.movieSlug, "naruto");
  assert.equal(r3.ep, "12");

  const r4 = parseRoute("", "#movie=thien-co-quyet-tran&ep=3");
  assert.equal(r4.movieSlug, "thien-co-quyet-tran");
  assert.equal(r4.ep, "3");

  const rEmpty = parseRoute("", "");
  assert.equal(rEmpty.movieSlug, null);
  assert.equal(rEmpty.ep, null);

  const mUrl = buildMovieUrl("one-piece");
  assert.ok(mUrl.includes("?movie=one-piece"));

  const epUrl = buildEpisodeUrl("one-piece", 3);
  assert.ok(epUrl.includes("?movie=one-piece&ep=3"));

  console.log("✓ URL router & route builder unit tests passed.");
}

// --- 2. Seek Controller Acceleration & Boundary Tests ---
{
  let currentTime = 0;
  let previewEvents = [];
  let commitEvents = [];
  let rafCallback = null;

  globalThis.window = {
    requestAnimationFrame(cb) {
      rafCallback = cb;
      return 123;
    },
    cancelAnimationFrame() {
      rafCallback = null;
    },
    setTimeout(cb, d) {
      return setTimeout(cb, d);
    },
    clearTimeout(id) {
      clearTimeout(id);
    }
  };

  const controller = createSeekController({
    getRange: () => ({ start: 0, end: 1000 }),
    getCurrentTime: () => currentTime,
    onPreview(progress, time, meta) {
      previewEvents.push({ progress, time, meta });
    },
    onCommit(time, meta) {
      commitEvents.push({ time, meta });
    }
  });

  // Test Boundary at 0: Seeking forward must begin animation even when starting at 0!
  currentTime = 0;
  controller.pressKey(1, "right");
  assert.ok(rafCallback !== null, "RAF must be scheduled when seeking forward from progress 0");

  // Animate hold frames (total elapsed = 0.3s > 0.22s)
  rafCallback(100);
  rafCallback(400);
  assert.ok(previewEvents.length > 0, "onPreview must be triggered during hold animation");
  const firstEvent = previewEvents[previewEvents.length - 1];
  assert.ok(firstEvent.meta.isHolding, "meta.isHolding must be true");
  assert.ok(firstEvent.meta.percentage > 0, "Percentage must increase forward");
  assert.equal(firstEvent.meta.direction, 1);

  // Release hold
  controller.releaseKey("right");
  assert.ok(commitEvents.length > 0, "onCommit must be called upon key release");
  const commitMeta = commitEvents[commitEvents.length - 1].meta;
  assert.ok(commitMeta.percentage > 0, "Committed percentage must be > 0");
  assert.equal(commitMeta.tapCount, 0, "Holding seek must reset tapCount to 0");

  // Test Consecutive Taps Acceleration
  previewEvents = [];
  commitEvents = [];
  currentTime = 100; // 10%

  // Tap 1
  controller.pressKey(1, "right");
  controller.releaseKey("right");
  const tap1Commit = commitEvents[commitEvents.length - 1];
  assert.equal(tap1Commit.meta.isTap, true);
  assert.equal(tap1Commit.meta.tapCount, 1);
  const time1 = tap1Commit.time;

  // Tap 2 (rapid successive tap within 650ms)
  controller.pressKey(1, "right");
  controller.releaseKey("right");
  const tap2Commit = commitEvents[commitEvents.length - 1];
  assert.equal(tap2Commit.meta.isTap, true);
  assert.equal(tap2Commit.meta.tapCount, 2);
  assert.ok(tap2Commit.meta.deltaSeconds >= 20, "Second tap must accelerate with larger delta");

  // Tap 3
  controller.pressKey(1, "right");
  controller.releaseKey("right");
  const tap3Commit = commitEvents[commitEvents.length - 1];
  assert.equal(tap3Commit.meta.tapCount, 3);
  assert.ok(tap3Commit.meta.deltaSeconds >= 30, "Third tap must accelerate further");

  // Test seekBy
  controller.seekBy(-15);
  const seekByCommit = commitEvents[commitEvents.length - 1];
  assert.equal(seekByCommit.meta.direction, -1);
  assert.equal(seekByCommit.meta.deltaSeconds, -15);

  // Test Direct Slider Click & Drag (setPreview + commitPreview)
  currentTime = 100; // 10%
  previewEvents = [];
  commitEvents = [];

  // User clicks at 65% on the seek bar
  controller.setPreview(0.65);
  assert.equal(previewEvents.length, 1);
  assert.equal(previewEvents[0].progress, 0.65);
  assert.equal(previewEvents[0].meta.isDirect, true);
  assert.equal(previewEvents[0].time, 650);

  // User commits preview (mouse up / change)
  controller.commitPreview();
  assert.equal(commitEvents.length, 1);
  assert.equal(commitEvents[0].time, 650, "Committed time must stay at 650 (65%) and not reset to 100");
  assert.equal(commitEvents[0].meta.isDirect, true);
  assert.equal(commitEvents[0].meta.isTap, false);

  // User drags from 65% to 80% then commits
  currentTime = 650;
  controller.setPreview(0.70);
  controller.setPreview(0.75);
  controller.setPreview(0.80);
  controller.commitPreview();
  const dragCommit = commitEvents[commitEvents.length - 1];
  assert.equal(dragCommit.time, 800, "Committed time must be 800 (80%)");
  assert.equal(dragCommit.meta.isDirect, true);

  controller.destroy();
  console.log("✓ Seek controller acceleration, boundary, direct click, and consecutive tap tests passed.");
}

console.log("\nALL SEEK CONTROLLER AND URL TESTS PASSED SUCCESSFULLY!");
