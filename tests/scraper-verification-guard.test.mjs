import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { isVerificationChallengeStream, isVerificationChallengeUrl } from "../src/components/mg/verificationChallengeGuard.js";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("explicit human-verification and QR challenge URLs are not video sources", () => {
  const challengeLinks = [
    "https://stream.example/cdn-cgi/challenge-platform/h/b/orchestrate",
    "https://stream.example/captcha/?next=play",
    "https://stream.example/verify-human",
    "https://stream.example/verify-you-are-human?id=10",
    "https://stream.example/turnstile/",
    "https://challenges.cloudflare.com/turnstile/v0/api.js",
    "https://www.google.com/recaptcha/api2/anchor",
  ];
  for (const url of challengeLinks) {
    assert.equal(isVerificationChallengeUrl(url), true, url);
    assert.equal(isVerificationChallengeStream({ url }), true);
  }
});

test("normal videos and streams remain allowed, even if the title contains the word human", () => {
  const normalLinks = [
    "https://cdn.example/video.m3u8?token=not-a-qr-challenge",
    "https://cdn.example/film.mp4",
    "https://cdn.example/Human.Nature.2025.mkv",
    "https://cdn.example/video/tt1234567?quality=1080",
    "https://cdn.example/watch?id=5",
    "https://cdn.example/film.m3u8?captcha_blocker=0",
  ];
  for (const url of normalLinks) {
    assert.equal(isVerificationChallengeUrl(url), false, url);
  }
  assert.equal(isVerificationChallengeStream({
    title: "A Human Story (2025) English 1080p",
    url: normalLinks[0],
  }), false);
  assert.equal(isVerificationChallengeStream({
    name: "Cloudflare Documentary", url: normalLinks[1],
  }), false);
  assert.equal(isVerificationChallengeStream({
    name: "Player", description: "Verify you are human to continue",
    url: "https://stream.example/play?id=abc",
  }), true);
  assert.equal(isVerificationChallengeStream({
    title: "Scan the QR code to verify", url: "https://stream.example/watch/1",
  }), true);
});

test("server and browser addon normalizers both reject challenged links before playback", () => {
  const browser = read("src/components/mg/addonBrowserFallback.js");
  const server = read("base44/functions/fetchAddonStreams/entry.ts");
  assert.match(browser, /isVerificationChallengeStream\(stream\)/);
  assert.match(browser, /isAddonControlStream\(stream, addonName\)/);
  assert.match(server, /const challengeUrl =/);
  assert.match(server, /const challengeMessage =/);
  assert.match(server, /isAddonControlStream\(stream, addonName\)/);

  const start = server.indexOf('const isAddonControlStream =');
  const end = server.indexOf("};", start) + 2;
  const serverGuard = vm.runInNewContext(server.slice(start, end) + "\nisAddonControlStream", {
    clean: value => String(value || "").trim()
  });
  assert.equal(serverGuard({url: "https://challenge.test/cdn-cgi/challenge-platform/h/b"}, "OtherAddon"), true);
  assert.equal(serverGuard({title:"Verify you are human", url:"https://media.test/direct"}, "OtherAddon"), true);
  assert.equal(serverGuard({name:"Working release",url:"https://media.test/ready.mp4"}, "Torrentio"), false);
});

test("TV episode scraper rejects challenge results before picking first useful provider", () => {
  const source = read("src/components/mg/tvEpisodeScraper.js");
  assert.match(source, /isVerificationChallengeStream\(item\)/);
  assert.match(source, /validEpisodeLink\(item, payload, id, seasonNumber, episodeNumber\)/);
});

test("web embeds offer an explicit escape from QR screens without altering native playback", () => {
  const main = read("src/components/mg/OnlyFlixEmbedPlayer.jsx");
  assert.match(main, /data-mg-try-next-web-source="true"/);
  assert.match(main, />Try next<\/button>/);
  assert.match(main, /advanceAfterFailure\(\)/);
  for (const name of ["VidSrcEmbedPlayer", "ExtraEmbedPlayer", "EmbedSuPlayer"]) {
    const ui = read("src/components/mg/" + name + ".jsx");
    assert.match(ui, /data-mg-skip-verification="true"/);
    assert.match(ui, /Skip QR/);
  }
  const core = read("src/components/mg/VidCoreEmbedPlayer.jsx");
  assert.match(core, /Skip QR \/ Try next/);
  assert.match(main, /Cross-origin iframes cannot report actual video playback/);
});
