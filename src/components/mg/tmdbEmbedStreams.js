import { base44 } from "@/api/base44Client";

const unwrap = (response) => response?.data ?? response ?? {};

/**
 * Fetches direct stream URLs from a self-hosted Inside4ndroid/TMDB-Embed-API
 * instance (configured via the TMDB_EMBED_API_URL secret). Returns streams
 * shaped like the existing addon-stream entries so they can be merged into
 * the Stream Sources list and played through the standard player path.
 */
export const fetchTmdbEmbedStreams = async ({
  tmdbId,
  mediaType = "movie",
  season = null,
  episode = null,
}) => {
  const id = String(tmdbId ?? "").trim();
  if (!/^[1-9][0-9]{0,9}$/.test(id)) {
    return { streams: [], attempted: false, error: "TMDB id is required." };
  }

  try {
    const response = await base44.functions.invoke("fetchTmdbEmbedStreams", {
      tmdb_id: id,
      media_type: mediaType === "tv" ? "tv" : "movie",
      ...(season != null ? { season } : {}),
      ...(episode != null ? { episode } : {}),
    });

    const data = unwrap(response);
    return {
      streams: Array.isArray(data?.streams) ? data.streams : [],
      attempted: true,
      error: data?.error || "",
    };
  } catch (error) {
    return {
      streams: [],
      attempted: true,
      error: error?.message || "TMDB Embed lookup failed.",
    };
  }
};