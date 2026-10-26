import assert from "node:assert/strict";
import fs from "node:fs";
import { parseMovieMarkdown } from "../js/data/movie-markdown-parser.js";
import { createCatalogService } from "../js/services/catalog-service.js";
import { inspectSegment } from "../js/player/segment-inspector.js";
import { createSegmentLoader } from "../js/player/segment-loader.js";
import { catalogSources } from "../js/config/catalog-sources.js";
import { parseSrt, srtToWebVtt, findActiveCues, getActiveSubtitleText, stripSubtitleHtml } from "../js/player/subtitle-parser.js";
import { createSubtitleService } from "../js/player/subtitle-service.js";
import { normalizeRemoteKey } from "../js/navigation/remote-navigation.js";

const fallbackPoster = "icon.png";
const firstStream = "https://video.example.test/one/master.m3u8?token=abc";
const secondStream = "https://video.example.test/two/master.m3u8";

function entry(title, poster, stream, source) {
  return [
    "## Movie",
    "- title: " + title,
    "- poster: " + poster,
    "- m3u8: " + stream,
    source ? "- source: " + source : ""
  ].filter(Boolean).join("\n");
}

const parsed = parseMovieMarkdown([
  "# Movie Catalog",
  entry("  Movie One  ", "[poster](https://images.example.test/one.jpg)", "[playlist](" + firstStream + ")", "cinema.example"),
  entry("Movie Two", "http://images.example.test/two.jpg", secondStream, ""),
  entry("", "https://images.example.test/missing-title.jpg", "https://video.example.test/no-title.m3u8", ""),
  entry("Invalid stream", "", "javascript:alert(1)", "")
].join("\n\n"), {
  catalogSourceId: "fixture-source",
  fallbackPoster: fallbackPoster,
  playbackEnabled: true
});

assert.equal(parsed.movies.length, 2);
assert.equal(parsed.movies[0].title, "Movie One");
assert.equal(parsed.movies[0].poster, "https://images.example.test/one.jpg");
assert.equal(parsed.movies[0].m3u8, firstStream);
assert.equal(parsed.movies[0].source, "cinema.example");
assert.equal(parsed.movies[0].catalogSourceId, "fixture-source");
assert.equal(parsed.movies[0].playbackEnabled, true);
assert.equal(parsed.movies[1].poster, fallbackPoster);
assert.equal(parsed.movies[1].source, "video.example.test");
assert.equal(parsed.diagnostics.length, 3);
const ironManPoster = "https://raw.githubusercontent.com/NgCuHs3/bacuflix/refs/heads/main/data/iron_man/poster.jfif";
const parsedIronMan = parseMovieMarkdown([
  "## Movie",
  "- title: IRON MAN 1",
  "- poster: [" + ironManPoster + "](" + ironManPoster + ")",
  "- m3u8: https://video.example.test/iron-man/master.m3u8"
].join("\n"), { fallbackPoster: fallbackPoster });
assert.equal(parsedIronMan.movies.length, 1);
assert.equal(parsedIronMan.movies[0].poster, ironManPoster);
assert.equal(parsedIronMan.diagnostics.length, 0);
assert.equal(parsed.movies[0].id, parseMovieMarkdown(
  entry("Movie One", "", firstStream, "other source"),
  { catalogSourceId: "different-source" }
).movies[0].id);
assert.equal(parseMovieMarkdown("# empty", {}).movies.length, 0);
assert.equal(catalogSources[0].url,
  "https://raw.githubusercontent.com/NgCuHs3/bacuflix/refs/heads/main/data/movies.md");
assert.equal(catalogSources[0].playbackEnabled, true);

