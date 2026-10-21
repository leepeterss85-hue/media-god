// Runs the real episode player/provider/assist in Chromium with a local video.
// Requires Chromium and ffmpeg. Backend responses are local test fixtures.
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
const directory = await mkdtemp(path.join(tmpdir(), "mg-episode-experience-"));
let browser;
let server;
let currentPage;
try {
  const fixture = path.join(directory, "episode.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "testsrc=size=320x180:rate=12", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000",
    "-t", "360", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-b:a", "16k",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", fixture]);
  const video = await readFile(fixture);
  server = await createServer({
    root, server: { host: "127.0.0.1", port: 0 },
    plugins: [{
      name: "episode-experience-fixtures", enforce: "pre",
      load(id) {
        if (!id.endsWith("/src/api/base44Client.js")) return;
        return `
          const stream={type:'file',label:'Local episode',url:location.origin+'/__episode.mp4',src:location.origin+'/__episode.mp4',direct:true};
          const entity={list:async()=>[],filter:async()=>[],subscribe:()=>()=>{},update:async(id,data)=>data,create:async data=>({id:'fixture',...data}),delete:async()=>{}};
          export const base44={auth:{me:async()=>null},entities:new Proxy({},{get:()=>entity}),functions:{invoke:async(name,payload={})=>{
            if(name==='getTmdbMovies') return {data:{id:42,imdb_id:'tt1234567',name:'Fixture show',episodes:[{episode_number:2,name:'Episode Two',air_date:'2020-01-01'},{episode_number:3,name:'Episode Three',air_date:'2020-01-02'}],seasons:[{season_number:1}],movies:[]}};
            if(name==='getSkipSegments') return {data:{markers:{},providers:['fixture']}};
            if(name==='realDebridAuth'||name==='multiDebrid') return {data:{connected:false,valid:false}};
            return {data:{streams:[stream],sources:[stream],connected:false,imdb_id:'tt1234567',success:true}};
          }}};`;
      },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url === "/__episode.mp4") {
            const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range || "");
            const start = range ? Number(range[1]) : 0;
            const end = range?.[2] ? Math.min(Number(range[2]), video.length - 1) : video.length - 1;
            response.writeHead(range ? 206 : 200, { "Content-Type": "video/mp4", "Accept-Ranges": "bytes",
              "Content-Length": end - start + 1, ...(range ? { "Content-Range": `bytes ${start}-${end}/${video.length}` } : {}) });
            response.end(video.subarray(start, end + 1));
            return;
          }
          if (request.url !== "/__episode-test") return next();
          response.setHeader("Content-Type", "text/html");
          response.end(await vite.transformIndexHtml(request.url, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
            import React,{useEffect} from 'react'; import {createRoot} from 'react-dom/client';
            import '/src/index.css'; import '/src/fire-tv-stable.css'; import '/src/fire-tv-player-failsafe.css';
            import {PlayerProvider,usePlayer} from '/src/components/mg/PlayerProvider.jsx';
            import MediaGodV2Assist from '/src/components/mg/MediaGodV2Assist.jsx';
            localStorage.setItem('mg_auto_next','1');
            const originalNow=Date.now; let offset=0; Date.now=()=>originalNow()+offset;
            window.test={next:0,cancel:[],seeks:[],seekSnapshots:[],ticks:0,advance:ms=>{offset+=ms;}};
            setInterval(()=>window.test.ticks++,100);
            window.addEventListener('mg:play-next-episode',()=>window.test.next++);
            window.addEventListener('mg:cancel-next-episode',event=>window.test.cancel.push(event.detail));
            window.addEventListener('mg:player-seek-to',event=>{window.test.seeks.push(event.detail.seconds);window.test.seekSnapshots.push({requested:event.detail.seconds,actual:document.querySelector('[data-mg-player-stage="true"] video')?.currentTime});});
            function Launch(){const player=usePlayer();useEffect(()=>{window.test.launch=(markers=true)=>player.play({
              id:42,tmdbId:42,imdbId:'tt1234567',title:'Fixture show',rdTitle:'Fixture show',mediaType:'tv',type:'series',season:1,episode:2,
              noRd:true,skipRdLookup:true,skipAddonLookup:true,verifiedPlaybackPolicy:'manual',
              ...(markers?{explicitSkipMarkers:{recap:{start:2,end:30},intro:{start:40,end:70},credits:{start:320}}}:{}),
              sources:[{type:'file',label:'Local episode',src:location.origin+'/__episode.mp4',url:location.origin+'/__episode.mp4',direct:true}]
            });},[player]);return null;}
            createRoot(document.getElementById('root')).render(React.createElement(PlayerProvider,null,React.createElement(Launch),React.createElement(MediaGodV2Assist)));
          </script></body></html>`));
        });
      },
    }],
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || "/usr/bin/chromium", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
  const pages = [];
  const open = async (markers = true) => {
    const page = await browser.newPage();
    currentPage = page;
    pages.push(page);
    page.setDefaultTimeout(60_000);
    page.testErrors = [];
    page.pendingRequests = new Set();
    page.on("requestfinished", request => page.pendingRequests.delete(request.url()));
    page.on("requestfailed", request => page.pendingRequests.delete(request.url()));
    page.on("pageerror", error => page.testErrors.push(error.message));
    await page.setViewport({ width: 390, height: 844 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      page.pendingRequests.add(request.url());
      if (request.url().startsWith(origin) || request.url().startsWith("data:")) void request.continue();
      else void request.abort();
    });
    await page.goto(`${origin}/__episode-test`, { waitUntil: "domcontentloaded", timeout:90_000 });
    await page.waitForFunction(() => typeof window.test?.launch === "function");
    await page.evaluate(markers => { void window.test.launch(markers); }, markers);
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-mg-player-stage="true"] video');
      return video?.readyState >= 2 && video.duration >= 360 && !video.paused && window.__MG_PLAYER_CONTEXT__?.nextEpisodeAvailable === true;
    });
    return page;
  };
  const position = async (page, seconds) => {
    await page.evaluate(async seconds => {
      const video = document.querySelector('[data-mg-player-stage="true"] video');
      video.currentTime = seconds;
      await video.play();
      window.dispatchEvent(new CustomEvent('mg:playback-position',{detail:{currentTime:seconds,duration:video.duration}}));
    }, seconds);
    await page.waitForFunction(seconds => {
      const video = document.querySelector('[data-mg-player-stage="true"] video');
      return !video.seeking && video.currentTime >= seconds && video.currentTime < seconds + 2;
    }, {}, seconds);
  };
  const settle = async page => {
    const before = await page.evaluate(() => window.test.ticks);
    await page.waitForFunction(before => window.test.ticks >= before + 3, {}, before);
  };
  const refresh = page => page.evaluate(() => window.dispatchEvent(new CustomEvent('mg:player-context',{
    detail:{...window.__MG_PLAYER_CONTEXT__,skipMarkersPending:false,nextEpisodeName:'Refreshed metadata'}
  })));
  const click = (page, label) => page.click(`[aria-label="${label}"]`);

  const skips = await open();
  await position(skips, 3);
  await skips.waitForSelector('[aria-label="Skip recap"]', { visible: true });
  await click(skips, "Skip recap");
  await skips.waitForFunction(() => window.test.seeks.includes(30.25));
  assert.ok(await skips.evaluate(() => window.test.seekSnapshots.some(({requested,actual})=>requested===30.25 && Math.abs(actual-requested)<0.01)), 'Recap must seek the real video to the recap end');
  await position(skips, 45);
  await skips.waitForSelector('[aria-label="Skip intro or opening titles"]', { visible: true });
  await refresh(skips);
  await settle(skips);
  assert.ok(await skips.$('[aria-label="Skip intro or opening titles"]'), "Same-episode metadata refresh must preserve the current skip window");
  await click(skips, "Skip intro or opening titles");
  await skips.waitForFunction(() => window.test.seeks.includes(70.25));
  assert.ok(await skips.evaluate(() => window.test.seekSnapshots.some(({requested,actual})=>requested===70.25 && Math.abs(actual-requested)<0.01)), 'Intro must seek the real video to the intro end');
  console.log("PASS recap and intro buttons seek to their explicit markers; metadata refresh preserves current position");
  await skips.evaluate(() => window.dispatchEvent(new CustomEvent('mg:set-auto-next',{detail:{enabled:false}})));
  await position(skips, 330);
  await skips.waitForSelector('[aria-label="Play next episode"]', { visible: true });
  await click(skips, "Play next episode");
  await skips.waitForFunction(() => window.test.next === 1 && window.__MG_PLAYER_CONTEXT__?.episode === 3);
  console.log("PASS credits Next control dispatches exactly once and selects the following episode");

  const cancelled = await open();
  await position(cancelled, 330);
  await cancelled.waitForSelector('[aria-label="Keep watching current episode"]', { visible: true });
  const session = await cancelled.evaluate(() => window.__MG_PLAYER_CONTEXT__.playbackSessionId);
  await click(cancelled, "Keep watching current episode");
  await cancelled.waitForFunction(() => window.test.cancel.length === 1 && !document.querySelector('[aria-label="Keep watching current episode"]'));
  assert.equal(await cancelled.evaluate(() => window.test.cancel[0].playbackSessionId), session);
  await refresh(cancelled);
  await cancelled.evaluate(() => window.test.advance(12_000));
  await settle(cancelled);
  assert.equal(await cancelled.evaluate(() => window.test.next), 0, "Metadata refresh must not restart a cancelled countdown");
  assert.equal(await cancelled.$('[aria-label="Keep watching current episode"]'), null);
  await position(cancelled, 359.8);
  await cancelled.waitForFunction(() => document.querySelector('[data-mg-player-stage="true"] video')?.ended);
  await settle(cancelled);
  assert.equal(await cancelled.evaluate(() => window.__MG_PLAYER_CONTEXT__?.episode), 2, "Natural end must respect the current session's cancellation");
  assert.equal(await cancelled.evaluate(() => window.test.next), 0);
  await cancelled.evaluate(() => window.dispatchEvent(new CustomEvent('mg:native-playback-ended',{detail:{autoNextCancelled:true}})));
  await settle(cancelled);
  assert.equal(await cancelled.evaluate(() => window.__MG_PLAYER_CONTEXT__?.episode), 2);
  console.log("PASS cancellation survives same-episode metadata refresh, countdown expiry, browser natural end, and cancelled native-end telemetry");

  const countdown = await open();
  await position(countdown, 330);
  await countdown.waitForSelector('[aria-label="Keep watching current episode"]', { visible: true });
  await countdown.evaluate(() => window.test.advance(11_000));
  await countdown.waitForFunction(() => window.test.next === 1 && window.__MG_PLAYER_CONTEXT__?.episode === 3);
  console.log("PASS verified credits countdown advances exactly once when it is not cancelled");

  const absent = await open(false);
  await position(absent, 30);
  await settle(absent);
  assert.equal(await absent.$('[aria-label="Skip recap"]'), null, "Recap must not be invented without timings");
  assert.equal(await absent.$('[aria-label="Skip intro or opening titles"]'), null, "Intro must not be invented without timings");
  await position(absent, 285);
  await absent.waitForSelector('[aria-label="Play next episode"]', { visible: true });
  assert.equal(await absent.$('[aria-label="Keep watching current episode"]'), null, "Missing credits metadata must not start a countdown 75 seconds early");
  await absent.evaluate(() => window.test.advance(20_000));
  await settle(absent);
  assert.equal(await absent.evaluate(() => window.test.next), 0);
  console.log("PASS missing timing data creates neither skip buttons nor an early countdown");
  for (const page of pages) assert.deepEqual(page.testErrors, [], "Player must not produce page errors");
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    console.error(await currentPage.evaluate(() => ({text:document.body.innerText.slice(-1600),context:window.__MG_PLAYER_CONTEXT__,video:[...document.querySelectorAll("video")].map(video=>({time:video.currentTime,duration:video.duration,paused:video.paused,ready:video.readyState}))})));
    console.error(currentPage.testErrors);
    console.error([...currentPage.pendingRequests]);
  }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  await rm(directory, { recursive: true, force: true });
}
