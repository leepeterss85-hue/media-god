import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const backendPaths = [
  'base44/functions/getTmdbMovies/entry.ts',
  'deploy/media-god-api/getTmdbMovies.mjs',
];

/** Exercise the real request builder extracted from each backend, not a test-only clone. */
function buildCinemaQuery(source, opts = {}) {
  const begin = source.indexOf('    const cinemaLatest =');
  const end = source.indexOf('    const buildGlobalReleaseUrl =');
  assert.ok(begin >= 0 && end > begin, 'cinema query builder must exist');
  const script = source.slice(begin, end);
  const context = {
    mediaType: opts.mediaType ?? 'movie',
    category: opts.category ?? 'cinema_latest',
    query: opts.query ?? '',
    providerIds: opts.providerIds ?? [],
    country: opts.country ?? '',
    genre: opts.genre ?? '',
    hasFilters: Boolean(opts.country || opts.genre || opts.year || opts.language || (opts.providerIds ?? []).length),
    year: opts.year ?? '',
    language: opts.language ?? '',
    body: { include_global_releases: opts.global ?? true },
    requestedDate: opts.today ?? '2026-11-08',
    region: opts.region ?? 'GB',
    timezone: 'Europe/London',
    apiKey: 'TEST_ONLY',
    CINEMA_FEATURE_MINUTES: 75,
    TMDB_BASE: 'https://api.themoviedb.org/3',
    URLSearchParams,
    URL,
    Date,
    parsedBrowseSearch: {title:'Test',year:''},
    MOVIE_ENDPOINTS: {now_playing:'movie/now_playing'},
    TV_ENDPOINTS: {tv_popular:'tv/popular'},
  };
  vm.createContext(context);
  vm.runInContext(script + '\nglobalThis.output = {cinemaLatest,cinemaExtras,cinemaSince,includeGlobalReleases,buildUrl};', context);
  const result = context.output;
  return {
    ...result,
    url: new URL(result.buildUrl(1)),
  };
}

for (const path of backendPaths) {
  test(path + ': UK latest cinema category uses actual GB theatrical dates and newest-first release window', () => {
    const source=read(path);
    const result=buildCinemaQuery(source);
    const q=result.url.searchParams;
    assert.equal(result.cinemaLatest,true);
    assert.equal(result.includeGlobalReleases,true,'Cinema must include US-first and worldwide theatrical releases');
    assert.equal(result.url.pathname,'/3/discover/movie');
    assert.equal(q.get('region'),'GB');
    assert.equal(q.get('with_release_type'),'3');
    assert.equal(q.get('with_runtime.gte'),'75');
    assert.equal(q.get('sort_by'),'release_date.desc');
    assert.equal(q.get('release_date.lte'),'2026-11-08');
    assert.equal(q.get('release_date.gte'),'2026-10-11');
    assert.equal(q.get('include_adult'),'false');
    assert.equal(q.get('page'),'1');
    assert.equal(q.get('api_key'),'TEST_ONLY');
    assert.match(source,/if \(cinemaDiscovery \|\| recentStreamingMovies \|\| recentTvPremieres\) \{/);
    assert.match(source,/mappedItems\.sort\(\(a, b\) =>/);
    assert.match(source,/\['cinema_latest', 'cinema_extras', 'movie_released_today', 'streaming_recent_movies', 'tv_recent_premieres'\]/);
  });

  test(path + ': genre, year, original language and country filters cannot escape the cinema window', () => {
    const query=buildCinemaQuery(read(path),{
      genre:'28',year:'2026',language:'en',country:'GB',region:'GB',
    }).url.searchParams;
    assert.equal(query.get('with_genres'),'28');
    assert.equal(query.get('primary_release_year'),'2026');
    assert.equal(query.get('with_original_language'),'en');
    assert.equal(query.get('with_origin_country'),'GB');
    assert.equal(query.get('with_release_type'),'3');
    assert.equal(query.get('with_runtime.gte'),'75');
    assert.equal(query.get('release_date.lte'),'2026-11-08');
  });

  test(path + ': chosen cinema region updates without changing global Now Playing or search', () => {
    const regional=buildCinemaQuery(read(path),{region:'FR'});
    assert.equal(regional.url.searchParams.get('region'),'FR');
    const specials=buildCinemaQuery(read(path),{category:'cinema_extras',region:'GB'});
    assert.equal(specials.cinemaLatest,false);
    assert.equal(specials.cinemaExtras,true);
    assert.equal(specials.url.pathname,'/3/discover/movie');
    assert.equal(specials.url.searchParams.get('with_release_type'),'3');
    assert.equal(specials.url.searchParams.has('with_runtime.gte'),false);
    const wider=buildCinemaQuery(read(path),{category:'now_playing',region:'GB'});
    assert.equal(wider.cinemaLatest,false);
    assert.equal(wider.includeGlobalReleases,true);
    assert.equal(wider.url.pathname,'/3/movie/now_playing');
    assert.equal(wider.url.searchParams.get('region'),'GB');
    assert.equal(wider.url.searchParams.get('with_release_type'),null);
    const search=buildCinemaQuery(read(path),{query:'Zootopia'});
    assert.equal(search.cinemaLatest,false);
    assert.equal(search.url.pathname,'/3/search/movie');
  });
}

test('Movies opens new UK/US cinema releases with separate official Top 10 and digital tabs', () => {
  const ui=read('src/components/mg/MoviesView.jsx');
  assert.match(ui,/id: "streaming_recent_movies", label: "New Digital Releases"/);
  assert.match(ui,/id: "cinema_top10", label: "Top 10 Cinema"/);
  assert.match(ui,/id: "now_playing", label: "Wider Releases"/);
  assert.match(ui,/id: "cinema_extras", label: "Short Films & Specials"/);
  assert.match(ui,/data-mg-cinema-extras/);
  assert.match(ui,/useState\("cinema_latest"\)/);
  assert.match(ui,/useState\("en"\)/);
  assert.match(ui,/region: streamingRegion/);
  assert.match(ui,/include_global_releases: true/);
  assert.match(ui,/A cinema release does not guarantee a playable stream/);
  assert.match(ui,/75 minutes or longer/);
  assert.match(ui,/category === "cinema_latest" && !debouncedQuery\.trim\(\)/);
  assert.match(ui,/\["cinema_latest", "cinema_top10", "cinema_extras", "streaming_recent_movies"\]\.includes\(category\)\) return undefined/);
  assert.match(ui,/cinemaRefresh/);
  assert.match(ui,/window\.addEventListener\("focus", checkFreshness\)/);
  assert.match(ui,/document\.addEventListener\("visibilitychange", checkFreshness\)/);
  assert.match(ui,/category === "streaming_recent_movies" \? "Worldwide digital" : "Worldwide cinema"/);
  assert.match(ui,/<Info className=/);
  // No changes to playback, Live TV, remote or Continue Watching required.
  assert.match(ui,/<DetailModal/);
});

test('Home retains its existing international film discovery and guarded movie rows', () => {
  const home=read('src/components/mg/HomeDashboard.jsx');
  assert.match(home,/category: "now_playing"/);
  assert.match(home,/include_global_releases: true/);
  assert.match(home,/\.filter\(showBrowseTitleWithSourceEvidence\)/);
});
