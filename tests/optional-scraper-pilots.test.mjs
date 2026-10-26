import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OPTIONAL_SCRAPER_PILOTS,
  isBareOptionalPilotManifest,
  isOptionalScraperPilot,
  redactOptionalPilotManifest,
  buildOrionTorrentOnlyManifest,
} from "../src/components/mg/optionalScraperPilots.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("optional candidates are discoverable only by explicit setup, not installed by default", () => {
  assert.deepEqual(OPTIONAL_SCRAPER_PILOTS.map(item => item.name), ["Orion", "StremThru Torz"]);
  assert.ok(OPTIONAL_SCRAPER_PILOTS.every(item =>
    item.configureUrl.startsWith("https://") && item.configureUrl.endsWith("/configure")
  ));
  assert.equal(isOptionalScraperPilot("orion"), true);
  assert.equal(isOptionalScraperPilot("Orion2"), true, "a replacement saved as Orion2 gets an isolated test button");
  assert.equal(isOptionalScraperPilot("Orion-3"), true);
  assert.equal(isOptionalScraperPilot("orion-backdoor"), false);
  assert.equal(isOptionalScraperPilot("StremThru Torz"), true);
  assert.equal(isOptionalScraperPilot("Torrentio"), false);

  const frontend = read("src/components/mg/AddonsView.jsx");
  const backend = read("base44/functions/testScraperCandidate/entry.ts");
  assert.match(frontend, /data-mg-optional-scraper-pilots/);
  assert.match(frontend, /active: !isOptionalScraperPilot\(name\)/);
  assert.match(frontend, /base44\.functions\.invoke\("testScraperCandidate"/);
  assert.match(frontend, /isBareOptionalPilotManifest\(name, url\)/);
  assert.match(backend, /base44\.auth\.me\(\)/);
  assert.match(backend, /base44\.entities\.Addon\.list/);
  assert.match(backend, /const addon = .*\.find\(item => clean\(item\?\.id\) === id\)/);
  assert.match(backend, /const manifest = await readBoundedJson\(response\)/);
  const discovery = read("base44/functions/fetchAddonStreams/entry.ts");
  const builtinBlock = discovery.slice(
    discovery.indexOf("const BUILTIN_PUBLIC_PLAYBACK_ADDONS"),
    discovery.indexOf("const addonUrlKey")
  );
  assert.doesNotMatch(builtinBlock, /Orion|StremThru/);
});

test("pilot setup blocks publicly unconfigured manifests", () => {
  assert.equal(isBareOptionalPilotManifest("Orion", "https://orion.example/manifest.json"), true);
  assert.equal(isBareOptionalPilotManifest("Orion2", "https://orion.example/manifest.json"), true);
  assert.equal(isBareOptionalPilotManifest("StremThru Torz", "https://stremthru.example/stremio/torz/manifest.json"), true);
  assert.equal(isBareOptionalPilotManifest("StremThru Torz", "https://stremthru.example/stremio/torz/ENCRYPTED/manifest.json"), false);
  assert.equal(isBareOptionalPilotManifest("Orion", "https://orion.example/encoded-credentials/manifest.json"), false);
  assert.equal(isBareOptionalPilotManifest("Torrentio", "https://torrentio.example/manifest.json"), false);
  assert.equal(isBareOptionalPilotManifest("Orion", "not-a-url"), false);
});

test("configured candidate manifest secrets stay hidden on the addons screen", () => {
  for (const name of ["Orion", "Orion2", "StremThru Torz"]) {
    const secret = "PRIVATE_ABC123";
    const url = "https://user:password@demo.example/stremio/torz/" + secret + "/manifest.json?auth=" + secret;
    const result = redactOptionalPilotManifest(name, url);
    assert.equal(result, "https://demo.example/[configured-profile]/manifest.json");
    assert.doesNotMatch(result, /PRIVATE_ABC123|user|password|auth=/);
  }
  assert.equal(redactOptionalPilotManifest("Other", "https://example.com/manifest.json"), null);
  assert.equal(redactOptionalPilotManifest("Orion", "garbled"), "Configured manifest (hidden)");
});

