export const catalogueLoadMessage = (online = globalThis.navigator?.onLine) =>
  online === false
    ? "You're offline. Check your connection, then try again."
    : "We couldn't load this right now. Please try again.";

export const savedTitlePayload = (row) => Object.fromEntries(
  ["title", "year", "poster_url", "description", "tmdb_id", "media_type", "profile_id"]
    .map(key => [key, key === "profile_id" ? (row[key] || "main") : row[key]])
    .filter(([, value]) => value !== undefined)
);

// Keep successful restores out of subsequent retries.
export const createLibraryRestore = (entity, rows) => {
  let pending = rows.map(savedTitlePayload);
  let running = false;
  return async () => {
    if (running) return null;
    running = true;
    const restored = [];
    const failed = [];
    try {
      for (const payload of pending) {
        try {
          const candidates = await entity.filter(payload.tmdb_id
            ? { tmdb_id: payload.tmdb_id }
            : { title: payload.title });
          const existing = candidates.find(row =>
            (row.profile_id || "main") === payload.profile_id &&
            (row.media_type || "movie") === (payload.media_type || "movie"));
          restored.push(existing || await entity.create(payload));
        } catch { failed.push(payload); }
      }
      pending = failed;
      return { restored, remaining: failed.length };
    } finally { running = false; }
  };
};
