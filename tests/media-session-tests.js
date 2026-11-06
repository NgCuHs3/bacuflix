import assert from "node:assert/strict";
import { createMediaSessionManager } from "../js/player/media-session-manager.js";

console.log("Starting MediaSessionManager Integration Tests...");

function createMockEventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (listeners.has(type)) {
        listeners.get(type).delete(fn);
      }
    },
    emit(type, payload) {
      if (!listeners.has(type)) {
        return;
      }
      for (const fn of Array.from(listeners.get(type))) {
        fn(payload);
      }
    },
    listenerCount(type) {
      return listeners.has(type) ? listeners.get(type).size : 0;
    }
  };
}

async function runMediaSessionTests() {
  const mockDoc = createMockEventTarget();
  mockDoc.hidden = false;
  globalThis.document = mockDoc;
  globalThis.window = {
    location: { origin: "https://bacuflix.app" },
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (id) => clearTimeout(id)
  };

  const video = createMockEventTarget();
  video.paused = true;
  video.ended = false;
  video.seeking = false;
  video.readyState = 4;
  video.currentTime = 12;
  video.duration = 1800;
  video.playbackRate = 1;
  video.error = null;

  const metadataCalls = [];
  const stateCalls = [];
  const positionCalls = [];
  let clearCalls = 0;
  let permissionCalls = 0;
  let mediaActionCallback = null;
  let mediaActionRemoved = false;
  let appStateCallback = null;
  let appStateRemoved = false;

  const mockPlugin = {
    requestNotificationPermission() {
      permissionCalls += 1;
      // Simulate permission denied on one path or resolved false to ensure no crash
      return Promise.resolve({ granted: false });
    },
    setMetadata(data) {
      metadataCalls.push(data);
      return Promise.resolve();
    },
    setPlaybackState(data) {
      stateCalls.push(data);
      return Promise.resolve();
    },
    setPositionState(data) {
      positionCalls.push(data);
      return Promise.resolve();
    },
    clear() {
      clearCalls += 1;
      return Promise.resolve();
    },
    addListener(eventName, cb) {
      if (eventName === "mediaAction") {
        mediaActionCallback = cb;
      }
      return Promise.resolve({
        remove() {
          mediaActionRemoved = true;
          mediaActionCallback = null;
          return Promise.resolve();
        }
      });
    }
  };

  const mockAppPlugin = {
    addListener(eventName, cb) {
      if (eventName === "appStateChange") {
        appStateCallback = cb;
      }
      return {
        remove() {
          appStateRemoved = true;
          appStateCallback = null;
          return Promise.resolve();
        }
      };
    }
  };

  const controllerActions = [];
  let hasPrev = false;
  let hasNext = true;

  const controller = {
    play() {
      controllerActions.push({ type: "play" });
      video.paused = false;
    },
    pause() {
      controllerActions.push({ type: "pause" });
      video.paused = true;
    },
    stop() {
      controllerActions.push({ type: "stop" });
      video.paused = true;
    },
    seekBy(delta) {
      controllerActions.push({ type: "seekBy", delta });
      video.currentTime = Math.max(0, video.currentTime + delta);
    },
    seekTo(pos) {
      controllerActions.push({ type: "seekTo", pos });
      video.currentTime = pos;
    },
    nextTrack() {
      controllerActions.push({ type: "nextTrack" });
    },
    previousTrack() {
      controllerActions.push({ type: "previousTrack" });
    },
    getCurrentTime() {
      return video.currentTime;
    },
    getDuration() {
      return video.duration;
    },
    getNavigationState() {
      return { hasPrev, hasNext };
    }
  };

  const manager = createMediaSessionManager({
    video,
    controller,
    plugin: mockPlugin,
    appPlugin: mockAppPlugin
  });

  assert.equal(permissionCalls, 1, "Must request notification permission once on init");

  // 1. Metadata synchronization
  manager.updateMetadata({
    title: "Ngọc Điểm Thú - Tập 1",
    seriesTitle: "Ngọc Điểm Thú",
    episodeName: "Tập 1",
    source: "KKPhim · Vietsub",
    thumb: "https://img.example.com/ngoc-diem-thu.jpg"
  });

  assert.equal(metadataCalls.length, 1);
  assert.equal(metadataCalls[0].title, "Ngọc Điểm Thú - Tập 1");
  assert.equal(metadataCalls[0].artist, "Ngọc Điểm Thú · KKPhim · Vietsub");
  assert.equal(metadataCalls[0].album, "Tập 1");
  assert.equal(metadataCalls[0].artwork, "https://img.example.com/ngoc-diem-thu.jpg");
  assert.equal(metadataCalls[0].duration, 1800);
  assert.equal(metadataCalls[0].position, 12);
  assert.equal(metadataCalls[0].hasPrev, false);
  assert.equal(metadataCalls[0].hasNext, true);

  // 2. Playback state synchronization
  video.paused = false;
  video.emit("playing");
  assert.equal(stateCalls.at(-1).state, "playing");

  video.emit("waiting");
  assert.equal(stateCalls.at(-1).state, "buffering");

  video.paused = true;
  video.emit("pause");
  assert.equal(stateCalls.at(-1).state, "paused");

  video.paused = false;
  video.playbackRate = 1.5;
  video.emit("ratechange");
  assert.equal(stateCalls.at(-1).playbackRate, 1.5);

  // 3. Throttled timeupdate verification
  const posCountBefore = positionCalls.length;
  for (let i = 1; i <= 15; i++) {
    video.currentTime = 12 + i * 0.25;
    video.emit("timeupdate");
  }
  assert.equal(positionCalls.length, posCountBefore, "High-frequency timeupdate within 1s window must be throttled");

  // Seeking & seeked bypass throttle
  video.currentTime = 300;
  video.emit("seeking");
  assert.equal(positionCalls.length, posCountBefore + 1);
  assert.equal(positionCalls.at(-1).position, 300);

  video.emit("seeked");
  assert.equal(stateCalls.at(-1).position, 300);

  // 4. Media actions from Android notification / lock screen / Bluetooth
  assert.ok(typeof mediaActionCallback === "function", "Media action listener must be registered");

  mediaActionCallback({ action: "pause" });
  assert.equal(controllerActions.at(-1).type, "pause");
  assert.equal(video.paused, true);

  mediaActionCallback({ action: "play" });
  assert.equal(controllerActions.at(-1).type, "play");
  assert.equal(video.paused, false);

  mediaActionCallback({ action: "seekForward", seconds: 10 });
  assert.equal(controllerActions.at(-1).type, "seekBy");
  assert.equal(controllerActions.at(-1).delta, 10);
  assert.equal(video.currentTime, 310);

  mediaActionCallback({ action: "seekBackward", seconds: 10 });
  assert.equal(controllerActions.at(-1).type, "seekBy");
  assert.equal(controllerActions.at(-1).delta, -10);
  assert.equal(video.currentTime, 300);

  mediaActionCallback({ action: "seekTo", position: 945 });
  assert.equal(controllerActions.at(-1).type, "seekTo");
  assert.equal(controllerActions.at(-1).pos, 945);
  assert.equal(video.currentTime, 945);

  mediaActionCallback({ action: "nextTrack" });
  assert.equal(controllerActions.at(-1).type, "nextTrack");

  mediaActionCallback({ action: "previousTrack" });
  assert.equal(controllerActions.at(-1).type, "previousTrack");

  mediaActionCallback({ action: "stop" });
  assert.equal(controllerActions.at(-1).type, "stop");

  // 5. Video switching updates metadata immediately
  hasPrev = true;
  hasNext = true;
  manager.updateMetadata({
    title: "Ngọc Điểm Thú - Tập 2",
    seriesTitle: "Ngọc Điểm Thú",
    episodeName: "Tập 2",
    source: "KKPhim · Vietsub",
    thumb: "/icon.png"
  });
  assert.equal(metadataCalls.at(-1).title, "Ngọc Điểm Thú - Tập 2");
  assert.equal(metadataCalls.at(-1).artwork, "https://bacuflix.app/icon.png");
  assert.equal(metadataCalls.at(-1).hasPrev, true);

  // 6. Lifecycle transitions (background & foreground)
  mockDoc.hidden = true;
  video.paused = true;
  mockDoc.emit("visibilitychange");
  assert.equal(stateCalls.at(-1).state, "paused");

  mockDoc.hidden = false;
  video.paused = false;
  if (appStateCallback) {
    appStateCallback({ isActive: true });
  }
  assert.equal(stateCalls.at(-1).state, "playing");

  // 7. Ended & Error states
  video.ended = true;
  video.emit("ended");
  assert.equal(stateCalls.at(-1).state, "ended");

  video.ended = false;
  video.error = { code: 4 };
  video.emit("error");
  assert.equal(stateCalls.at(-1).state, "error");

  // 8. Cleanup on destroy
  await new Promise((r) => setTimeout(r, 10));
  manager.destroy();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(clearCalls, 1, "Destroy must clear native MediaSession notification");
  assert.equal(video.listenerCount("playing"), 0, "All video listeners must be removed on destroy");
  assert.equal(video.listenerCount("timeupdate"), 0, "timeupdate listener must be removed on destroy");
  assert.equal(mockDoc.listenerCount("visibilitychange"), 0, "document visibilitychange listener must be removed on destroy");
  assert.equal(mediaActionRemoved, true, "Native mediaAction listener must be removed on destroy");
  assert.equal(appStateRemoved, true, "Capacitor appStateChange listener must be removed on destroy");

  console.log("✓ MediaSessionManager metadata, playback sync, throttling, media actions, lifecycle, and cleanup tests passed.");
}

await runMediaSessionTests();
console.log("\nALL MEDIA SESSION TESTS PASSED SUCCESSFULLY!");