test("Orion torrent mode preserves private settings while bypassing Orion direct debrid resolves", () => {
  const profile = {
    api: "TEST_SECRET_KEY_NOT_FOR_LOGS",
    listOpt: "debrid",
    linkLimit: "5",
    debridservices: ["realdebrid"],
    videoquality: "hd",
    sortValue: "size",
    audiolanguages: ["en"],
  };
  const profileText = btoa(JSON.stringify(profile));
  const manifest = "https://5a0d1888fa64-orion.baby-beamup.club/" + profileText + "/manifest.json";
  const converted = buildOrionTorrentOnlyManifest(manifest);
  assert.ok(converted.startsWith("https://5a0d1888fa64-orion.baby-beamup.club/"));
  assert.notEqual(converted, manifest);
  const encoded = new URL(converted).pathname.split("/")[1];
  const decoded = JSON.parse(atob(encoded));
  assert.equal(decoded.listOpt, "torrent");
  assert.deepEqual(decoded.debridservices, ["realdebrid"], "existing private authorization not modified");
  assert.equal(decoded.api, profile.api, "API key preserved inside the private profile");
  assert.equal(decoded.linkLimit, "5");
  assert.equal(decoded.audiolanguages[0], "en");
  assert.equal(buildOrionTorrentOnlyManifest(converted), null, "idempotent");
  assert.throws(() => buildOrionTorrentOnlyManifest("https://untrusted.example/" + profileText + "/manifest.json"));
  assert.throws(() => buildOrionTorrentOnlyManifest("https://5a0d1888fa64-orion.baby-beamup.club/manifest.json"));
  assert.throws(() => buildOrionTorrentOnlyManifest("https://5a0d1888fa64-orion.baby-beamup.club/bad/manifest.json"));
  assert.throws(() => buildOrionTorrentOnlyManifest("https://5a0d1888fa64-orion.baby-beamup.club/" + btoa(JSON.stringify({ listOpt: "debrid" })) + "/manifest.json"));
});

test("the Orion torrent-mode option creates a disabled candidate and preserves the original", () => {
  const ui = read("src/components/mg/AddonsView.jsx");
  assert.match(ui, /data-mg-orion-torrent-mode/);
  assert.match(ui, /buildOrionTorrentOnlyManifest\(addon.url\)/);
  assert.match(ui, /base44.entities.Addon.update\(addon.id, \{ active: false \}\)/);
  assert.match(ui, /base44.entities.Addon.create\(\{/);
  assert.match(ui, /active: false,\s*installed: true,\s*description: "Experimental Orion torrent-only results/);
  assert.match(ui, /testCandidateAddon\(addon\)/);
  assert.doesNotMatch(ui, /console\.log\(.*converted|console\.log\(.*addon.url/);
});

test("Orion 404 diagnostics check account connection without probing a torrent or exposing secrets", () => {
  const ui = read("src/components/mg/AddonsView.jsx");
  const start = ui.indexOf("const checkOrionRealDebrid = async () => {");
  const end = ui.indexOf("const testCandidateAddon =", start);
  const body = ui.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /base44.functions.invoke\("realDebridAuth", \{\s*action: "status"/);
  assert.match(body, /status\?\.connected/);
  assert.match(body, /status\?\.premium/);
  assert.match(body, /info failed: 404/);
  assert.doesNotMatch(body, /addon\.url|magnet|token|api_key|add_magnet|torrent_info|\.update\(/);
  assert.match(ui, /data-mg-orion-rd-diagnostics="true"/);
  assert.match(ui, /Check my Real-Debrid connection/);
});

test("the optional scraper check is read-only and leaves playback/navigation code alone", () => {
  const branch = read("base44/functions/testScraperCandidate/entry.ts");
  assert.match(branch, /if \(!user\) return reply/);
  assert.match(branch, /base44\.entities\.Addon\.list/);
  assert.match(branch, /const addon = .*\.find/);
  assert.match(branch, /ALLOWED_PROVIDERS/);
  assert.match(branch, /\^orion\(\?:\[ _-\]\?\\d\+\)\?\$/);
  assert.match(branch, /redirect: "error"/);
  assert.match(branch, /const limit = 64 \* 1024/);
  assert.match(branch, /readBoundedJson\(response\)/);
  assert.doesNotMatch(branch, /lookupAddon|activeAddons\.push|Addon\.create|Addon\.update|stream\/|playback_url/);
  const ui = read("src/components/mg/AddonsView.jsx");
  assert.match(ui, /Test candidate/);
  assert.match(ui, /The working scrapers were not changed/);
});
