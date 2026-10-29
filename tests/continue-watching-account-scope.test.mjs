import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/mg/householdProfiles.js", import.meta.url), "utf8")
  .replace(/^import .*;\s*/m, "").replace(/export const /g, "const ");

function device(rows, initialUser = "account-a") {
  let userId = initialUser;
  const calls = [];
  const memory = new Map();
  const entity = {
    list: async () => { throw new Error("Unscoped history read"); },
    filter: async (query, sort, limit = 50) => {
      calls.push({ query, sort, limit });
      const found = rows.filter(row => Object.entries(query).every(([key, value]) => row[key] === value));
      if (sort === "-updated_date") found.sort((a, b) => b.updated_date.localeCompare(a.updated_date));
      return found.slice(0, limit);
    },
    create: async data => {
      const row = { ...data, id: String(rows.length), created_by_id: userId, updated_date: "2026-10-29T13:00:00Z" };
      rows.push(row); return row;
    },
    update: async (id, patch) => Object.assign(rows.find(row => row.id === id), patch),
    delete: async id => rows.splice(rows.findIndex(row => row.id === id), 1),
    subscribe: () => () => {},
  };
  const context = {
    base44: {
      auth: { me: async () => userId ? { id: userId } : null },
      entities: { ContinueWatching: entity, Favorite: entity, WatchlistItem: entity },
    },
    window: {
      localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
      dispatchEvent: () => {},
    },
    CustomEvent: class {},
  };
  vm.runInNewContext(source + "\nglobalThis.library = profiledLibrary.ContinueWatching;", context);
  return { library: context.library, calls, setUser: id => { userId = id; } };
}
const history = () => [
  { id: "other", created_by_id: "account-b", profile_id: "main", content_key: "film", progress: 900, updated_date: "2026-10-29T12:00:00Z" },
  { id: "old", created_by_id: "account-a", content_key: "film", progress: 100, updated_date: "2026-10-28T12:00:00Z" },
  { id: "new", created_by_id: "account-a", profile_id: "main", content_key: "film", progress: 3120, updated_date: "2026-10-29T11:00:00Z" },
  { id: "family", created_by_id: "account-a", profile_id: "p-family", content_key: "film", progress: 400, updated_date: "2026-10-29T10:00:00Z" },
];

test("preview and phone read the same account history, including legacy Main records", async () => {
  const rows = history();
  const preview = device(rows); const phone = device(rows);
  const first = await preview.library.list("-updated_date", 250);
  assert.deepEqual(Array.from(first, row => row.id), ["new", "old"]);
  assert.equal(JSON.stringify(first), JSON.stringify(await phone.library.list("-updated_date", 250)));
  await phone.library.update("new", { progress: 3600 });
  assert.equal((await preview.library.list("-updated_date", 250))[0].progress, 3600);
  assert.equal(rows.find(row => row.id === "other").progress, 900);
});

test("resume and save lookup chooses newest own record, even when another account watched the same film", async () => {
  const { library, calls } = device(history());
  const rows = await library.filter({ content_key: "film", created_by_id: "account-b" });
  assert.deepEqual(Array.from(rows, row => row.id), ["new", "old"]);
  assert.equal(calls[0].query.created_by_id, "account-a");
  assert.equal(calls[0].sort, "-updated_date");
});

test("stale IDs cannot update or delete another account or household profile", async () => {
  const rows = history(); const { library } = device(rows);
  for (const id of ["other", "family", "missing"]) {
    await assert.rejects(library.update(id, { progress: 5 }), /outside the active/);
    await assert.rejects(library.delete(id), /outside the active/);
  }
  assert.equal(rows.length, 4);
  await library.delete("old");
  assert.equal(rows.length, 3);
});

test("switching accounts re-resolves ownership, and signed-out reads fail closed", async () => {
  const session = device(history());
  await session.library.list();
  session.setUser("account-b");
  assert.deepEqual(Array.from(await session.library.list(), row => row.id), ["other"]);
  session.setUser(null);
  const count = session.calls.length;
  await assert.rejects(session.library.list(), /Sign in/);
  await assert.rejects(session.library.update("other", { progress: 5 }), /Sign in/);
  assert.equal(session.calls.length, count);
});