function crc32(bytes) {
  let crc = 0xffffffff;
  bytes.forEach(function (value) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function pngChunk(type, payload) {
  const typeBytes = Array.from(type).map((character) => character.charCodeAt(0));
  const body = typeBytes.concat(Array.from(payload));
  return uint32(payload.length).concat(body, uint32(crc32(body)));
}

function pngPrefix(includeEnd, includeIendText) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const header = new Array(13).fill(0);
  header[3] = 1;
  header[7] = 1;
  const imageData = includeIendText ? [73, 69, 78, 68, 0, 73, 69, 78, 68] : [0, 1, 2, 3];
  const chunks = signature.concat(
    pngChunk("IHDR", header),
    pngChunk("IDAT", imageData)
  );
  return includeEnd ? chunks.concat(pngChunk("IEND", [])) : chunks;
}

function makeTransportStream(packetCount) {
  const bytes = new Uint8Array(packetCount * 188);
  for (let packet = 0; packet < packetCount; packet += 1) {
    bytes[packet * 188] = 0x47;
    bytes[packet * 188 + 1] = packet;
    bytes[packet * 188 + 2] = 0x10;
    bytes[packet * 188 + 3] = 0x10;
  }
  return bytes;
}

const normalTs = makeTransportStream(3);
assert.equal(inspectSegment(normalTs.buffer).kind, "mpeg-ts");
assert.equal(inspectSegment(normalTs.buffer).data, normalTs.buffer);
const mp4 = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 0, 0, 0, 0]);
assert.equal(inspectSegment(mp4.buffer).kind, "fragmented-mp4");
assert.equal(inspectSegment(mp4.buffer).data, mp4.buffer);
const pngWrapped = new Uint8Array(pngPrefix(true, true).concat(Array.from(normalTs)));
const recovered = inspectSegment(pngWrapped.buffer);
assert.equal(recovered.kind, "png-wrapped-mpeg-ts");
assert.equal(recovered.pngBytes, pngPrefix(true, true).length);
assert.equal(recovered.transportStreamBytes, normalTs.length);
assert.deepEqual(Array.from(new Uint8Array(recovered.data)), Array.from(normalTs));
assert.throws(() => inspectSegment(new Uint8Array(pngPrefix(true, false)).buffer),
  /no valid trailing MPEG-TS/);
assert.throws(() => inspectSegment(new Uint8Array(pngPrefix(false, false)).buffer),
  /IEND chunk is missing/);
const malformedPng = new Uint8Array(20);
malformedPng.set([137, 80, 78, 71, 13, 10, 26, 10, 255, 255, 255, 255], 0);
assert.throws(() => inspectSegment(malformedPng.buffer), /extends beyond/);
const truncatedTs = new Uint8Array(pngPrefix(true, false).concat(Array.from(makeTransportStream(2)), [0x47]));
assert.throws(() => inspectSegment(truncatedTs.buffer), /no valid trailing MPEG-TS/);
const oneSyncPayload = new Uint8Array(pngPrefix(true, false).concat([0x47, 0, 0, 0]));
assert.throws(() => inspectSegment(oneSyncPayload.buffer), /no valid trailing MPEG-TS/);
assert.equal(inspectSegment(new Uint8Array([0, 1, 2, 3]).buffer).kind, "unknown");
const invalidCrcPng = new Uint8Array(pngPrefix(true, false));
invalidCrcPng[invalidCrcPng.length - 1] ^= 1;
assert.throws(() => inspectSegment(invalidCrcPng.buffer), /checksum is invalid/);

let recoveredByLoader = null;
function FakeLoader() {}
FakeLoader.prototype.load = function (context, _config, callbacks) {
  callbacks.onSuccess({ data: context.data, code: 200 }, {}, context, null);
};
const WrappedLoader = createSegmentLoader(FakeLoader);
const wrappedLoader = new WrappedLoader({});
wrappedLoader.load({
  type: "media-fragment",
  data: pngWrapped.buffer
}, {}, {
  onSuccess(response) {
    recoveredByLoader = response.data;
  },
  onError() {
    throw new Error("Valid wrapped TS unexpectedly failed.");
  }
});
assert.deepEqual(Array.from(new Uint8Array(recoveredByLoader)), Array.from(normalTs));

function passThroughLoaderData(data) {
  let received = null;
  const loader = new WrappedLoader({});
  loader.load({ type: "media-fragment", data: data }, {}, {
    onSuccess(response) {
      received = response.data;
    },
    onError(response) {
      throw new Error(response.text);
    }
  });
  return received;
}
assert.equal(passThroughLoaderData(normalTs.buffer), normalTs.buffer);
assert.equal(passThroughLoaderData(mp4.buffer), mp4.buffer);

let loaderError = "";
const malformedLoader = new WrappedLoader({});
malformedLoader.load({
  type: "media-fragment",
  data: new Uint8Array(pngPrefix(true, false)).buffer
}, {}, {
  onSuccess() {
    throw new Error("Invalid wrapped segment was accepted.");
  },
  onError(response) {
    loaderError = response.text;
  }
});
assert.match(loaderError, /no valid trailing MPEG-TS/);

let playlistPassedThrough = false;
FakeLoader.prototype.load = function (context, _config, callbacks) {
  playlistPassedThrough = true;
  callbacks.onSuccess({ data: context.data, code: 200 }, {}, context, null);
};
const playlistLoader = new WrappedLoader({});
playlistLoader.load({ type: "manifest", data: "playlist text" }, {}, {
  onSuccess(response) {
    assert.equal(response.data, "playlist text");
  }
});
assert.equal(playlistPassedThrough, true);

