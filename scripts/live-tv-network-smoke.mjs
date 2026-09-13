import {
  LIVE_TV_SOURCES,
  PUBLIC_DIRECT_CHANNELS,
} from "../src/components/mg/freeTvPlaylist.js";

const withTimeout = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.apple.mpegurl, text/plain, application/gzip, application/xml, */*",
        "User-Agent": "MediaGod-Regression/1.0",
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
};

const playlistIds = [
  "iptv-org-uk",
  "dearbulut-uk-healthchecked",
  "samsung-tv-plus-gb-buddy",
];

const directNames = [
  "V2BEAT TV",
  "Dunya News UK",
  "Timeline",
];

let failures = 0;

for (const id of playlistIds) {
  const source = LIVE_TV_SOURCES.find((item) => item.id === id);
  if (!source) {
    console.error(`missing playlist definition: ${id}`);
    failures += 1;
    continue;
  }

  try {
    const response = await withTimeout(source.url);
    const text = await response.text();
    const entries = (text.match(/#EXTINF:/gi) || []).length;
    const ok = response.ok && entries > 0;
    console.log(
      `${ok ? "ok" : "FAIL"} playlist ${source.name}: HTTP ${response.status}, ${entries} entries`
    );
    if (!ok) failures += 1;
  } catch (error) {
    console.error(`FAIL playlist ${source.name}: ${error?.message || error}`);
    failures += 1;
  }
}

for (const name of directNames) {
  const channel = PUBLIC_DIRECT_CHANNELS.find((item) => item.name === name);
  if (!channel) {
    console.error(`missing direct channel definition: ${name}`);
    failures += 1;
    continue;
  }

  try {
    const response = await withTimeout(channel.url);
    const text = await response.text();
    const hls = /#EXTM3U/i.test(text);
    const ok = response.ok && hls;
    console.log(
      `${ok ? "ok" : "FAIL"} stream ${channel.name}: HTTP ${response.status}, HLS ${hls ? "yes" : "no"}`
    );
    if (!ok) failures += 1;
  } catch (error) {
    console.error(`FAIL stream ${channel.name}: ${error?.message || error}`);
    failures += 1;
  }
}

try {
  const epg = await withTimeout(
    "https://epgshare01.online/epgshare01/epg_ripper_UK1.xml.gz"
  );
  const bytes = new Uint8Array(await epg.arrayBuffer());
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const ok = epg.ok && bytes.length > 10000 && gzip;
  console.log(
    `${ok ? "ok" : "FAIL"} UK EPG: HTTP ${epg.status}, ${bytes.length} bytes, gzip ${gzip ? "yes" : "no"}`
  );
  if (!ok) failures += 1;
} catch (error) {
  console.error(`FAIL UK EPG: ${error?.message || error}`);
  failures += 1;
}

if (failures > 0) {
  console.error(`network smoke failures: ${failures}`);
  process.exit(1);
}

console.log("network smoke passed");
