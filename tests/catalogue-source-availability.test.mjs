import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogueSourceKey, classifyCatalogueSourceResult, createCatalogueSourceChecker,
  SOURCE_CHECK_BATCH, SOURCE_CHECK_CONCURRENCY } from '../src/components/mg/catalogueSourceAvailability.js';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const movie = n => ({ media_type:'movie', tmdb_id:n, title:`Movie ${n}`, year:'2026' });

test('exact movie identity and episode-only TV are not falsely marked as confirmed', () => {
  assert.equal(catalogueSourceKey(movie(35)), 'movie:35:2026');
  assert.equal(catalogueSourceKey({...movie(35),year:'2025'}), 'movie:35:2025');
  assert.equal(catalogueSourceKey({...movie(35),media_type:'tv'}), '');
  assert.equal(catalogueSourceKey({...movie(35),tmdb_id:'invalid'}), '');
  assert.equal(SOURCE_CHECK_BATCH, 8);
  assert.equal(SOURCE_CHECK_CONCURRENCY, 2);
});

test('source status requires positive cached/direct evidence, not scraper hints or captcha', () => {
  assert.equal(classifyCatalogueSourceResult(null), 'unknown');
  assert.equal(classifyCatalogueSourceResult({error:'timeout',streams:[]}), 'unknown');
  assert.equal(classifyCatalogueSourceResult({streams:[]}), 'unconfirmed');
  assert.equal(classifyCatalogueSourceResult({streams:[{type:'torrent',magnet:'magnet:?xt=urn:btih:123'}]}), 'unconfirmed');
  assert.equal(classifyCatalogueSourceResult({streams:[{type:'torrent',debridCached:false,cacheRequired:true}]}), 'unconfirmed');
  assert.equal(classifyCatalogueSourceResult({streams:[{type:'url',src:'https://example.test/film.m3u8'}]}), 'found');
  assert.equal(classifyCatalogueSourceResult({streams:[{type:'url',src:'https://example.test/movie.mp4?sig=private'}]}), 'found');
  assert.equal(classifyCatalogueSourceResult({streams:[{type:'rd',debridCached:true,infoHash:'abc'}]}), 'found');
  assert.equal(classifyCatalogueSourceResult({streams:[{type:'provider',src:'https://provider.test/watch.m3u8'}]}), 'unconfirmed');
  assert.equal(classifyCatalogueSourceResult({streams:[{type:'url',src:'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/verify.mp4'}]}), 'unconfirmed');
  assert.equal(classifyCatalogueSourceResult({streams:[{type:'url',label:'Movie trailer',src:'https://example.test/trailer.mp4'}]}), 'unconfirmed');
});

