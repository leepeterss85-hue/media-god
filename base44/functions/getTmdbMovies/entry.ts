import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';
const PROVIDER_LOGO_BASE = 'https://image.tmdb.org/t/p/w92';

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
      data?.results?.GB ||
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
  const isTv =
    forcedType === 'tv' ||
    m.media_type === 'tv' ||
    (
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

export default async function(req) {
  try {
    const base44 =
      createClientFromRequest(
        req
      );

    const user =
      await base44.auth.me();

    if (!user) {
      return Response.json(
        {
          error:
            'Unauthorized',
        },
        {
          status:
            401,
        }
      );
    }

    let body = {};

    try {
      body =
        await req.json();
    } catch {
      body = {};
    }

    const mediaType =
      body.media_type ===
      'tv'
        ? 'tv'
        : 'movie';

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
        'GB'
      ).toUpperCase();

    const timezone =
      String(
        body.timezone ||
        'Europe/London'
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

      return Response.json({
        movies:
          items,
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
            providerResults.GB ||
            providerResults.US ||
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

    const hasFilters =
      country ||
      genre ||
      year ||
      language;

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

              query,

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

    const pages =
      category ===
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

    const items =
      merged.map(
        (m) =>
          mapItem(
            m,
            mediaType
          )
      );

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
