import test from 'node:test';
import assert from 'node:assert/strict';
import { createRollingSourceChecks, ROLLING_SOURCE_CHECK_MS } from '../src/components/mg/rollingSourceChecks.js';
class FakeEvents extends EventTarget {
  constructor() { super(); this.visibilityState='visible'; this.timers=new Map(); this.nextId=0; }
  setInterval(fn,ms) { const id=++this.nextId;this.timers.set(id,{fn,ms});return id; }
  clearInterval(id) { this.timers.delete(id); }
  tick() { for(const {fn} of this.timers.values()) fn(); }
}
test('rolling source checks cover entire list, pause in background, resume on foreground and clean up', async()=>{
  const win=new FakeEvents(),doc=new FakeEvents();
  const checked=[];const items=Array.from({length:10},(_,id)=>id+1);
  const stop=createRollingSourceChecks(()=>items, item=>checked.push(item), {windowObject:win,documentObject:doc,batchSize:3});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ROLLING_SOURCE_CHECK_MS,45000);
  assert.deepEqual(checked,[1,2,3]);
  for (let tick = 0; tick < 3; tick++) {
    win.tick();
    // Each real interval allows the previous async batch to settle.
    await new Promise(resolve=>setImmediate(resolve));
  }
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(checked,[1,2,3,4,5,6,7,8,9,10,1,2]);
  doc.visibilityState='hidden';win.tick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(checked.length,12);
  doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(checked.slice(-3),[3,4,5]);
  stop();win.tick();
  assert.equal(win.timers.size,0);
});

test('slow TV-box checks never overlap and recover when a request finishes', async () => {
  const win = new FakeEvents(), doc = new FakeEvents();
  const started = [];
  const pending = [];
  const stop = createRollingSourceChecks(
    () => [1, 2, 3, 4, 5],
    item => {
      started.push(item);
      return new Promise(resolve => pending.push(resolve));
    },
    { windowObject: win, documentObject: doc, batchSize: 2 }
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [1, 2]);
  win.tick();
  win.dispatchEvent(new Event('focus'));
  win.dispatchEvent(new Event('online'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [1, 2], 'requests must stay bounded while unresolved');
  pending[0]();
  await new Promise(resolve => setImmediate(resolve));
  win.tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [1, 2, 3]);
  stop();
  pending[1]();
  pending[2]();
  await new Promise(resolve => setImmediate(resolve));
  win.tick();
  assert.deepEqual(started, [1, 2, 3], 'cleanup prevents further requests');
});
