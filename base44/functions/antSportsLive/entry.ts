const ANT_SPORTS_BASE_URL = "https://antsports.tv";
const ANT_SPORTS_DIRECTORY_URL = `${ANT_SPORTS_BASE_URL}/us`;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const SPORT_LABELS = {
  football: "Football",
  fighting: "Fighting",
  nfl: "NFL",
  f1: "Formula 1",
  rugby: "Rugby",
  baseball: "MLB / Baseball",
  basketball: "Basketball",
  nba: "NBA",
  ncaaf: "NCAAF",
  afl: "AFL",
  nhl: "NHL",
  tennis: "Tennis",
  golf: "Golf",
  motorsport: "Motorsport",
  racing: "Motorsport",
  other: "Other",
};

const nextDataFromHtml = (html) => {
  const match = String(html || "").match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (!match?.[1]) {
    throw new Error("ANT SPORTS page data was not found.");
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error("ANT SPORTS page data could not be read.");
  }
};

const absoluteAssetUrl = (value) => {
  const raw = clean(value);
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${ANT_SPORTS_BASE_URL}${raw}`;
  return `${ANT_SPORTS_BASE_URL}/${raw}`;
};

const eventUrl = (row) => {
  const link = clean(row?.link).replace(/^\/+|\/+$/g, "");
  if (!link) return ANT_SPORTS_DIRECTORY_URL;
  return `${ANT_SPORTS_BASE_URL}/us/ant-live-sports/${link}`;
};

const rowKey = (row) =>
  clean(row?.id || row?.link || `${row?.home || ""}-${row?.away || ""}-${row?.matchTime || ""}`).toLowerCase();

const sportKeyForRow = (row) => {
  const raw = clean(row?.matchType || row?.sport || "other").toLowerCase();
  if (raw === "american-football") return "nfl";
  if (raw === "formula-1" || raw === "formula1") return "f1";
  return raw || "other";
};

const sportLabelForRow = (row) => {
  const key = sportKeyForRow(row);
  return SPORT_LABELS[key] || clean(row?.matchType || row?.sport || "Other");
};

const scheduleRows = (pageProps) => {
  const groups = Array.isArray(pageProps?.items) ? pageProps.items : [];
  const rows = [];

  for (const group of groups) {
    for (const match of Array.isArray(group?.matches) ? group.matches : []) {
      rows.push(match);
    }
  }

  return rows;
};

const normaliseMatch = (row, liveKeys, nowSeconds) => {
  if (!row) return null;

  const key = rowKey(row);
  const explicitLive = row?.isLiving === true || liveKeys.has(key);
  const matchTime = Number(row?.matchTime || 0);

  // Keep genuine live rows and future/TBD rows. Old completed fixtures stay out
  // of the Live TV catalogue; ANT SPORTS has a separate replay area for those.
  const upcoming = !explicitLive && (matchTime <= 0 || matchTime >= nowSeconds - 15 * 60);
  if (!explicitLive && !upcoming) return null;

  const home = clean(row?.home);
  const away = clean(row?.away);
  const league = clean(row?.leagueName || row?.matchType || "Sports");
  const sportKey = sportKeyForRow(row);
  const sport = sportLabelForRow(row);
  const title =
    home && away
      ? `${home} vs ${away}`
      : clean(row?.title || row?.name || row?.link || league || `${sport} on ANT SPORTS`);

  if (!title) return null;

  const officialUrl = eventUrl(row);
  const eventId = clean(row?.id || row?.link || `${sportKey}-${home}-${away}-${matchTime}`);
  const status = explicitLive ? "live" : "upcoming";

  return {
    id: `antsports:${eventId}`,
    eventId,
    name: title,
    league,
    sport,
    sportKey,
    matchType: clean(row?.matchType || sportKey || "sports"),
    leagueCountry: clean(row?.leagueCountry),
    matchDate: clean(row?.matchDate),
    matchDate2: clean(row?.matchDate2),
    dateDay: clean(row?.dateDay),
    timeHeader: clean(row?.timeHeader),
    matchTime,
    matchTimeTbd: Number(row?.matchTimeTbd || 0) === 1,
    home,
    away,
    homeScore: row?.homeScore ?? null,
    awayScore: row?.awayScore ?? null,
    logo: absoluteAssetUrl(row?.leagueFlag),
    homeLogo: absoluteAssetUrl(row?.homeFlag),
    awayLogo: absoluteAssetUrl(row?.awayFlag),
    officialUrl,
    status,
    live: explicitLive,
    upcoming,
  };
};

const collectEvents = (pageProps) => {
  const liveRows = [
    ...(Array.isArray(pageProps?.onTheAir) ? pageProps.onTheAir : []),
    ...(Array.isArray(pageProps?.hot) ? pageProps.hot : []),
    ...(Array.isArray(pageProps?.banners) ? pageProps.banners : []),
  ];

  const liveKeys = new Set(liveRows.map(rowKey).filter(Boolean));
  const rows = [...liveRows, ...scheduleRows(pageProps)];
  const nowSeconds = Math.floor(Date.now() / 1000);
  const seen = new Set();
  const events = [];

  for (const row of rows) {
    const event = normaliseMatch(row, liveKeys, nowSeconds);
    if (!event) continue;

    const key = clean(row?.id || row?.link || event.officialUrl).toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    events.push(event);
  }

  events.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;

    const aTime = Number(a?.matchTime || Number.MAX_SAFE_INTEGER);
    const bTime = Number(b?.matchTime || Number.MAX_SAFE_INTEGER);
    if (aTime !== bTime) return aTime - bTime;

    const sportOrder = String(a?.sport || "").localeCompare(String(b?.sport || ""));
    if (sportOrder !== 0) return sportOrder;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  return events;
};

const eventSummary = (events) => {
  const bySport = {};
  let live = 0;
  let upcoming = 0;

  for (const event of events) {
    const sport = clean(event?.sport || "Other");
    if (!bySport[sport]) {
      bySport[sport] = { total: 0, live: 0, upcoming: 0 };
    }

    bySport[sport].total += 1;
    if (event?.live) {
      live += 1;
      bySport[sport].live += 1;
    } else {
      upcoming += 1;
      bySport[sport].upcoming += 1;
    }
  }

  return { live, upcoming, bySport };
};

export default async function () {
  try {
    const response = await fetch(ANT_SPORTS_DIRECTORY_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; MediaGod) AppleWebKit/537.36 Chrome/153 Safari/537.36",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`ANT SPORTS returned HTTP ${response.status}.`);
    }

    const html = await response.text();
    const data = nextDataFromHtml(html);
    const pageProps = data?.props?.pageProps || {};
    const events = collectEvents(pageProps);
    const summary = eventSummary(events);

    return Response.json({
      ok: true,
      source: "ANT SPORTS",
      directoryUrl: ANT_SPORTS_DIRECTORY_URL,
      count: events.length,
      liveCount: summary.live,
      upcomingCount: summary.upcoming,
      sports: summary.bySport,
      events,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: clean(error?.message) || "ANT SPORTS events could not be loaded.",
        events: [],
      },
      { status: 502 }
    );
  }
}
