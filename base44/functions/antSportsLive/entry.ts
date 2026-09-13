const ANT_SPORTS_BASE_URL = "https://antsports.tv";
const ANT_SPORTS_DIRECTORY_URL = `${ANT_SPORTS_BASE_URL}/us`;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

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

const normaliseLiveMatch = (row) => {
  if (!row || row?.isLiving !== true) return null;

  const home = clean(row?.home);
  const away = clean(row?.away);
  const league = clean(row?.leagueName || row?.matchType || "Sports");
  const title =
    home && away
      ? `${home} vs ${away}`
      : clean(row?.title || row?.name || row?.link || league || "ANT SPORTS Live");

  if (!title) return null;

  const officialUrl = eventUrl(row);
  const eventId = clean(row?.id || row?.link || `${home}-${away}`);

  return {
    id: `antsports:${eventId}`,
    eventId,
    name: title,
    league,
    matchType: clean(row?.matchType || "sports"),
    leagueCountry: clean(row?.leagueCountry),
    matchDate: clean(row?.matchDate),
    matchTime: Number(row?.matchTime || 0),
    home,
    away,
    homeScore: row?.homeScore ?? null,
    awayScore: row?.awayScore ?? null,
    logo: absoluteAssetUrl(row?.leagueFlag),
    homeLogo: absoluteAssetUrl(row?.homeFlag),
    awayLogo: absoluteAssetUrl(row?.awayFlag),
    officialUrl,
    live: true,
  };
};

const uniqueLiveMatches = (pageProps) => {
  const rows = [
    ...(Array.isArray(pageProps?.onTheAir) ? pageProps.onTheAir : []),
    ...(Array.isArray(pageProps?.hot) ? pageProps.hot : []),
    ...(Array.isArray(pageProps?.banners) ? pageProps.banners : []),
  ];

  const seen = new Set();
  const events = [];

  for (const row of rows) {
    const event = normaliseLiveMatch(row);
    if (!event) continue;

    const key = clean(row?.id || row?.link || event.officialUrl).toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    events.push(event);
  }

  events.sort((a, b) => {
    const aTime = Number(a?.matchTime || 0);
    const bTime = Number(b?.matchTime || 0);
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  return events;
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
    const events = uniqueLiveMatches(pageProps);

    return Response.json({
      ok: true,
      source: "ANT SPORTS",
      directoryUrl: ANT_SPORTS_DIRECTORY_URL,
      count: events.length,
      events,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: clean(error?.message) || "ANT SPORTS live events could not be loaded.",
        events: [],
      },
      { status: 502 }
    );
  }
}
