import { readFile } from "node:fs/promises";

const root = process.cwd();

const read = async (path) => readFile(`${root}/${path}`, "utf8");

const expect = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const home = await read("src/pages/Home.jsx");
const navbar = await read("src/components/mg/Navbar.jsx");
const roadmap = await read("src/components/mg/RoadmapView.jsx");
const downloads = await read("src/components/mg/DebridDashboard.jsx");
const watchParty = await read("src/components/mg/WatchPartyView.jsx");
const liveTv = await read("src/components/mg/LiveTVView.jsx");
const evSports = await read("src/components/mg/evSportsScraper.js");
const freeTv = await read("src/components/mg/freeTvPlaylist.js");

const requiredViews = [
  ["home", "Home"],
  ["movies", "Movies"],
  ["tv", "TV Shows"],
  ["live", "Live TV"],
  ["watchlist", "Watchlist"],
  ["favorites", "Favorites"],
  ["watchparty", "Watch Party"],
  ["rdlib", "RD Library"],
  ["downloads", "Downloads"],
  ["addons", "Addons"],
  ["sources", "Sources"],
  ["roadmap", "Roadmap"],
  ["updates", "Updates"],
  ["remote", "Phone Remote"],
  ["settings", "Settings"],
];

for (const [id, label] of requiredViews) {
  expect(
    navbar.includes(`id: "${id}"`) && navbar.includes(`label: "${label}"`),
    `Navbar is missing ${label}`
  );

  if (id !== "remote") {
    expect(
      home.includes(`"${id}" && (`),
      `Home does not render the ${label} view`
    );
  }
}

expect(
  home.includes("<RoadmapView onBack={goBack} />"),
  "Roadmap is not wired into the global back routine"
);
expect(
  roadmap.includes("onClick={() => onBack?.()}"),
  "Roadmap back button is not interactive"
);

for (const marker of [
  'data-mg-downloads-view="true"',
  '["active", "Active"]',
  '["ready", "Ready"]',
  '["errors", "Errors"]',
  '["all", "All"]',
  'skipAddonLookup: true',
  'skipRdLookup: true',
]) {
  expect(downloads.includes(marker), `Downloads regression marker missing: ${marker}`);
}

for (const marker of [
  'data-mg-watch-party-view="true"',
  'data-mg-watch-party-room="true"',
  "validWatchUrl",
  "refreshRoom",
  "endRoom",
  "navigator.share",
]) {
  expect(watchParty.includes(marker), `Watch Party regression marker missing: ${marker}`);
}

expect(
  evSports.includes("EV_SPORTS_SOURCE_PRIORITY = 220"),
  "EV SPORTS priority changed from the locked value"
);
expect(
  liveTv.includes("const evSportsFallback = evSportsDestinationForChannel"),
  "EV SPORTS matching fallback is no longer active"
);
expect(
  liveTv.includes("!evSportsFallback && channelUsesAntSportsFallback(channel)"),
  "ANT SPORTS can bypass the EV SPORTS priority rule"
);
expect(
  freeTv.includes('sourceName === "BBC CDN Direct"') &&
    freeTv.includes('sourceName === "ITVX Official"'),
  "BBC/ITV locked primary rules are missing"
);

console.log("ok UI/navigation/download/watch-party/locked-source structural checks complete");
