export const ANT_SPORTS_BASE_URL = "https://antsports.tv";
export const ANT_SPORTS_DIRECTORY_URL = `${ANT_SPORTS_BASE_URL}/us`;
export const ANT_SPORTS_LIVE_PRIORITY = 110;
export const ANT_SPORTS_UPCOMING_PRIORITY = 96;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const statusLabel = (event) => (event?.live === true ? "Live" : "Upcoming");

const normaliseEvent = (event, index) => {
  const officialUrl = clean(event?.officialUrl) || ANT_SPORTS_DIRECTORY_URL;
  const league = clean(event?.league || "Sports");
  const sport = clean(event?.sport || event?.matchType || "Sports");
  const matchType = clean(event?.matchType || sport || "Sports");
  const title = clean(event?.name || `ANT SPORTS ${sport}`);
  const leagueCountry = clean(event?.leagueCountry);
  const live = event?.live === true || clean(event?.status).toLowerCase() === "live";
  const upcoming = !live;
  const label = live ? "Live" : "Upcoming";
  const matchTime = Number(event?.matchTime || 0);

  return {
    id: clean(event?.id) || `antsports:${index}:${title}`,
    name: title,
    rawName: title,
    group: `ANT SPORTS • ${sport} • ${label}`,
    country: /^[A-Za-z]{2}$/.test(leagueCountry) ? leagueCountry.toUpperCase() : "",
    logo: clean(event?.logo),
    url: officialUrl,
    officialUrl,
    officialLabel: live ? "Watch on ANT SPORTS" : "Open ANT SPORTS event",
    kind: "external",
    format: "external",
    sourceId: "antsports-live",
    sourceName: `ANT SPORTS • ${sport}`,
    sourcePriority: live
      ? ANT_SPORTS_LIVE_PRIORITY
      : ANT_SPORTS_UPCOMING_PRIORITY,
    sourceCategory: "Sports",
    browserPlayable: true,
    geoRestricted: false,
    geoBlocked: false,
    quality: 0,
    live,
    upcoming,
    tags: [
      "Sports",
      "ANT SPORTS",
      label,
      sport,
      league,
      matchType,
      ...(leagueCountry ? [leagueCountry] : []),
    ].filter(Boolean),
    score: live ? 5200 : 3600,
    alternatives: [],
    antsports: {
      eventId: clean(event?.eventId),
      league,
      sport,
      sportKey: clean(event?.sportKey),
      matchType,
      status: live ? "live" : "upcoming",
      leagueCountry,
      matchDate: clean(event?.matchDate),
      matchDate2: clean(event?.matchDate2),
      dateDay: clean(event?.dateDay),
      timeHeader: clean(event?.timeHeader),
      matchTime,
      matchTimeTbd: event?.matchTimeTbd === true,
      home: clean(event?.home),
      away: clean(event?.away),
      homeScore: event?.homeScore ?? null,
      awayScore: event?.awayScore ?? null,
      homeLogo: clean(event?.homeLogo),
      awayLogo: clean(event?.awayLogo),
      label: statusLabel(event),
    },
  };
};

export async function fetchAntSportsEvents() {
  // Keep the Base44 client lazy so Node regression tests can import the
  // playlist/parser module without needing Vite's @ alias resolution.
  const { base44 } = await import("../../api/base44Client.js");
  const response = await base44.functions.invoke("antSportsLive", {});
  const data = response?.data ?? response ?? {};

  if (data?.ok === false || data?.error) {
    throw new Error(clean(data?.error) || "ANT SPORTS events could not be loaded.");
  }

  return (Array.isArray(data?.events) ? data.events : [])
    .map(normaliseEvent)
    .filter((event) => event.name && /^https?:\/\//i.test(event.officialUrl));
}
