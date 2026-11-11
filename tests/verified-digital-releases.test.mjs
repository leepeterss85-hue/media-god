import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const paths = ['base44/functions/getTmdbMovies/entry.ts', 'deploy/media-god-api/getTmdbMovies.mjs'];
const records = (...events) => [{ iso_3166_1: 'US', release_dates: events.map(([type, date]) => ({type, release_date: date})) }];
for (const path of paths) {
  test(path + ': verifies digital events, rejecting cinema, old rereleases, future and missing dates', async () => {
    const source = readFileSync(path, 'utf8');
    const data = {
      1: records([3, '2026-11-10']),
      2: records([3, '2026-08-01'], [4, '2026-11-09']),
      3: records([4, '2020-01-01'], [4, '2026-11-10']),
      4: records([4, '2026-11-12']),
      5: records([4, '2026-02-30']),
      6: [{ iso_3166_1: 'GB', release_dates: [{type:4,release_date:'2026-11-10'}] }, ...records([4, '2026-11-01'])],
      7: [],
    };
    let calls = 0;
    const context = { Map, Date, Promise, AbortSignal, encodeURIComponent, TMDB_BASE: 'https://example.test',
      fetch: async url => {
        calls++;
        const id = new URL(url).pathname.split('/')[2];
        if (id === '8') return {ok:false};
        return {ok:true, json:async () => ({results:data[id]})};
      },
    };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('const digitalReleaseCache'), source.indexOf('const IMG_BASE')) + '\nglobalThis.verify = verifyDigitalReleases;', context);
    const items = Array.from({length:8}, (_,i) => ({id:i+1}));
    const found = await context.verify(items, 'test-key', '2026-10-12', '2026-11-11');
    assert.deepEqual([...found.entries()].sort(), [['2','2026-11-09'], ['6','2026-11-01']]);
    await context.verify(items, 'test-key', '2026-10-12', '2026-11-11');
    assert.equal(calls,9,'successful metadata is cached; failed request can retry');
    assert.match(source,/merged\.filter\(m => !recentStreamingMovies \|\| verifiedDigitalDates\.has\(String\(m.id\)\)\)/);
    assert.match(source,/year: recentStreamingMovies \? mapped.year/);
  });
}

for (const path of paths) {
  test(path + ': cinema excludes festival, digital, future and regional rereleases without hiding US-first films', async () => {
    const source = readFileSync(path, 'utf8');
    const data = {
      1: records([1, '2026-11-10']),
      2: records([4, '2026-11-10']),
      3: records([3, '2026-11-12']),
      4: records([3, '2000-01-01'], [3, '2026-11-10']),
      5: records([1, '2026-01-01'], [3, '2026-11-05']),
      6: records([2, '2026-10-01'], [3, '2026-11-10']),
      7: [...records([3, '2026-11-01']), {iso_3166_1:'GB', release_dates:[{type:3,release_date:'2026-12-01'}]}],
    };
    const context = { Map, Date, Promise, AbortSignal, encodeURIComponent, TMDB_BASE:'https://example.test',
      fetch: async url => ({ok:true, json:async () => ({results:data[new URL(url).pathname.split('/')[2]]})}),
    };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('const digitalReleaseCache'), source.indexOf('const IMG_BASE')) + '\nglobalThis.verify = verifyDigitalReleases;', context);
    const items = Object.keys(data).map(id => ({id}));
    // A cached digital result must never qualify as theatrical evidence.
    await context.verify(items, 'key', '2026-09-16', '2026-11-11');
    const dates = await context.verify(items, 'key', '2026-09-16', '2026-11-11', [2,3]);
    assert.deepEqual([...dates.entries()].sort(), [['5','2026-11-05'],['6','2026-10-01'],['7','2026-11-01']]);
    assert.match(source, /filter\(m => !cinemaLatest \|\| verifiedCinemaDates.has\(String\(m.id\)\)\)/);
  });
}
