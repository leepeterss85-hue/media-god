import test from "node:test";
import assert from "node:assert/strict";

import {
  CATCH_UP_SERVICES,
  filterCatchUpServices,
} from "../src/components/mg/catchUpServices.js";
import {
  PUBLIC_PLAYLIST_PRESETS,
  hasPlaylistUrl,
} from "../src/components/mg/publicPlaylistPresets.js";
import {
  safeWatchUrl,
  watchmodeSourceLinks,
} from "../src/components/mg/officialWatchLinks.js";
import {
  resolveStreamingServices,
} from "../src/components/mg/streamingServices.js";

test("worldwide additions preserve original catch-up services with unique IDs", () => {
  const ids = CATCH_UP_SERVICES.map((service) => service.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(CATCH_UP_SERVICES.length >= 60);
  for (const id of ["bbc", "itvx", "channel4", "five", "u", "stv", "pbs", "cbc", "abc", "tv5"]) {
    assert.ok(ids.includes(id), `Original service lost: ${id}`);
  }
  for (const id of ["tubi", "plutotv", "plexwatch", "rte", "npo", "hotstar", "netflix", "primevideo"]) {
    assert.ok(ids.includes(id), `New service missing: ${id}`);
  }
  assert.ok(CATCH_UP_SERVICES.every((service) => service.url.startsWith("https://")));
  assert.ok(filterCatchUpServices({ query: "Pluto" }).some((service) => service.id === "plutotv"));
  assert.ok(filterCatchUpServices({ region: "Oceania" }).some((service) => service.id === "tvnz"));
});

test("country presets are unique optional feeds, and existing URLs are not re-added", () => {
  assert.ok(PUBLIC_PLAYLIST_PRESETS.length >= 25);
  assert.equal(new Set(PUBLIC_PLAYLIST_PRESETS.map((p) => p.id)).size, PUBLIC_PLAYLIST_PRESETS.length);
  assert.equal(new Set(PUBLIC_PLAYLIST_PRESETS.map((p) => p.url)).size, PUBLIC_PLAYLIST_PRESETS.length);
  assert.ok(PUBLIC_PLAYLIST_PRESETS.every((p) => /^https:\/\/iptv-org\.github\.io\/iptv\/countries\/[a-z]{2}\.m3u$/.test(p.url)));
  const us = PUBLIC_PLAYLIST_PRESETS.find((p) => p.country === "United States");
  assert.ok(us);
  assert.equal(hasPlaylistUrl([{ url: us.url.toUpperCase() }], us.url), true);
  assert.equal(hasPlaylistUrl([], us.url), false);
});

test("Watchmode sources are linked only to selected region and valid web destinations", () => {
  const sources = [
    { name: "Netflix", type: "sub", region: "GB", web_url: "https://www.netflix.com/watch/example" },
    { name: "Netflix", type: "sub", region: "GB", web_url: "https://www.netflix.com/watch/other" },
    { name: "Hulu", type: "sub", region: "US", web_url: "https://www.hulu.com/series/test" },
    { name: "Unsafe", type: "free", region: "GB", web_url: "javascript:alert(1)" },
    { name: "No link", region: "GB" },
  ];
  assert.equal(safeWatchUrl("javascript:alert(1)"), "");
  assert.equal(safeWatchUrl("https://user:pass@example.com/"), "");
  const links = watchmodeSourceLinks(sources, { region: "gb" });
  assert.equal(links.length, 1);
  assert.equal(links[0].name, "Netflix");
  assert.equal(links[0].tier, "Subscription");
  assert.ok(links[0].url.startsWith("https://www.netflix.com/"));
});

test("Watchmode Android TV links are preferred only for TV devices", () => {
  const sources = [{
    name: "Prime Video",
    type: "sub",
    region: "GB",
    web_url: "https://www.primevideo.com/detail/test",
    android_tv_url: "https://app.primevideo.com/tv/test",
  }];
  assert.ok(watchmodeSourceLinks(sources, { region: "GB" })[0].url.includes("www.primevideo.com"));
  assert.ok(watchmodeSourceLinks(sources, { region: "GB", preferTv: true })[0].url.includes("app.primevideo.com"));
});

test("HBO Max name matching does not swallow VRT MAX or Showmax", () => {
  const catalog = [
    { provider_id: 1, provider_name: "VRT MAX" },
    { provider_id: 2, provider_name: "Showmax" },
    { provider_id: 3, provider_name: "HBO Max" },
  ];
  const resolved = resolveStreamingServices(catalog);
  assert.deepEqual(resolved.find((service) => service.key === "max")?.providerIds, ["3"]);
  assert.deepEqual(resolved.find((service) => service.key === "showmax")?.providerIds, ["2"]);
  assert.deepEqual(resolved.find((service) => service.key === "vrt")?.providerIds, ["1"]);
});
