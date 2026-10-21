import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  pairingCodeFromInput,
  receiverOnline,
  mediaGodHandoffCommand,
} from "../src/components/mg/pairedMediaGodCast.js";

const token = "abcd1234".repeat(4);
const origin = "https://mysterious-media-vault-pro.base44.app";

test("accepts the existing 32-character Fire TV Phone Remote bearer code or matching origin QR link", () => {
  assert.equal(pairingCodeFromInput(token, origin), token);
  assert.equal(pairingCodeFromInput(`${origin}/remote/${token}`, origin), token);
  assert.equal(pairingCodeFromInput(`https://phishing.example/remote/${token}`, origin), "");
  assert.equal(pairingCodeFromInput("../../remote/" + token, origin), "");
  assert.equal(pairingCodeFromInput("123456", origin), "");
});

test("only sends to receivers with a current live heartbeat and unexpired session", () => {
  const now = Date.parse("2026-10-20T21:00:00Z");
  const receiver = {
    id: "receiver1", session_code: token,
    expires_at: "2026-10-20T22:00:00Z",
    last_seen_at: "2026-10-20T20:59:55Z",
  };
  assert.equal(receiverOnline(receiver, now), true);
  assert.equal(receiverOnline({ ...receiver, last_seen_at: "2026-10-20T20:00:00Z" }, now), false);
  assert.equal(receiverOnline({ ...receiver, expires_at: "2026-10-20T20:00:00Z" }, now), false);
});

test("movie transfer includes title and 52 minute resume position but never a source URL", () => {
  const payload = mediaGodHandoffCommand({
    tmdbId: 10023, title: "Oasis: Don't Look Back in Anger", mediaType: "movie",
    startTime: 3120, url: "https://secret.example/signed-token",
    magnet: "magnet:?xt=urn:btih:sensitive", auth: "SECRET",
  });
  assert.equal(payload.command, "play_media");
  const value = JSON.parse(payload.value);
  assert.equal(value.tmdbId, 10023);
  assert.equal(value.startTime, 3120);
  assert.equal(value.url, undefined);
  assert.equal(value.magnet, undefined);
  assert.equal(value.auth, undefined);
  assert.doesNotMatch(payload.value, /secret|magnet|auth/i);
});

test("TV handoff keeps season and episode and live handoff reuses TV channel resolver", () => {
  const tv = JSON.parse(mediaGodHandoffCommand({
    title: "Example series", tmdbId: "77", mediaType: "tv",
    season: 3, episode: 2, startTime: 55,
  }).value);
  assert.equal(tv.mediaType, "tv");
  assert.equal(tv.season, 3);
  assert.equal(tv.episode, 2);
  assert.throws(() => mediaGodHandoffCommand({ title: "Example series", tmdbId: 77, mediaType: "tv" }), /season/i);
  const live = mediaGodHandoffCommand({ title: "BBC One", live: true, channelId: "bbc-one" });
  assert.equal(live.command, "play_live");
  assert.equal(JSON.parse(live.value).name, "BBC One");
});

test("the Cast menu offers both native Google Cast and paired Media God destinations", () => {
  const button = readFileSync(new URL("../src/components/mg/CastButton.jsx", import.meta.url), "utf8");
  const player = readFileSync(new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8");
  const receiver = readFileSync(new URL("../src/components/mg/PlayerQrRemote.jsx", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../src/components/mg/PlayerProvider.jsx", import.meta.url), "utf8");
  assert.match(button, /Chromecast \/ Google TV/);
  assert.match(button, /Media God TV \/ Fire Stick/);
  assert.match(button, /showMediaGodPairing/);
  assert.match(player, /media=\{\{/);
  assert.match(provider, /startTime: remoteStartTime/);
  assert.match(receiver, /command === "play_media"/);
  assert.match(receiver, /command === "play_live"/);
});
