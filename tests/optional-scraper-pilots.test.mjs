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
  const backend = read("base44/functions/fetchAddonStreams/entry.ts");
  assert.match(frontend, /data-mg-optional-scraper-pilots/);
  assert.match(frontend, /active: !isOptionalScraperPilot\(name\)/);
  assert.match(frontend, /action: "health_candidate", candidate_addon_id: addon.id/);
  assert.match(frontend, /isBareOptionalPilotManifest\(name, url\)/);
  assert.match(backend, /action === "health_candidate"/);
  assert.match(backend, /addons\.find\(\(item\) => clean\(item\?\.id\) === candidateId\)/);
  assert.match(backend, /const result = await healthCheckAddon\(candidate\)/);
  assert.ok(backend.indexOf('action === "health_candidate"') < backend.indexOf('action === "trigger_comet_playback"'));
  const builtinBlock = backend.slice(
    backend.indexOf("const BUILTIN_PUBLIC_PLAYBACK_ADDONS"),
    backend.indexOf("const addonUrlKey")
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
  const backend = read("base44/functions/fetchAddonStreams/entry.ts");
  const branch = backend.slice(
    backend.indexOf('if (action === "health_candidate")'),
    backend.indexOf('if (action === "trigger_comet_playback")')
  );
  assert.match(branch, /user && candidateId/);
  assert.match(branch, /addons\.find/);
  assert.match(branch, /healthCheckAddon\(candidate\)/);
  assert.doesNotMatch(branch, /lookupAddon|activeAddons\.push|Addon\.create|Addon\.update|stream\/|playback_url/);
  const ui = read("src/components/mg/AddonsView.jsx");
  assert.match(ui, /Test candidate/);
  assert.match(ui, /The working scrapers were not changed/);
});
