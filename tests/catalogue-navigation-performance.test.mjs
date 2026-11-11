import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { cataloguePosterUrl } from "../src/components/mg/posterImageSizing.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("TMDB poster optimisation sizes cards without touching unrelated images", () => {
  const poster = "https://image.tmdb.org/t/p/w500/cinema-poster.jpg";
  assert.equal(cataloguePosterUrl(poster, {lowCapacity:true, viewportWidth:960}),
    "https://image.tmdb.org/t/p/w185/cinema-poster.jpg");
  assert.equal(cataloguePosterUrl(poster, {lowCapacity:false, viewportWidth:960}),
    "https://image.tmdb.org/t/p/w342/cinema-poster.jpg");
  assert.equal(cataloguePosterUrl(poster, {lowCapacity:false, viewportWidth:2100}), poster);
  assert.equal(cataloguePosterUrl("https://image.tmdb.org/t/p/original/another.png",
    {lowCapacity:true, viewportWidth:400}), "https://image.tmdb.org/t/p/w185/another.png");
  assert.equal(cataloguePosterUrl("https://image.tmdb.org/t/p/w500/a.jpg?language=en",
    {lowCapacity:true, viewportWidth:960}),
    "https://image.tmdb.org/t/p/w185/a.jpg?language=en");
  assert.equal(cataloguePosterUrl("https://other.example/t/p/w500/test.jpg",
    {lowCapacity:true, viewportWidth:960}), "https://other.example/t/p/w500/test.jpg");
  assert.equal(cataloguePosterUrl("https://image.tmdb.org/t/p/w500/backdrop.jpg",
    {lowCapacity:false, viewportWidth:2100}),
    "https://image.tmdb.org/t/p/w500/backdrop.jpg");
  assert.equal(cataloguePosterUrl("", {lowCapacity:true}), "");
});

test("Home loads movie and TV page JavaScript only when visited, retaining page error boundaries", () => {
  const page = read("src/pages/Home.jsx");
  assert.match(page, /const MoviesView = lazy\(\(\) => import\("@\/components\/mg\/MoviesView"\)\)/);
  assert.match(page, /const TvShowsView = lazy\(\(\) => import\("@\/components\/mg\/TvShowsView"\)\)/);
  assert.doesNotMatch(page, /import MoviesView from/);
  assert.doesNotMatch(page, /import TvShowsView from/);
  assert.match(page, /<SafeDeferredView resetKey=\{view\} label="Movies"/);
  assert.match(page, /<SafeDeferredView resetKey=\{view\} label="TV Shows"/);
  assert.match(page, /import LiveTVView from/);
  assert.match(page, /<HomeDashboard onOpenTvService=/);
});

test("fulfilled public catalogue response is available synchronously on revisit, and private requests are never cached", async () => {
  const source = read("src/components/mg/catalogueRequests.js");
  const code = source.replace(/^import [^\n]+\n/, "").replaceAll("export const ", "const ");
  const calls = [];
  const ctx = {
    Map, Date, JSON, Object, Math,
    base44: { functions: { invoke: (name, params) => {
      calls.push({ name, params });
      return Promise.resolve({ data: { movies: [{id:1, title:"Film"}] } });
    } } }
  };
  vm.createContext(ctx);
  vm.runInContext(code + "\nglobalThis.calls = { getCatalogueMovies, peekCatalogueMovies, clearCatalogueRequestCache };",ctx);
  const {getCatalogueMovies,peekCatalogueMovies,clearCatalogueRequestCache} = ctx.calls;
  const movieParams = {media_type:"movie",category:"cinema_latest",region:"GB"};
  assert.equal(peekCatalogueMovies(movieParams),null);
  const first = getCatalogueMovies(movieParams);
  assert.strictEqual(getCatalogueMovies({region:"GB",category:"cinema_latest",media_type:"movie"}),first);
  await first;
  await Promise.resolve();
  assert.equal(peekCatalogueMovies(movieParams)?.data?.movies?.[0]?.title,"Film");
  assert.equal(calls.length,1);
  assert.equal(peekCatalogueMovies({...movieParams,query:"private query"}),null);
  assert.equal(peekCatalogueMovies({...movieParams,user_id:"private"}),null);
  await getCatalogueMovies({...movieParams,query:"private query"});
  await getCatalogueMovies({...movieParams,query:"private query"});
  assert.equal(calls.length,3,"search terms must not be cached");
  clearCatalogueRequestCache();
  assert.equal(peekCatalogueMovies(movieParams),null);
});

test("only poster cards use image sizing; hero and playback images are left alone", () => {
  const components = [
    ["src/components/mg/MediaCard.jsx","item.poster_url"],
    ["src/components/mg/MoviesView.jsx","movie.poster_url"],
    ["src/components/mg/TvShowsView.jsx","show.poster_url"],
  ];
  for(const [path,property] of components) {
    const content = read(path);
    assert.ok(content.includes("src={cataloguePosterUrl(" + property + ")}"),path);
    assert.match(content,/loading="lazy"/);
  }
  const hero = read("src/components/mg/HeroSlider.jsx");
  assert.match(hero,/src=\{item\.backdrop_url\}/);
  assert.match(hero,/fetchPriority="high"/);
});

test("revisits reuse catalogue data and skip duplicate provider-logo API requests", () => {
  const movies = read("src/components/mg/MoviesView.jsx");
  const tv = read("src/components/mg/TvShowsView.jsx");
  const logos = read("src/components/mg/StreamingProviderLogos.jsx");
  assert.match(movies,/peekCatalogueMovies\(params\)/);
  assert.match(tv,/peekCatalogueMovies\(params\)/);
  assert.match(movies,/getCatalogueMovies\(params\)/);
  assert.match(tv,/getCatalogueMovies\(params\)/);
  assert.match(logos,/if \(Array\.isArray\(initialProviders\) && initialProviders\.length > 0\) \{/);
  assert.match(logos,/return \(\) => \{ cancelled = true; \};/);
  assert.match(logos,/fetchProviders\(\{/);
});
