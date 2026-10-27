import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { watchContinueWatchingChanges, CONTINUE_WATCHING_SAVED,
  PROFILE_CHANGED_EVENT, CONTINUE_WATCHING_SYNC_INTERVAL_MS } from '../src/components/mg/continueWatchingSync.js';
import { EMBED_HISTORY_CHANGED } from '../src/components/mg/embedWatchingHistory.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
class FakeEvents extends EventTarget {
  constructor() { super(); this.visibilityState = 'visible'; this.callbacks = new Map(); this.id = 0; }
  setInterval(cb, ms) { const id=++this.id; this.callbacks.set(id,{cb,ms}); return id; }
  clearInterval(id) { this.callbacks.delete(id); }
  poll() { for (const {cb} of this.callbacks.values()) cb(); }
}

test('history refreshes on login-session return, new saved progress, reconnect and on a visible 15s poll', () => {
  const win = new FakeEvents(); const doc = new FakeEvents();
  let seen = 0; let onSubscription = null; let unsubscribed = false;
  const stop = watchContinueWatchingChanges(() => { seen++; }, {
    windowObject: win, documentObject: doc,
    subscribe: cb => { onSubscription=cb; return () => { unsubscribed=true; }; },
  });
  assert.equal(CONTINUE_WATCHING_SAVED,EMBED_HISTORY_CHANGED);
  assert.equal(CONTINUE_WATCHING_SYNC_INTERVAL_MS,15000);
  assert.equal(seen,1);
  assert.deepEqual([...win.callbacks.values()].map(v=>v.ms),[15000]);
  win.dispatchEvent(new Event('focus'));
  win.dispatchEvent(new Event('online'));
  win.dispatchEvent(new Event('mg:fire-tv-app-resume'));
  win.dispatchEvent(new Event(CONTINUE_WATCHING_SAVED));
  win.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
  onSubscription(); win.poll();
  assert.equal(seen,8);
  doc.visibilityState='hidden';
  win.poll(); win.dispatchEvent(new Event('focus')); onSubscription();
  assert.equal(seen,8,'background device must not poll');
  doc.visibilityState='visible'; doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(seen,9);
  stop();assert.equal(unsubscribed,true);assert.equal(win.callbacks.size,0);
  win.dispatchEvent(new Event('focus'));win.poll();
  assert.equal(seen,9,'unmount removes every listener and poll');
});

test('history rows ignore stale responses, preserve selected source, and cannot delete other-device entries', () => {
  const row = read('src/components/mg/ContinueWatchingRow.jsx');
  const recent = read('src/components/mg/RecentlyWatchedRow.jsx');
  const assist = read('src/components/mg/ContinueWatchingAssist.jsx');
  assert.match(row,/watchContinueWatchingChanges\(load/);
  assert.match(row,/version !== loadVersionRef\.current/);
  assert.doesNotMatch(row,/Promise\.allSettled\([\s\S]*ContinueWatching\.delete/);
  assert.match(row,/readEmbedBookmark\(item\)/);
  assert.match(row,/hasSavedPlayableSource\(entry\.item\)/);
  assert.match(recent,/watchContinueWatchingChanges\(load/);
  assert.match(recent,/version !== loadVersionRef\.current/);
  assert.match(assist,/new CustomEvent\(EMBED_HISTORY_CHANGED\)/);
  assert.match(assist,/preserveSource/);
  const schema=read('base44/entities/ContinueWatching.jsonc');
  assert.match(schema,/"created_by_id": "\{\{user\.id\}\}"/);
});

test('Continue Watching appears before the featured banner, only once, without changing Live TV', () => {
  const home = read('src/components/mg/HomeDashboard.jsx');
  assert.ok(home.indexOf('data-mg-home-first="continue-watching"') < home.indexOf('<HeroSlider'),
    'Resume row must render before the featured hero');
  assert.equal((home.match(/<ContinueWatchingRow /g) || []).length, 1,
    'Never show two Continue Watching rows');
  assert.match(home, /homeOrder \|\| \[\]\)\.filter\(\(id\) => id !== "continue-watching"\)/);
  assert.match(home, /hiddenHomeSections\.has\("continue-watching"\)/);
  assert.match(home, /continue-watching>featured>new-films>new-tv/);
});