const memoryStore = Object.create(null);
const requestCalls = [];
globalThis.window = {
  localStorage: {
    getItem(key) { return memoryStore[key] || null; },
    setItem(key, value) { memoryStore[key] = value; }
  },
  fetch(url, options) {
    requestCalls.push({ url: url, options: options });
    if (url.indexOf("catalog-b") !== -1) {
      return Promise.reject(new Error("offline"));
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text() {
        return Promise.resolve([
          "# Movie Catalog",
          entry("Movie One", "", firstStream, "one.example"),
          entry("Movie Two", "", secondStream, "two.example")
        ].join("\n\n"));
      }
    });
  },
  setTimeout,
  clearTimeout
};

const service = createCatalogService([
  { id: "catalog-a", url: "https://catalog.example.test/a.md", playbackEnabled: false },
  { id: "catalog-b", url: "https://catalog.example.test/catalog-b.md", playbackEnabled: false }
]);
const loaded = await service.load(false);
assert.equal(loaded.movies.length, 2);
assert.equal(loaded.errors.length, 1);
assert.equal(loaded.failedAll, false);
assert.equal(loaded.movies[0].playbackEnabled, false);
assert.equal(requestCalls.length, 2);
assert.equal(requestCalls.some((call) => call.url.indexOf(".m3u8") !== -1), false);

const cached = await service.load(false);
assert.equal(cached.movies.length, 2);
assert.equal(requestCalls.length, 3);
const refreshed = await service.load(true);
assert.equal(refreshed.movies.length, 2);
assert.equal(requestCalls.length, 5);
assert.equal(requestCalls[3].options.cache, "no-cache");

assert.equal(service.getLastResult().movies.length, 2);

const parsedVariants = parseMovieMarkdown([
  "## Movie",
  "- title: Autolink Poster",
  "- poster: <" + ironManPoster + ">",
  "- m3u8: <https://video.example.test/stream.m3u8>",
  "",
  "## Movie",
  "- title: Titled Poster",
  "- poster: [Poster](" + ironManPoster + " \"Iron Man\")",
  "- m3u8: https://video.example.test/stream2.m3u8",
  "",
  "## Movie",
  "- title: Bracketed Destination",
  "- poster: [Poster](<" + ironManPoster + ">)",
  "- m3u8: https://video.example.test/stream3.m3u8"
].join("\n"), { fallbackPoster: fallbackPoster });
assert.equal(parsedVariants.movies.length, 3);
assert.equal(parsedVariants.movies[0].poster, ironManPoster);
assert.equal(parsedVariants.movies[1].poster, ironManPoster);
assert.equal(parsedVariants.movies[2].poster, ironManPoster);

// Subtitle Markdown parsing tests
const subtitleUrl = "https://subtitle.123embed.net/subtitles/mv/184.vietnam.srt";
const parsedSubtitleEntries = parseMovieMarkdown([
  "## Movie",
  "- title: Movie With Plain Subtitle",
  "- poster: " + ironManPoster,
  "- m3u8: https://video.example.test/stream1.m3u8",
  "- subtitle: " + subtitleUrl,
  "",
  "## Movie",
  "- title: Movie With Markdown Link Subtitle",
  "- poster: " + ironManPoster,
  "- m3u8: https://video.example.test/stream2.m3u8",
  "- subtitle: [Tiếng Việt](" + subtitleUrl + ")",
  "",
  "## Movie",
  "- title: Movie With Bracketed Subtitle",
  "- poster: " + ironManPoster,
  "- m3u8: https://video.example.test/stream3.m3u8",
  "- subtitle: [" + subtitleUrl + "](" + subtitleUrl + ")",
  "",
  "## Movie",
  "- title: Movie Without Subtitle",
  "- poster: " + ironManPoster,
  "- m3u8: https://video.example.test/stream4.m3u8",
  "",
  "## Movie",
  "- title: Movie With Invalid Subtitle",
  "- poster: " + ironManPoster,
  "- m3u8: https://video.example.test/stream5.m3u8",
  "- subtitle: javascript:alert('xss')"
].join("\n"), { fallbackPoster: fallbackPoster });

