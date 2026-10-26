import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const candidates = [
  "base44/functions/fetchAddonStreams/entry.ts",
  "src/components/mg/addonBrowserFallback.js",
];

const sample = {
  name: "🚀 ORION",
  title: "⚠️ ERROR! \nToo many debrid resolutions.",
  url: "https://github.com/gorlev/orion-stremio-addon/blob/main/videos/error.mp4?raw=true",
};
const torrentError = {
  name: "🪐 ORION",
  title: "⚠️ ERROR! \nNo API links remaining.",
  url: "https://github.com/gorlev/orion-stremio-addon/blob/main/videos/error-general.mp4?raw=true",
};

for (const file of candidates) {
  test(file + " never exposes Orion error-video controls as playable streams", () => {
    const source = read(file);
    const start = source.indexOf("const isAddonControlStream =");
    const end = source.indexOf("};", start) + 2;
    assert.ok(start > 0 && end > start, "guard function present");
    const fn = vm.runInNewContext(
      source.slice(start, end) + "\nisAddonControlStream;",
      { clean: v => String(v || "").trim() }
    );
    for (const addon of ["Orion", "Orion2", "Orion-3"]) {
      assert.equal(fn(sample, addon), true);
      assert.equal(fn(torrentError, addon), true);
      assert.equal(fn({ ...sample, title: "Ordinary HD release" }, addon), true, "known placeholder URL is always an error");
      assert.equal(fn({ ...sample, url: "https://raw.githubusercontent.com/gorlev/orion-stremio-addon/main/videos/error.mp4" }, addon), true);
      assert.equal(fn({ name: "🚀 ORION [Real-Debrid]", title: "Movie.1080p.WEB-DL", url: "https://valid.example/download/abc" }, addon), false);
      assert.equal(fn({ name: "🪐 ORION", title: "Film.1080p", infoHash: "a".repeat(40) }, addon), false);
    }
    assert.equal(fn({ ...sample, title: "Film.1080p", url: "https://cdn.example/film.mp4" }, "Torrentio"), false);
    assert.equal(fn({ ...sample, title: "Film.1080p", url: "https://cdn.example/film.mp4" }, "Comet"), false);
    assert.equal(fn({ name: "[❌] Comet sync", title: "Control", url: "" }, "Comet"), true);
    assert.match(source, /isAddonControlStream\(stream, addonName\)/);
  });
}
