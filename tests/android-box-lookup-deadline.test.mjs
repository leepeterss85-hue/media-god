import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAddonSourcesWithPublicFallback } from '../src/api/addonSourceRecovery.js';
import { invokeIndependentImdbResolver } from '../src/api/independentMetadata.js';

const never = () => new Promise(() => {});
test('a stuck SDK token lookup reaches public discovery without starting private work', async () => {
  let privateCalls = 0;
  const result = await searchAddonSourcesWithPublicFallback({title: 'Example'}, {
    readToken: never, tokenTimeoutMs: 10,
    searchPersonal: () => { privateCalls++; },
    searchPublic: async () => ({data: {streams: [{name: 'Public'}]}}),
  });
  assert.equal(privateCalls, 0);
  assert.equal(result.data.streams[0].name, 'Public');
});

test('a private transport ignoring its timeout cannot hold the public fallback indefinitely', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const result = await searchAddonSourcesWithPublicFallback({}, {
    readToken: async () => 'session', personalTimeoutMs: 10,
    searchPersonal: () => pending,
    searchPublic: async () => ({data: {streams: [{name: 'Recovered'}]}}),
  });
  finish({data: {streams: [{name: 'Late private'}]}});
  await Promise.resolve();
  assert.equal(result.data.streams[0].name, 'Recovered');
});

const memoryStorage = () => {
  const entries = new Map();
  return {getItem: k => entries.get(k), setItem: (k,v) => entries.set(k,v),
    removeItem: k => entries.delete(k), key: i => [...entries.keys()][i],
    get length() { return entries.size; }};
};
test('repeat IMDb lookup reuses a successful identity without another HTTP request', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const options = {storage, fetchImpl: async () => {
    calls++;
    return {ok: true, json: async () => ({imdb_id: 'tt1234567'})};
  }};
  for (let i = 0; i < 3; i++) {
    const result = await invokeIndependentImdbResolver('resolveImdb', {tmdb_id: 123}, options);
    assert.equal(result.data.imdb_id, 'tt1234567');
  }
  assert.equal(calls, 1);
  await invokeIndependentImdbResolver('resolveTvImdb', {tmdb_id: 123}, options);
  assert.equal(calls, 2, 'Movie and TV identities must not share a cache key');
});
test('HTTP 200 lookup errors cannot poison the successful identity cache', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const options = {storage, fetchImpl: async () => {
    calls++;
    return {ok: true, json: async () => calls === 1 ? {error: 'Rate limited'} : {imdb_id: 'tt7654321'}};
  }};
  await invokeIndependentImdbResolver('resolveImdb', {tmdb_id: 42}, options);
  assert.equal(storage.length, 0);
  const result = await invokeIndependentImdbResolver('resolveImdb', {tmdb_id: 42}, options);
  assert.equal(result.data.imdb_id, 'tt7654321');
});

for (const mode of ['guest', 'private-error', 'private-empty']) {
  test(`stalled public lookup settles after ${mode}`, async () => {
    const personal = {data: {streams: [], diagnostics: [{status: 'provider_timeout'}]}};
    const lookup = searchAddonSourcesWithPublicFallback({}, {
      readToken: async () => mode === 'guest' ? '' : 'session',
      searchPersonal: async () => {
        if (mode === 'private-error') throw new Error('Offline');
        return personal;
      },
      searchPublic: never,
      publicTimeoutMs: 10,
    });
    if (mode === 'private-empty') assert.equal(await lookup, personal);
    else await assert.rejects(lookup, /Source lookup timed out/);
  });
}

test('late public failure is handled and a later source retry can succeed', async () => {
  let fail;
  const pending = new Promise((_, reject) => { fail = reject; });
  const deps = {readToken: async () => '', searchPublic: () => pending, publicTimeoutMs: 10};
  await assert.rejects(searchAddonSourcesWithPublicFallback({}, deps), /timed out/);
  fail(new Error('Late network error'));
  const result = await searchAddonSourcesWithPublicFallback({}, {
    ...deps, searchPublic: async () => ({data: {streams: [{name: 'Recovered'}]}}),
  });
  assert.equal(result.data.streams[0].name, 'Recovered');
});
