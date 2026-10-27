import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("existing Media God theme, Home row order, and navigation remain intact", () => {
  const home = read("src/components/mg/HomeDashboard.jsx");
  const hero = read("src/components/mg/HeroSlider.jsx");
  const nav = read("src/components/mg/Navbar.jsx");
  assert.match(home, /continue-watching>featured>new-films>new-tv>new-episodes>because-you-watched/);
  assert.match(home, /data-mg-home-layout-lock=\{HOME_LAYOUT_LOCK_ID\}/);
  assert.match(home, /<HeroSlider/);
  assert.match(home, /<ContinueWatchingRow/);
  assert.match(hero, /mg-fire-tv-hero relative w-full h-\[52svh\]/);
  assert.match(hero, /from-mg-background via-mg-background/);
  assert.match(hero, /bg-mg-green text-black/);
  assert.match(hero, /if \(fireTv \|\| count <= 1 \|\| !heroVisible \|\| heroFocused\)/);
  assert.match(hero, /IntersectionObserver/);
  assert.match(nav, /\{ id: "home", label: "Home"/);
  assert.match(nav, /\{ id: "live", label: "Live TV"/);
  assert.match(nav, /\{ id: "settings", label: "Settings"/);
});

test("episode tracking uses saved playback progress and only released episodes", () => {
  const source = read("src/components/mg/EpisodeSelector.jsx");
  assert.match(source, /profiledLibrary\.ContinueWatching\.list/);
  assert.match(source, /const airedEpisodes = \[\.\.\.episodes\]/);
  assert.match(source, /!airDate \|\| airDate <= today/);
  assert.match(source, /completedEpisodeCount = airedEpisodes\.filter/);
  assert.match(source, /nextUnwatchedEpisode = airedEpisodes\.find/);
  assert.match(source, /data-mg-season-watch-progress="true"/);
  assert.match(source, /onClick=\{\(\) => playEpisode\(nextUnwatchedEpisode\)\}/);
  assert.match(source, /const hasResume =/);
  assert.match(source, /playEpisodeNumber\(\{/);
});

test("details keep existing tabs, sourced reviews and richer verified metadata", () => {
  const source = read("src/components/mg/DetailModal.jsx");
  assert.match(source, /\{ id: "overview", label: "Overview" \}/);
  assert.match(source, /\{ id: "reviews", label: "Reviews" \}/);
  assert.match(source, /\{ id: "cast", label: "Cast" \}/);
  assert.match(source, /\{ id: "watch", label: "Where to Watch" \}/);
  assert.match(source, /data-mg-verified-title-facts="true"/);
  assert.match(source, /Number\(details\.number_of_episodes \|\| 0\)/);
  assert.match(source, /details\.original_title/);
  assert.match(source, /TMDB rating/);
  assert.match(source, /details\.rating_votes > 0/);
  assert.match(source, /<MediaReviews/);
  assert.match(source, /trailerUrl=\{/);
  assert.match(source, /bg-mg-surface/);
  assert.match(source, /<EpisodeSelector/);
});

test("voice search and exact title/year matching do not launch another player", () => {
  const source = read("src/components/mg/SearchDialog.jsx");
  const begin = source.indexOf("const normaliseSearchText =");
  const end = source.indexOf("const normaliseMediaType =", begin);
  assert.ok(begin >= 0 && end > begin);
  const snippet = source.slice(begin, end).replaceAll("export const ", "const ");
  const { cleanVoiceSearch, searchRelevance } =
    vm.runInNewContext(snippet + "\n({ cleanVoiceSearch, searchRelevance });");
  assert.equal(cleanVoiceSearch("Hey Media God, play Resident Evil 2026."), "Resident Evil 2026");
  assert.equal(cleanVoiceSearch("search for 24"), "24");
  assert.equal(cleanVoiceSearch("show me The Simpsons?"), "The Simpsons");
  assert.ok(searchRelevance({title:"24", year:"2001"}, "24") >
    searchRelevance({title:"2024 Holiday", year:"2024"}, "24"));
  assert.ok(searchRelevance({title:"Resident Evil", year:"2026"}, "Resident Evil 2026") >
    searchRelevance({title:"Resident Evil", year:"2002"}, "Resident Evil 2026"));
  assert.ok(searchRelevance({title:"Bad Apples", identity_corrected:true, search_aliases:["Bad Apple"]}, "Bad Apple") >
    searchRelevance({title:"Bad Apple"}, "Bad Apple"));
  assert.match(source, /mg:native-voice-search-result/);
  assert.match(source, /event\?\.detail\?\.text \|\| event\?\.detail\?\.transcript/);
  assert.equal((source.match(/onClick=\{startVoiceSearch\}/g) || []).length, 1, "One accessible voice-search button, not duplicates");
  assert.match(source, /startVoiceSearch/);
});

test("optional profiles isolate libraries and preserve Main's existing rows", async () => {
  const stores = new Map();
  let selected = "";
  const records = [
    {id:"old", title:"Existing title", tmdb_id:"1"},
  ];
  const subscribers = new Set();
  const entity = {
    list: async () => records,
    filter: async criteria => records.filter(r => Object.entries(criteria).every(([k,v])=>String(r[k])===String(v))),
    create: async row => {const created={id:"new"+records.length,...row}; records.push(created); subscribers.forEach(fn=>fn());return created;},
    delete: async id=>{const i=records.findIndex(r=>r.id===id);if(i>=0)records.splice(i,1);},
    update: async (id,patch)=>Object.assign(records.find(r=>r.id===id),patch),
    subscribe: fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);},
  };
  const window = {
    localStorage: {getItem:k=>stores.get(k)??null,setItem:(k,v)=>stores.set(k,v)},
    dispatchEvent(){},
  };
  const src = read("src/components/mg/householdProfiles.js")
    .replace(/^import \{ base44 \} from "[^"]+";\s*/, "")
    .replaceAll("export const ", "const ");
  const system=vm.runInNewContext(src+"\n({readHouseholdProfiles,activeHouseholdProfileId,createHouseholdProfile,selectHouseholdProfile,profiledLibrary})", {
    base44:{entities:{Favorite:entity,WatchlistItem:entity,ContinueWatching:entity}},
    window,
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail;}},
    crypto:{randomUUID:()=>"11111111-1111-4111-8111-111111111111"},
  });
  assert.equal(system.activeHouseholdProfileId(),"main");
  assert.equal((await system.profiledLibrary.Favorite.list()).length,1);
  const created=system.createHouseholdProfile("Family");
  assert.equal(created.name,"Family");
  assert.equal(system.activeHouseholdProfileId(),created.id);
  assert.equal((await system.profiledLibrary.Favorite.list()).length,0);
  await system.profiledLibrary.Favorite.create({title:"Family title",tmdb_id:"2"});
  assert.equal((await system.profiledLibrary.Favorite.list())[0].title,"Family title");
  system.selectHouseholdProfile("main");
  assert.equal((await system.profiledLibrary.Favorite.list()).length,1);
  assert.equal((await system.profiledLibrary.Favorite.list())[0].title,"Existing title");
  assert.equal(system.readHouseholdProfiles().length,2);
  const setting=read("src/components/mg/SettingsView.jsx");
  const panel=read("src/components/mg/HouseholdProfilesPanel.jsx");
  assert.match(setting, /<HouseholdProfilesPanel/);
  assert.match(panel, /Optional\. Each profile keeps its own Watchlist, Favorites and Continue Watching/);
  assert.match(panel, /bg-mg-card/);
  assert.match(panel, /bg-mg-green/);
  assert.match(panel, /they are not separate secure logins/);
});

test("VLC playback, Live TV and one-tap updates are not modified by these enhancements", () => {
  const base = JSON.parse(read("scripts/protected-media-baseline.json"));
  assert.ok(base.files["src/components/mg/VideoPlayer.jsx"]);
  assert.ok(base.files["src/components/mg/LiveTVView.jsx"]);
  const mobile=read("android-mobile/app/src/main/java/com/mediagod/mobile/AppUpdater.kt");
  assert.match(mobile, /fun startUpdate\(versionName: String\): String/);
  assert.match(mobile, /verifyDownloadedApk\(apk\)/);
  const notices=read("src/components/mg/AndroidMobileAppUpdateNotice.jsx");
  assert.match(notices,/startNativeFireTvUpdate/);
});
