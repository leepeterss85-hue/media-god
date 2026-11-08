import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const original = readFileSync(
  new URL("../src/api/independentRealDebrid.js", import.meta.url), "utf8"
);
const start = original.indexOf("export async function invokeIndependentRealDebrid(");
assert.ok(start >= 0);
const code = original.slice(start).replace(
  "export async function invokeIndependentRealDebrid(",
  "async function invokeIndependentRealDebrid("
);
const invoke = vm.runInNewContext(code + "\ninvokeIndependentRealDebrid;", {
  INDEPENDENT_RD_FUNCTIONS: new Set([
    "realDebrid", "realDebridAuth", "multiDebrid", "fetchAddonStreams"
  ]),
  INDEPENDENT_RD_ENDPOINT: "https://rd.example.test",
  independentRdPayload: data => Object.fromEntries(
    Object.entries(data || {}).filter(([key]) => key !== "rd_token")
  ),
  readAccountSessionToken: async () => "session",
  resolveAccountToken: async () => "",
  getAccessToken: async () => "",
  AbortController, setTimeout, clearTimeout, globalThis: {},
});
const never = () => new Promise(() => {});
const response = (status, data = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test("Android TV Real-Debrid hanging fetch has a hard deadline even if AbortController is ignored", async () => {
  let signal;
  const started = Date.now();
  await assert.rejects(
    invoke("realDebrid", {action:"status"}, {
      token:"session", timeoutMs: 15,
      fetchImpl: (_url, options) => { signal = options.signal; return never(); },
    }),
    error => error.code === "RD_REQUEST_TIMEOUT" && /timed out/i.test(error.message),
  );
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 500);
});

test("Android TV Real-Debrid also times out a stalled HTTP 200 JSON body", async () => {
  let signal;
  await assert.rejects(invoke("realDebrid", {action:"status"}, {
    token:"session", timeoutMs: 15,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return { ok:true, status:200, json:never };
    },
  }), error => error.code === "RD_REQUEST_TIMEOUT");
  assert.equal(signal.aborted, true);
});

test("Android TV 401 with a stuck SDK refresh cannot retain a pending Real-Debrid request", async () => {
  let calls = 0;
  await assert.rejects(invoke("realDebridAuth", {action:"status"}, {
    token:"expired-session", timeoutMs: 15,
    refreshToken: never,
    fetchImpl: async () => {
      calls += 1;
      return response(401, {error:"Unauthorized"});
    },
  }), error => error.code === "RD_REQUEST_TIMEOUT");
  assert.equal(calls, 1, "Never retry an expired token without a new session");
});

test("fast authenticated Real-Debrid requests still return their original data and status", async () => {
  let options;
  const result = await invoke("realDebrid", {action:"status", rd_token:"secret"}, {
    token:"valid", timeoutMs:100,
    fetchImpl: async (_url, init) => {
      options = init;
      return response(200, {valid:true, premium:true});
    },
  });
  assert.equal(result.data.valid, true);
  assert.equal(result.status, 200);
  assert.equal(options.headers.Authorization, "Bearer valid");
  assert.equal(options.credentials, "omit");
  assert.doesNotMatch(options.body, /secret|rd_token/);
});

test("a 403 permission failure remains a 403 and never refreshes a session", async () => {
  let refreshes = 0;
  await assert.rejects(invoke("realDebrid", {}, {
    token:"valid", timeoutMs: 100,
    refreshToken: async () => {refreshes++; return "new";},
    fetchImpl: async () => response(403, {error:"Origin denied"}),
  }), error => error.status === 403 && /Origin denied/.test(error.message));
  assert.equal(refreshes, 0);
});

test("one refreshed session still retries on 401 without bypassing authentication", async () => {
  const headers = [];
  const result = await invoke("realDebrid", {action:"status"}, {
    token:"expired", timeoutMs:100,
    refreshToken: async () => "new-session",
    fetchImpl: async (_url, options) => {
      headers.push(options.headers.Authorization);
      return response(headers.length===1 ? 401 : 200, {connected:true});
    },
  });
  assert.deepEqual(headers, ["Bearer expired", "Bearer new-session"]);
  assert.equal(result.data.connected, true);
});

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const drain = () => new Promise(resolve => setImmediate(resolve));

test("a late 401 after timeout never starts account refresh or body decoding", async () => {
  const pending = deferred();
  let refreshes = 0;
  let bodies = 0;
  const task = invoke("realDebrid", {}, {
    token: "expired", timeoutMs: 15,
    fetchImpl: () => pending.promise,
    refreshToken: async () => { refreshes++; return "fresh"; },
  });
  await assert.rejects(task, error => error.code === "RD_REQUEST_TIMEOUT");
  pending.resolve({ status: 401, ok: false, json: async () => { bodies++; return {}; } });
  await drain();
  assert.equal(refreshes, 0);
  assert.equal(bodies, 0);
});

test("a late account refresh after timeout never submits another RD request", async () => {
  const pending = deferred();
  let calls = 0;
  const task = invoke("realDebrid", { action: "status" }, {
    token: "expired", timeoutMs: 15,
    fetchImpl: async () => { calls++; return response(401); },
    refreshToken: () => pending.promise,
  });
  await assert.rejects(task, error => error.code === "RD_REQUEST_TIMEOUT");
  pending.resolve("fresh");
  await drain();
  assert.equal(calls, 1);
  const retry = await invoke("realDebrid", {}, {
    token: "fresh", timeoutMs: 100,
    fetchImpl: async () => response(200, { connected: true }),
  });
  assert.equal(retry.data.connected, true, "A separate user retry still works");
});

test("a late successful response after timeout is not decoded", async () => {
  const pending = deferred();
  let bodies = 0;
  const task = invoke("realDebrid", {}, {
    token: "valid", timeoutMs: 15, fetchImpl: () => pending.promise,
  });
  await assert.rejects(task, error => error.code === "RD_REQUEST_TIMEOUT");
  pending.resolve({ status: 200, ok: true, json: async () => { bodies++; return {}; } });
  await drain();
  assert.equal(bodies, 0);
});
