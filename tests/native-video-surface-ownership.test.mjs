import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function video({ paused = true, url = "https://media.test/movie.mp4" } = {}) {
  const attributes = new Map([["src", url], ["poster", "poster.jpg"]]);
  const styles = new Map();
  return {
    paused, ended: false, currentSrc: url, pauses: 0, loads: 0,
    style: { setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name) },
    styles,
    getAttribute: name => attributes.get(name) || null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    querySelectorAll: () => [],
    pause() { this.paused = true; this.pauses += 1; },
    load() { this.loads += 1; },
  };
}

async function installGuard(platform, stages, outside = []) {
  const pkg = platform === "android-mobile" ? "mobile" : "firetv";
  const source = readFileSync(new URL(`../${platform}/app/src/main/java/com/mediagod/${pkg}/MainActivity.kt`, import.meta.url), "utf8");
  const start = source.indexOf("if(!window.__MG_SINGLE_VIDEO_SURFACE_GUARD__){");
  const end = source.indexOf("window.dispatchEvent(new CustomEvent('mg:", start);
  assert.ok(start >= 0 && end > start, "Native bootstrap must contain its video surface guard");
  const listeners = new Map();
  const window = { addEventListener: (name, callback) => listeners.set(name, callback) };
  const document = {
    body: {},
    addEventListener: (name, callback) => listeners.set(name, callback),
    querySelectorAll: selector => selector === '[data-mg-player-stage="true"]'
      ? stages.map(videos => ({ querySelectorAll: () => videos }))
      : [...stages.flat(), ...outside],
  };
  vm.runInNewContext(source.slice(start, end), {
    window, document, Promise,
    MutationObserver: class { observe() {} },
  });
  await Promise.resolve();
  return async name => { listeners.get(name)?.(); await Promise.resolve(); };
}

for (const platform of ["android-mobile", "firetv-android"]) {
  test(`${platform}: a Cast helper outside the stage cannot strip a paused resume video's source`, async () => {
    const movie = video();
    const castHelper = video({ url: "blob:cast-helper" });
    await installGuard(platform, [[movie]], [castHelper]);
    assert.equal(movie.getAttribute("src"), "https://media.test/movie.mp4");
    assert.equal(movie.pauses, 0);
    assert.equal(movie.loads, 0);
    assert.equal(movie.styles.get("display"), undefined);
  });

  test(`${platform}: DOM order cannot retire the playing movie when a helper mounts inside the stage`, async () => {
    const movie = video({ paused: false });
    const helper = video({ url: "blob:cast-helper" });
    await installGuard(platform, [[movie, helper]]);
    assert.equal(movie.getAttribute("src"), "https://media.test/movie.mp4");
    assert.equal(movie.paused, false);
    assert.equal(movie.loads, 0);
    assert.equal(movie.styles.get("display"), undefined);
    assert.equal(helper.getAttribute("src"), "blob:cast-helper");
    assert.equal(helper.styles.get("display"), "none");
  });

  test(`${platform}: a paused seek/resume preserves both candidates until ownership is clear`, async () => {
    const previous = video();
    const resumed = video({ url: "https://media.test/resumed.mp4" });
    resumed.styles.set("display", "none");
    await installGuard(platform, [[previous, resumed]]);
    for (const candidate of [previous, resumed]) {
      assert.ok(candidate.getAttribute("src"));
      assert.equal(candidate.loads, 0);
      assert.equal(candidate.styles.get("display"), undefined);
    }
  });

  test(`${platform}: retiring a paused surface is reversible when it becomes the active video`, async () => {
    const movie = video({ paused: false });
    const next = video({ url: "https://media.test/resumed.mp4" });
    const emit = await installGuard(platform, [[movie, next]]);
    movie.paused = true;
    next.paused = false;
    await emit("play");
    assert.equal(next.styles.get("display"), undefined);
    assert.equal(next.getAttribute("src"), "https://media.test/resumed.mp4");
    assert.equal(next.paused, false);
    assert.equal(movie.getAttribute("src"), "https://media.test/movie.mp4");
  });
}
