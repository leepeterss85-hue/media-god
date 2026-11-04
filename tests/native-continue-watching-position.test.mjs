import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const sourceText = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const loadTracker = (rows) => {
  const listeners = new Map();
  const emit = (type, detail) => listeners.get(type)?.({ type, detail });
  const window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    dispatchEvent: event => emit(event.type, event.detail),
  };
  const document = {
    addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], visibilityState: "visible",
  };
  const library = {
    list: async () => rows,
    filter: async ({ content_key }) => rows.filter(row => row.content_key === content_key),
    create: async patch => {
      const row = { id: `history-${rows.length + 1}`, ...patch };
      rows.push(row);
      return row;
    },
    update: async (id, patch) => {
      const row = rows.find(row => row.id === id);
      if (!row) throw Error("History row missing");
      Object.assign(row, patch);
      return row;
    },
  };
  const code = sourceText("src/components/mg/ContinueWatchingAssist.jsx")
    .replace(/import[\s\S]*?from "[^"]+";/g, "")
    .replace("export default function", "function");
  vm.runInNewContext(code + "\nContinueWatchingAssist();", {
    useRef: value => ({ current: value }), useEffect: callback => callback(),
    window, document, profiledLibrary: { ContinueWatching: library },
    EMBED_HISTORY_CHANGED: "mg:history-changed",
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
    HTMLVideoElement: class {},
  });
  return { emit, listeners };
};
const waitFor = async check => {
  for (let attempt = 0; attempt < 80 && !check(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(check(), "Timed out waiting for an account-backed native resume write");
};

test("native film Back/Exit saves the exact position instead of five-second placeholder", async () => {
  const resumeSource = { infoHash: "moviehash", fileIdx: 3, viaRealDebrid: true };
  const row = {
    id: "movie",
    content_key: "mg2|42|movie|2026|||Test",
    title: "Test",
    progress: 3120,
    duration: 6000,
    video_url: "mgsource:" + encodeURIComponent(JSON.stringify(resumeSource)),
    source_type: "rd",
  };
  const rows = [row];
  const { emit } = loadTracker(rows);
  emit("mg:player-context", { mediaType: "movie", tmdbId: "42", title: "Test", year: "2026" });
  emit("mg:native-resume-session", { requestId: "movie-current", mediaType: "movie", tmdbId: 42, startTime: 3120 });
  emit("mg:native-player-result", { requestId: "previous-title", reason: "back", positionMs: 650000, durationMs: 6000000 });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(row.progress, 3120, "Reject callbacks from earlier native sessions");
  emit("mg:native-player-result", { requestId: "movie-current", reason: "back", positionMs: 3255000, durationMs: 6000000 });
  await waitFor(() => row.progress === 3255);
  assert.equal(row.duration, 6000);
  assert.equal(row.source_type, "rd");
  assert.equal(JSON.parse(decodeURIComponent(row.video_url.slice(9))).infoHash, "moviehash");
  assert.equal(rows.length, 1);
});

test("native TV progress and stop save exact episode while rejecting stale episode callbacks", async () => {
  const rows = [];
  const { emit } = loadTracker(rows);
  const context = { mediaType: "tv", tmdbId: "77", title: "Example Show", year: "2025", season: 2, episode: 3 };
  emit("mg:player-context", context);
  emit("mg:native-resume-session", { requestId: "tv-current", mediaType: "tv", tmdbId: 77, season: 2, episode: 3 });
  emit("mg:native-playback-progress", {
    requestId: "tv-current", tmdbId: 77, season: 2, episode: 4,
    positionSeconds: 800, durationSeconds: 2200,
  });
  assert.equal(rows.length, 0, "Another episode must never overwrite the active episode");
  emit("mg:native-playback-progress", {
    requestId: "tv-current", tmdbId: 77, season: 2, episode: 3,
    positionSeconds: 808, durationSeconds: 2200,
  });
  await waitFor(() => rows.length === 1 && rows[0].progress === 808);
  assert.match(rows[0].content_key, /\|tv\|2025\|2\|3\|/);
  emit("mg:native-player-result", {
    requestId: "tv-current", reason: "back", positionMs: 1122000, durationMs: 2200000,
  });
  await waitFor(() => rows[0].progress === 1122);
  emit("mg:native-playback-progress", {
    requestId: "tv-current", tmdbId: 77, season: 2, episode: 3,
    positionSeconds: 200, durationSeconds: 2200,
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(rows[0].progress, 1122, "Finished native session must not accept late progress");
  assert.equal(rows.length, 1);
});

test("native launch binds history only after Android accepts the request without leaking source credentials", () => {
  const bridge = sourceText("src/components/mg/nativeFireTvBridge.js");
  assert.match(bridge, /if \(accepted && !live && typeof window !== "undefined"\)/);
  assert.match(bridge, /new CustomEvent\("mg:native-resume-session"/);
  const metadata = bridge.slice(bridge.indexOf('new CustomEvent("mg:native-resume-session"'));
  assert.doesNotMatch(metadata.slice(0, 320), /streamUrl|payload\.url|headers|rd_token/);
});

test("native tracking leaves working VideoPlayer, Android and Fire Stick playback files unchanged", () => {
  const tracker = sourceText("src/components/mg/ContinueWatchingAssist.jsx");
  assert.match(tracker, /"mg:native-playback-progress", onNativePlaybackProgress/);
  assert.match(tracker, /"mg:native-player-result", onNativePlayerResult/);
  assert.match(tracker, /String\(detail\?\.requestId \|\| ""\) === state\.nativeRequestId/);
});
