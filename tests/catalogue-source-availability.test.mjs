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
  assert.doesNotMatch(code, /localStorage|sessionStorage/);
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
