import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";

const TMDB_BASE = "https://api.themoviedb.org/3";

const clean = (value) => String(value || "").trim();

const validImdb = (value) => /^tt\d+$/i.test(clean(value));

const fetchJson = async (url) => {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
};

const externalIdForTmdb = async ({
  apiKey,
  tmdbId,
  mediaType,
}) => {
  if (!tmdbId) {
    return "";
  }

  const type = mediaType === "tv" ? "tv" : "movie";

  const data = await fetchJson(
    `${TMDB_BASE}/${type}/${encodeURIComponent(
      String(tmdbId)
    )}/external_ids?api_key=${encodeURIComponent(apiKey)}`
  );

  return validImdb(data?.imdb_id) ? data.imdb_id : "";
};
const normaliseTitle = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tmdbDetails = async ({
  apiKey,
  tmdbId,
  mediaType,
}) => {
  if (!tmdbId) return null;

  const type = mediaType === "tv" ? "tv" : "movie";

  return fetchJson(
    `${TMDB_BASE}/${type}/${encodeURIComponent(
      String(tmdbId)
    )}?api_key=${encodeURIComponent(apiKey)}&language=en-GB`
  );
};

const tmdbRecordMatchesRequest = ({
  record,
  title,
  year,
  mediaType,
}) => {
  if (!record) return false;

  const type = mediaType === "tv" ? "tv" : "movie";
  const requestedTitle = normaliseTitle(title);
  const recordTitle = normaliseTitle(
    type === "tv"
      ? record?.name || record?.original_name || record?.title
      : record?.title || record?.original_title || record?.name
  );

  if (
    requestedTitle &&
    recordTitle &&
    requestedTitle !== recordTitle
  ) {
    return false;
  }

  const requestedYear = clean(year);
  if (/^\d{4}$/.test(requestedYear)) {
    const date = clean(
      type === "tv"
        ? record?.first_air_date
        : record?.release_date
    );
    const recordYear = date.match(/^(\d{4})/)?.[1] || "";

    if (!recordYear || recordYear !== requestedYear) {
      return false;
    }
  }

  return true;
};


const searchTmdb = async ({
  apiKey,
  title,
  year,
  mediaType,
}) => {
  const type = mediaType === "tv" ? "tv" : "movie";

  const params = new URLSearchParams({
    api_key: apiKey,
    language: "en-GB",
    query: title,
    page: "1",
    include_adult: "false",
  });

  if (year) {
    if (type === "tv") {
      params.set("first_air_date_year", String(year));
    } else {
      params.set("year", String(year));
    }
  }

  const data = await fetchJson(
    `${TMDB_BASE}/search/${type}?${params.toString()}`
  );

  const results = Array.isArray(data?.results) ? data.results : [];

  if (results.length === 0) {
    return null;
  }

  const wanted = clean(title).toLowerCase();

  const exact = results.find((item) => {
    const candidate = clean(
      type === "tv"
        ? item?.name || item?.title
        : item?.title || item?.name
    ).toLowerCase();

    return candidate === wanted;
  });

  return exact || results[0] || null;
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    let body = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const suppliedImdb = clean(
      body?.imdb_id ||
        body?.imdbId
    );

    const tmdbId = clean(
      body?.tmdb_id ||
        body?.tmdbId ||
        body?.id
    );

    const title = clean(body?.title);
    const year = clean(body?.year);
    const mediaType =
      body?.media_type === "tv" ||
      body?.mediaType === "tv"
        ? "tv"
        : "movie";

    const apiKey = secrets.get("TMDB_API_KEY");

    if (!apiKey) {
      return Response.json(
        {
          error: "TMDB API key not configured",
          imdb_id: "",
        },
        { status: 500 }
      );
    }

    if (tmdbId && /^\d+$/.test(tmdbId)) {
      const record = await tmdbDetails({
        apiKey,
        tmdbId,
        mediaType,
      });

      const identityMatches =
        tmdbRecordMatchesRequest({
          record,
          title,
          year,
          mediaType,
        });

      if (
        identityMatches ||
        (!title && !year)
      ) {
        const imdbId = await externalIdForTmdb({
          apiKey,
          tmdbId,
          mediaType,
        });

        if (imdbId) {
          return Response.json({
            imdb_id:
              validImdb(suppliedImdb) && suppliedImdb === imdbId
                ? suppliedImdb
                : imdbId,
            tmdb_id: tmdbId,
            source:
              validImdb(suppliedImdb) && suppliedImdb !== imdbId
                ? "tmdb_id_corrected_supplied_imdb"
                : "tmdb_id_validated",
          });
        }
      }
    }

    if (title) {
      const match = await searchTmdb({
        apiKey,
        title,
        year,
        mediaType,
      });

      if (match?.id) {
        const imdbId = await externalIdForTmdb({
          apiKey,
          tmdbId: match.id,
          mediaType,
        });

        if (imdbId) {
          return Response.json({
            imdb_id: imdbId,
            tmdb_id: String(match.id),
            source:
              validImdb(suppliedImdb) && suppliedImdb !== imdbId
                ? "title_search_corrected_supplied_imdb"
                : "title_search",
          });
        }
      }
    }

    return Response.json({
      imdb_id: "",
      tmdb_id: tmdbId,
      source: "not_found",
      error: "IMDb id could not be resolved for this title.",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "IMDb lookup failed.",
        imdb_id: "",
      },
      { status: 500 }
    );
  }
}
