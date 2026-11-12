import test from "node:test";
import assert from "node:assert/strict";
import { invokeIndependentImdbResolver } from "../src/api/independentMetadata.js";

const storage = () => {
  const items = new Map();
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key),
    key: index => [...items.keys()][index] ?? null,
    get length() { return items.size; },
  };
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const ok = imdb_id => ({ ok: true, json: async () => ({ imdb_id }) });

test("simultaneous Android-box movie IMDb lookups share one public fetch, not credentials", async () => {
  const gate = deferred();
  let calls = 0;
  let options;
  const fetchImpl = async (url, init) => {
    calls++;
    options = init;
    assert.match(url, /\/functions\/resolveImdb$/);
    await gate.promise;
    return ok("tt1234567");
  };
  const request = { tmdb_id: 123456, title: "Test Film", rd_token: "must-stay-private" };
  const one = invokeIndependentImdbResolver("resolveImdb", request, {fetchImpl,storage:storage()});
  const two = invokeIndependentImdbResolver("resolveImdb", request, {fetchImpl,storage:storage()});
  await Promise.resolve();
  assert.equal(calls,1, "Duplicate requests should share the one in-flight public fetch");
  gate.resolve();
  const [first,second] = await Promise.all([one,two]);
  assert.deepEqual(first.data, second.data);
  assert.equal(first.data.imdb_id,"tt1234567");
  assert.equal(options.credentials,"omit");
  assert.doesNotMatch(options.body,/rd_token|must-stay-private|Authorization/);
});

test("TV and movie IMDb resolver requests never share identities", async () => {
  let count=0;
  const fetchImpl=async url => {
    count++;
    return ok(url.endsWith("/resolveTvImdb")?"tt2345678":"tt1234567");
  };
  const opts={fetchImpl,storage:storage()};
  const [movie,tv]=await Promise.all([
    invokeIndependentImdbResolver("resolveImdb",{tmdb_id:999},opts),
    invokeIndependentImdbResolver("resolveTvImdb",{tmdb_id:999},opts),
  ]);
  assert.equal(count,2);
  assert.equal(movie.data.imdb_id,"tt1234567");
  assert.equal(tv.data.imdb_id,"tt2345678");
});

test("unrelated episodes or title IDs are never incorrectly coalesced",async()=>{
  let count=0;
  const fetchImpl=async (_url,init)=> {
    count++;
    return ok(JSON.parse(init.body).tmdb_id===111?"tt1111111":"tt2222222");
  };
  const opts={fetchImpl,storage:storage()};
  await Promise.all([
    invokeIndependentImdbResolver("resolveImdb",{tmdb_id:111},opts),
    invokeIndependentImdbResolver("resolveImdb",{tmdb_id:222},opts),
  ]);
  assert.equal(count,2);
});

test("failed shared lookup releases its pending slot so a later retry succeeds",async()=>{
  let count=0;
  const fetchImpl=async()=>{
    count++;
    if(count===1) return {ok:false,status:429};
    return ok("tt4444444");
  };
  const opts={fetchImpl,storage:storage()};
  const request={tmdb_id:4444};
  const [a,b]=await Promise.allSettled([
    invokeIndependentImdbResolver("resolveImdb",request,opts),
    invokeIndependentImdbResolver("resolveImdb",request,opts),
  ]);
  assert.equal(a.status,"rejected");
  assert.equal(b.status,"rejected");
  assert.equal(count,1);
  const retry=await invokeIndependentImdbResolver("resolveImdb",request,opts);
  assert.equal(count,2);
  assert.equal(retry.data.imdb_id,"tt4444444");
});

test("successful identity still persists in its caller-owned public-only cache",async()=>{
  let calls=0;
  const local=storage();
  const fetchImpl=async()=>{calls++;return ok("tt7777777")};
  const opts={fetchImpl,storage:local};
  const first=await invokeIndependentImdbResolver("resolveTvImdb",{tmdb_id:77},opts);
  const second=await invokeIndependentImdbResolver("resolveTvImdb",{tmdb_id:77},opts);
  assert.equal(first.data.imdb_id,"tt7777777");
  assert.equal(second.data.imdb_id,"tt7777777");
  assert.equal(calls,1);
  assert.equal(local.length,1);
  assert.ok(local.key(0).startsWith("mg:public-imdb-cache:"));
});
