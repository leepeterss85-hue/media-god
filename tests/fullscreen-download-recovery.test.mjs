import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeDownloadName, downloadableMedia, startDeviceDownload } from "../src/components/mg/deviceMediaDownload.js";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Fullscreen never hands embedded providers to WebView native fullscreen", () => {
  const stage = read("src/components/mg/SafeEmbedStage.jsx");
  assert.match(stage,/data-mg-safe-embed-fullscreen/);
  assert.match(stage,/data-mg-safe-fullscreen-toggle/);
  assert.match(stage,/setFullscreen\(\(previous\) => !previous\)/);
  assert.match(stage,/fixed inset-0 z-\[2147483647\]/);
  assert.doesNotMatch(stage,/requestFullscreen|webkitEnterFullscreen|window\.location/);
  for (const path of ["OnlyFlixEmbedPlayer","VidCoreEmbedPlayer","EmbedSuPlayer","ExtraEmbedPlayer","VidSrcEmbedPlayer"]) {
    const src=read("src/components/mg/"+path+".jsx");
    assert.match(src,/<SafeEmbedStage>/,path);
    assert.match(src,/<\/SafeEmbedStage>/,path);
    assert.match(src,/picture-in-picture/,path);
    if (path === "OnlyFlixEmbedPlayer") {
      // Only Fire TV may hand an iframe's own Fullscreen button to the native
      // WebChromeClient. The phone and other web embed paths are unchanged.
      assert.match(src, /allowFullScreen=\{isFireTv\}/, path);
      assert.match(src, /fullscreen"/, path);
    } else {
      assert.doesNotMatch(src,/allowFullScreen|fullscreen; picture-in-picture/,path);
    }
  }
});

test("Download only exposes resolvable direct HTTPS video files", () => {
  assert.equal(safeDownloadName("folder\\Safe.Movie.mkv"),"Safe.Movie.mkv");
  assert.equal(safeDownloadName("files/movie.m3u8"),"");
  assert.equal(safeDownloadName("../../bad.html"),"");
  assert.deepEqual(downloadableMedia({filename:"Movie.mkv",stream_url:"https://download.example.org/files/xyz"}),{url:"https://download.example.org/files/xyz",filename:"Movie.mkv"});
  assert.equal(downloadableMedia({filename:"Movie.mkv",stream_url:"http://download.example.org/a"}),null);
  assert.equal(downloadableMedia({filename:"Movie.mkv",stream_url:"https://localhost/a"}),null);
  assert.equal(downloadableMedia({filename:"Movie.mkv",stream_url:"https://127.0.0.1/a"}),null);
  assert.equal(downloadableMedia({filename:"Movie.mkv",stream_url:"https://site.example/playlist.m3u8"}),null);
  assert.equal(downloadableMedia({filename:"Film.mp4",fallback_stream_url:"https://cdn.example/dl/file",stream_url:"https://cdn.example/play.m3u8"}).url,"https://cdn.example/dl/file");
  assert.equal(startDeviceDownload({url:"https://example.com/file.mp4",filename:"file.mp4"}),"unavailable");
});

test("Ready Downloads item exposes Save without altering RD or player code",()=>{
  const dashboard=read("src/components/mg/DebridDashboard.jsx");
  assert.match(dashboard,/data-mg-save-to-device="true"/);
  assert.match(dashboard,/const saveToDevice = async \(torrent\)/);
  assert.match(dashboard,/action: "torrent_info"/);
  assert.match(dashboard,/downloadableMedia\(result, torrent\.filename\)/);
  assert.match(dashboard,/startDeviceDownload\(file\)/);
  assert.match(dashboard,/\{readyNow && \(\s*<button\s*type="button"\s*data-mg-save-to-device/);
});

test("Phone and Fire Stick native bridges enqueue user-initiated downloads",()=>{
  for(const target of ["android-mobile","firetv-android"]){
    const main=read(target+"/app/src/main/java/com/mediagod/"+(target==="android-mobile"?"mobile":"firetv")+"/MainActivity.kt");
    assert.match(main,/@JavascriptInterface\s*fun downloadFile\(payloadJson: String\)/);
    assert.match(main,/nativeBridgeAllowed\(\)/);
    assert.match(main,/url\.scheme != "https"/);
    assert.match(main,/android\.app\.DownloadManager\.Request\(url\)/);
    assert.match(main,/Environment\.DIRECTORY_DOWNLOADS/);
    assert.match(main,/manager\.enqueue\(request\)/);
    assert.match(main,/setDestinationInExternalFilesDir/);
    assert.match(main,/setDestinationInExternalPublicDir/);
  }
});
