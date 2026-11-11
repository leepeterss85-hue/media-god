/**
 * A catalogue release is not proof of a playable or licensed video stream.
 * Release dates here describe the first known public debut worldwide, not
 * the viewer's local rights or the date a provider added an older title.
 */
export const validReleaseDate = (value) => {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const parsed = new Date(raw + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === raw ? raw : "";
};

export const formatReleaseDate = (date) => {
  const value = validReleaseDate(date);
  return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : "";
};

export const releaseStatusLabel = (item = {}, section = "") => {
  const context = section || item.release_context || "";
  if (context === "cinema" || context === "cinema_latest") {
    return "In cinemas worldwide · stream unconfirmed";
  }
  if (context === "special" || context === "cinema_extras") {
    return item.cinema_group === "short" ? "Short film · special theatrical screening" :
      item.cinema_group === "runtime_unconfirmed" ? "Cinema event · feature length unconfirmed" :
      "Special cinema event · not a regular feature-film premiere";
  }
  if (context === "digital" || context === "streaming_recent_movies") {
    return item.local_streaming_listed
      ? "Digital release · local streaming listed"
      : "Digital release worldwide · local stream unconfirmed";
  }
  if (context === "tv" || context === "tv_recent_premieres") {
    return "First aired worldwide";
  }
  if (item.local_streaming_listed) return "Local streaming listed";
  return "";
};

const releaseDateFor = (item) =>
  validReleaseDate(item?.release_date || item?.first_air_date || item?.air_date);

export const newThisWeekItems = ({ cinema = [], digital = [], tv = [], today = "" } = {}) => {
  const end = validReleaseDate(today) || new Date().toISOString().slice(0, 10);
  const since = new Date(end + "T12:00:00Z");
  since.setUTCDate(since.getUTCDate() - 6);
  const start = since.toISOString().slice(0, 10);
  const entries = [
    ...cinema.map((item) => ({ ...item, media_type: "movie", release_context: "cinema" })),
    ...digital.map((item) => ({ ...item, media_type: "movie", release_context: "digital" })),
    ...tv.map((item) => ({ ...item, media_type: "tv", release_context: "tv" })),
  ].filter((item) => {
    const date = releaseDateFor(item);
    return date && date >= start && date <= end && (item.tmdb_id || item.id);
  });

  // One poster per title; a new digital event wins over a repeat cinema card.
  const unique = new Map();
  for (const item of entries) {
    const key = `${item.media_type}:${item.tmdb_id || item.id}`;
    const previous = unique.get(key);
    if (!previous || releaseDateFor(item) > releaseDateFor(previous) ||
        (releaseDateFor(item) === releaseDateFor(previous) && item.release_context === "digital")) {
      unique.set(key, item);
    }
  }
  return [...unique.values()].sort((a, b) =>
    releaseDateFor(b).localeCompare(releaseDateFor(a)) ||
    Number(b.popularity || 0) - Number(a.popularity || 0)
  ).slice(0, 35);
};

export const releaseAlertItems = (records = [], today = "", selectedTypes = {}) => {
  const end = validReleaseDate(today) || new Date().toISOString().slice(0, 10);
  const floor = new Date(end + "T12:00:00Z");
  floor.setUTCDate(floor.getUTCDate() - 21);
  const since = floor.toISOString().slice(0, 10);
  const all = [];
  for (const record of records) {
    const title = String(record.title || record.name || "").trim();
    const tmdbId = String(record.tmdb_id || record.tmdbId || record.id || "");
    if (!title || !tmdbId) continue;
    const isTv = record.media_type === "tv";
    const opportunities = isTv
      ? [
          ["tv", record.premiere_date, "TV premiere"],
          ["episode", record.last_episode?.air_date, `New episode S${record.last_episode?.season_number || "?"}E${record.last_episode?.episode_number || "?"}`],
        ]
      : [
          ["cinema", record.first_cinema_date, "Cinema release"],
          ["digital", record.first_digital_date, "Digital release"],
        ];
    for (const [type, candidate, label] of opportunities) {
      if (selectedTypes[type] === false) continue;
      const date = validReleaseDate(candidate);
      if (date < since || date > end || !date) continue;
      all.push({
        key: `${isTv ? "tv" : "movie"}:${tmdbId}:${type}:${date}`,
        title,
        tmdbId,
        media_type: isTv ? "tv" : "movie",
        type,
        label,
        date,
      });
    }
  }
  const unique = new Map(all.map((item) => [item.key, item]));
  return [...unique.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
};
