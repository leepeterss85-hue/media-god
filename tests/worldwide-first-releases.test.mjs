import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const backends = [
  "deploy/media-god-api/getTmdbMovies.mjs",
  "base44/functions/getTmdbMovies/entry.ts",
];

for (const path of backends) {
  test(path + " keeps local provider entitlements separate from worldwide film dates", () => {
    const source = read(path);
    const begin = source.indexOf("    const buildGlobalReleaseUrl =");
    const end = source.indexOf("    const providerPageCount =", begin);
    assert.ok(begin >= 0 && end > begin);
    const context = {
      URL,
      recentStreamingMovies: true,
      buildUrl: page =>
        "https://api.themoviedb.org/3/discover/movie?" +
        "region=GB&watch_region=GB&with_watch_monetization_types=flatrate%7Cfree%7Cads" +
        "&with_release_type=4&release_date.lte=2026-11-08&page=" + page,
    };
    vm.createContext(context);
    vm.runInContext(source.slice(begin, end) +
      "\nglobalThis.queries = { worldwide: buildGlobalReleaseUrl(1), us: buildRegionalReleaseUrl(1, 'US') };", context);
    const worldwide = new URL(context.queries.worldwide).searchParams;
    const us = new URL(context.queries.us).searchParams;
    assert.equal(worldwide.has("region"), false);
    assert.equal(worldwide.has("watch_region"), false);
    assert.equal(worldwide.has("with_watch_monetization_types"), false);
    assert.equal(worldwide.get("with_release_type"), "4");
    assert.equal(us.get("region"), "US");
    assert.equal(us.get("watch_region"), "US");
    assert.equal(us.get("with_watch_monetization_types"), "flatrate|free|ads");
  });

  test(path + " includes US-first releases, keeps the earliest date and rejects future listings", async () => {
    const source = read(path);
    const begin = source.indexOf("    const globalReleasedDates =");
    const end = source.indexOf("    const seen =", begin);
    assert.ok(begin >= 0 && end > begin);
    const context = {
      includeGlobalReleases: true,
      pages: 5,
      pageResults: [{ results: [
        { id: 101, release_date: "2026-11-08" },
        { id: 404, release_date: "2026-11-07" },
      ] }],
      category: "cinema_latest",
      region: "GB",
      cinemaLatest: true,
      recentStreamingMovies: false,
      cinemaSince: "2026-09-13",
      recentReleaseSince: "2026-07-11",
      requestedDate: "2026-11-08",
      validYmd: date => /^\\d{4}-\\d{2}-\\d{2}$/.test(String(date)),
      buildGlobalReleaseUrl: page => "https://example.test/discover?world=true&page=" + page,
      buildRegionalReleaseUrl: (page, country) => "https://example.test/discover?region=" + country + "&page=" + page,
      fetch: async url => ({
        ok: true,
        json: async () => ({
          results: url.includes("region=US") ? [
            { id: 101, release_date: "2026-11-05" },
            { id: 202, release_date: "2026-11-06" },
          ] : [
            { id: 303, release_date: "2026-11-02" },
            { id: 999, release_date: "2026-11-15" },
          ],
        }),
      }),
    };
    vm.createContext(context);
    await vm.runInContext(
      "(async () => {\n" + source.slice(begin, end) +
      "\nglobalThis.out = { dates: [...globalReleasedDates], rows: pageResults.flatMap(p => p.results || []) };\n})()",
      context
    );
    const dates = new Map(context.out.dates);
    assert.equal(dates.get("101"), "2026-11-05");
    assert.equal(dates.get("202"), "2026-11-06");
    assert.equal(dates.get("303"), "2026-11-02");
    assert.equal(dates.get("404"), "2026-11-07");
    assert.equal(dates.has("999"), false);
    assert.equal(context.out.rows.some(x => x.id === 202), true);
    assert.equal(context.out.rows.some(x => x.id === 999), false);
  });
}
