// Exercises the real history card, providers, CSS and video in Chromium.
// Requires Chromium and ffmpeg; no backend credentials or remote media are used.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const directory = await mkdtemp(path.join(tmpdir(), "mg-history-video-"));
let browser;
let server;
try {
  const fixture = path.join(directory, "resume.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "testsrc=size=320x180:rate=24", "-f", "lavfi", "-i", "sine=frequency=440",
    "-t", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-movflags", "+faststart", fixture]);
  const video = await readFile(fixture);
  server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [{
      name: "history-video-fixture",
      enforce: "pre",
      load(id) {
        if (!id.endsWith("/src/api/base44Client.js")) return;
        return `
          const row = {id:'resume-test',content_key:'mg2|42|movie|2026|||Resume%20test',
            title:'Resume test',progress:12,duration:30,source_type:'file',
            video_url:location.origin+'/__history-video.mp4',updated_date:new Date().toISOString()};
          const entity={list:async()=>[row],filter:async()=>[row],subscribe:()=>()=>{},
            update:async(id,patch)=>Object.assign(row,patch),create:async data=>data,delete:async()=>{}};
          export const base44={auth:{me:async()=>null},entities:new Proxy({},{get:()=>entity}),
            functions:{invoke:async()=>({data:{connected:false,streams:[],movies:[]}})}};`;
      },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url === "/__history-video.mp4") {
            const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range || "");
            const start = range ? Number(range[1]) : 0;
            const end = range?.[2] ? Math.min(Number(range[2]), video.length - 1) : video.length - 1;
            response.writeHead(range ? 206 : 200, {
              "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": end - start + 1,
              ...(range ? { "Content-Range": `bytes ${start}-${end}/${video.length}` } : {}),
            });
            response.end(video.subarray(start, end + 1));
            return;
          }
          if (request.url !== "/__history-video-test") return next();
          const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body><div id="root"></div><script type="module">
            import React from 'react'; import {createRoot} from 'react-dom/client';
            import '/src/index.css'; import '/src/fire-tv-stable.css'; import '/src/fire-tv-player-failsafe.css';
            import {PlayerProvider} from '/src/components/mg/PlayerProvider.jsx';
            import ContinueWatchingRow from '/src/components/mg/ContinueWatchingRow.jsx';
            import ContinueWatchingAssist from '/src/components/mg/ContinueWatchingAssist.jsx';
            createRoot(document.getElementById('root')).render(React.createElement(PlayerProvider,null,
              React.createElement(ContinueWatchingRow),React.createElement(ContinueWatchingAssist)));
            </script></body></html>`;
          response.setHeader("Content-Type", "text/html");
          response.end(await vite.transformIndexHtml(request.url, html));
        });
      },
    }],
  });
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
  });
  for (const [label, width, height] of [["phone portrait", 390, 844], ["phone landscape", 844, 390], ["desktop", 1280, 800]]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewport({ width, height });
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.url().startsWith(origin) || request.url().startsWith("data:")) void request.continue();
      else void request.abort();
    });
    await page.goto(`${origin}/__history-video-test`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[aria-label="Open Resume test"]');
    await page.click('[aria-label="Open Resume test"]');
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-mg-player-stage="true"] video');
      return video && video.currentTime >= 12 && !video.paused && video.readyState >= 2 && video.videoWidth > 0;
    });
    const result = await page.evaluate(() => {
      const stage = document.querySelector('[data-mg-player-stage="true"]');
      const video = stage.querySelector("video");
      const rect = video.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      return { width: rect.width, height: rect.height, stageHeight: stageRect.height,
        frames: video.getVideoPlaybackQuality().totalVideoFrames, time: video.currentTime,
        castScripts: document.querySelectorAll('script[src*="cast_sender"]').length };
    });
    assert.ok(result.height > 100, `${label}: resumed video collapsed: ${JSON.stringify(result)}`);
    assert.ok(result.width > 200, `${label}: resumed video has no visible width`);
    assert.ok(result.height >= result.stageHeight - 3, `${label}: video must fill its stage`);
    assert.ok(result.frames > 0, `${label}: video must decode frames`);
    assert.equal(result.castScripts, 0, "History playback must not initialize casting");
    assert.deepEqual(errors, [], `${label}: no player render errors`);
    console.log(`PASS ${label}: Continue Watching resumed at ${result.time.toFixed(1)}s with visible ${Math.round(result.width)}×${Math.round(result.height)} video`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server?.close();
  await rm(directory, { recursive: true, force: true });
}