assert.equal(parsedSubtitleEntries.movies.length, 5);
assert.equal(parsedSubtitleEntries.movies[0].subtitle, subtitleUrl);
assert.equal(parsedSubtitleEntries.movies[1].subtitle, subtitleUrl);
assert.equal(parsedSubtitleEntries.movies[2].subtitle, subtitleUrl);
assert.equal(parsedSubtitleEntries.movies[3].subtitle, null);
assert.equal(parsedSubtitleEntries.movies[4].subtitle, null);
assert.equal(parsedSubtitleEntries.diagnostics.length, 1);
assert.match(parsedSubtitleEntries.diagnostics[0].message, /subtitle URL is invalid/i);

// Verify live data/movies.md Iron Man 1 subtitle
const localMoviesMd = fs.readFileSync("data/movies.md", "utf8");
const parsedLocalMovies = parseMovieMarkdown(localMoviesMd, { fallbackPoster: fallbackPoster });
const ironManEntry = parsedLocalMovies.movies.find((m) => m.title.includes("IRON MAN"));
assert.ok(ironManEntry, "Iron Man entry exists in data/movies.md");
assert.equal(ironManEntry.subtitle, subtitleUrl);

// Subtitle SRT parsing tests
const srtSample = [
  "\uFEFF1",
  "00:00:01,000 --> 00:00:03,500",
  "<i>Tôi là</i> <b>Người Sắt</b>.{\\an8}",
  "",
  "2",
  "00:00:04,200 --> 00:00:06,800",
  "&quot;Xin chào&quot; &amp; &lt;Việt Nam&gt;!",
  "Dòng thứ hai.",
  "",
  "3",
  "00:00:07,000 --> 00:00:09,000",
  "Cuộc phiêu lưu tiếp tục."
].join("\r\n");

const parsedCues = parseSrt(srtSample);
assert.equal(parsedCues.length, 3);
assert.equal(parsedCues[0].start, 1.0);
assert.equal(parsedCues[0].end, 3.5);
assert.equal(parsedCues[0].text, "Tôi là Người Sắt.");
assert.equal(parsedCues[1].start, 4.2);
assert.equal(parsedCues[1].end, 6.8);
assert.equal(parsedCues[1].text, '"Xin chào" & <Việt Nam>!\nDòng thứ hai.');

// HTML/ASS sanitization tests
assert.equal(stripSubtitleHtml("<i>Hello</i> &amp; <b>World</b>{\\an8}"), "Hello & World");
assert.equal(stripSubtitleHtml("&quot;Test&quot; &lt;Tag&gt; &#39;Single&#39; &nbsp;"), '"Test" <Tag> \'Single\'');
assert.equal(stripSubtitleHtml("<script>alert(1)</script>Safe"), "Safe");

// Active cues & timeline synchronization tests
assert.deepEqual(findActiveCues(parsedCues, 0.5), []);
assert.equal(findActiveCues(parsedCues, 1.0).length, 1);
assert.equal(findActiveCues(parsedCues, 2.0).length, 1);
assert.equal(findActiveCues(parsedCues, 3.5).length, 1);
assert.deepEqual(findActiveCues(parsedCues, 3.8), []);
assert.equal(findActiveCues(parsedCues, 4.2).length, 1);
assert.equal(findActiveCues(parsedCues, 5.0).length, 1);
assert.equal(findActiveCues(parsedCues, 6.8).length, 1);
assert.deepEqual(findActiveCues(parsedCues, 6.9), []);
assert.equal(findActiveCues(parsedCues, 8.0).length, 1);
assert.deepEqual(findActiveCues(parsedCues, 15.0), []);

assert.equal(getActiveSubtitleText(parsedCues, 2.0), "Tôi là Người Sắt.");
assert.equal(getActiveSubtitleText(parsedCues, 5.0), '"Xin chào" & <Việt Nam>!\nDòng thứ hai.');
assert.equal(getActiveSubtitleText(parsedCues, 3.8), "");

// WebVTT conversion tests
const vtt = srtToWebVtt(srtSample);
assert.ok(vtt.startsWith("WEBVTT\n"));
assert.ok(vtt.includes("00:00:01.000 --> 00:00:03.500"));
assert.ok(vtt.includes("Tôi là Người Sắt."));

// Subtitle Service caching and fetching tests
const originalFetch = globalThis.fetch;
let subtitleFetchCalls = 0;
globalThis.fetch = async function (url) {
  subtitleFetchCalls += 1;
  return {
    ok: true,
    status: 200,
    text: async () => srtSample,
    arrayBuffer: async () => Buffer.from(srtSample, "utf8")
  };
};

