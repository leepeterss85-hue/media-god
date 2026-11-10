import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import realDebrid from "../deploy/media-god-rd-api/realDebrid.mjs";
import realDebridAuth from "../deploy/media-god-rd-api/realDebridAuth.mjs";
import multiDebrid from "../deploy/media-god-rd-api/multiDebrid.mjs";
import { createClientFromRequest } from "../deploy/media-god-rd-api/verifiedUserClient.mjs";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function request(action, user, { body = {} } = {}) {
  const req = new Request("https://local.test/functions/realDebrid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const client = {
    auth: {
      me: async () => user,
      updateMe: async patch => ({...user, ...patch}),
    },
    entities: {
      RdLink: {
        filter: async () => [],
        create: async () => ({}),
        update: async () => ({}),
        delete: async () => ({}),
      },
    },
  };
  Object.defineProperties(req, {
    __mediaGodVerifiedClient: {value: client},
    __mediaGodVerifiedUser: {value: user},
    __mediaGodVerifiedUserId: {value: user.id},
  });
  return req;
}

test("the ported RD status uses the verified account token, not a client-supplied one", async () => {
  const original = globalThis.fetch;
  const seen = [];
  try {
    globalThis.fetch = async (url, options) => {
      seen.push({url: String(url), authorization: options?.headers?.Authorization || ""});
      return new Response(JSON.stringify({premium: 1, points: 100, expiration: "2030-01-01"}), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    };
    const res = await realDebrid(request("status", {id:"verified-1", rd_token:"correct-private-rd-token"}, {
      body: {rd_token:"attacker-fake-token"},
    }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.valid, true);
    assert.equal(data.premium, true);
    assert.ok(seen.some(call => call.authorization === "Bearer correct-private-rd-token"));
    assert.ok(!seen.some(call => call.authorization.includes("attacker-fake-token")));
    assert.doesNotMatch(JSON.stringify(data), /correct-private-rd-token|attacker-fake-token/);
  } finally {
    globalThis.fetch = original;
  }
});

test("Real-Debrid authentication status remains account-scoped and never exposes tokens", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      premium: 1, points: 23, expiration: "2030-01-01",
    }), {status: 200, headers: {"Content-Type":"application/json"}});
    const res = await realDebridAuth(request("status", {
      id: "verified-2",
      rd_token: "secret-token",
      rd_refresh_token: "secret-refresh",
    }));
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.connected, true);
    assert.doesNotMatch(JSON.stringify(payload), /secret-token|secret-refresh/);
  } finally {
    globalThis.fetch = original;
  }
});

test("handlers cannot obtain a client without a verified user request", () => {
  const request = new Request("https://local.test", {method:"POST"});
  assert.throws(() => createClientFromRequest(request), /Verified Media God account/);
});

test("Railway RD service requires a real Base44 session, protects actions and excludes guest impersonation", () => {
  const server = source("deploy/media-god-rd-api/server.mjs");
  assert.match(server, /client\.auth\.me\(\)/);
  assert.match(server, /if \(!verified\) return respond\(res, 401/);
  assert.match(server, /credentials must not be supplied/i);
  assert.match(server, /ALLOWED_ORIGINS/);
  assert.match(server, /private, no-store/);
  assert.match(server, /\/functions\/realDebridAuth/);
  assert.match(server, /\/functions\/findRdLibrary/);
  const guests = source("deploy/media-god-rd-api/guestDebrid.mjs");
  assert.doesNotMatch(guests, /asServiceRole|process\.env\..*TOKEN/);
});

test("authenticated Real-Debrid cache-check route returns valid structures", async () => {
  const user = {id:"verified-cache", rd_token:"private-dummy-rd", debrid_provider_priority:["realdebrid"]};
  const res = await multiDebrid(request("check_cache", user, {body:{hashes:[]}}));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.cached, {});
  assert.deepEqual(data.bestProviderByHash, {});
});

test("client redirects all main RD actions and cached-source checks to verified backend", () => {
  const client = source("src/api/base44Client.js");
  const helper = source("src/api/independentRealDebrid.js");
  assert.match(client, /INDEPENDENT_RD_FUNCTIONS\.has\(String\(name \|\| ''\)\)/);
  assert.match(client, /readAccountSessionToken\(\)/);
  assert.match(client, /invokeIndependentRealDebrid\(name, payload, \{ token: sessionToken \}\)/);
  for (const name of ["realDebrid", "realDebridAuth", "findRdLibrary", "multiDebrid"]) {
    assert.match(helper, new RegExp('"' + name + '"'));
  }
  assert.match(helper, /getAccessToken/);
  assert.match(helper, /credentials: "omit"/);
  assert.match(helper, /"Authorization": deviceToken \? `Device/);
  assert.match(helper, /`Bearer \$\{session\}`/);
  assert.doesNotMatch(helper, /localStorage\.setItem|process\.env/);
  const server = source("deploy/media-god-rd-api/server.mjs");
  assert.match(server, /"\/functions\/multiDebrid": multiDebrid/);
});
