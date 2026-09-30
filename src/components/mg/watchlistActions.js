import { base44 } from "@/api/base44Client";
import { resolveCatalogMediaType } from "@/components/mg/catalogMediaIdentity";

/*
 * Single source of truth for adding a title to the Watchlist.
 *
 * Every entry point (hero banner, movie/TV detail view, listing-card quick-add)
 * routes through this helper so the persisted record always carries a string
 * `tmdb_id` and a correct `media_type`, and a duplicate add never creates a
 * second row.
 */

export const resolveWatchlistId = (item) => {
  const raw =
    item?.tmdb_id ?? item?.tmdbId ?? item?.id ?? null;

  if (raw == null) {
    return "";
  }

  return String(raw);
};

const asList = (response) => {
  if (Array.isArray(response)) {
    return response;
  }

  return Array.isArray(response?.items) ? response.items : [];
};

export const addToWatchlistItem = async (item) => {
  const tmdbId = resolveWatchlistId(item);

  if (!tmdbId) {
    return { ok: false, reason: "missing_id" };
  }

  const mediaType =
    resolveCatalogMediaType(item) === "tv" ? "tv" : "movie";

  try {
    const existing = asList(
      await base44.entities.WatchlistItem.filter({
        tmdb_id: tmdbId,
      })
    );

    if (existing.length > 0) {
      return {
        ok: true,
        created: false,
        reason: "duplicate",
        record: existing[0],
      };
    }
  } catch {
    // If the dedupe lookup fails, fall through and attempt the create so a
    // transient network error never blocks a legitimate first add.
  }

  const record = await base44.entities.WatchlistItem.create({
    title: item?.title || item?.name || "Untitled",
    year: item?.year || "",
    poster_url:
      item?.poster_url || item?.posterUrl || item?.poster || "",
    description: item?.description || item?.overview || "",
    tmdb_id: tmdbId,
    media_type: mediaType,
  });

  return { ok: true, created: true, record };
};