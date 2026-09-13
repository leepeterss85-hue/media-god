import { base44 } from "@/api/base44Client";

export const ANT_SPORTS_BASE_URL = "https://antsports.tv";
export const ANT_SPORTS_DIRECTORY_URL = `${ANT_SPORTS_BASE_URL}/us`;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normaliseEvent = (event, index) => {
  const officialUrl = clean(event?.officialUrl) || ANT_SPORTS_DIRECTORY_URL;
  const league = clean(event?.league || "Sports");
  const matchType = clean(event?.matchType || "Sports");
  const title = clean(event?.name || "ANT SPORTS Live");
  const leagueCountry = clean(event?.leagueCountry);

  return {
    id: clean(event?.id) || `antsports:${index}:${title}`,
    name: title,
    rawName: title,
    group: "AntSports Live",
    country: "US",
    logo: clean(event?.logo),
    url: officialUrl,
    officialUrl,
    officialLabel: "Open ANT SPORTS",
    kind: "external",
    format: "external",
    sourceId: "antsports-live",
    sourceName: "AntSports Live",
    sourcePriority: 97,
    sourceCategory: "Sports",
    browserPlayable: true,
    geoRestricted: false,
    geoBlocked: false,
    quality: 0,
    tags: [
      "Sports",
      "AntSports",
      "Live",
      league,
      matchType,
      ...(leagueCountry ? [leagueCountry] : []),
    ].filter(Boolean),
    score: 4500,
    alternatives: [],
    antsports: {
      eventId: clean(event?.eventId),
      league,
      matchType,
      leagueCountry,
      matchDate: clean(event?.matchDate),
      home: clean(event?.home),
      away: clean(event?.away),
      homeScore: event?.homeScore ?? null,
      awayScore: event?.awayScore ?? null,
      homeLogo: clean(event?.homeLogo),
      awayLogo: clean(event?.awayLogo),
    },
  };
};

export async function fetchAntSportsEvents() {
  const response = await base44.functions.invoke("antSportsLive", {});
  const data = response?.data ?? response ?? {};

  if (data?.ok === false || data?.error) {
    throw new Error(clean(data?.error) || "ANT SPORTS live events could not be loaded.");
  }

  return (Array.isArray(data?.events) ? data.events : [])
    .map(normaliseEvent)
    .filter((event) => event.name && /^https?:\/\//i.test(event.officialUrl));
}
