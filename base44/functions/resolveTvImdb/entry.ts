import { secrets } from "base44:runtime";

const TMDB_BASE = "https://api.themoviedb.org/3";

const clean = (value: unknown) => String(value ?? "").trim();

const isImdbId = (value: unknown) => /^tt\d+$/i.test(clean(value));

const toPositiveInt = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const getYear = (value: unknown) => {
  const match = clean(value).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

const normaliseTitle = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

const tmdbGet = async (
  path: string,
  apiKey: string,
  params: Record<string, string | number | null | undefined> = {}
) => {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && clean(value) !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null as any,
        error: `TMDB returned HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: await response.json(),
      error: "",
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      data: null as any,
      error:
        error?.name === "AbortError"
          ? "TMDB request timed out"
          : error?.message || "TMDB request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const externalIdForTmdbTv = async (
  tmdbId: number,
  apiKey: string
) => {
  const result = await tmdbGet(
    `/tv/${tmdbId}/external_ids`,
    apiKey
  );

  if (!result.ok) {
    return {
      imdbId: "",
      error: result.error,
    };
  }

  const imdbId = clean(result.data?.imdb_id);

  if (!isImdbId(imdbId)) {
    return {
      imdbId: "",
      error: `TMDB TV id ${tmdbId} did not return an IMDb id.`,
    };
  }

  return {
    imdbId,
    error: "",
  };
};

const chooseTvMatch = (
  results: any[],
  title: string,
  year: number | null
) => {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const wanted = normaliseTitle(title);

  const ranked = results.map((item) => {
    const candidate = normaliseTitle(
      item?.name ||
        item?.original_name ||
        ""
    );

    const candidateYear = getYear(
      item?.first_air_date
    );

    let score =
      Number(item?.popularity || 0) /
      1000;

    if (
      candidate === wanted &&
      wanted
    ) {
      score += 100;
    } else if (
      candidate &&
      wanted &&
      (
        candidate.includes(wanted) ||
        wanted.includes(candidate)
      )
    ) {
      score += 30;
    }

    if (
      year &&
      candidateYear
    ) {
      if (
        candidateYear === year
      ) {
        score += 80;
      } else {
        score -= Math.min(
          Math.abs(
            candidateYear -
              year
          ) * 15,
          90
        );
      }
    }

    return {
      item,
      score,
    };
  });

  ranked.sort(
    (a, b) =>
      b.score -
      a.score
  );

  return ranked[0]?.item || null;
};

export default async function (req: Request) {
  try {
    let body: any = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const apiKey = clean(
      secrets.get("TMDB_API_KEY")
    );

    if (!apiKey) {
      return json(
        {
          imdb_id: "",
          error:
            "TMDB_API_KEY is not configured.",
        },
        500
      );
    }

    const tmdbId =
      toPositiveInt(
        body?.tmdb_id ??
          body?.tmdbId
      );

    const title =
      clean(body?.title);

    const year =
      getYear(body?.year);

    // TV playback deliberately resolves the IMDb id
    // from the TMDB series id.
    //
    // We do not trust an IMDb id carried on an old
    // card/detail object because a stale id can point
    // to a different programme with the same title.
    if (tmdbId) {
      const direct =
        await externalIdForTmdbTv(
          tmdbId,
          apiKey
        );

      if (direct.imdbId) {
        return json({
          imdb_id:
            direct.imdbId,

          tmdb_id:
            tmdbId,

          media_type:
            "tv",

          source:
            "tmdb_tv_external_ids",
        });
      }
    }

    if (!title) {
      return json(
        {
          imdb_id:
            "",

          tmdb_id:
            tmdbId,

          media_type:
            "tv",

          error:
            "A TMDB TV id or TV title is required.",
        },
        400
      );
    }

    const search =
      await tmdbGet(
        "/search/tv",
        apiKey,
        {
          query:
            title,

          include_adult:
            "false",

          language:
            "en-US",

          first_air_date_year:
            year,
        }
      );

    if (!search.ok) {
      return json(
        {
          imdb_id:
            "",

          tmdb_id:
            tmdbId,

          media_type:
            "tv",

          error:
            search.error ||
            "TMDB TV search failed.",
        },
        502
      );
    }

    const match =
      chooseTvMatch(
        search.data?.results ||
          [],
        title,
        year
      );

    const matchedTmdbId =
      toPositiveInt(
        match?.id
      );

    if (!matchedTmdbId) {
      return json({
        imdb_id:
          "",

        tmdb_id:
          tmdbId,

        media_type:
          "tv",

        error:
          "TMDB did not find a matching TV programme.",
      });
    }

    const resolved =
      await externalIdForTmdbTv(
        matchedTmdbId,
        apiKey
      );

    if (!resolved.imdbId) {
      return json({
        imdb_id:
          "",

        tmdb_id:
          matchedTmdbId,

        media_type:
          "tv",

        error:
          resolved.error ||
          "IMDb id was not returned for this TV programme.",
      });
    }

    return json({
      imdb_id:
        resolved.imdbId,

      tmdb_id:
        matchedTmdbId,

      media_type:
        "tv",

      source:
        "tmdb_tv_title_search",

      matched_title:
        match?.name ||
        match?.original_name ||
        title,

      matched_year:
        getYear(
          match?.first_air_date
        ),
    });
  } catch (error: any) {
    return json(
      {
        imdb_id:
          "",

        media_type:
          "tv",

        error:
          error?.message ||
          "Unable to resolve TV IMDb id.",
      },
      500
    );
  }
}
