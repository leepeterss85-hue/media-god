import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INDEPENDENT_METADATA_API_URL,
  invokeIndependentMetadata,
  invokeIndependentImdbResolver,
} from "../src/api/independentMetadata.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const storage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    get length() { return values.size; },
    key: index => [...values.keys()][index] || null,
    keys: () => [...values.keys()],
  };
};

test("public TMDB catalogue invokes independent Railway service without Base44 tokens", async () => {
  let url = "", options;
  const data = { movies: [{ id: 123, title: "Example" }] };
  const result = await invokeIndependentMetadata(
    { media_type: "movie", page: 1 },
    {
      fetchImpl: async (endpoint, init) => {
        url = endpoint;
        options = init;
        return { ok: true, json: async () => data };
      },
      storage: storage(),
    },
  );
  assert.equal(url, INDEPENDENT_METADATA_API_URL);
  assert.equal(options.method, "POST");
  assert.equal(options.credentials, "omit");
  assert.doesNotMatch(JSON.stringify(options), /authorization|rd_token|base44_access_token/i);
  assert.deepEqual(result.data, data);
});

test("public metadata cache survives a temporary endpoint outage without deleting history", async () => {
  const local = storage();
  const request = { media_type: "tv", page: 2 };
  const answer = { movies: [{ id: 321, name: "Example TV" }] };
  await invokeIndependentMetadata(request, {
    fetchImpl: async () => ({ ok: true, json: async () => answer }),
    storage: local,
  });
  const cached = await invokeIndependentMetadata(request, {
    fetchImpl: async () => { throw new Error("offline"); },
    storage: local,
  });
  assert.deepEqual(cached.data, answer);
  assert.equal(cached.stale, true);
  assert.ok(local.keys().every(key => key.startsWith("mg:public-tmdb-cache:")),
    "Never touch Continue Watching, login or user profile data");
});

test("no silent return to Base44 credits for public catalogue requests", () => {
  const client = read("src/api/base44Client.js");
  assert.match(client, /if \(name === 'getTmdbMovies'\) \{\s*return invokeIndependentMetadata\(payload\)/);
  assert.match(client, /return rawInvoke\(/);
  assert.match(client, /withGuestDebridPayload\(payload\)/);
  const metadata = read("src/api/independentMetadata.js");
  assert.doesNotMatch(metadata, /base44\.functions\.invoke|rd_token|asServiceRole/);
});

test("standalone metadata port keeps original response and server-held secret", () => {
  const server = read("deploy/media-god-api/server.mjs");
  const handler = read("deploy/media-god-api/getTmdbMovies.mjs");
  assert.match(server, /\/functions\/getTmdbMovies/);
  assert.match(server, /ALLOWED_ORIGINS/);
  assert.match(server, /TMDB upstream/);
  assert.match(server, /BODY_LIMIT_BYTES/);
  assert.match(handler, /process\.env\[name\]/);
  assert.doesNotMatch(handler, /base44:runtime/);
  assert.match(handler, /movies:\s*items/);
});

test("independent IMDb resolvers pass only public movie/episode identity", async () => {
  let uri, init;
  const result = await invokeIndependentImdbResolver(
    "resolveTvImdb",
    { tmdb_id: 1399, title: "Example", year: 2011, rd_token: "never-send" },
    { fetchImpl: async (url, options) => {
        uri = url; init = options;
        return { ok: true, json: async () => ({ imdb_id: "tt0944947", media_type: "tv" }) };
      }, storage: storage() },
  );
  assert.match(uri, /\/functions\/resolveTvImdb$/);
  assert.equal(result.data.imdb_id, "tt0944947");
  assert.doesNotMatch(init.body, /never-send|rd_token|token/);
  assert.equal(init.credentials, "omit");
  const client = read("src/api/base44Client.js");
  assert.match(client, /name === 'resolveImdb' \|\| name === 'resolveTvImdb'/);
  assert.match(client, /return invokeIndependentImdbResolver\(name, payload\)/);
});

test("independent backend ports IMDb logic without Base44 integration runtime", () => {
  const server = read("deploy/media-god-api/server.mjs");
  const imdb = read("deploy/media-god-api/resolveImdb.mjs");
  const tv = read("deploy/media-god-api/resolveTvImdb.mjs");
  assert.match(server, /"\/functions\/resolveImdb": resolveImdb/);
  assert.match(server, /"\/functions\/resolveTvImdb": resolveTvImdb/);
  assert.doesNotMatch(imdb, /base44:runtime/);
  assert.doesNotMatch(tv, /base44:runtime/);
  assert.match(imdb, /TMDB_API_KEY/);
  assert.match(tv, /TMDB_API_KEY/);
});
