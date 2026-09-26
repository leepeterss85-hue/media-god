import test from "node:test";
import assert from "node:assert/strict";
import { resolveCatalogMediaType } from "../src/components/mg/catalogMediaIdentity.js";

test("Bad Apples film stays a movie when an old card says TV", () => {
  assert.equal(
    resolveCatalogMediaType({
      id: "old-saved-row",
      tmdb_id: "1198654",
      title: "Bad Apples",
      year: "2026",
      media_type: "tv",
    }, "tv"),
    "movie"
  );
  assert.equal(
    resolveCatalogMediaType({
      imdb_id: "tt29714073",
      title: "Bad Apples",
      media_type: "series",
    }),
    "movie"
  );
});

test("separate Bad Apples TV series and similarly named films retain their identities", () => {
  assert.equal(
    resolveCatalogMediaType({
      id: "125242",
      title: "Bad Apples",
      year: "2021",
      media_type: "tv",
    }, "movie"),
    "tv"
  );
  assert.equal(
    resolveCatalogMediaType({
      id: "1642114",
      title: "Bad Apples",
      year: "2026",
      media_type: "movie",
    }),
    "movie"
  );
  assert.equal(
    resolveCatalogMediaType({
      id: "1198654",
      title: "Unrelated series",
      year: "2026",
      media_type: "tv",
    }),
    "tv"
  );
});

test("a linked title's explicit type takes precedence over its parent screen", () => {
  assert.equal(resolveCatalogMediaType({ media_type: "movie" }, "tv"), "movie");
  assert.equal(resolveCatalogMediaType({ media_type: "tv" }, "movie"), "tv");
  assert.equal(resolveCatalogMediaType({}, "tv"), "tv");
});
