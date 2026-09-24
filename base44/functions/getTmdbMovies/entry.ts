import { secrets } from 'base44:runtime';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';
const PROVIDER_LOGO_BASE = 'https://image.tmdb.org/t/p/w92';

/*
 * A very small escape hatch for legitimate titles that exist on TMDB but are
 * not returned by TMDB's own title-search index. Keep these entries factual,
 * keyed to stable TMDB/IMDb ids, and only surface them when the query matches.
 *
 * Cage is a real TMDB title (451911) / IMDb title (tt5001426), but TMDB's
 * search endpoint currently omits it even for an exact "Cage" search. Prime
 * Video markets the same film as 2017 while TMDB/IMDb use 2016, so both years
 * are accepted for matching while 2016 remains the canonical playback year.
 */
const EXTERNAL_SEARCH_OVERRIDES = [
  {
    id: '451911',
    tmdb_id: 451911,
    imdb_id: 'tt5001426',
    title: 'Cage',
    name: 'Cage',
    year: '2016',
    release_date: '2016-06-01',
    alternate_years: ['2017'],
    media_type: 'movie',
    poster_url:
      'https://m.media-amazon.com/images/M/MV5BNzdhNTQxZWUtYmYyMC00NGExLWI0NmQtYTFjYjdjMTA0ZmI5XkEyXkFqcGc@._V1_.jpg',
    description:
      'Seattle call girl Gracie Blake wakes up in a cage, in a warehouse, somewhere in America.',
    vote_average: 3.7,
    popularity: 0,
    original_language: 'en',
    official_url:
      'https://www.amazon.co.uk/Cage-Warren-Dudley/dp/B0H8LJJVPH',
    watch_link:
      'https://www.amazon.co.uk/Cage-Warren-Dudley/dp/B0H8LJJVPH',
    watch_providers: [
      {
        provider_id: 119,
        provider_name: 'Amazon Prime Video',
        logo_url:
          'https://image.tmdb.org/t/p/w92/pvske1MyAoymrs5bguRfVqYiM9a.jpg',
        availability: 'Stream',
        link:
          'https://www.amazon.co.uk/Cage-Warren-Dudley/dp/B0H8LJJVPH',
      },
    ],
    search_terms: [
      'cage',
      'warren dudley',
      'patrick bergin',
      'lucy jane quinlan',
      'b0h8ljjvph',
    ],
  },
];

/*
 * Verified movie/TV identity conflicts.
 *
 * These are not fuzzy guesses. Each correction is keyed to a stable TMDB/IMDb
 * identity and only activates for exact known aliases (plus an optional
 * release year). The original TMDB movie/TV rows are still returned, so a
 * genuinely separate TV project with a similar title remains selectable.
 */
const SEARCH_IDENTITY_CORRECTIONS = [
  {
    aliases: [
      'bad apple',
      'bad apples',
    ],
    media_type: 'movie',
    tmdb_id: 1198654,
    imdb_id: 'tt29714073',
    title: 'Bad Apples',
    accepted_years: [
      '2025',
      '2026',
    ],
  },
];

const MOVIE_ENDPOINTS = {
  now_playing: 'movie/now_playing',
  popular: 'movie/popular',
  top_rated: 'movie/top_rated',
  upcoming: 'movie/upcoming',
};

const TV_ENDPOINTS = {
  tv_popular: 'tv/popular',
  tv_top_rated: 'tv/top_rated',
  tv_airing_today: 'tv/airing_today',
  tv_on_the_air: 'tv/on_the_air',
};

const validYmd = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || '')
  );

const todayUtcYmd = () => {
  const now = new Date();

  const yyyy =
    now.getUTCFullYear();

  const mm =
    String(
      now.getUTCMonth() + 1
    ).padStart(
      2,
      '0'
    );

  const dd =
    String(
      now.getUTCDate()
    ).padStart(
      2,
      '0'
    );

  return `${yyyy}-${mm}-${dd}`;
};

const requestRegion = (req) => {
  const headerCandidates = [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'cloudfront-viewer-country',
    'x-country-code',
  ];

  for (const header of headerCandidates) {
    const value = String(req?.headers?.get?.(header) || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(value)) return value;
  }

  const acceptLanguage = String(
    req?.headers?.get?.('accept-language') || ''
  );

  for (const part of acceptLanguage.split(',')) {
    const locale = part.split(';')[0].trim();
    const match = locale.match(/[-_]([A-Za-z]{2})(?:[-_]|$)/);
    if (match?.[1]) return match[1].toUpperCase();
  }

  return 'US';
};

