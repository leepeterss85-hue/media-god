const clean = (value) => String(value ?? "").trim();

const validImdbId = (value) => /^tt\d{6,10}$/i.test(clean(value));
const validTmdbId = (value) => /^\d{1,10}$/.test(clean(value));

const firstPlayableId = (source) => {
  const imdbCandidates = [
    source?.imdbId,
    source?.imdb_id,
    source?.sourceDiagnostics?.imdbId,
  ];

  for (const value of imdbCandidates) {
    if (validImdbId(value)) return clean(value);
  }

  const tmdbCandidates = [
    source?.tmdbId,
    source?.tmdb_id,
    source?.sourceDiagnostics?.tmdbId,
    source?.id,
  ];

  for (const value of tmdbCandidates) {
    if (validTmdbId(value)) return clean(value);
  }

  return "";
};

export const buildAlternateEmbedFallback = (source, options = {}) => {
  const id = firstPlayableId(source);
  if (!id) return null;

  const mediaType = String(
    source?.mediaType || source?.media_type || source?.type || "movie"
  ).toLowerCase();
  const isTv = mediaType === "tv" || mediaType === "series" || mediaType === "show";

  const season = Math.max(
    1,
    Number(source?.rdSeason ?? source?.season ?? options?.season ?? 1) || 1
  );
  const episode = Math.max(
    1,
    Number(source?.rdEpisode ?? source?.episode ?? options?.episode ?? 1) || 1
  );

  const path = isTv
    ? `/embed/tv/${encodeURIComponent(id)}/${season}/${episode}`
    : `/embed/movie/${encodeURIComponent(id)}`;

  const params = new URLSearchParams();
  params.set("autoplay", "1");
  params.set("primaryColor", "22c55e");

  const resumeAt = Math.max(0, Number(options?.resumeAt || 0));
  if (resumeAt > 0) {
    params.set("resumeAt", String(Math.floor(resumeAt)));
  }

  const title = clean(source?.title || source?.rdTitle);
  if (title) params.set("title", title);

  return {
    url: `https://vaplayer.ru${path}?${params.toString()}`,
    provider: "VidAPI",
    id,
    mediaType: isTv ? "tv" : "movie",
    season: isTv ? season : null,
    episode: isTv ? episode : null,
  };
};
