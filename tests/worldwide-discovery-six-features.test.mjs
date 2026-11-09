import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { newThisWeekItems, releaseAlertItems, releaseStatusLabel, validReleaseDate } from "../src/components/mg/releaseDiscovery.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("a US-first cinema and a digital release appear during the original worldwide week", () => {
  const items = newThisWeekItems({
    today: "2026-11-09",
    cinema: [
      { id: 101, title: "US First", release_date: "2026-11-05" },
      { id: 102, title: "Future", release_date: "2026-11-12" },
    ],
    digital: [
      { id: 103, title: "Digital", release_date: "2026-11-07", local_streaming_listed: false },
      { id: 101, title: "US First", release_date: "2026-11-06" },
    ],
    tv: [{ id: 104, title: "New Series", first_air_date: "2026-11-08" }],
  });
  assert.deepEqual(items.map((x) => x.id), [104, 103, 101]);
  assert.equal(items.find((x) => x.id === 101).release_context, "digital");
  assert.equal(items.find((x) => x.id === 103).release_context, "digital");
  assert.equal(releaseStatusLabel(items[1]), "Digital release worldwide · local stream unconfirmed");
  assert.equal(releaseStatusLabel({ release_context:"cinema" }).includes("stream unconfirmed"), true);
  assert.equal(validReleaseDate("2026-02-30"), "");
});

test("watchlist release alerts include cinema, digital, TV premiere and latest episode, but not future or old releases", () => {
  const records = [
    {
      tmdb_id: 101, media_type: "movie", title: "US Film",
      first_cinema_date: "2026-11-04", first_digital_date: "2026-11-09",
    },
    {
      tmdb_id: 202, media_type: "tv", title: "US TV",
      premiere_date: "2026-10-01",
      last_episode: { air_date:"2026-11-08", season_number:2, episode_number:5 },
    },
    {
      tmdb_id: 303, media_type: "movie", title: "Future Movie",
      first_cinema_date:"2026-11-30",
    },
  ];
  const found = releaseAlertItems(records, "2026-11-09");
  assert.deepEqual(found.map(x=>x.type).sort(), ["cinema","digital","episode"]);
  assert.equal(found.some(x=>x.label.includes("S2E5")), true);
  assert.equal(releaseAlertItems(records,"2026-11-09",{cinema:false}).some(x=>x.type==="cinema"), false);
  assert.equal(found.some(x=>x.title==="Future Movie"), false);
});

for (const path of ["deploy/media-god-api/getTmdbMovies.mjs","base44/functions/getTmdbMovies/entry.ts"]) {
  test(path + ": batch watchlist metadata uses actual worldwide theatrical/digital dates and TV episode first-air date", async () => {
    const source=read(path);
    const begin=source.indexOf("    if (Array.isArray(body.release_alerts)) {");
    const end=source.indexOf("    if (body.community_reviews === true)",begin);
    assert.ok(begin>=0 && end>begin);
    const requests=[];
    const context={
      body:{release_alerts:[
        {tmdb_id:101,media_type:"movie"},
        {tmdb_id:202,media_type:"tv"},
        {tmdb_id:"INVALID",media_type:"movie"},
      ]},
      apiKey:"TEST_ONLY",
      TMDB_BASE:"https://api.themoviedb.org/3",
      validYmd:x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x)),
      AbortSignal,
      Promise,
      Response:{json:x=>x},
      fetch:async url=>{
        requests.push(url);
        return {
          ok:true,
          json:async()=>url.includes("/movie/101")
            ? {title:"US Film",release_dates:{results:[
                {iso_3166_1:"GB",release_dates:[{type:3,release_date:"2026-11-10T00:00:00Z"}]},
                {iso_3166_1:"US",release_dates:[{type:3,release_date:"2026-11-04T00:00:00Z"},{type:4,release_date:"2026-11-08T00:00:00Z"}]},
              ]}}
            : {name:"TV series",first_air_date:"2026-11-01",
                last_episode_to_air:{air_date:"2026-11-08",season_number:1,episode_number:2}},
        };
      },
    };
    vm.createContext(context);
    const result=await vm.runInContext(
      "(async()=>{\n"+source.slice(begin,end)+"\n})()",context);
    assert.equal(requests.length,2);
    const movie=result.alerts.find(x=>x.tmdb_id==="101");
    const tv=result.alerts.find(x=>x.tmdb_id==="202");
    assert.equal(movie.first_cinema_date,"2026-11-04");
    assert.equal(movie.first_digital_date,"2026-11-08");
    assert.equal(tv.last_episode.air_date,"2026-11-08");
  });
}

test("new sections preserve working playback/Live TV and homepage's locked Continue Watching position", () => {
  const home=read("src/components/mg/HomeDashboard.jsx");
  const view=read("src/components/mg/NewThisWeek.jsx");
  const episodes=read("src/components/mg/NewEpisodesRow.jsx");
  const watchlist=read("src/components/mg/WatchlistView.jsx");
  const alerts=read("src/components/mg/WatchlistReleaseAlerts.jsx");
  const providers=read("src/components/mg/StreamingServiceRows.jsx");
  const cache=read("src/components/mg/catalogueRequests.js");
  const prefs=read("src/components/mg/uxPreferences.js");
  assert.match(home,/data-mg-home-second="continue-watching"/);
  assert.match(home,/case "new-this-week"/);
  assert.match(view,/newThisWeekItems/);
  assert.match(view,/<NewEpisodesRow/);
  assert.match(episodes,/watchlistTvSeeds/);
  assert.match(episodes,/showThisWeekOnly/);
  assert.match(watchlist,/<WatchlistReleaseAlerts items=\{items\}/);
  assert.match(alerts,/Cinema releases/);
  assert.match(alerts,/Digital releases/);
  assert.match(alerts,/New episodes/);
  assert.match(alerts,/Notification\.requestPermission\(\)/);
  assert.match(providers,/Find Netflix, Prime, Disney\+/);
  assert.match(providers,/\["mixed", "All"\], \["movie", "Films"\], \["tv", "TV"\]/);
  assert.match(cache,/MAX_ENTRIES = 140/);
  assert.match(cache,/!params\.release_alerts/);
  assert.match(prefs,/id: "new-this-week"/);
});
