import test from 'node:test';
import assert from 'node:assert/strict';
import { needsBrowserHelp } from '../src/lib/browserEntry.js';

test('social browsers receive help without classifying normal Chrome or Safari', () => {
  for (const ua of ['Android WhatsApp/2', 'iPhone FBAN/FBIOS', 'Android Instagram 400', 'Android; wv) AppleWebKit']) {
    assert.equal(needsBrowserHelp(ua), true, ua);
  }
  for (const ua of ['Android Chrome/130 Mobile Safari/537.36', 'iPhone Version/18 Mobile Safari/604.1', 'Windows Chrome/130', '']) {
    assert.equal(needsBrowserHelp(ua), false, ua);
  }
});

test('native phone, Fire TV and bridge-equipped Android boxes never receive browser escape prompts', () => {
  for (const ua of ['Android; wv) MediaGodMobile/1.0 AndroidMobile', 'Android; wv) MediaGodFireTV/1.0', 'Android; wv) AmazonWebAppPlatform', 'Android; wv) AFTMM']) {
    assert.equal(needsBrowserHelp(ua), false, ua);
  }
  assert.equal(needsBrowserHelp('Android; wv)', true), false);
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const help = readFileSync(new URL('../public/open.html', import.meta.url), 'utf8');
const helpScript = help.match(/<script>([\s\S]*?)<\/script>/)[1];
function openHelp(ua, clipboard) {
  const elements = Object.fromEntries(['link', 'copy', 'status', 'chrome'].map(id => [id, {
    hidden: true,
    value: id === 'link' ? 'https://mysterious-media-vault-pro.base44.app/' : '',
    textContent: '',
    addEventListener(event, handler) { this[event] = handler; },
    focus() { this.focused = true; },
    select() { this.selected = true; },
    setSelectionRange(start, end) { this.selection = [start, end]; },
  }]));
  vm.runInNewContext(helpScript, {
    document: { getElementById: id => elements[id] },
    navigator: { userAgent: ua, clipboard },
    location: { href: 'https://mysterious-media-vault-pro.base44.app/open.html?access_token=secret#private' },
  });
  return elements;
}

test('copying help shares only the public home address, never incoming credentials', async () => {
  let copied;
  const elements = openHelp('Android WhatsApp', { writeText: async text => { copied = text; } });
  elements.copy.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(copied, 'https://mysterious-media-vault-pro.base44.app/');
  assert.match(elements.status.textContent, /Link copied/);
  assert.equal(elements.chrome.hidden, false);
});

test('blocked or missing clipboard leaves a selectable address and honest instructions', async () => {
  for (const clipboard of [undefined, { writeText: () => Promise.reject(new Error('denied')) }]) {
    const elements = openHelp('iPhone', clipboard);
    elements.copy.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements.link.selected, true);
    assert.match(elements.status.textContent, /Press and hold/);
    assert.equal(elements.chrome.hidden, true);
  }
  assert.equal(openHelp('Android MediaGodMobile', undefined).chrome.hidden, true);
});
