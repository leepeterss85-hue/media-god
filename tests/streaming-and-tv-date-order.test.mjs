import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  catalogueReleaseDate, formatCatalogueDate, sortCatalogueNewestFirst,
} from "../src/components/mg/catalogueDateOrder.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const backends = [
  "base44/functions/getTmdbMovies/entry.ts",
  "deploy/media-god-api/getTmdbMovies.mjs",
];

const buildDateRequest = (source, options = {}) => {
  const begin = source.indexOf("    const cinemaLatest =");
  const end = source.indexOf("    const buildGlobalReleaseUrl =");
  assert.ok(begin >= 0 && end > begin, "Real TMDB query builder must remain findable");
  const providerIds = options.providerIds || [];
  const country = options.country || "", genre = options.genre || "";
  const year = options.year || "", language = options.language || "";
  const context = {
    mediaType: options.mediaType || "movie",
    category: options.category || "streaming_recent_movies",
    providerIds,
    query: options.query || "",
    country, genre, year, language,
    body: { include_global_releases: true },
    hasFilters: Boolean(providerIds.length || country || genre || year || language),
    parsedBrowseSearch: {title: options.query || "",year:""},
    region: options.region || "GB",
    requestedDate: options.today || "2026-11-08",
    timezone: "Europe/London",
    apiKey: "ONLY_FOR_TESTS",
    TMDB_BASE: "https://api.themoviedb.org/3",
    URL, URLSearchParams, Date,
    TV_ENDPOINTS: {tv_on_the_air:"tv/on_the_air",tv_popular:"tv/popular"},
    MOVIE_ENDPOINTS: {now_playing:"movie/now_playing"},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(begin, end) +
    "\nglobalThis.exports = { buildUrl, recentStreamingMovies, recentTvPremieres, recentReleaseSince, includeGlobalReleases };", context);
  return {
    ...context.exports,
    url: new URL(context.exports.buildUrl(1)),
  };
};

for (const path of backends) {
  test(path + " latest UK digital releases use actual digital dates and available provider type", () => {
    const result = buildDateRequest(read(path));
    assert.equal(result.recentStreamingMovies, true);
    assert.equal(result.recentTvPremieres, false);
    assert.equal(result.includeGlobalReleases, true);
    assert.equal(result.url.pathname, "/3/discover/movie");
    const q = result.url.searchParams;
    assert.equal(q.get("region"), "GB");
    assert.equal(q.get("watch_region"), "GB");
    assert.equal(q.get("with_watch_monetization_types"), "flatrate|free|ads");
    assert.equal(q.get("with_release_type"), "4");
    assert.equal(q.get("sort_by"), "release_date.desc");
    assert.equal(q.get("release_date.lte"), "2026-11-08");
    assert.equal(q.get("release_date.gte"), result.recentReleaseSince);
    assert.equal(result.recentReleaseSince,
      new Date(Date.parse("2026-11-08T12:00:00Z") - 120 * 86400000).toISOString().slice(0, 10));
  });

  test(path + " digital film filters retain digital release window and streaming region", () => {
    const result = buildDateRequest(read(path), {
      region: "FR", country:"FR", genre:"28", year:"2026", language:"fr",
    });
    const q = result.url.searchParams;
    assert.equal(q.get("region"), "FR");
    assert.equal(q.get("watch_region"), "FR");
    assert.equal(q.get("with_genres"), "28");
    assert.equal(q.get("with_origin_country"), "FR");
    assert.equal(q.get("primary_release_year"), "2026");
    assert.equal(q.get("with_original_language"), "fr");
    assert.equal(q.get("with_release_type"), "4");
    assert.equal(q.get("release_date.lte"), "2026-11-08");
  });

  test(path + " newest TV premieres are sorted and never include future first-air dates", () => {
    const result = buildDateRequest(read(path), { mediaType:"tv", category:"tv_recent_premieres" });
    assert.equal(result.recentTvPremieres, true);
    assert.equal(result.url.pathname, "/3/discover/tv");
    const q = result.url.searchParams;
    assert.equal(q.get("sort_by"), "first_air_date.desc");
    assert.equal(q.get("first_air_date.lte"), "2026-11-08");
    assert.equal(q.get("first_air_date.gte"), result.recentReleaseSince);
    assert.equal(q.get("include_adult"), "false");
  });

  test(path + " provider filtered movie and TV results use correct release and premiere order", () => {
    const movie = buildDateRequest(read(path), {
      category:"popular", mediaType:"movie", providerIds:[8,119],
    });
    const mq=movie.url.searchParams;
    assert.equal(movie.url.pathname, "/3/discover/movie");
    assert.equal(mq.get("sort_by"), "primary_release_date.desc");
    assert.equal(mq.get("primary_release_date.lte"), "2026-11-08");
    assert.equal(mq.get("watch_region"), "GB");
    assert.equal(mq.get("with_watch_providers"), "8|119");
    assert.equal(mq.get("with_watch_monetization_types"), "flatrate|free|ads");

    const tv = buildDateRequest(read(path), {
      category:"tv_recent_premieres", mediaType:"tv", providerIds:[8],
    });
    const tq=tv.url.searchParams;
    assert.equal(tv.recentTvPremieres, false);
    assert.equal(tv.url.pathname, "/3/discover/tv");
    assert.equal(tq.get("sort_by"), "first_air_date.desc");
    assert.equal(tq.get("first_air_date.lte"), "2026-11-08");
    assert.equal(tq.get("watch_region"), "GB");
    assert.equal(tq.get("with_watch_providers"), "8");
  });

  test(path + " full catalogue searches preserve original search path", () => {
    const result=buildDateRequest(read(path), { query:"Dune",mediaType:"movie" });
    assert.equal(result.recentStreamingMovies, false);
    assert.equal(result.url.pathname, "/3/search/movie");
    assert.equal(result.url.searchParams.get("query"), "Dune");
  });
}