const normaliseSearchTitle = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseSearchQuery = (value) => {
  const raw = String(value || '').trim();
  const yearMatch = raw.match(/(?:^|[\s(])((?:19|20)\d{2})\)?\s*$/);

  if (!yearMatch) {
    return {
      raw,
      title: raw,
      year: '',
    };
  }

  const title = raw
    .slice(0, yearMatch.index)
    .replace(/[\s(,\-]+$/g, '')
    .trim();

  return {
    raw,
    title: title || raw,
    year: yearMatch[1],
  };
};

const externalSearchOverrides = (
  query,
  mediaType = ''
) => {
  const parsed =
    parseSearchQuery(query);
  const wantedTitle =
    normaliseSearchTitle(parsed.title);
  const wantedRaw =
    normaliseSearchTitle(parsed.raw);
  const wantedYear =
    String(parsed.year || '');

  return EXTERNAL_SEARCH_OVERRIDES.filter((item) => {
    if (
      mediaType &&
      item.media_type !== mediaType
    ) {
      return false;
    }

    const itemTitle =
      normaliseSearchTitle(item.title);
    const termMatch =
      (item.search_terms || []).some((term) => {
        const normalised = normaliseSearchTitle(term);
        return (
          normalised &&
          normalised !== itemTitle &&
          (
            wantedRaw === normalised ||
            wantedRaw.includes(normalised)
          )
        );
      });
    const titleMatch =
      wantedTitle === itemTitle ||
      termMatch;

    if (!titleMatch) {
      return false;
    }

    if (!wantedYear) {
      return true;
    }

    const acceptedYears = new Set([
      String(item.year || ''),
      ...(item.alternate_years || []).map(String),
    ]);

    return acceptedYears.has(wantedYear);
  }).map((item) => ({
    ...item,
    watch_providers:
      (item.watch_providers || []).map((provider) => ({
        ...provider,
      })),
  }));
};

const matchingSearchIdentityCorrections = (
  query,
  mediaType = ''
) => {
  const parsed =
    parseSearchQuery(query);

  const wantedTitle =
    normaliseSearchTitle(
      parsed.title
    );

  const wantedYear =
    String(
      parsed.year ||
      ''
    );

  if (!wantedTitle) {
    return [];
  }

  return SEARCH_IDENTITY_CORRECTIONS.filter(
    (correction) => {
      if (
        mediaType &&
        correction.media_type !==
          mediaType
      ) {
        return false;
      }

      const aliasMatch =
        (
          correction.aliases ||
          []
        ).some(
          (alias) =>
            normaliseSearchTitle(
              alias
            ) ===
            wantedTitle
        );

      if (!aliasMatch) {
        return false;
      }

      if (!wantedYear) {
        return true;
      }

      return (
        correction
          .accepted_years ||
        []
      )
        .map(String)
        .includes(
          wantedYear
        );
    }
  );
};

const searchResultScore = (item, titleQuery, requestedYear, originalIndex) => {
  const wantedTitle = normaliseSearchTitle(titleQuery);
  const titles = [
    item?.title,
    item?.name,
    item?.original_title,
    item?.original_name,
  ]
    .map(normaliseSearchTitle)
    .filter(Boolean);

  let score = Math.max(0, 500 - originalIndex);

  if (wantedTitle) {
    if (titles.some((title) => title === wantedTitle)) {
      score += 10000;
    } else if (titles.some((title) => title.startsWith(wantedTitle))) {
      score += 5000;
    } else if (titles.some((title) => title.includes(wantedTitle))) {
      score += 2500;
    }
  }

  if (requestedYear) {
    const date = String(
      item?.release_date ||
      item?.first_air_date ||
      ''
    );
    const resultYear = /^\d{4}/.test(date)
      ? Number(date.slice(0, 4))
      : 0;
    const wantedYear = Number(requestedYear);

    if (resultYear && wantedYear) {
      const distance = Math.abs(resultYear - wantedYear);
      if (distance === 0) score += 3000;
      else if (distance === 1) score += 2200;
      else if (distance === 2) score += 900;
      else score -= Math.min(distance * 100, 1000);
    }
  }

  score += Math.min(Number(item?.popularity || 0), 500);
  return score;
};

const fetchWatchProviders = async (
  item,
  apiKey,
  region
) => {
  const mediaType =
    item?.media_type === 'tv'
      ? 'tv'
      : 'movie';

  const id =
    String(
      item?.id ||
      ''
    ).trim();

  if (!id) {
    return {
      watch_providers: [],
      watch_link: '',
    };
  }

  try {
    const response =
      await fetch(
        `${TMDB_BASE}/${mediaType}/${id}/watch/providers?api_key=${apiKey}`,
        {
          headers: {
            Accept:
              'application/json',
          },
        }
      );

    if (!response.ok) {
      return {
        watch_providers: [],
        watch_link: '',
      };
    }

    const data =
      await response.json();

    const regional =
      data?.results?.[region] ||
      {};

    const groups = [
      ['flatrate', 'Stream'],
      ['free', 'Free'],
      ['ads', 'Free with ads'],
      ['rent', 'Rent'],
      ['buy', 'Buy'],
    ];

    const seen = new Set();
    const providers = [];

    for (const [key, availability] of groups) {
      const list = Array.isArray(regional?.[key])
        ? regional[key]
        : [];

      for (const provider of list) {
        const providerId =
          String(
            provider?.provider_id ||
            provider?.provider_name ||
            ''
          );

        if (!providerId || seen.has(providerId)) {
          continue;
        }

        seen.add(providerId);
        providers.push({
          provider_id:
            provider?.provider_id ||
            null,
          provider_name:
            provider?.provider_name ||
            'Streaming service',
          logo_url:
            provider?.logo_path
              ? `${PROVIDER_LOGO_BASE}${provider.logo_path}`
              : '',
          availability,
        });

        if (providers.length >= 5) {
          break;
        }
      }

      if (providers.length >= 5) {
        break;
      }
    }

    return {
      watch_providers:
        providers,
      watch_link:
        String(
          regional?.link ||
          ''
        ),
    };
  } catch {
    return {
      watch_providers: [],
      watch_link: '',
    };
  }
};

const mapItem = (
  m,
  forcedType = ''
) => {
  const explicitType =
    forcedType === 'tv' ||
    forcedType === 'movie'
      ? forcedType
      : (
          m?.media_type === 'tv' ||
          m?.media_type === 'movie'
            ? m.media_type
            : ''
        );

  /*
   * A typed endpoint is authoritative. A movie returned by /movie/... must
   * stay a movie even if stale/cross-fed metadata happens to contain TV-like
   * fields, and the same applies in reverse for /tv/....
   */
  const isTv =
    explicitType === 'tv' ||
    (
      !explicitType &&
      !m.title &&
      Boolean(
        m.name
      )
    );

  const title =
    isTv
      ? (
          m.name ||
          m.title
        )
      : (
          m.title ||
          m.name
        );

  const date =
    isTv
      ? (
          m.first_air_date ||
          ''
        )
      : (
          m.release_date ||
          ''
        );

  return {
    id:
      String(
        m.id
      ),

    title,

    year:
      date.slice(
        0,
        4
      ),

    release_date:
      date,

    poster_url:
      m.poster_path
        ? `${IMG_BASE}${m.poster_path}`
        : '',

    backdrop_url:
      m.backdrop_path
        ? `${BACKDROP_BASE}${m.backdrop_path}`
        : '',

    description:
      m.overview ||
      '',

    tmdb_id:
      m.id,

    genre_ids:
      m.genre_ids ||
      [],

    media_type:
      isTv
        ? 'tv'
        : 'movie',

    vote_average:
      m.vote_average ||
      0,

    popularity:
      m.popularity ||
      0,

    original_language:
      m.original_language ||
      '',
  };
};

const fetchSearchIdentityCorrections = async (
  query,
  mediaType,
  apiKey,
  region
) => {
  const corrections =
    matchingSearchIdentityCorrections(
      query,
      mediaType
    );

  if (
    corrections.length ===
    0
  ) {
    return [];
  }

  const corrected =
    await Promise.all(
      corrections.map(
        async (
          correction
        ) => {
          try {
            const response =
              await fetch(
                `${TMDB_BASE}/${correction.media_type}/${correction.tmdb_id}?api_key=${apiKey}&language=en-GB`,
                {
                  headers: {
                    Accept:
                      'application/json',
                  },
                }
              );

            if (
              !response.ok
            ) {
              return null;
            }

            const record =
              await response.json();

            const mapped =
              mapItem(
                {
                  ...record,
                  media_type:
                    correction.media_type,
                },
                correction.media_type
              );

            const providers =
              await fetchWatchProviders(
                {
                  ...record,
                  id:
                    correction.tmdb_id,
                  media_type:
                    correction.media_type,
                },
                apiKey,
                region
              );

            return {
              ...mapped,
              ...providers,
              id:
                String(
                  correction.tmdb_id
                ),
              tmdb_id:
                correction.tmdb_id,
              imdb_id:
                correction.imdb_id,
              title:
                correction.title ||
                mapped.title,
              name:
                correction.title ||
                mapped.title,
              media_type:
                correction.media_type,
              mediaType:
                correction.media_type,
              alternate_years:
                (
                  correction
                    .accepted_years ||
                  []
                ).filter(
                  (value) =>
                    String(
                      value
                    ) !==
                    String(
                      mapped.year ||
                      ''
                    )
                ),
              search_aliases:
                correction.aliases ||
                [],
              identity_corrected:
                true,
            };
          } catch {
            return null;
          }
        }
      )
    );

  return corrected.filter(
    Boolean
  );
};

export default async function(req) {
  try {
    /*
     * Catalogue metadata is public app content. Keep it available when a viewer
     * chooses the remembered guest/skip path; account-only features remain
     * protected by their own user-scoped endpoints.
     */

    let body = {};

    try {
      body =
        await req.json();
    } catch {
      body = {};
    }

    const requestedMediaType =
      body.media_type ===
      'tv'
        ? 'tv'
        : body.media_type ===
          'all'
          ? 'all'
          : 'movie';

    const mediaType =
      requestedMediaType ===
      'tv'
        ? 'tv'
        : 'movie';

    const rawProviderIds =
      Array.isArray(body.provider_ids)
        ? body.provider_ids
        : [
            body.provider_ids ||
            body.provider_id ||
            '',
          ];

    const providerIds =
      Array.from(
        new Set(
          rawProviderIds
            .flatMap((value) =>
              String(value || '')
                .split(/[|,]/)
            )
            .map((value) => value.trim())
            .filter((value) => /^\d+$/.test(value))
        )
      );

    const country =
      body.country ||
      '';

    const genre =
      body.genre ||
      '';

    const year =
      body.year ||
      '';

    const language =
      body.language ||
      '';

    const movieId =
      body.movie_id;

    const seasonNumber =
      body.season_number;

    const region =
      String(
        body.region ||
        requestRegion(req)
      ).toUpperCase();

    const timezone =
      String(
        body.timezone ||
        'UTC'
      );

    const requestedDate =
      validYmd(
        body.date
      )
        ? String(
            body.date
          )
        : todayUtcYmd();

    const apiKey =
      secrets.get(
        'TMDB_API_KEY'
      );

    if (!apiKey) {
      return Response.json(
        {
          error:
            'TMDB API key not configured',
        },
        {
          status:
            500,
        }
      );
    }

    if (
      body.provider_catalog
    ) {
      const providerTypes =
        requestedMediaType === 'all'
          ? ['movie', 'tv']
          : [mediaType];

      const lists =
        await Promise.all(
          providerTypes.map(async (type) => {
            const params =
              new URLSearchParams({
                api_key: apiKey,
                language: 'en-GB',
                watch_region: region,
              });

            try {
              const response =
                await fetch(
                  `${TMDB_BASE}/watch/providers/${type}?${params.toString()}`,
                  {
                    headers: { Accept: 'application/json' },
                  }
                );

              if (!response.ok) {
                return [];
              }

              const data = await response.json();
              return Array.isArray(data?.results)
                ? data.results
                : [];
            } catch {
              return [];
            }
          })
        );

      const providersById = new Map();

      for (const provider of lists.flat()) {
        const id = String(provider?.provider_id || '').trim();
        if (!id) continue;

        const priority = Number(
          provider?.display_priorities?.[region] ??
          provider?.display_priority ??
          99999
        );

        const current = providersById.get(id);
        if (current && Number(current.display_priority) <= priority) {
          continue;
        }

        providersById.set(id, {
          provider_id: provider?.provider_id || null,
          provider_name: provider?.provider_name || 'Streaming service',
          logo_url: provider?.logo_path
            ? `${PROVIDER_LOGO_BASE}${provider.logo_path}`
            : '',
          display_priority: priority,
        });
      }

      return Response.json({
        providers: Array.from(providersById.values())
          .sort((a, b) =>
            Number(a.display_priority || 99999) -
              Number(b.display_priority || 99999) ||
            String(a.provider_name || '').localeCompare(
              String(b.provider_name || '')
            )
          ),
        region,
      });
    }

    if (
      body.providers_only &&
      movieId
    ) {
      const providerData =
        await fetchWatchProviders(
          {
            id: movieId,
            media_type: mediaType,
          },
          apiKey,
          region
        );

      return Response.json(providerData);
    }

    /*
     * GLOBAL SEARCH
     */
    if (
      body.multi_search
    ) {
      const parsedSearch =
        parseSearchQuery(
          body.multi_search
        );

      const q =
        parsedSearch.title;

      if (!q) {
        return Response.json({
          movies:
            [],
        });
      }

      const params =
        new URLSearchParams({
          api_key:
            apiKey,

          language:
            'en-GB',

          query:
            q,

          page:
            '1',

          include_adult:
            'false',

          region,
        });

      const sRes =
        await fetch(
          `${TMDB_BASE}/search/multi?${params.toString()}`,
          {
            headers: {
              Accept:
                'application/json',
            },
          }
        );

      if (!sRes.ok) {
        return Response.json(
          {
            error:
              `TMDB error: ${sRes.status}`,
          },
          {
            status:
              502,
          }
        );
      }

      const sData =
        await sRes.json();

      const rankedItems =
        (
          sData.results ||
          []
        )
          .map((item, index) => ({
            item,
            index,
            score: searchResultScore(
              item,
              q,
              parsedSearch.year,
              index
            ),
          }))
          .filter(
            ({ item: m }) =>
              m.media_type ===
                'movie' ||
              m.media_type ===
                'tv'
          )
          .sort(
            (a, b) =>
              b.score - a.score ||
              a.index - b.index
          )
          .slice(
            0,
            16
          );

      const items =
        await Promise.all(
          rankedItems.map(
            async ({ item: m }) => {
              const mapped =
                mapItem(
                  m
                );

              const providers =
                await fetchWatchProviders(
                  m,
                  apiKey,
                  region
                );

              return {
                ...mapped,
                ...providers,
              };
            }
          )
        );

      const corrected =
        await fetchSearchIdentityCorrections(
          body.multi_search,
          '',
          apiKey,
          region
        );

      const overrides =
        externalSearchOverrides(
          body.multi_search
        );

      const combined = [];
      const combinedSeen = new Set();

      for (const item of [
        ...corrected,
        ...overrides,
        ...items,
      ]) {
        const key =
          `${item?.media_type || 'movie'}:${item?.tmdb_id || item?.id || item?.imdb_id || item?.title || ''}`;

        if (!key || combinedSeen.has(key)) {
          continue;
        }

        combinedSeen.add(key);
        combined.push(item);

        if (combined.length >= 16) {
          break;
        }
      }

      return Response.json({
        movies:
          combined,
      });
    }

    /*
     * TV SEASON EPISODES
     */
    if (
      movieId &&
      mediaType ===
        'tv' &&
      seasonNumber !==
        undefined &&
      seasonNumber !==
        null &&
      seasonNumber !==
        ''
    ) {
      const sRes =
        await fetch(
          `${TMDB_BASE}/tv/${movieId}/season/${seasonNumber}?api_key=${apiKey}&language=en-GB`,
          {
            headers: {
              Accept:
                'application/json',
            },
          }
        );

      if (!sRes.ok) {
        return Response.json(
          {
            error:
              `TMDB error: ${sRes.status}`,
          },
          {
            status:
              502,
          }
        );
      }

      const sData =
        await sRes.json();

      const episodes =
        (
          sData.episodes ||
          []
        ).map(
          (e) => ({
            episode_number:
              e.episode_number,

            name:
              e.name ||
              `Episode ${e.episode_number}`,

            overview:
              e.overview ||
              '',

            still_url:
              e.still_path
                ? `https://image.tmdb.org/t/p/w300${e.still_path}`
                : '',

            air_date:
              e.air_date ||
              '',

            runtime:
              (
                e.runtime ||
                (
                  e.episode_run_time ||
                  []
                )[0]
              ) ||
              '',
          })
        );

      return Response.json({
        season_name:
          sData.name ||
          `Season ${seasonNumber}`,

        episodes,
      });
    }

    /*
     * DETAILS
     * TRAILER
     * PROVIDERS
     * CAST
     */
    if (
      movieId
    ) {
      const vRes =
        await fetch(
          `${TMDB_BASE}/${mediaType}/${movieId}/videos?api_key=${apiKey}&language=en-GB`,
          {
            headers: {
              Accept:
                'application/json',
            },
          }
        );

      if (!vRes.ok) {
        return Response.json(
          {
            error:
              `TMDB error: ${vRes.status}`,
          },
          {
            status:
              502,
          }
        );
      }

      const vData =
        await vRes.json();

      const results =
        vData.results ||
        [];

      const yt =
        results.find(
          (v) =>
            v.site ===
              'YouTube' &&
            v.type ===
              'Trailer'
        ) ||
        results.find(
          (v) =>
            v.site ===
            'YouTube'
        );

      const key =
        yt?.key ||
        '';

      let providers =
        [];

      try {
        const wRes =
          await fetch(
            `${TMDB_BASE}/${mediaType}/${movieId}/watch/providers?api_key=${apiKey}`,
            {
              headers: {
                Accept:
                  'application/json',
              },
            }
          );

        if (
          wRes.ok
        ) {
          const wData =
            await wRes.json();

          const providerResults =
            wData.results ||
            {};

          const regionData =
            providerResults[
              region
            ] ||
            {};

          const link =
            regionData.link ||
            '';

          const tierMap = [
            [
              'flatrate',
              'Subscription',
            ],
            [
              'free',
              'Free',
            ],
            [
              'ads',
              'Free with Ads',
            ],
            [
              'rent',
              'Rent',
            ],
            [
              'buy',
              'Buy',
            ],
          ];

          const seen =
            new Set();

          const out =
            [];

          for (
            const [
              keyName,
              tier,
            ] of
            tierMap
          ) {
            for (
              const p of
              regionData[
                keyName
              ] ||
              []
            ) {
              if (
                !p.provider_id ||
                seen.has(
                  p.provider_id
                )
              ) {
                continue;
              }

              seen.add(
                p.provider_id
              );

              out.push({
                name:
                  p.provider_name,

                logo:
                  p.logo_path
                    ? `https://image.tmdb.org/t/p/w92${p.logo_path}`
                    : '',

                tier,

                link,
              });
            }

            if (
              out.length >=
              12
            ) {
              break;
            }
          }

          providers =
            out;
        }
      } catch {
        providers =
          [];
      }

      let details =
        {};

      let cast =
        [];

      let related =
        [];

      try {
        const dRes =
          await fetch(
            `${TMDB_BASE}/${mediaType}/${movieId}?api_key=${apiKey}&language=en-GB`,
            {
              headers: {
                Accept:
                  'application/json',
              },
            }
          );

        if (
          dRes.ok
        ) {
          const d =
            await dRes.json();

          details = {
            overview:
              d.overview ||
              '',

            rating:
              d.vote_average
                ? Number(
                    d.vote_average
                  ).toFixed(
                    1
                  )
                : '',

            runtime:
              mediaType ===
              'tv'
                ? (
                    d.episode_run_time ||
                    []
                  )[0]
                : d.runtime,

            genres:
              (
                d.genres ||
                []
              ).map(
                (g) =>
                  g.name
              ),

            genre_ids:
              (
                d.genres ||
                []
              ).map(
                (g) =>
                  g.id
              ),

            backdrop_url:
              d.backdrop_path
                ? `${BACKDROP_BASE}${d.backdrop_path}`
                : '',

            release_date:
              d.release_date ||
              d.first_air_date ||
              '',

            seasons:
              mediaType ===
              'tv'
                ? (
                    d.seasons ||
                    []
                  )
                    .filter(
                      (s) =>
                        s.season_number !==
                        0
                    )
                    .map(
                      (s) => ({
                        season_number:
                          s.season_number,

                        name:
                          s.name,

                        episode_count:
                          s.episode_count,

                        poster_url:
                          s.poster_path
                            ? `https://image.tmdb.org/t/p/w185${s.poster_path}`
                            : '',
                      })
                    )
                : [],
          };
        }
      } catch {
        details =
          {};
      }

      try {
        const cRes =
          await fetch(
            `${TMDB_BASE}/${mediaType}/${movieId}/credits?api_key=${apiKey}&language=en-GB`,
            {
              headers: {
                Accept:
                  'application/json',
              },
            }
          );

        if (
          cRes.ok
        ) {
          const cData =
            await cRes.json();

          cast =
            (
              cData.cast ||
              []
            )
              .slice(
                0,
                12
              )
              .map(
                (c) => ({
                  name:
                    c.name,

                  character:
                    c.character,

                  profile_url:
                    c.profile_path
                      ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
                      : '',
                })
              );
        }
      } catch {
        cast =
          [];
      }

      /*
       * Keep recommendation cards tied to the exact TMDB title. The
       * recommendations endpoint gives the strongest relationship signal;
       * similar titles fill any gaps. Both stay on the same media type so a
       * movie card cannot silently turn into a TV result (or vice versa).
       */
      try {
        const relatedParams =
          new URLSearchParams({
            api_key:
              apiKey,
            language:
              'en-GB',
            page:
              '1',
          });

        const [
          recommendationsResponse,
          similarResponse,
        ] =
          await Promise.all([
            fetch(
              `${TMDB_BASE}/${mediaType}/${movieId}/recommendations?${relatedParams.toString()}`,
              {
                headers: {
                  Accept:
                    'application/json',
                },
              }
            ).catch(
              () =>
                null
            ),
            fetch(
              `${TMDB_BASE}/${mediaType}/${movieId}/similar?${relatedParams.toString()}`,
              {
                headers: {
                  Accept:
                    'application/json',
                },
              }
            ).catch(
              () =>
                null
            ),
          ]);

        const relatedLists =
          await Promise.all(
            [
              recommendationsResponse,
              similarResponse,
            ].map(
              async (
                response
              ) => {
                if (
                  !response?.ok
                ) {
                  return [];
                }

                try {
                  const data =
                    await response.json();

                  return Array.isArray(
                    data?.results
                  )
                    ? data.results
                    : [];
                } catch {
                  return [];
                }
              }
            )
          );

        const seenRelated =
          new Set([
            String(
              movieId
            ),
          ]);

        related =
          relatedLists
            .flat()
            .map(
              (candidate) =>
                mapItem(
                  candidate,
                  mediaType
                )
            )
            .filter(
              (candidate) => {
                const id =
                  String(
                    candidate?.tmdb_id ||
                      candidate?.id ||
                      ''
                  );

                if (
                  !id ||
                  seenRelated.has(
                    id
                  )
                ) {
                  return false;
                }

                seenRelated.add(
                  id
                );

                return Boolean(
                  candidate?.title
                );
              }
            )
            .slice(
              0,
              24
            );
      } catch {
        related =
          [];
      }

      return Response.json({
        trailer_key:
          key,

        trailer_url:
          key
            ? `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&mute=1&rel=0&playsinline=1`
            : '',

        watch_providers:
          providers,

        details,

        cast,

        related,
      });
    }

    const category =
      body.category ||
      (
        mediaType ===
        'tv'
          ? 'tv_popular'
          : 'now_playing'
      );

    /*
     * TRENDING
     */
    if (
      category ===
      'trending'
    ) {
      const trendUrl =
        (page) =>
          `${TMDB_BASE}/trending/all/week?api_key=${apiKey}&language=en-GB&page=${page}`;

      const trendPages =
        await Promise.all(
          Array.from(
            {
              length:
                3,
            },
            (
              _,
              i
            ) =>
              fetch(
                trendUrl(
                  i + 1
                ),
                {
                  headers: {
                    Accept:
                      'application/json',
                  },
                }
              )
                .then(
                  (r) =>
                    r.ok
                      ? r.json()
                      : {
                          results:
                            [],
                        }
                )
                .catch(
                  () => ({
                    results:
                      [],
                  })
                )
          )
        );

      const seen =
        new Set();

      const merged =
        [];

      for (
        const data of
        trendPages
      ) {
        for (
          const m of
          data.results ||
          []
        ) {
          if (
            !m ||
            seen.has(
              m.id
            )
          ) {
            continue;
          }

          seen.add(
            m.id
          );

          merged.push(
            m
          );
        }
      }

      return Response.json({
        movies:
          merged.map(
            (m) =>
              mapItem(
                m
              )
          ),
      });
    }

    const query =
      body.query ||
      '';

    const parsedBrowseSearch =
      query
        ? parseSearchQuery(query)
        : {
            raw: '',
            title: '',
            year: '',
          };

    const hasFilters =
      country ||
      genre ||
      year ||
      language ||
      providerIds.length > 0;

    const includeGlobalReleases =
      mediaType === 'movie' &&
      Boolean(body.include_global_releases) &&
      !query &&
      providerIds.length === 0 &&
      [
        'now_playing',
        'upcoming',
        'movie_released_today',
      ].includes(category);

    const buildUrl =
      (page) => {
        /*
         * EXACT FILM RELEASES TODAY
         */
        if (
          category ===
          'movie_released_today'
        ) {
          const params =
            new URLSearchParams({
              api_key:
                apiKey,

              language:
                'en-GB',

              region,

              sort_by:
                'popularity.desc',

              include_adult:
                'false',

              page:
                String(
                  page
                ),

              'release_date.gte':
                requestedDate,

              'release_date.lte':
                requestedDate,
            });

          return `${TMDB_BASE}/discover/movie?${params.toString()}`;
        }

        /*
         * SEARCH
         */
        if (
          query
        ) {
          const params =
            new URLSearchParams({
              api_key:
                apiKey,

              language:
                'en-GB',

              query:
                parsedBrowseSearch.title || query,

              page:
                String(
                  page
                ),

              include_adult:
                'false',

              region,
            });

          return `${TMDB_BASE}/search/${mediaType}?${params.toString()}`;
        }

        /*
         * DISCOVER FILTERS
         */
        if (
          hasFilters
        ) {
          const params =
            new URLSearchParams({
              api_key:
                apiKey,

              language:
                'en-GB',

              sort_by:
                'popularity.desc',

              page:
                String(
                  page
                ),

              include_adult:
                'false',
            });

          if (
            country
          ) {
            params.set(
              'with_origin_country',
              country
            );
          }

          if (
            genre
          ) {
            params.set(
              'with_genres',
              genre
            );
          }

          if (
            year
          ) {
            if (
              mediaType ===
              'tv'
            ) {
              params.set(
                'first_air_date_year',
                year
              );
            } else {
              params.set(
                'primary_release_year',
                year
              );
            }
          }

          if (
            language
          ) {
            params.set(
              'with_original_language',
              language
            );
          }

          if (
            providerIds.length > 0
          ) {
            params.set(
              'watch_region',
              region
            );
            params.set(
              'with_watch_providers',
              providerIds.join('|')
            );
            params.set(
              'with_watch_monetization_types',
              'flatrate|free|ads'
            );
          }

          if (
            mediaType ===
            'movie'
          ) {
            params.set(
              'region',
              region
            );
          }

          return `${TMDB_BASE}/discover/${mediaType}?${params.toString()}`;
        }

        const path =
          mediaType ===
          'tv'
            ? (
                TV_ENDPOINTS[
                  category
                ] ||
                TV_ENDPOINTS.tv_popular
              )
            : (
                MOVIE_ENDPOINTS[
                  category
                ] ||
                MOVIE_ENDPOINTS.now_playing
              );

        const params =
          new URLSearchParams({
            api_key:
              apiKey,

            language:
              'en-GB',

            page:
              String(
                page
              ),
          });

        if (
          mediaType ===
          'movie'
        ) {
          params.set(
            'region',
            region
          );
        }

        if (
          category ===
          'tv_airing_today'
        ) {
          params.set(
            'timezone',
            timezone
          );
        }

        return `${TMDB_BASE}/${path}?${params.toString()}`;
      };

    const buildGlobalReleaseUrl =
      (page) => {
        const url = new URL(buildUrl(page));
        url.searchParams.delete('region');
        url.searchParams.delete('watch_region');
        url.searchParams.delete('with_origin_country');
        return url.toString();
      };

    const providerPageCount =
      Math.max(
        1,
        Math.min(
          10,
          Number(body.provider_pages || 3) || 3
        )
      );

    const pages =
      providerIds.length > 0
        ? providerPageCount
        : category ===
          'movie_released_today'
          ? 5
          : query
            ? 2
            : 3;

    const pageResults =
      await Promise.all(
        Array.from(
          {
            length:
              pages,
          },
          (
            _,
            i
          ) =>
            fetch(
              buildUrl(
                i + 1
              ),
              {
                headers: {
                  Accept:
                    'application/json',
                },
              }
            )
              .then(
                (r) =>
                  r.ok
                    ? r.json()
                    : {
                        results:
                          [],
                      }
              )
              .catch(
                () => ({
                  results:
                    [],
                })
              )
        )
      );

    const globalReleasedDates = new Map();

    if (includeGlobalReleases) {
      const globalPageCount = Math.min(pages, 3);
      const globalResults = await Promise.all(
        Array.from(
          { length: globalPageCount },
          (_, i) =>
            fetch(
              buildGlobalReleaseUrl(i + 1),
              {
                headers: {
                  Accept: 'application/json',
                },
              }
            )
              .then((r) =>
                r.ok
                  ? r.json()
                  : { results: [] }
              )
              .catch(() => ({ results: [] }))
        )
      );

      if (category === 'now_playing' || category === 'movie_released_today') {
        for (const data of globalResults) {
          for (const item of data?.results || []) {
            const id = String(item?.id || '');
            if (id) {
              globalReleasedDates.set(id, String(item?.release_date || requestedDate || ''));
            }
          }
        }
      }

      if (category === 'upcoming') {
        const globalNowPlayingResults = await Promise.all(
          Array.from(
            { length: globalPageCount },
            (_, i) => {
              const params = new URLSearchParams({
                api_key: apiKey,
                language: 'en-GB',
                page: String(i + 1),
              });

              return fetch(
                `${TMDB_BASE}/movie/now_playing?${params.toString()}`,
                {
                  headers: {
                    Accept: 'application/json',
                  },
                }
              )
                .then((r) =>
                  r.ok
                    ? r.json()
                    : { results: [] }
                )
                .catch(() => ({ results: [] }));
            }
          )
        );

        for (const data of globalNowPlayingResults) {
          for (const item of data?.results || []) {
            const id = String(item?.id || '');
            if (id) {
              globalReleasedDates.set(id, String(item?.release_date || ''));
            }
          }
        }

        pageResults.push(...globalNowPlayingResults);
      }

      pageResults.push(...globalResults);
    }

    const seen =
      new Set();

    const merged =
      [];

    for (
      const data of
      pageResults
    ) {
      for (
        const m of
        data.results ||
        []
      ) {
        if (
          !m ||
          seen.has(
            m.id
          )
        ) {
          continue;
        }

        seen.add(
          m.id
        );

        merged.push(
          m
        );
      }
    }

    if (query) {
      merged.sort(
        (a, b) =>
          searchResultScore(
            b,
            parsedBrowseSearch.title || query,
            parsedBrowseSearch.year,
            0
          ) -
            searchResultScore(
              a,
              parsedBrowseSearch.title || query,
              parsedBrowseSearch.year,
              0
            ) ||
          Number(b?.popularity || 0) - Number(a?.popularity || 0)
      );
    }

    const mappedItems =
      merged.map(
        (m) => ({
          ...mapItem(
            m,
            mediaType
          ),
          global_release_available:
            globalReleasedDates.has(String(m?.id || '')),
          global_release_date:
            globalReleasedDates.get(String(m?.id || '')) || '',
        })
      );

    const corrected =
      query
        ? await fetchSearchIdentityCorrections(
            query,
            mediaType,
            apiKey,
            region
          )
        : [];

    const overrides =
      query
        ? externalSearchOverrides(
            query,
            mediaType
          )
        : [];

    const items = [];
    const itemSeen = new Set();

    for (const item of [
      ...corrected,
      ...overrides,
      ...mappedItems,
    ]) {
      const key =
        `${item?.media_type || mediaType}:${item?.tmdb_id || item?.id || item?.imdb_id || item?.title || ''}`;

      if (!key || itemSeen.has(key)) {
        continue;
      }

      itemSeen.add(key);
      items.push(item);
    }

    return Response.json({
      movies:
        items,

      requested_date:
        requestedDate,

      region,

      timezone,
    });
  } catch (
    error
  ) {
    return Response.json(
      {
        error:
          error?.message ||
          'Unexpected TMDB error',
      },
      {
        status:
          500,
      }
    );
  }
}
