const ANT_SPORTS_BASE_URL = "https://antsports.tv";
const ANT_SPORTS_DIRECTORY_URL = `${ANT_SPORTS_BASE_URL}/us`;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const SPORT_CATEGORIES = [
  { key: "football", label: "Football", href: "/cate/football/football" },
  { key: "fighting", label: "Fighting", href: "/cate/fighting/fighting" },
  { key: "nfl", label: "NFL", href: "/cate/nfl/american-football" },
  { key: "f1", label: "Formula 1", href: "/cate/f1/formula-1" },
  { key: "rugby", label: "Rugby", href: "/cate/rugby/rugby" },
  { key: "baseball", label: "MLB / Baseball", href: "/cate/baseball/baseball" },
  { key: "basketball", label: "Basketball", href: "/cate/basketball/basketball" },
  { key: "ncaaf", label: "NCAAF", href: "/cate/ncaaf/ncaaf" },
  { key: "afl", label: "AFL", href: "/cate/afl/afl" },
  { key: "hockey", label: "NHL", href: "/cate/hockey/hockey" },
  { key: "tennis", label: "Tennis", href: "/cate/tennis/tennis" },
  { key: "golf", label: "Golf", href: "/cate/golf/golf" },
  { key: "motorsport", label: "Motorsport", href: "/cate/motorsport/motorsport" },
  { key: "other", label: "Other", href: "/cate/other/other" },
];

const CATEGORY_BY_KEY = new Map(
  SPORT_CATEGORIES.map((category) => [category.key, category])
);

const SPORT_ALIASES = {
  soccer: "football",
  "american-football": "nfl",
  formula1: "f1",
  "formula-1": "f1",
  baseball: "baseball",
  mlb: "baseball",
  nba: "basketball",
  hockey: "hockey",
  nhl: "hockey",
  racing: "motorsport",
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

const sportKeyForRow = (row) => {
  const raw = clean(row?.matchType || row?.sport || "other").toLowerCase();
  return SPORT_ALIASES[raw] || raw || "other";
};

const sportLabelForKey = (key) =>
  CATEGORY_BY_KEY.get(key)?.label ||
  clean(key)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase()) ||
  "Other";

const categoryUrlForKey = (key) => {
  const href = CATEGORY_BY_KEY.get(key)?.href;
  return href ? `${ANT_SPORTS_BASE_URL}/us${href}` : ANT_SPORTS_DIRECTORY_URL;
};

const eventUrl = (row) => {
  const link = clean(row?.link).replace(/^\/+|\/+$/g, "");
  if (!link) return ANT_SPORTS_DIRECTORY_URL;
  return `${ANT_SPORTS_BASE_URL}/us/ant-live-sports/${link}`;
};

const rowKey = (row) =>
  clean(
    row?.id ||
      row?.link ||
      `${row?.home || ""}-${row?.away || ""}-${row?.matchTime || ""}`
  ).toLowerCase();

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

const pageLiveRows = (pageProps) => [
  ...(Array.isArray(pageProps?.onTheAir) ? pageProps.onTheAir : []),
  ...(Array.isArray(pageProps?.hot) ? pageProps.hot : []),
  ...(Array.isArray(pageProps?.banners) ? pageProps.banners : []),
];

const fetchPageProps = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; MediaGod) AppleWebKit/537.36 Chrome/153 Safari/537.36",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const data = nextDataFromHtml(html);
    return data?.props?.pageProps || {};
  } finally {
    clearTimeout(timer);
  }
};

const normaliseMatch = (row, liveKeys, nowSeconds) => {
  if (!row) return null;

  const key = rowKey(row);
  const explicitLive = row?.isLiving === true || liveKeys.has(key);
  const matchTime = Number(row?.matchTime || 0);

  // Keep genuine live rows and future/TBD rows. Old completed fixtures stay out
  // of the Live TV catalogue; ANT SPORTS has a separate replay area for those.
  const upcoming =
    !explicitLive && (matchTime <= 0 || matchTime >= nowSeconds - 15 * 60);
  if (!explicitLive && !upcoming) return null;

  const home = clean(row?.home);
  const away = clean(row?.away);
  const league = clean(row?.leagueName || row?.matchType || "Sports");
  const sportKey = sportKeyForRow(row);
  const sport = sportLabelForKey(sportKey);
  const title =
    home && away
      ? `${home} vs ${away}`
      : clean(
          row?.title ||
            row?.name ||
            row?.link ||
            league ||
            `${sport} on ANT SPORTS`
        );

  if (!title) return null;

  const officialUrl = eventUrl(row);
  const eventId = clean(
    row?.id || row?.link || `${sportKey}-${home}-${away}-${matchTime}`
  );
  const status = explicitLive ? "live" : "upcoming";

  return {
    id: `antsports:${eventId}`,
    eventId,
    name: title,
    league,
    sport,
    sportKey,
    categoryUrl: categoryUrlForKey(sportKey),
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

const collectEvents = (pagePropsList) => {
  const pages = (Array.isArray(pagePropsList) ? pagePropsList : []).filter(Boolean);
  const liveRows = pages.flatMap(pageLiveRows);
  const schedule = pages.flatMap(scheduleRows);
  const liveKeys = new Set(liveRows.map(rowKey).filter(Boolean));
  const rows = [...liveRows, ...schedule];
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
  const bySport = Object.fromEntries(
    SPORT_CATEGORIES.map((category) => [
      category.label,
      {
        key: category.key,
        categoryUrl: `${ANT_SPORTS_BASE_URL}/us${category.href}`,
        total: 0,
        live: 0,
        upcoming: 0,
      },
    ])
  );

  let live = 0;
  let upcoming = 0;

  for (const event of events) {
    const sport = clean(event?.sport || "Other");
    if (!bySport[sport]) {
      bySport[sport] = {
        key: clean(event?.sportKey || "other"),
        categoryUrl: clean(event?.categoryUrl || ANT_SPORTS_DIRECTORY_URL),
        total: 0,
        live: 0,
        upcoming: 0,
      };
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
    const homePageProps = await fetchPageProps(ANT_SPORTS_DIRECTORY_URL);

    const categoryResults = await Promise.allSettled(
      SPORT_CATEGORIES.map(async (category) => {
        const url = `${ANT_SPORTS_BASE_URL}/us${category.href}`;
        const pageProps = await fetchPageProps(url);
        return { category, url, pageProps };
      })
    );

    const categoryPages = [];
    const categoryStatus = [];

    for (let index = 0; index < categoryResults.length; index += 1) {
      const result = categoryResults[index];
      const category = SPORT_CATEGORIES[index];
      const url = `${ANT_SPORTS_BASE_URL}/us${category.href}`;

      if (result.status === "fulfilled") {
        categoryPages.push(result.value.pageProps);
        categoryStatus.push({
          key: category.key,
          label: category.label,
          url,
          ok: true,
          matches: scheduleRows(result.value.pageProps).length,
          error: null,
        });
      } else {
        categoryStatus.push({
          key: category.key,
          label: category.label,
          url,
          ok: false,
          matches: 0,
          error: clean(result.reason?.message || "Category could not be loaded"),
        });
      }
    }

    const events = collectEvents([homePageProps, ...categoryPages]);
    const summary = eventSummary(events);

    return Response.json({
      ok: true,
      source: "ANT SPORTS",
      directoryUrl: ANT_SPORTS_DIRECTORY_URL,
      count: events.length,
      liveCount: summary.live,
      upcomingCount: summary.upcoming,
      sports: summary.bySport,
      categoryStatus,
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
