// Episode-specific state must never be inherited by the following episode.
export function resetEpisodePlaybackState(current = {}) {
  const next = { ...current };
  for (const type of ["recap", "intro", "credits"]) {
    for (const edge of ["start", "end"]) {
      const capitalType = type[0].toUpperCase() + type.slice(1);
      const capitalEdge = edge[0].toUpperCase() + edge.slice(1);
      delete next[`${type}${capitalEdge}`];
      delete next[`${type}_${edge}`];
      delete next[`skip${capitalType}${capitalEdge}`];
    }
  }
  for (const field of [
    "skipMarkers", "skip_markers", "explicitSkipMarkers", "skipMarkerProvenance",
    "skipMarkerProviders", "skipMarkersPending", "skipMarkerLookupFailed", "sourceDiagnostics", "qualifiedLaunchOnly",
    "preparedEpisodeHandoff", "preparedAt", "verifiedPrepared", "playRequestId", "playbackSessionId",
    "completeSources", "discoveredSources", "magnet", "magnetLink", "richMagnet",
    "infoHash", "info_hash", "fileIdx", "file_idx", "rdTorrentId", "torrentId",
  ]) delete next[field];
  return next;
}

export function playbackContextIdentity(context) {
  if (!context) return "";
  return [context.mediaType || "", context.tmdbId ?? context.tmdb_id ?? context.title ?? "",
    context.season ?? "", context.episode ?? "", context.playbackSessionId ?? ""].join(":");
}

export function shouldStartEpisodeCountdown({
  isTv, hasNextEpisode, autoNext, duration, position, playing, cancelled, creditsStart,
}) {
  if (!isTv || !hasNextEpisode || !autoNext || !playing || cancelled ||
      !Number.isFinite(duration) || duration < 180 || !Number.isFinite(position) ||
      position < 60 || position >= duration - 0.5) return false;
  const verifiedCredits = Number.isFinite(creditsStart) && creditsStart > 0 &&
    creditsStart < duration && position >= creditsStart;
  // Without credits metadata, a ten-second countdown cannot cut off the
  // episode before its natural end. The ended handler remains a fallback.
  return verifiedCredits || duration - position <= 10;
}

function timestampMs(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function episodeSourceExpiresAt(source) {
  const declared = timestampMs(source?.expiresAt ?? source?.expires_at ?? source?.expiration ?? source?.expiry);
  if (declared != null) return declared;
  try {
    const url = new URL(String(source?.src || source?.url || ""));
    let declaredExpiry = null;
    url.searchParams.forEach((value, key) => {
      if (declaredExpiry == null && ["expires", "exp"].includes(key.toLowerCase())) {
        declaredExpiry = timestampMs(value);
      }
    });
    if (declaredExpiry != null) return declaredExpiry;
  } catch { /* Torrent identities have no HTTP expiry. */ }
  return null;
}

export function freshEpisodePreparation(prepared, now = Date.now()) {
  const preparedAt = Number(prepared?.preparedAt || 0);
  if (!preparedAt || preparedAt <= now - 2 * 60 * 60 * 1000 ||
      !Array.isArray(prepared?.sources) || !prepared.sources.length ||
      (prepared.verifiedPlaybackPolicy === "strict" && prepared.verifiedPrepared !== true)) return null;
  const usable = (source) => {
    const expiry = episodeSourceExpiresAt(source);
    if (expiry != null && expiry <= now + 30_000) return false;
    const publicResolver = source?.episodeResolver || source?.flixQuestSource;
    const direct = /^https?:\/\//i.test(String(source?.src || source?.url || ""));
    return !(publicResolver && direct && preparedAt <= now - 15 * 60 * 1000);
  };
  const sources = prepared.sources.filter(usable);
  if (!sources.length) return null;
  const complete = Array.isArray(prepared.completeSources) ? prepared.completeSources : prepared.sources;
  const completeSources = complete.filter(usable);
  return { ...prepared, sources, completeSources,
    refreshRequired: sources.length !== prepared.sources.length || completeSources.length !== complete.length };
}

export function episodeHasAired(episode, now = Date.now()) {
  const date = String(episode?.air_date || episode?.airDate || "").trim();
  if (!date) return true;
  const releasedAt = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date);
  return !Number.isFinite(releasedAt) || releasedAt <= now;
}

// Retry empty/expired preparations without repeatedly hitting providers on
// every progress event. Refresh near expiry before the handoff needs the URL.
export function shouldRefreshEpisodePreparation(state, now = Date.now()) {
  if (state?.promise || state?.availability === "no") return false;
  if (Number(state?.attemptedAt || 0) > now - 60_000) return false;
  const fresh = freshEpisodePreparation(state?.prepared, now + 120_000);
  return !fresh || fresh.refreshRequired === true;
}
