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
