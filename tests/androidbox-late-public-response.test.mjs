import test from 'node:test';
import assert from 'node:assert/strict';
import {
  invokeIndependentMetadata,
  invokeIndependentImdbResolver,
  invokeIndependentAddonSources,
} from '../src/api/independentMetadata.js';
import { fetchEpisodeScraperJson } from '../src/components/mg/tvEpisodeScraper.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const routes = [
  ['catalogue', options => invokeIndependentMetadata({}, options), 26_000],
  ['IMDb', options => invokeIndependentImdbResolver('resolveImdb', { tmdb_id: 123 }, options), 16_000],
  ['public addon', options => invokeIndependentAddonSources({ tmdb_id: 123 }, options), 16_000],
  ['episode scraper', options => fetchEpisodeScraperJson('https://example.test/episode', options), 3_200],
];

for (const [name, invoke, deadline] of routes) {
  test(`${name} does not decode a response arriving after cancellation`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let finish;
    let bodies = 0;
    let signal;
    const response = new Promise(resolve => { finish = resolve; });
    const task = invoke({
      storage: null,
      fetchImpl: (_url, options) => { signal = options.signal; return response; },
    }).catch(() => null);
    await flush();
    t.mock.timers.tick(deadline);
    assert.equal(await task, null);
    assert.equal(signal.aborted, true);
    finish({ ok: true, json: async () => { bodies++; return { streams: [] }; } });
    await flush();
    assert.equal(bodies, 0, 'Expired requests must not start response decoding');
  });
}