test('bounded queue, per-title caching, request payload, failures and no source URL persistence', async () => {
  const active = { value:0, peak:0 };
  const seen = [];
  let release = [];
  let tick=1000;
  const check = createCatalogueSourceChecker(async (name,payload) => {
    seen.push({name,payload});active.value++;active.peak=Math.max(active.peak,active.value);
    await new Promise(resolve => { release.push(resolve); });
    active.value--;
    return {data:{streams:[{debridCached:true,src:'https://private.example.test/stream'}]}};
  }, {now:()=>tick});
  const pending = [1,2,3,4].map(n=>check.check(movie(n)));
  const dup = check.check(movie(1));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(seen.length,2,'only 2 concurrent addon calls');
  assert.equal(active.peak,2);
  for(let i=0;i<5 && seen.length < 4;i++){
    const items=release.splice(0);items.forEach(fn=>fn());
    await new Promise(resolve=>setImmediate(resolve));
  }
  release.splice(0).forEach(fn=>fn());
  assert.deepEqual(await Promise.all([...pending,dup]),Array(5).fill('found'));
  assert.equal(seen.length,4,'duplicate film must share one network check');
  assert.equal((await check.check(movie(1))), 'found');
  assert.equal(seen.length,4,'cached source status prevents repeat network calls');
  assert.deepEqual(Object.keys(seen[0].payload).sort(),['fast_mode','imdb_id','media_type','title','tmdb_id','year'].sort());
  assert.equal(seen[0].payload.fast_mode,true);
  assert.equal(seen[0].payload.media_type,'movie');
  const fail=createCatalogueSourceChecker(async()=>{throw Error('offline');});
  assert.equal(await fail.check(movie(88)), 'unknown');
  const code=read('src/components/mg/catalogueSourceAvailability.js');
  assert.doesNotMatch(code, /(?:window\.|globalThis\.)?(?:localStorage|sessionStorage)\.setItem\(/);
});

test('Search has an opt-in movie source filter; other media and playback paths stay accessible', () => {
  const search = read('src/components/mg/SearchDialog.jsx');
  assert.match(search,/data-mg-sources-found-filter="true"/);
  assert.match(search,/catalogueSourceChecker\.check\(item\)/);
  assert.match(search,/sourcesFoundOnly \|\| mediaFilter !== "all"/);
  assert.match(search,/setMediaFilter\("movie"\)/);
  assert.match(search,/Show all titles/);
  assert.match(search,/TV shows need an exact episode/);
  assert.match(search,/Checking movie addon sources/);
});

const healthyEmpty = fast_mode => ({
  streams: [], fast_mode, addons_checked: 2, addons_available: 2,
  diagnostics: [
    {name:'Comet',status:'no_playable_streams',stream_count:0,playable_count:0},
    {name:'Torrentio',status:'no_playable_streams',stream_count:0,playable_count:0},
  ],
});

test('confirmed empty requires successful exhaustive checks; outages and partial addons never hide movies', async () => {
  const { isComprehensiveAddonNoSourceResult } = await import('../src/components/mg/catalogueSourceAvailability.js');
  assert.equal(isComprehensiveAddonNoSourceResult(healthyEmpty(false)), true);
  assert.equal(isComprehensiveAddonNoSourceResult(healthyEmpty(true)), false);
  assert.equal(isComprehensiveAddonNoSourceResult({ ...healthyEmpty(false),addons_checked:1 }),false);
  assert.equal(isComprehensiveAddonNoSourceResult({ ...healthyEmpty(false),addons_available:3 }),false);
  assert.equal(isComprehensiveAddonNoSourceResult({ ...healthyEmpty(false),diagnostics:[{
    status:'browser_required',stream_count:1,playable_count:0
  }] }), false);
  assert.equal(isComprehensiveAddonNoSourceResult({ ...healthyEmpty(false),diagnostics:[
    {...healthyEmpty(false).diagnostics[0],status:'http_429'},healthyEmpty(false).diagnostics[1]
  ] }), false);
  assert.equal(isComprehensiveAddonNoSourceResult({ ...healthyEmpty(false),streams:[{type:'magnet',infoHash:'abc'}] }),false);

  const complete=createCatalogueSourceChecker(async (_name,payload)=>({data:healthyEmpty(payload.fast_mode)}));
  assert.equal(await complete.check(movie(42)), 'no-sources');
  assert.equal(complete.getStatus(movie(42)), 'no-sources');
  const networkError=createCatalogueSourceChecker(async (_name,payload)=>({data:{
    ...healthyEmpty(payload.fast_mode),
    diagnostics:[{status:'error',stream_count:0,playable_count:0},healthyEmpty(false).diagnostics[1]]
  }}));
  assert.notEqual(await networkError.check(movie(42)), 'no-sources');
  const suspiciousFast=createCatalogueSourceChecker(async (_name,payload)=>({data:payload.fast_mode
    ? {...healthyEmpty(true),diagnostics:[{status:'error'},healthyEmpty(true).diagnostics[1]]}
    : healthyEmpty(false)}));
  assert.notEqual(await suspiciousFast.check(movie(42)), 'no-sources');
});

test('titles automatically return when verified empty cache expires and a source reappears', async () => {
  let t=0;let available=false;let requests=0;let notices=[];
  const checker=createCatalogueSourceChecker(async (_name,payload)=>{
    requests++;
    return {data:available
      ? {...healthyEmpty(payload.fast_mode),streams:[{debridCached:true,src:'https://private.test/stream'}]}
      : healthyEmpty(payload.fast_mode)};
  },{now:()=>t});
  const dispose=checker.subscribe((key,status)=>notices.push([key,status]));
  assert.equal(await checker.check(movie(13)),'no-sources');
  assert.equal(requests,2);
  assert.equal(checker.getStatus(movie(13)),'no-sources');
  t=4*60*1000;
  available=true;
  assert.equal(await checker.check(movie(13)),'no-sources','do not spam checks while negative cache is valid');
  assert.equal(requests,2);
  t=6*60*1000;
  assert.equal(checker.getStatus(movie(13)),'unknown','expired negative cannot keep a title hidden');
  assert.equal(await checker.check(movie(13)),'found');
  assert.equal(checker.getStatus(movie(13)),'found');
  assert.equal(requests,3);
  assert.deepEqual(notices.map(row=>row[1]),['no-sources','found']);
  dispose();
});

test('browse pages hide only verified no-source discovery, not user-owned rows or TV', () => {
  const home=read('src/components/mg/HomeDashboard.jsx');
  const search=read('src/components/mg/SearchDialog.jsx');
  const client=read('src/components/mg/catalogueSourceCheckerClient.js');
  assert.match(home,/\.filter\(showBrowseTitleWithSourceEvidence\)/);
  assert.match(home,/sourceAvailabilityEpoch/);
  assert.match(home,/10 \* 60 \* 1000/);
  assert.match(home,/\(rows\.newMovies \|\| \[\]\)\.filter\(showBrowseTitleWithSourceEvidence\)/);
  assert.match(home,/items=\{rows\.watchlist\}/);
  assert.match(home,/items=\{rows\.favorites\}/);
  assert.match(home,/<ContinueWatchingRow/);
  assert.match(search,/visibleMediaResults\.filter|filteredMediaResults\.filter\(showBrowseTitleWithSourceEvidence\)/);
  assert.match(client,/!== 'no-sources'/);
});
