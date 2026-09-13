import {
  LIVE_TV_SOURCES,
  dedupeMergedChannels,
  parseFreeTvPlaylist,
} from "../src/components/mg/freeTvPlaylist.js";

const sourceIds = [
  "iptv-org-uk",
  "dearbulut-uk-healthchecked",
  "samsung-tv-plus-gb-buddy",
];

const all = [];
let failures = 0;

for (const id of sourceIds) {
  const source = LIVE_TV_SOURCES.find((item) => item.id === id);
  if (!source) {
    console.error(`FAIL missing source definition: ${id}`);
    failures += 1;
    continue;
  }

  try {
    const response = await fetch(source.url, {
      headers: { "User-Agent": "MediaGod-Stress/1.0" },
    });
    const text = await response.text();
    const parsed = parseFreeTvPlaylist(text, source);
    const badUrls = parsed.filter(
      (channel) => !/^https?:\/\//i.test(String(channel?.url || ""))
    );
    const unknownNames = parsed.filter(
      (channel) => !channel?.name || channel.name === "Unknown"
    );
    const duplicateUrls =
      parsed.length - new Set(parsed.map((channel) => channel.url)).size;
    const missingCountry = parsed.filter((channel) => !channel?.country);

    console.log(
      [
        source.name,
        `parsed=${parsed.length}`,
        `badUrl=${badUrls.length}`,
        `unknown=${unknownNames.length}`,
        `missingCountry=${missingCountry.length}`,
        `duplicateUrls=${duplicateUrls}`,
      ].join(" ")
    );

    if (!response.ok || parsed.length === 0 || badUrls.length > 0) {
      failures += 1;
    }

    all.push(...parsed);
  } catch (error) {
    console.error(`FAIL ${id}: ${error?.message || error}`);
    failures += 1;
  }
}

const merged = dedupeMergedChannels(all);
const badMerged = merged.filter(
  (channel) => !channel?.url || !channel?.name
);
const backupCount = merged.reduce(
  (total, channel) => total + (channel?.alternatives?.length || 0),
  0
);
const gbCount = merged.filter((channel) => channel?.country === "GB").length;
const geoPrimaryCount = merged.filter(
  (channel) => channel?.geoRestricted === true
).length;

console.log(
  [
    "MERGED",
    `raw=${all.length}`,
    `visible=${merged.length}`,
    `backups=${backupCount}`,
    `GB=${gbCount}`,
    `bad=${badMerged.length}`,
    `geoPrimary=${geoPrimaryCount}`,
  ].join(" ")
);

if (badMerged.length > 0) failures += 1;

if (failures > 0) {
  console.error(`parser stress failures: ${failures}`);
  process.exit(1);
}

console.log("parser stress passed");