const subtitleService = createSubtitleService();
const subResult1 = await subtitleService.loadSubtitle(subtitleUrl);
assert.equal(subResult1.cues.length, 3);
assert.equal(subResult1.error, null);
assert.equal(subtitleFetchCalls, 1);

// Second call must be served from cache without extra fetch
const subResult2 = await subtitleService.loadSubtitle(subtitleUrl);
assert.equal(subResult2.cues.length, 3);
assert.equal(subtitleFetchCalls, 1, "Cached subtitle should not invoke fetch again");

// Empty or invalid URL test
const emptySubResult = await subtitleService.loadSubtitle("");
assert.equal(emptySubResult.cues.length, 0);
assert.equal(emptySubResult.error, "No subtitle URL provided.");

// HTTP failure handling test
globalThis.fetch = async function () {
  return { ok: false, status: 404, statusText: "Not Found" };
};
const errorSubResult = await subtitleService.loadSubtitle("https://example.test/missing.srt");
assert.equal(errorSubResult.cues.length, 0);
assert.match(errorSubResult.error, /HTTP 404/);

// UTF-8 BOM buffer decoding test
globalThis.fetch = async function () {
  const bomBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(srtSample, "utf8")]);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bomBytes
  };
};
const bomSubResult = await subtitleService.loadSubtitle("https://example.test/bom.srt");
assert.equal(bomSubResult.cues.length, 3);
assert.equal(bomSubResult.cues[0].text, "Tôi là Người Sắt.");

// AbortController / cancel test
let abortedSignal = false;
globalThis.fetch = async function (url, opts) {
  return new Promise((_, reject) => {
    if (opts && opts.signal) {
      if (opts.signal.aborted) {
        abortedSignal = true;
        reject(Object.assign(new Error("Request aborted"), { name: "AbortError" }));
        return;
      }
      opts.signal.addEventListener("abort", () => {
        abortedSignal = true;
        reject(Object.assign(new Error("Request aborted"), { name: "AbortError" }));
      });
    }
  });
};
const pendingPromise = subtitleService.loadSubtitle("https://example.test/in-flight.srt");
subtitleService.cancel();
const abortedResult = await pendingPromise;
assert.ok(abortedResult.aborted || abortedSignal, "Request must be aborted on cancel");

globalThis.fetch = originalFetch;

// Keyboard normalization tests
const escKey = normalizeRemoteKey({ key: "Escape", keyCode: 27 });
assert.equal(escKey.isEscape, true);
assert.equal(escKey.isBack, true);

const tvBackKey = normalizeRemoteKey({ key: "Back", keyCode: 10009 });
assert.equal(tvBackKey.isBack, true);
assert.equal(tvBackKey.isEscape, false);

const enterKey = normalizeRemoteKey({ key: "Enter", keyCode: 13 });
assert.equal(enterKey.isSelect, true);
assert.equal(enterKey.isBack, false);

// Player navigation bar UI verification
const playerSource = fs.readFileSync("js/player/player-screen.js", "utf8");
assert.equal(playerSource.includes('id="sound-toggle"'), false, "sound-toggle should be removed from player markup");
assert.equal(playerSource.includes('id="fullscreen-button"'), false, "fullscreen-button should be removed from player markup");
assert.ok(playerSource.includes("m15 18-6-6 6-6"), "Rewind button should use chevron-left SVG icon");
assert.ok(playerSource.includes("m9 18 6-6-6-6"), "Forward button should use chevron-right SVG icon");

// Verify ESC hides controls first before triggering onBackRequest
assert.ok(
  playerSource.includes("if (controlsVisible || stage.classList.contains(\"controls-visible\")) {\n        window.clearTimeout(controlsTimer);\n        hideControls(true);"),
  "ESC/Back while controls are visible must hide controls without triggering onBackRequest"
);

// Home screen Stage A & B verification
const homeSource = fs.readFileSync("js/home/home-screen.js", "utf8");
assert.ok(homeSource.includes("card.tabIndex = 0;"), "Movie card must have tabIndex = 0 for Stage A selection");
assert.ok(homeSource.includes("play.tabIndex = -1;"), "Play button must start with tabIndex = -1");
assert.ok(homeSource.includes("activateStageB"), "Home screen must support activating Stage B");
assert.ok(homeSource.includes("cancelStageB"), "Home screen must support canceling Stage B on Escape");
assert.ok(homeSource.includes("catalog-play-icon"), "Play button must have clean SVG play icon");

console.log("All unit, subtitle, player UI, and keyboard navigation tests passed.");
