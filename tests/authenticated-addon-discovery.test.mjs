import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fetchAddonStreams from "../deploy/media-god-rd-api/fetchAddonStreams.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const reqFor = ({userId, addon, body}) => {
  const request = new Request("http://127.0.0.1/functions/fetchAddonStreams", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  });
  const user = {id:userId};
  const client = {
    auth: {me: async () => user},
    entities: {Addon: {list: async () => [addon]}},
  };
  Object.defineProperties(request, {
    __mediaGodVerifiedClient: {value: client},
    __mediaGodVerifiedUser: {value: user},
    __mediaGodVerifiedUserId: {value: userId},
  });
  return request;
};

test("authenticated Railway discovery loads the signed-in user's private addon list", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  try {
    globalThis.fetch = async url => {
      requested.push(String(url));
      if (String(url).endsWith("manifest.json")) {
        return Response.json({
          id: "com.media-god.test", version: "1.0.0",
          resources: [{name:"stream", types:["movie"], idPrefixes:["tt"]}],
          types: ["movie"],
        });
      }
      return Response.json({
        streams: [{
          name: "Custom source",
          title: "Custom source | English WEB-DL",
          infoHash: "a".repeat(40),
          fileIdx: 0,
          sources: ["tracker:https://tracker.example.org/announce"],
        }],
      });
    };
    const result = await fetchAddonStreams(reqFor({
      userId: "signed-in-1",
      addon: {
        name: "MyPersonalAddon",
        url: "https://personal-addon.example.org/manifest.json",
        installed: true, active: true,
      },
      body: {
        imdb_id: "tt1375666", title: "Inception",
        media_type: "movie", fast_mode: false,
        include_addons: ["MyPersonalAddon"],
      },
    }));
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.addons_checked, 1, JSON.stringify(data.diagnostics));
    assert.ok(data.streams.length > 0, JSON.stringify(data.diagnostics));
    assert.ok(data.streams.some(source =>
      String(source?.label || "").includes("MyPersonalAddon")), "Account addon returned a playable torrent");
    assert.ok(requested.every(url => url.startsWith("https://personal-addon.example.org/")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("source lookup is isolated to the verified account and never exposed by the anonymous endpoint", () => {
  const privateServer = read("deploy/media-god-rd-api/server.mjs");
  const publicServer = read("deploy/media-god-api/server.mjs");
  const publicHandler = read("deploy/media-god-api/fetchAddonStreams.mjs");
  const client = read("src/api/base44Client.js");
  assert.match(privateServer, /"\/functions\/fetchAddonStreams": fetchAddonStreams/);
  assert.match(privateServer, /client\.auth\.me\(\)/);
  assert.match(privateServer, /if \(!verified\) return respond\(res, 401/);
  assert.match(client, /readAccountSessionToken\(\)/);
  assert.match(client, /invokeIndependentRealDebrid\(name, payload/);
  assert.match(client, /return invokeIndependentAddonSources\(payload\)/);
  assert.match(publicHandler, /auth: \{ me: async \(\) => null \}/);
  assert.doesNotMatch(publicServer, /"\/functions\/fetchAddonStreams":.*verifiedClient/);
});

test("both backend discovery paths honour upstream 429 instead of immediately retrying it", () => {
  for (const path of [
    "deploy/media-god-api/fetchAddonStreams.mjs",
    "deploy/media-god-rd-api/fetchAddonStreams.mjs",
  ]) {
    const code = read(path);
    assert.match(code, /const addonCooldownUntil = new Map\(\)/);
    assert.match(code, /if \(result\?\.status === 429\)/);
    assert.match(code, /Date\.now\(\) \+ 45_000/);
    assert.doesNotMatch(code, /result\?\.status === 429\s*\|\|\s*result\?\.status === 500/);
  }
  const publicServer = read("deploy/media-god-api/server.mjs");
  assert.match(publicServer, /const emptySourceLookup = sourceLookup/);
  assert.match(publicServer, /emptySourceLookup \? 8_000 : CACHE_MS/);
});
