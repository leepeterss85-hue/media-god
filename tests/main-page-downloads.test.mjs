import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readyMediaDownloads } from "../src/components/mg/readyMediaDownloads.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const list = [
  {id:"a", filename:"The.Matrix.1999.1080p.mkv",status:"downloaded"},
  {id:"b", filename:"The.Matrix.2021.1080p.mkv",status:"downloaded"},
  {id:"c", filename:"The.Matrix.1999.2160p.mkv",status:"downloading"},
  {id:"d", filename:"The.Matrix.Reloaded.2003.mkv",status:"downloaded"},
  {id:"e", filename:"Law.and.Order.Special.Victims.Unit.S28E02.1080p.mkv",status:"downloaded"},
  {id:"f", filename:"Law.and.Order.Special.Victims.Unit.S28E03.1080p.mkv",status:"downloaded"},
  {id:"g", filename:"Law.and.Order.Special.Victims.Unit.S28.mkv",status:"downloaded"},
];

test("main film downloads show only matching completed files for that release",()=>{
  assert.deepEqual(readyMediaDownloads(list,{title:"The Matrix",year:1999,mediaType:"movie"}).map(x=>x.id),["a"]);
  assert.deepEqual(readyMediaDownloads(list,{title:"The Matrix",year:2021,mediaType:"movie"}).map(x=>x.id),["b"]);
  assert.deepEqual(readyMediaDownloads(list,{title:"Bad Apple",mediaType:"movie"}),[]);
});
test("exact TV episode download never offers another episode or a full-season archive",()=>{
  assert.deepEqual(readyMediaDownloads(list,{title:"Law & Order: Special Victims Unit",mediaType:"tv",season:28,episode:2}).map(x=>x.id),["e"]);
  assert.deepEqual(readyMediaDownloads(list,{title:"Law & Order: Special Victims Unit",mediaType:"tv",season:28,episode:3}).map(x=>x.id),["f"]);
  assert.deepEqual(readyMediaDownloads(list,{title:"Law & Order: Special Victims Unit",mediaType:"tv",season:28,episode:4}),[]);
});
test("movie details and TV episodes have their own Download actions without changing Play or Sources",()=>{
  const detail=read("src/components/mg/DetailModal.jsx");
  const episodes=read("src/components/mg/EpisodeSelector.jsx");
  const picker=read("src/components/mg/MediaDownloadPicker.jsx");
  assert.match(detail,/data-mg-detail-download="true"/);
  assert.match(detail,/<MediaDownloadPicker/);
  assert.match(detail,/resolvedMediaType === "tv"\) \{\s*goToEpisodes\(\)/);
  assert.match(detail,/data-mg-detail-primary="true"/);
  assert.match(episodes,/data-mg-episode-download="true"/);
  assert.match(episodes,/data-mg-episode-sources="true"/);
  assert.match(episodes,/data-mg-episode-source-panel="true"/);
  assert.match(episodes,/<MediaDownloadPicker/);
  assert.match(episodes,/season=\{seasonNumber\}/);
  assert.match(episodes,/episode=\{episodeNumber\}/);
  assert.match(picker,/action: "torrents_list"/);
  assert.match(picker,/action: "torrent_info"/);
  assert.match(picker,/downloadableMedia\(result, torrent\.filename\)/);
  assert.match(picker,/startDeviceDownload\(file\)/);
  assert.match(picker,/data-mg-main-page-save="true"/);
  assert.match(picker,/No matching completed file was found/);
  const nav=read("src/components/mg/Navbar.jsx");
  assert.match(nav,/id: "downloads", label: "Downloads"/);
});
