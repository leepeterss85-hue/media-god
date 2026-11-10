import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { deviceClient } from '../deploy/media-god-rd-api/deviceClient.mjs';

test('device credentials persist encrypted and cannot be read by another device', async () => {
  const dir = await mkdtemp(`${tmpdir()}/mg-device-`);
  try {
    assert.equal(await deviceClient('Device weak', dir), null);
    const a = await deviceClient('Device ' + 'a'.repeat(64), dir);
    await a.client.auth.updateMe({rd_token: 'private-rd-token'});
    const b = await deviceClient('Device ' + 'b'.repeat(64), dir);
    assert.equal(b.user.rd_token, undefined);
    const restored = await deviceClient('Device ' + 'a'.repeat(64), dir);
    assert.equal(restored.user.rd_token, 'private-rd-token');
    const files = await readdir(dir);
    assert.equal(files.length, 1);
    assert.ok(!(await readFile(`${dir}/${files[0]}`, 'utf8')).includes('private-rd-token'));
    const link = await a.client.entities.RdLink.create({hash:'test',url:'private-url'});
    assert.deepEqual(await b.client.entities.RdLink.filter({hash:'test'}), []);
    await assert.rejects(b.client.entities.RdLink.update(link.id, {url:'changed'}));
    await a.client.auth.updateMe({rd_token:''});
    assert.equal((await a.client.auth.me()).rd_token, '');
  } finally { await rm(dir, {recursive:true,force:true}); }
});
