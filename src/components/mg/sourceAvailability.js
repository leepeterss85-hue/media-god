import { base44 } from "@/api/base44Client";

const AVAILABILITY_TTL_MS = 15 * 60 * 1000;
const availabilityCache = new Map();
const inFlight = new Map();

const clean = (value) => String(value ?? "").trim();

const mediaTypeOf = (item, options = {}) => {
  const raw = clean(
    options.mediaType ||
      item?.media_type ||
      item?.mediaType ||
      item?.type ||
      "movie"
  ).toLowerCase();

  return raw === "tv" || raw === "series" || raw === "show"
    ? "tv"
    : "movie";
};

const positiveInt = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const itemId = (item, options = {}) =>
  clean(
    options.tmdbId ||
      options.tmdb_id ||
      item?.tmdb_id ||
      item?.tmdbId ||
      item?.id
  );

const itemTitle = (item, options = {}) =>
  clean(
    options.title ||
      item?.title ||
      item?.name ||
      item?.showTitle ||
      item?.seriesTitle
  );

const itemYear = (item, options = {}) =>
  clean(
    options.year ||
      item?.year ||
      item?.release_year ||
      item?.releaseYear
  );

const itemImdbId = (item, options = {}) =>
  clean(
    options.imdbId ||
      options.imdb_id ||
      item?.imdb_id ||
      item?.imdbId
  );

const requestShape = (item, options = {}) => {
  const mediaType = mediaTypeOf(item, options);
  const season =
    mediaType === "tv"
      ? positiveInt(
          options.season ??
            item?.season ??
            item?.season_number ??
            item?.seasonNumber
        ) || 1
      : null;
  const episode =
    mediaType === "tv"
      ? positiveInt(
          options.episode ??
            item?.episode ??
            item?.episode_number ??
            item?.episodeNumber
        ) || 1
      : null;

  return {
    mediaType,
    tmdbId: itemId(item, options),
    imdbId: itemImdbId(item, options),
    title: itemTitle(item, options),
    year: itemYear(item, options),
    season,
    episode,
  };
};

const availabilityKey = (shape) =>
  [
    shape.mediaType,
    shape.tmdbId || "",
    shape.imdbId || "",
    shape.title.toLowerCase(),
    shape.year || "",
    shape.season || "",
    shape.episode || "",
  ].join("|");

const unwrap = (response) => {
  const first = response?.data ?? response ?? {};
  return first &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    first.data &&
    typeof first.data === "object" &&
    !Array.isArray(first.data)
    ? first.data
    : first;
};

const streamLooksUsable = (stream) => {
  if (!stream || stream?.unsupported === true) return false;

  return Boolean(
    clean(stream?.src) ||
      clean(stream?.url) ||
      clean(stream?.magnet) ||
      clean(stream?.infoHash) ||
      clean(stream?.info_hash)
  );
};

export const hasPlayableCatalogSource = async (item, options = {}) => {
  const shape = requestShape(item, options);

  if (!shape.tmdbId && !shape.imdbId && !shape.title) {
    return false;
  }

  const key = availabilityKey(shape);
  const cached = availabilityCache.get(key);

  if (
    cached &&
    Date.now() - Number(cached.checkedAt || 0) < AVAILABILITY_TTL_MS
  ) {
    return cached.available === true;
  }

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = base44.functions
    .invoke("fetchAddonStreams", {
      fast_mode: true,
      media_type: shape.mediaType,
      ...(shape.tmdbId ? { tmdb_id: shape.tmdbId } : {}),
      ...(shape.imdbId ? { imdb_id: shape.imdbId } : {}),
      ...(shape.title ? { title: shape.title } : {}),
      ...(shape.year ? { year: shape.year } : {}),
      ...(shape.mediaType === "tv"
        ? {
            season: shape.season,
            episode: shape.episode,
          }
        : {}),
    })
    .then((response) => {
      const payload = unwrap(response);
      const streams = Array.isArray(payload?.streams) ? payload.streams : [];
      const available = streams.some(streamLooksUsable);

      availabilityCache.set(key, {
        available,
        checkedAt: Date.now(),
      });

      return available;
    })
    .catch(() => {
      availabilityCache.set(key, {
        available: false,
        checkedAt: Date.now(),
      });

      return false;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
};

export const filterItemsWithPlayableSources = async (
  items,
  {
    concurrency = 4,
    forItem,
    maxItems,
  } = {}
) => {
  const sourceItems = Array.isArray(items) ? items : [];
  const limit = Math.max(
    1,
    Math.min(sourceItems.length || 1, Number(concurrency || 4))
  );
  const keep = new Array(sourceItems.length).fill(false);
  let cursor = 0;

  const worker = async () => {
    while (cursor < sourceItems.length) {
      const index = cursor;
      cursor += 1;

      const item = sourceItems[index];
      const options =
        typeof forItem === "function"
          ? forItem(item, index) || {}
          : {};

      keep[index] = await hasPlayableCatalogSource(item, options);
    }
  };

  await Promise.all(
    Array.from({ length: limit }, () => worker())
  );

  const filtered = sourceItems.filter((_, index) => keep[index]);

  return Number.isFinite(Number(maxItems)) && Number(maxItems) > 0
    ? filtered.slice(0, Number(maxItems))
    : filtered;
};

export const clearCatalogSourceAvailabilityCache = () => {
  availabilityCache.clear();
  inFlight.clear();
};
