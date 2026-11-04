import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function mountHistory(rows) {
  const listeners = new Map();
  const dispatch = (type, detail) => listeners.get(type)?.({ type, detail });
  const window = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: name => listeners.delete(name),
    dispatchEvent: event => dispatch(event.type, event.detail),
  };
  const document = { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] };
  const entity = {
    list: async () => rows,
    filter: async ({ content_key }) => rows.filter(row => row.content_key === content_key),
    create: async data => {
      const row = { id: `row-${rows.length + 1}`, ...data };
      rows.push(row);
      return row;
    },
    update: async (id, data) => {
      const row = rows.find(entry => entry.id === id);
      if (!row) throw new Error("Missing account history row");
      Object.assign(row, data);
      return row;
    },
  };
  const source = read("src/components/mg/ContinueWatchingAssist.jsx")
    .replace(/import[\s\S]*?from "[^"]+";/g, "")
    .replace("export default function", "function");
  vm.runInNewContext(source + "\nContinueWatchingAssist();", {
    window, document,
    useRef: value => ({ current: value }),
    useEffect: callback => callback(),
    profiledLibrary: { ContinueWatching: entity },
    EMBED_HISTORY_CHANGED: "mg:history-changed",
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    HTMLVideoElement: class {},
  });
  return dispatch;
}
const waitFor = async condition => {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(condition(), "Timed out waiting for saved playback progress");
};
const id = label => `mg-${Date.now()}-0-${label}`;

test("native film exit saves actual resume seconds and preserves the chosen RD source", async () => {
  const source = { infoHash: "moviehash", fileIdx: 3, viaRealDebrid: true };
  const row = {
    id: "movie", content_key: "mg2|42|movie|2026|||Test",
    title: "Test", progress: 3120, duration: 6000,
    source_type: "rd", video_url: "mgsource:" + encodeURIComponent(JSON.stringify(source)),
  };
  const rows = [row], dispatch = mountHistory(rows);
  dispatch("mg:player-context", { mediaType: "movie", tmdbId: "42", title: "Test", year: "2026" });
  const requestId = id("movie");
  dispatch("mg:native-player-result", {
    requestId: `mg-${Date.now() - 60000}-0-stale`,
    reason: "back", positionMs: 200000, durationMs: 6000000,
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(row.progress, 3120, "Ignore callbacks from an older player request");
  dispatch("mg:native-player-result", {
    requestId, reason: "back", positionMs: 3255000, durationMs: 6000000,
  });
  await waitFor(() => row.progress === 3255);
  assert.equal(row.duration, 6000);
  assert.equal(row.source_type, "rd");
  assert.equal(JSON.parse(decodeURIComponent(row.video_url.slice(9))).infoHash, "moviehash");
  assert.equal(rows.length, 1);
  dispatch("mg:native-player-result", {
    requestId, reason: "back", positionMs: 100000, durationMs: 6000000,
  });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(row.progress, 3255, "Ignore callbacks after the native player closed");
});

test("native episode progress and Back update the exact episode, never an adjacent episode", async () => {
  const rows = [], dispatch = mountHistory(rows);
  const context = {
    mediaType: "tv", tmdbId: "77", title: "Example Show", year: "2025",
    season: 2, episode: 3,
  };
  dispatch("mg:player-context", context);
  const requestId = id("episode");
  dispatch("mg:native-playback-progress", {
    requestId, tmdbId: 77, season: 2, episode: 4,
    positionSeconds: 800, durationSeconds: 2200,
  });
  assert.equal(rows.length, 0, "Reject a different episode");
  dispatch("mg:native-playback-progress", {
    requestId, tmdbId: 77, season: 2, episode: 3,
    positionSeconds: 808, durationSeconds: 2200,
  });
  await waitFor(() => rows.length === 1 && rows[0].progress === 808);
  assert.match(rows[0].content_key, /\|tv\|2025\|2\|3\|/);
  dispatch("mg:native-player-result", {
    requestId, reason: "back", positionMs: 1122000, durationMs: 2200000,
  });
  await waitFor(() => rows[0].progress === 1122);
  dispatch("mg:native-playback-progress", {
    requestId, tmdbId: 77, season: 2, episode: 3,
    positionSeconds: 150, durationSeconds: 2200,
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(rows[0].progress, 1122, "Late callbacks cannot rewind a completed session");
  assert.equal(rows.length, 1);
});

test("history fix uses existing native callbacks without changing protected video launch", () => {
  const tracker = read("src/components/mg/ContinueWatchingAssist.jsx");
  const bridge = read("src/components/mg/nativeFireTvBridge.js");
  assert.match(tracker, /"mg:native-playback-progress", onNativePlaybackProgress/);
  assert.match(tracker, /"mg:native-player-result", onNativePlayerResult/);
  assert.match(tracker, /nativeContextStartedAt/);
  assert.match(tracker, /closedNativeRequests/);
  assert.doesNotMatch(bridge, /mg:native-resume-session/);
  assert.match(bridge, /setNativePlaybackOwnership\(accepted\);\s*return accepted;/);
});
