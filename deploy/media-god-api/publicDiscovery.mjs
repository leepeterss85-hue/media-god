// Public discovery only: no accounts, RD credentials, or playback URLs.
const json = (data, status = 200) => Response.json(data, { status });
const pickCountry = value => ["GB", "US", "CA", "AU"].includes(String(value || "").toUpperCase()) ? String(value).toUpperCase() : "GB";
const today = () => new Date().toISOString().slice(0, 10);
const cleanText = value => String(value ?? "").replace(/<[^>]*>/g, "").trim().slice(0, 500);
async function read(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error("Provider temporarily unavailable");
  return response.json();
}
const tvRow = episode => ({
  id: "tvmaze-" + episode.id,
  title: episode.name ? (episode._embedded?.show?.name || episode.show?.name || "TV") + " — " + episode.name : (episode.show?.name || "Episode"),
  description: cleanText(episode.summary),
  start_time: episode.airstamp || episode.airdate,
  source_name: "TVmaze",
  poster_url: episode.show?.image?.medium || episode._embedded?.show?.image?.medium || "",
  web_url: episode.url || "",
  status: "Scheduled TV episode",
});
const sportRow = item => ({
  id: "sportsdb-" + item.idEvent,
  title: cleanText(item.strEvent),
  description: cleanText(item.strLeague),
  start_time: item.strTimestamp || (item.dateEvent ? item.dateEvent + "T" + (item.strTime || "00:00:00") + "Z" : ""),
  source_name: "TheSportsDB",
  league_name: cleanText(item.strLeague),
  poster_url: item.strThumb || "",
  web_url: item.strVideo && /^https:\/\//.test(item.strVideo) ? item.strVideo : "",
  status: "Scheduled sports fixture",
});
// Curated league IDs verified against TheSportsDB. The provider's free
// schedule API returns a small sample per league, not full regional coverage.
// Never include foreign leagues solely because they appeared in the old feed.
const LEAGUES_BY_REGION = Object.freeze({
  GB: Object.freeze([4328, 4329, 4330, 4396, 4397, 4414, 4415, 4463, 4482, 4372]),
  US: Object.freeze([4387, 4391, 4424, 4346, 4380]),
  CA: Object.freeze([4405]),
  AU: Object.freeze([4356, 4416, 4456, 4461]),
});
export default async function discovery(req) {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const action = String(body?.action || "");
  const region = pickCountry(body?.region);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body?.date || "") ? body.date : today();
  if (!["tv", "sports", "status"].includes(action)) return json({ error: "Unsupported discovery action" }, 400);
  if (action === "status") return json({ configured: true, sources: ["TMDB", "TVmaze", "TheSportsDB"], liveSports: false });
  if (action === "tv") {
    try {
      const url = new URL("https://api.tvmaze.com/schedule");
      url.searchParams.set("country", region);
      url.searchParams.set("date", date);
      const data = await read(url);
      const rows = Array.isArray(data) ? data.slice(0, 100).map(tvRow) : [];
      return json({ results: rows, source: "TVmaze", region, date, liveSports: false });
    } catch { return json({ results: [], source: "TVmaze", error: "TV episode schedule temporarily unavailable" }, 502); }
  }
  // TheSportsDB v1 free plan exposes only limited upcoming fixtures per league.
  // Never represent this as a comprehensive or live sports guide.
  const leagueIds = LEAGUES_BY_REGION[region];
  const selectedLeagues = new Set(leagueIds.map(String));
  const settled = await Promise.allSettled(leagueIds.map(async id => {
    const url = new URL("https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php");
    url.searchParams.set("id", String(id));
    const data = await read(url);
    return Array.isArray(data?.events) ? data.events : [];
  }));
  // Reject any mismatched league the provider might return. An event without
  // an idLeague came from one of the region's explicitly selected league URLs.
  const rows = settled.filter(r => r.status === "fulfilled").flatMap(r => r.value)
    .filter(e => e?.idEvent && (!e.idLeague || selectedLeagues.has(String(e.idLeague))))
    .filter(e => !e.dateEvent || e.dateEvent >= today());
  const unique = [...new Map(rows.map(e => [e.idEvent, e])).values()]
    .map(sportRow).sort((a,b) => String(a.start_time).localeCompare(String(b.start_time)));
  if (!settled.some(r => r.status === "fulfilled")) {
    return json({ results: [], source: "TheSportsDB", region, error: "Sports schedules temporarily unavailable" }, 502);
  }
  return json({ results: unique, source: "TheSportsDB", region, selected_league_ids: leagueIds, limited: true, liveSports: false });
}
