import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transform } from "esbuild";

const read = (name) => readFileSync(
  new URL(`../src/components/mg/${name}`, import.meta.url), "utf8"
);

test("Continue Watching and Recently Watched never load another profile's rows", () => {
  for (const file of ["ContinueWatchingRow.jsx", "RecentlyWatchedRow.jsx"]) {
    const source = read(file);
    assert.match(source, /profiledLibrary\.ContinueWatching\s*\.list\(/, file);
    assert.doesNotMatch(source, /base44\.entities\.ContinueWatching\s*\.list\(/, file);
  }
});

test("legacy Main history and new profile history are isolated in the shared account", async () => {
  const memory = new Map();
  const rows = [{ id: "old", created_by_id: "account-a", profile_id: "main", content_key: "movie-1" }];
  const entity = {
    list: async () => rows,
    filter: async (criteria) => rows.filter(row =>
      Object.entries(criteria).every(([key, value]) => row[key] === value)
    ),
    create: async (data) => {
      const row = { id: String(rows.length + 1), created_by_id: "account-a", ...data };
      rows.push(row);
      return row;
    },
    update: async (id, patch) => Object.assign(rows.find(row => row.id === id), patch),
    delete: async (id) => rows.splice(rows.findIndex(row => row.id === id), 1),
    subscribe: () => () => {},
  };
  const modules = await transform(read("householdProfiles.js"), {
    format: "cjs",
    loader: "js",
  });
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (name) => {
      assert.equal(name, "@/api/base44Client");
      return { base44: { auth: { me: async () => ({ id: "account-a" }) }, entities: {
        ContinueWatching: entity,
        WatchlistItem: entity,
        Favorite: entity,
      } } };
    },
    window: {
      localStorage: {
        getItem: key => memory.get(key) ?? null,
        setItem: (key, value) => memory.set(key, value),
      },
      dispatchEvent: () => {},
    },
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
  };
  vm.runInNewContext(modules.code, sandbox);
  const { profiledLibrary, activeHouseholdProfileId, createHouseholdProfile, selectHouseholdProfile } = module.exports;

  assert.equal(activeHouseholdProfileId(), "main");
  assert.equal((await profiledLibrary.ContinueWatching.list()).length, 1);
  const added = createHouseholdProfile("Guest");
  assert.ok(added?.id);
  assert.notEqual(activeHouseholdProfileId(), "main");
  assert.equal((await profiledLibrary.ContinueWatching.list()).length, 0);
  await profiledLibrary.ContinueWatching.create({ content_key: "movie-1" });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].profile_id, added.id);
  assert.equal((await profiledLibrary.ContinueWatching.filter({ content_key: "movie-1" })).length, 1);
  assert.equal((await profiledLibrary.ContinueWatching.list()).length, 1);

  selectHouseholdProfile("main");
  const visible = await profiledLibrary.ContinueWatching.list();
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, "old");

  // Rows written before household profiles existed had no profile_id.
  // They must remain visible to Main, but never appear in Guest history.
  rows.push({ id: "legacy", created_by_id: "account-a", content_key: "movie-2" });
  assert.equal((await profiledLibrary.ContinueWatching.list()).length, 2);
  selectHouseholdProfile(added.id);
  assert.equal((await profiledLibrary.ContinueWatching.list()).length, 1);
  assert.equal((await profiledLibrary.ContinueWatching.filter({ content_key: "movie-2" })).length, 0);
});
