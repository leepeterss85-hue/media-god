import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/api/independentRealDebrid.js", import.meta.url),
  "utf8",
);
const begin = source.indexOf("export async function invokeIndependentRealDebrid(");
assert.ok(begin > -1);
const functionCode = source.slice(begin).replace(
  "export async function invokeIndependentRealDebrid(",
  "async function invokeIndependentRealDebrid(",
);
const invoke = vm.runInNewContext(functionCode + "\n invokeIndependentRealDebrid;", {
  INDEPENDENT_RD_FUNCTIONS: new Set(["realDebrid", "realDebridAuth"]),
  INDEPENDENT_RD_ENDPOINT: "https://rd.example.test",
  independentRdPayload: payload => Object.fromEntries(Object.entries(payload || {})
    .filter(([name]) => name !== "rd_token")),
  readAccountSessionToken: async () => "original-session",
  resolveAccountToken: async () => "",
  getAccessToken: async () => "",
  AbortController, setTimeout, clearTimeout,
  globalThis: {},
});

const reply = (status, data = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => data,
});

test("Android box Real-Debrid 401 retries with newer verified SDK session only once", async () => {
  const calls = [];
  let refreshes = 0;
  const result = await invoke("realDebrid", { action: "status", rd_token: "private" }, {
    token: "old-session",
    refreshToken: async () => { refreshes++; return "new-session"; },
    fetchImpl: async (_url, options) => {
      calls.push(options);
      return reply(calls.length === 1 ? 401 : 200, { valid: true });
    },
  });
  assert.equal(result.data.valid, true);
  assert.equal(refreshes, 1);
  assert.deepEqual(calls.map(x => x.headers.Authorization), [
    "Bearer old-session", "Bearer new-session",
  ]);
  assert.equal(calls[0].body, calls[1].body);
  assert.doesNotMatch(calls[1].body, /private/);
  assert.equal(calls[0].credentials, "omit");
});

test("same rejected session is never retried or looped", async () => {
  let count = 0;
  await assert.rejects(
    invoke("realDebrid", {}, {
      token: "expired",
      refreshToken: async () => "expired",
      fetchImpl: async () => { count++; return reply(401, {error:"Sign in again"}); },
    }),
    error => error.status === 401 && /Sign in again/.test(error.message),
  );
  assert.equal(count, 1);
});

test("new session also rejected only makes two authenticated attempts", async () => {
  let count = 0;
  await assert.rejects(invoke("realDebrid", {}, {
    token: "expired",
    refreshToken: async () => "fresh",
    fetchImpl: async () => { count++; return reply(401, {error:"Still expired"}); },
  }), error => error.status === 401);
  assert.equal(count, 2);
});

test("permission/Origin 403 cannot trigger another Real-Debrid request", async () => {
  let count = 0;
  let refreshCount = 0;
  await assert.rejects(invoke("realDebrid", {}, {
    token: "account",
    refreshToken: async () => {refreshCount++; return "different";},
    fetchImpl: async () => {count++; return reply(403, {error:"Origin not allowed"});},
  }), error => error.status === 403);
  assert.equal(count, 1);
  assert.equal(refreshCount, 0);
});

test("non-auth server errors retain existing status and no retry", async () => {
  let count = 0;
  await assert.rejects(invoke("realDebrid", {}, {
    token: "account",
    refreshToken: async () => {throw new Error("Should not refresh");},
    fetchImpl: async () => {count++; return reply(500, {error:"Unavailable"});},
  }), error => error.status === 500);
  assert.equal(count, 1);
});

test("successful status check never asks SDK to refresh credentials", async () => {
  let refreshed = false;
  const value = await invoke("realDebridAuth", {action:"status"}, {
    token: "active",
    refreshToken: async () => {refreshed = true; return "new";},
    fetchImpl: async () => reply(200, {connected:true}),
  });
  assert.equal(refreshed, false);
  assert.equal(value.data.connected, true);
});
