import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesLibraryQuery, selectVisibleLibraryIds } from '../src/components/mg/savedLibraryTools.js';

test('saved-title search tolerates accents, punctuation, word order and extra spaces', () => {
  assert.equal(matchesLibraryQuery({ title: 'Amélie', year: 2001 }, '  2001   amelie  '), true);
  assert.equal(matchesLibraryQuery({ title: 'Schindler’s List' }, "schindlers list"), true);
  assert.equal(matchesLibraryQuery({ title: 'Spider-Man: Homecoming' }, 'spider man'), true);
  assert.equal(matchesLibraryQuery({ title: 'Amélie', year: 2001 }, 'amelie 2002'), false);
  assert.equal(matchesLibraryQuery({ title: '千と千尋の神隠し' }, '千尋'), true);
});

test('select visible preserves hidden selections without duplicates', () => {
  const selected = ['hidden', 'a'];
  assert.deepEqual(selectVisibleLibraryIds(selected, [{id:'a'}, {id:'b'}], true), ['hidden', 'a', 'b']);
  assert.deepEqual(selected, ['hidden', 'a']);
});

test('deselect visible leaves hidden selections intact', () => {
  assert.deepEqual(selectVisibleLibraryIds(['hidden', 'a', 'b'], [{id:'a'}, {id:'b'}], false), ['hidden']);
  assert.deepEqual(selectVisibleLibraryIds(['hidden'], [], false), ['hidden']);
});
