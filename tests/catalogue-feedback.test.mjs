import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueLoadMessage, savedTitlePayload, createLibraryRestore } from '../src/components/mg/catalogueFeedback.js';

test('load failures distinguish offline from an unavailable service', () => {
  assert.match(catalogueLoadMessage(false), /offline/);
  assert.match(catalogueLoadMessage(true), /try again/);
});
test('undo preserves original profile and excludes server-managed metadata', () => {
  assert.deepEqual(savedTitlePayload({ id:'old', title:'Film', profile_id:'child', created_by_id:'owner', created_date:'yesterday' }), { title:'Film', profile_id:'child' });
  assert.equal(savedTitlePayload({title:'Legacy'}).profile_id, 'main');
});
test('undo reuses a matching saved title but never one from another profile or media type', async () => {
  const created = [];
  const entity = {
    filter: async () => [{id:'other', tmdb_id:'1', profile_id:'other'}, {id:'tv', tmdb_id:'1', profile_id:'main', media_type:'tv'}],
    create: async row => { created.push(row); return {...row,id:'new'}; },
  };
  const restore = createLibraryRestore(entity,[{title:'Film',tmdb_id:'1'}]);
  assert.equal((await restore()).restored[0].id,'new');
  assert.equal((await restore()).restored.length,0);
  assert.equal(created.length,1);
  entity.filter = async () => [{id:'existing',tmdb_id:'1',media_type:'movie'}];
  assert.equal((await createLibraryRestore(entity,[{title:'Film',tmdb_id:'1'}])()).restored[0].id,'existing');
  assert.equal(created.length,1);
});
test('bulk undo retries only failed restores and prevents concurrent duplicate requests', async () => {
  let fail = true;
  let release;
  const gate = new Promise(resolve => {release=resolve;});
  const created = [];
  const entity = {
    filter: async () => { await gate; return []; },
    create: async row => {
      if(row.title==='B' && fail) throw new Error('offline');
      created.push(row.title); return {...row,id:row.title};
    },
  };
  const restore=createLibraryRestore(entity,[{title:'A'},{title:'B'}]);
  const first=restore();
  assert.equal(await restore(),null);
  release();
  assert.equal((await first).remaining,1);
  fail=false;
  assert.equal((await restore()).remaining,0);
  assert.deepEqual(created,['A','B']);
});
