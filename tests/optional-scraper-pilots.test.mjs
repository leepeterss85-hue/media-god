import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OPTIONAL_SCRAPER_PILOTS,
  isBareOptionalPilotManifest,
  isOptionalScraperPilot,
  redactOptionalPilotManifest,
} from "../src/components/mg/optionalScraperPilots.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("optional candidates are discoverable only by explicit setup, not installed by default", () => {
  assert.deepEqual(OPTIONAL_SCRAPER_PILOTS.map(item => item.name), ["Orion", "StremThru Torz"]);
  assert.ok(OPTIONAL_SCRAPER_PILOTS.every(item =>
    item.configureUrl.startsWith("https://") && item.configureUrl.endsWith("/configure")
  ));
  assert.equal(isOptionalScraperPilot("orion"), true);
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
  assert.equal(isBareOptionalPilotManifest("StremThru Torz", "https://stremthru.example/stremio/torz/manifest.json"), true);
  assert.equal(isBareOptionalPilotManifest("StremThru Torz", "https://stremthru.example/stremio/torz/ENCRYPTED/manifest.json"), false);
  assert.equal(isBareOptionalPilotManifest("Orion", "https://orion.example/encoded-credentials/manifest.json"), false);
  assert.equal(isBareOptionalPilotManifest("Torrentio", "https://torrentio.example/manifest.json"), false);
  assert.equal(isBareOptionalPilotManifest("Orion", "not-a-url"), false);
});

test("configured candidate manifest secrets stay hidden on the addons screen", () => {
  for (const name of ["Orion", "StremThru Torz"]) {
    const secret = "PRIVATE_ABC123";
    const url = "https://user:password@demo.example/stremio/torz/" + secret + "/manifest.json?auth=" + secret;
    const result = redactOptionalPilotManifest(name, url);
    assert.equal(result, "https://demo.example/[configured-profile]/manifest.json");
    assert.doesNotMatch(result, /PRIVATE_ABC123|user|password|auth=/);
  }
  assert.equal(redactOptionalPilotManifest("Other", "https://example.com/manifest.json"), null);
  assert.equal(redactOptionalPilotManifest("Orion", "garbled"), "Configured manifest (hidden)");
});

test("the optional scraper check is read-only and leaves playback/navigation code alone", () => {
  const branch = read("base44/functions/testScraperCandidate/entry.ts");
  assert.match(branch, /if \(!user\) return reply/);
  assert.match(branch, /base44\.entities\.Addon\.list/);
  assert.match(branch, /const addon = .*\.find/);
  assert.match(branch, /ALLOWED_PROVIDERS/);
  assert.match(branch, /redirect: "error"/);
  assert.match(branch, /const limit = 64 \* 1024/);
  assert.match(branch, /readBoundedJson\(response\)/);
  assert.doesNotMatch(branch, /lookupAddon|activeAddons\.push|Addon\.create|Addon\.update|stream\/|playback_url/);
  const ui = read("src/components/mg/AddonsView.jsx");
  assert.match(ui, /Test candidate/);
  assert.match(ui, /The working scrapers were not changed/);
});