test("mixed service rows sort actual movie/TV dates, not interleave out of order", () => {
  const data=[
    { id:1, media_type:"tv", first_air_date:"2026-10-20", popularity:3 },
    { id:2, media_type:"movie", release_date:"2026-11-01", popularity:1 },
    { id:3, media_type:"tv", first_air_date:"2026-11-01", popularity:9 },
    { id:4, media_type:"movie", release_date:"", popularity:500 },
  ];
  assert.deepEqual(sortCatalogueNewestFirst(data).map(x=>x.id), [3,2,1,4]);
  assert.equal(catalogueReleaseDate({release_date:"2026-02-30"}), "");
  assert.equal(formatCatalogueDate({first_air_date:"2026-11-08"}), "08/11/2026");
  const service=read("src/components/mg/StreamingServiceRows.jsx");
  assert.match(service,/sortCatalogueNewestFirst\(dedupe\(\[\.\.\.left, \.\.\.right\]\)\)/);
  assert.match(service,/return mergeNewest\(tv, movies, rowLimit\)/);
  assert.match(service,/showReleaseDate/);
  assert.match(service,/SERVICE_ITEMS_REFRESH_MS = 4 \* 60 \* 60 \* 1000/);
  assert.match(service,/Dates are not the day a service added the title/);
});

test("date display is opt-in on streaming provider rows and does not change other card play routes", () => {
  const card=read("src/components/mg/MediaCard.jsx");
  const row=read("src/components/mg/MediaRow.jsx");
  assert.match(card,/showReleaseDate = false/);
  assert.match(card,/formatCatalogueDate\(item\)/);
  assert.match(card,/"Premiered" : "Released"/);
  assert.match(row,/showReleaseDate = false/);
  assert.match(row,/showReleaseDate=\{showReleaseDate\}/);
  assert.match(card,/launchFireTvCardPlay\(player, media\)/);
});

test("Movies retain the UK cinema landing tab and add recent digital releases", () => {
  const movie=read("src/components/mg/MoviesView.jsx");
  assert.match(movie,/useState\("cinema_latest"\)/);
  assert.match(movie,/streaming_recent_movies", label: "Recent Digital \/ Streaming"/);
  assert.match(movie,/data-mg-digital-release-region/);
  assert.match(movie,/These are digital release dates, not necessarily the day/);
  assert.match(movie,/category === "cinema_latest" \? "Worldwide cinema" : "Worldwide digital"/);
  assert.match(movie,/include_global_releases: true/);
});

test("TV opens on dated premieres while preserving Airing Today and exact episode browsing", () => {
  const tv=read("src/components/mg/TvShowsView.jsx");
  assert.match(tv,/useState\("tv_recent_premieres"\)/);
  assert.match(tv,/id: "tv_airing_today", label: "Airing Today"/);
  assert.match(tv,/data-mg-recent-tv-premieres="true"/);
  assert.match(tv,/Premiered:/);
  assert.match(tv,/activeProviderIds/);
  assert.match(tv,/<DetailModal/);
  assert.match(tv,/premiereRefresh/);
  const home=read("src/components/mg/HomeDashboard.jsx");
  assert.match(home,/HOME_LAYOUT_LOCK_ID/);
  assert.match(home,/<ContinueWatchingRow/);
  assert.match(home,/category: "tv_on_the_air"/);
});
