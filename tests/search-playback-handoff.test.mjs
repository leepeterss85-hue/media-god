import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchTmdbId } from "../src/components/mg/searchMediaIdentity.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("searched movies and shows keep the corrected TMDB playback identity", () => {
  for (const media_type of ["movie", "tv"]) {
    const selected = { media_type, id: "old-id", tmdb_id: 12345, tmdbId: 12345 };
    assert.equal(searchTmdbId(selected), 12345);
    assert.equal(searchTmdbId({ media_type, id: "old-id", tmdbId: 67890 }), 67890);
    assert.equal(searchTmdbId({ media_type, id: "old-id", tmdb_id: "" }), "old-id");
  }
  assert.equal(searchTmdbId({ title: "Missing identity" }), null);
});

test("Search closes before its one VOD selection opens details and Play uses that TMDB id", () => {
  const search = read("src/components/mg/SearchDialog.jsx");
  const home = read("src/pages/Home.jsx");
  const detail = read("src/components/mg/DetailModal.jsx");

  const choose = search.slice(search.indexOf("  const choose ="), search.indexOf("  const close ="));
  const select = home.slice(home.indexOf("  const handleSearchSelect ="), home.indexOf("  const closeDetails ="));
  assert.match(choose, /const result = rawResult/);
  assert.match(choose, /onOpenChange\(\s*false\s*\)/);
  assert.match(choose, /else \{\s*onSelect\?\.\(result\)/);
  assert.doesNotMatch(choose, /normaliseSearchResult\(\s*rawResult/);

  assert.match(home, /if \(!searchOpen && pendingSearchSelection\) \{[\s\S]*?setSearchResult\(pendingSearchSelection\)/);
  assert.match(home, /onSelect=\{\(item\) => handleSearchSelect\(item, true\)\}/);
  assert.match(select, /if \(fromSearch\) \{\s*setPendingSearchSelection\(item\)/);
  assert.doesNotMatch(select, /setTimeout|requestAnimationFrame/);
  assert.match(home, /const id = searchTmdbId\(value\)/);
  assert.match(search, /const id = searchTmdbId\(item\)/);
  assert.match(detail, /const itemId =\s*safeItem\.id/);
  assert.match(detail, /player\.play\(\{\s*id:\s*itemId,[\s\S]*?tmdbId:\s*itemId/);
});
