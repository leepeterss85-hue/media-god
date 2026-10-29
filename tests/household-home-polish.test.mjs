import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Main history is preserved and new household profiles isolate three collections", async () => {
  const store = new Map();
  const storage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  };
  const data = Object.fromEntries(
    ["Favorite", "WatchlistItem", "ContinueWatching"].map(name => [
      name,
      [{ id: name + ":old", created_by_id: "account-a", title: "Saved in Main", content_key: "mg2|legacy" }],
    ])
  );
  let lastId = 1;
  const entities = Object.fromEntries(
    Object.entries(data).map(([name, rows]) => [
      name,
      {
        list: async () => rows,
        filter: async criteria => rows.filter(row =>
          Object.entries(criteria).every(([field, value]) => row[field] === value)),
        create: async value => {
          const record = { id: name + ":" + ++lastId, created_by_id: "account-a", ...value };
          rows.push(record);
          return record;
        },
        update: async (id, patch) => {
          Object.assign(rows.find(row => row.id === id), patch);
        },
        delete: async id => {
          const position = rows.findIndex(row => row.id === id);
          if (position >= 0) rows.splice(position, 1);
        },
        subscribe: () => () => {},
      },
    ])
  );
  const context = {
    base44: { entities, auth: { me: async () => ({ id: "account-a" }) } },
    window: { localStorage: storage, dispatchEvent: () => {} },
    crypto: { randomUUID: () => "a1234567-aaaa-4444-bbbb-cccccccccccc" },
    CustomEvent: class {},
    console,
  };
  const script = read("src/components/mg/householdProfiles.js")
    .replace(/^import .*;\s*/m, "")
    .replace(/export const /g, "const ");
  vm.runInNewContext(script + `
    globalThis.out = {
      activeHouseholdProfileId, readHouseholdProfiles, createHouseholdProfile,
      selectHouseholdProfile, profiledLibrary, profileOwnsRow
    };
  `, context);
  const profiles = context.out;
  assert.equal(profiles.activeHouseholdProfileId(), "main");
  for (const library of Object.keys(data)) {
    assert.equal((await profiles.profiledLibrary[library].list()).length, 1);
  }
  const guest = profiles.createHouseholdProfile("Family");
  assert.equal(guest?.name, "Family");
  assert.equal(profiles.activeHouseholdProfileId(), guest.id);
  for (const library of Object.keys(data)) {
    assert.equal((await profiles.profiledLibrary[library].list()).length, 0);
    await profiles.profiledLibrary[library].create({ title: "Saved in Family" });
    assert.equal((await profiles.profiledLibrary[library].list()).length, 1);
    assert.equal(data[library].at(-1).profile_id, guest.id);
    assert.equal((await profiles.profiledLibrary[library].filter({ title:"Saved in Main" })).length, 0);
  }
  assert.equal(profiles.selectHouseholdProfile("main"), true);
  for (const library of Object.keys(data)) {
    assert.equal((await profiles.profiledLibrary[library].list()).length, 1);
    assert.equal((await profiles.profiledLibrary[library].filter({ title:"Saved in Family" })).length, 0);
  }
  assert.equal(profiles.readHouseholdProfiles().length, 2);
  assert.equal(profiles.createHouseholdProfile("Family"), null);
});

test("original look, locked Home row order, and existing navigation remain", () => {
  const hero = read("src/components/mg/HeroSlider.jsx");
  const home = read("src/components/mg/HomeDashboard.jsx");
  const settings = read("src/components/mg/SettingsView.jsx");
  const nav = read("src/components/mg/Navbar.jsx");
  assert.match(home,/featured>continue-watching>new-films>new-tv>new-episodes>because-you-watched/);
  assert.match(hero,/from-mg-background/);
  assert.match(hero,/bg-mg-green/);
  assert.match(hero,/!heroVisible \|\| heroFocused/);
  assert.match(hero,/IntersectionObserver/);
  assert.match(settings,/HouseholdProfilesPanel/);
  assert.match(nav,/id: "home"/);
  assert.match(nav,/id: "settings"/);
  assert.doesNotMatch(nav,/id: "profiles"/);
});

test("episode tracking, details, and search build on existing UI", () => {
  const selector = read("src/components/mg/EpisodeSelector.jsx");
  const details = read("src/components/mg/DetailModal.jsx");
  const search = read("src/components/mg/SearchDialog.jsx");
  assert.match(selector,/data-mg-season-watch-progress="true"/);
  assert.match(selector,/nextUnwatchedEpisode/);
  assert.match(selector,/completedEpisodeCount/);
  assert.match(selector,/onClick=\{\(\) => playEpisode\(nextUnwatchedEpisode\)\}/);
  assert.match(selector,/airDate <= today/);
  assert.match(details,/rating_votes: Number/);
  assert.match(details,/TMDB/);
  assert.match(details,/MediaReviews/);
  assert.match(details,/activeTab === "cast"/);
  assert.match(search,/export const cleanVoiceSearch/);
  assert.match(search,/title\.split\(" "\)\.includes\(titleWanted\)/);
  assert.match(search,/setQuery\(cleanVoiceSearch\(spoken\)\)/);
});

test("all three personal collections have a profile_id schema without altering account RLS", () => {
  for (const entity of ["ContinueWatching", "WatchlistItem", "Favorite"]) {
    const config = JSON.parse(read(`base44/entities/${entity}.jsonc`));
    assert.equal(config.properties.profile_id?.default, "main");
    assert.equal(config.rls.read.created_by_id, "{{user.id}}");
    assert.equal(config.rls.create.created_by_id, "{{user.id}}");
  }
  const queue = read("src/components/mg/PlayerProvider.jsx");
  assert.match(queue,/profiledLibrary\.ContinueWatching\.create/);
  assert.match(queue,/profiledLibrary\.ContinueWatching\.filter/);
  assert.match(read("src/components/mg/ContinueWatchingAssist.jsx"),/profiledLibrary\.ContinueWatching\.update/);
});
