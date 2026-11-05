import http from 'node:http';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { TV_SCRAPER_SANDBOX } from '../src/components/mg/tvScraperSandbox.js';

// A local cross-origin fixture tests containment without relying on a scraper.
// Physical Android-box playback remains a separate release requirement.
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  if (req.url === '/frame') {
    res.end(`<button id="escape" onclick="window.popupBlocked = window.open('/popup') === null; try { top.location.href='/escaped'; } catch(e) { window.topBlocked=true; }">Play</button>
      <video id="video" muted autoplay playsinline></video><canvas id="canvas" width="160" height="90"></canvas>
      <script>const canvas=document.querySelector('canvas'); const ctx=canvas.getContext('2d');
      setInterval(()=>{ctx.fillStyle='green';ctx.fillRect(0,0,160,90)},50);
      document.querySelector('video').srcObject=canvas.captureStream(10);</script>`);
  } else {
    const port = server.address().port;
    res.end(`<iframe sandbox="${TV_SCRAPER_SANDBOX}" allow="autoplay; fullscreen" src="http://localhost:${port}/frame"></iframe>`);
  }
});
await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
let browser;
try {
  browser = await puppeteer.launch({executablePath: process.env.CHROME_PATH, headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const initialPages = (await browser.pages()).length;
  await page.goto(url);
  const frame = page.frames().find(f => f.url().endsWith('/frame'));
  assert.ok(frame);
  await frame.waitForFunction(() => document.querySelector('video').currentTime > 0.2);
  await frame.click('#escape');
  assert.deepEqual(await frame.evaluate(() => ({popup: window.popupBlocked, top: window.topBlocked})), {popup: true, top: true});
  assert.equal(page.url(), url);
  assert.equal((await browser.pages()).length, initialPages);
  console.log('PASS: cross-origin inline video advances; user-click popup and top navigation are blocked; app remains mounted.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
