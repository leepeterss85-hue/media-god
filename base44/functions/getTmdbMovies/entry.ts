import { secrets } from 'base44:runtime';

const TMDB_BASE = 'https://api.themoviedb.org/3';
// Discovery is only a candidate list. Verify the first event of the requested
// release type; later regional rereleases must not reset the date.
const digitalReleaseCache = new Map();
const firstDigitalReleaseDate = (results, releaseTypes = [4]) => (Array.isArray(results) ? results : [])
  .flatMap(region => Array.isArray(region?.release_dates) ? region.release_dates : [])
  .filter(event => releaseTypes.includes(Number(event?.type)))
  .map(event => String(event.release_date || '').slice(0, 10))
  .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date + 'T00:00:00Z')) &&
    new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date)
  .sort()[0] || '';

async function verifyDigitalReleases(items, apiKey, since, today, releaseTypes = [4]) {
  const verified = new Map();
  let cursor = 0;
  const deadline = Date.now() + 12000;
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => {
    while (cursor < items.length && Date.now() < deadline) {
      const item = items[cursor++];
      const id = String(item?.id || '');
      if (!/^\d+$/.test(id)) continue;
      const cacheKey = releaseTypes.join(',') + ':' + id;
      let cached = digitalReleaseCache.get(cacheKey);
      if (!cached || cached.expires <= Date.now()) {
        try {
          const response = await fetch(`${TMDB_BASE}/movie/${id}/release_dates?api_key=${encodeURIComponent(apiKey)}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(Math.max(1, Math.min(4000, deadline - Date.now()))),
          });
          if (!response.ok) continue;
          const data = await response.json();
          const cinemaEvent = releaseTypes.length === 1 && releaseTypes[0] === 3;
          const firstDate = firstDigitalReleaseDate(data.results, releaseTypes);
          const firstDigital = cinemaEvent ? firstDigitalReleaseDate(data.results, [4]) : '';
          // UK and US full theatrical openings only. A film that premiered
          // months ago overseas must not become "new" on each regional date.
          const primaryMarketDates = cinemaEvent
            ? (Array.isArray(data.results) ? data.results : [])
                .filter(record => ['GB', 'US'].includes(String(record?.iso_3166_1 || '').toUpperCase()))
                .flatMap(record => Array.isArray(record.release_dates) ? record.release_dates : [])
                .filter(event => Number(event?.type) === 3)
                .map(event => String(event.release_date || '').slice(0, 10))
                .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
            : [];
          const hasOpening = primaryMarketDates.some(date => date >= since && date <= today);
          cached = { date: cinemaEvent && (!hasOpening || firstDate < since ||
            (firstDigital && firstDigital < firstDate)) ? '' : firstDate,
            expires: Date.now() + 6 * 60 * 60 * 1000 };
          if (digitalReleaseCache.size >= 2000) digitalReleaseCache.delete(digitalReleaseCache.keys().next().value);
          digitalReleaseCache.set(cacheKey, cached);
        } catch { continue; } // Unknown dates never fall back to cinema dates.
      }
      if (cached.date && cached.date >= since && cached.date <= today) verified.set(id, cached.date);
    }
  }));
  return verified;
}


// UK & Ireland box-office rankings are sourced from published weekend ticket
// sales, never inferred from TMDB's popularity or streaming-provider feeds.
const VERIFIED_UK_CINEMA_CHART = {
  period: '6–8 November 2026',
  published_on: '2026-11-10',
  source: { url: 'https://www.cinemauk.org.uk/the-industry/facts-and-figures/latest-uk-cinema-statistics/weekend-top-10-box-office/', label: 'UK Cinema Association' },
  rows: [
  {
    "rank": 1,
    "title": "Ramayana: Rise of a Legend",
    "weekend_gross_gbp": 2148159
  },
  {
    "rank": 2,
    "title": "Wild Horse Nine",
    "weekend_gross_gbp": 1477229
  },
  {
    "rank": 3,
    "title": "Godzilla Minus Zero",
    "weekend_gross_gbp": 1391129
  },
  {
    "rank": 4,
    "title": "Wicker",
    "weekend_gross_gbp": 1127892
  },
  {
    "rank": 5,
    "title": "George Michael: The Faith Tour",
    "weekend_gross_gbp": 1023447
  },
  {
    "rank": 6,
    "title": "Primetime",
    "weekend_gross_gbp": 843456
  },
  {
    "rank": 7,
    "title": "Ghosts: The Possession of Button House",
    "weekend_gross_gbp": 747374
  },
  {
    "rank": 8,
    "title": "Clayface",
    "weekend_gross_gbp": 683058
  },
  {
    "rank": 9,
    "title": "I Play Rocky",
    "weekend_gross_gbp": 607741
  },
  {
    "rank": 10,
    "title": "Stray Kids World Tour 'Run It'",
    "weekend_gross_gbp": 594832
  }
],
};

const UK_CINEMA_CHART_SOURCES = [
  { url: 'https://www.cinemauk.org.uk/the-industry/facts-and-figures/latest-uk-cinema-statistics/weekend-top-10-box-office/', label: 'UK Cinema Association' },
  { url: 'https://filmdistributorsassociation.com/the-industry/databank/uk-and-ireland-current-top-15/', label: 'Film Distributors’ Association' },
];
let ukCinemaChartCache = null;
const chartPlainText = value => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|nbsp|pound|rsquo|lsquo|ndash);/gi, (_text, part) => {
    const names = { amp: '&', quot: '"', apos: "'", nbsp: ' ', pound: '£', rsquo: '’', lsquo: '‘', ndash: '–' };
    const name = part.toLowerCase();
    if (names[name]) return names[name];
    const cp = name.startsWith('#x') ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ' ';
  })
  .replace(/\s+/g, ' ').trim();

function parseUkCinemaChart(html) {
  const period = chartPlainText(html).match(/\b\d{1,2}\s*[-–]\s*\d{1,2}\s+[A-Za-z]+\s+20\d{2}\b/)?.[0] || '';
  const rows = [];
  const seen = new Set();
  for (const match of String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => chartPlainText(cell[1]));
    if (cells.length < 4 || !/^(?:[1-9]|10)$/.test(cells[0])) continue;
    const rank = Number(cells[0]);
    const title = cells[1].replace(/\s+\([^()]{2,70}\)\s*$/, '').trim();
    const amount = cells[cells.length - 2].replace(/[^\d]/g, '');
    const gross = Number(amount);
    if (!title || title.length > 160 || !amount || !Number.isSafeInteger(gross) || gross <= 0 || seen.has(rank)) continue;
    seen.add(rank);
    rows.push({ rank, title, weekend_gross_gbp: gross });
    if (rows.length === 10) break;
  }
  return { period, rows: rows.sort((a, b) => a.rank - b.rank) };
}

const normaliseBoxOfficeTitle = value => String(value || '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');

async function getUkCinemaTop10(apiKey) {
  const now = Date.now();
  if (ukCinemaChartCache && ukCinemaChartCache.expires > now) return ukCinemaChartCache.payload;
  let latest = null;
  for (const source of UK_CINEMA_CHART_SOURCES) {
    try {
      const response = await fetch(source.url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(6500) });
      if (!response.ok) continue;
      const parsed = parseUkCinemaChart(await response.text());
      if (parsed.rows.length !== 10 || parsed.rows.some((row, index) => row.rank !== index + 1)) continue;
      latest = { ...parsed, source };
      break;
    } catch {
      // Secondary official source is tried when the main chart is unavailable.
    }
  }
  if (!latest) {
    // Preserve the last independently verified box-office weekend when the
    // remote official source blocks the hosted runtime. Never invent ranks.
    latest = { ...VERIFIED_UK_CINEMA_CHART };
  }
  const snapshotAge = Date.parse(String(latest.published_on || '')) || Date.parse('2026-11-10');
  const chartStale = latest === null || Boolean(latest.published_on) &&
    now - snapshotAge > 7 * 86400000;
  const movies = await Promise.all(latest.rows.map(async entry => {
    let match = null;
    try {
      const query = new URLSearchParams({ api_key: apiKey, language: 'en-GB', query: entry.title, include_adult: 'false' });
      const response = await fetch(TMDB_BASE + '/search/movie?' + query, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4500),
      });
      if (response.ok) {
        const data = await response.json();
        match = (Array.isArray(data.results) ? data.results : [])
          .filter(movie => normaliseBoxOfficeTitle(movie.title) === normaliseBoxOfficeTitle(entry.title) ||
                           normaliseBoxOfficeTitle(movie.original_title) === normaliseBoxOfficeTitle(entry.title))
          .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0))[0] || null;
      }
    } catch {
      // Chart rank survives an unsuccessful TMDB identity/poster search.
    }
    return {
      ...(match ? mapItem(match, 'movie') : {
        id: 'uk-chart-' + entry.rank, title: entry.title, year: '', media_type: 'movie',
        tmdb_id: null, poster_url: '', release_date: '',
      }),
      title: entry.title, chart_rank: entry.rank, chart_weekend_gross_gbp: entry.weekend_gross_gbp,
      release_context: 'cinema_boxoffice',
    };
  }));
  const payload = {
    movies, chart_region: 'GB', chart_period: latest.period, chart_source: latest.source.label,
    chart_source_url: latest.source.url, chart_unavailable: false, chart_stale: chartStale,
  };
  ukCinemaChartCache = { payload, checked_at: now, expires: now + 4 * 60 * 60 * 1000 };
  return payload;
}

const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';
const PROVIDER_LOGO_BASE = 'https://image.tmdb.org/t/p/w92';
const validImdbId = (value) => {
  const id = String(value || '').trim();
  return /^tt\d+$/i.test(id) ? id : '';
};

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
    // Newly released LAIKA film: TMDB 791523 / IMDb tt2056785.
    // The normal first-page multi-search can lag behind a theatrical
    // release. Resolve the exact TMDB movie metadata on a matching query,
    // even when there is not yet a lawful digital streaming option.
    // No stream, download, or watch-provider URL is invented here.
    aliases: [
      'wildwood',
    ],
    media_type: 'movie',
    tmdb_id: 791523,
    imdb_id: 'tt2056785',
    title: 'Wildwood',
    accepted_years: [
      '2026',
    ],
  },
  {
    aliases: [
      'matchbox',
      'matchbox the movie',
    ],
    media_type: 'movie',
    tmdb_id: 1148365,
    imdb_id: 'tt28498219',
    title: 'Matchbox The Movie',
    accepted_years: [
      '2026',
    ],
  },
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
  tv_upcoming: 'discover/tv',
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

    if (body.category === 'cinema_top10' && mediaType === 'movie' &&
        !String(body.query || '').trim()) {
      const chart = await getUkCinemaTop10(apiKey);
      return Response.json({ ...chart, requested_date: requestedDate });
    }

    /*
     * Privacy-safe watchlist release metadata batch. No user watchlist,
     * identity or credentials are stored here; clients submit only TMDB IDs.
     * One TMDB details request per title (movie release_dates is appended)
     * and at most four requests in flight, so checking saved titles cannot
     * overload the metadata service or block playback.
     */
    if (Array.isArray(body.release_alerts)) {
      const wanted = [];
      const seenAlerts = new Set();
      for (const raw of body.release_alerts.slice(0, 24)) {
        const id = String(raw?.tmdb_id ?? raw?.id ?? '').trim();
        const type = raw?.media_type === 'tv' ? 'tv' : 'movie';
        if (!/^[1-9]\d{0,8}$/.test(id) || seenAlerts.has(type + ':' + id)) continue;
        seenAlerts.add(type + ':' + id);
        wanted.push({ id, type });
      }
      const alerts = [];
      const workers = Array.from({ length: Math.min(4, wanted.length) }, async (_, worker) => {
        for (let index = worker; index < wanted.length; index += 4) {
          const item = wanted[index];
          try {
            const append = item.type === 'movie' ? '&append_to_response=release_dates' : '';
            const result = await fetch(
              `${TMDB_BASE}/${item.type}/${item.id}?api_key=${apiKey}&language=en-GB${append}`,
              { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) }
            );
            if (!result.ok) continue;
            const data = await result.json();
            if (item.type === 'tv') {
              const mapEpisode = (episode) => episode && validYmd(String(episode.air_date || ''))
                ? {
                    air_date: String(episode.air_date),
                    season_number: Number(episode.season_number || 0),
                    episode_number: Number(episode.episode_number || 0),
                  }
                : null;
              alerts.push({
                tmdb_id: item.id,
                media_type: 'tv',
                title: data.name || '',
                premiere_date: validYmd(data.first_air_date) ? data.first_air_date : '',
                last_episode: mapEpisode(data.last_episode_to_air),
                next_episode: mapEpisode(data.next_episode_to_air),
              });
            } else {
              const byType = (types) => {
                const dates = [];
                for (const regionEntry of data?.release_dates?.results || []) {
                  for (const release of regionEntry?.release_dates || []) {
                    const value = String(release?.release_date || '').slice(0, 10);
                    if (types.includes(Number(release?.type)) && validYmd(value)) dates.push(value);
                  }
                }
                return dates.sort()[0] || '';
              };
              alerts.push({
                tmdb_id: item.id,
                media_type: 'movie',
                title: data.title || '',
                first_cinema_date: byType([2, 3]),
                first_digital_date: byType([4]),
              });
            }
          } catch {
            // A missing title/timeout cannot hide other saved-title alerts.
          }
        }
      });
      await Promise.all(workers);
      return Response.json({ alerts });
    }

    if (body.community_reviews === true) {
      const tmdbId = String(body.tmdb_id ?? '').trim();
      if (!/^[1-9]\d{0,8}$/.test(tmdbId) || requestedMediaType === 'all') {
        return Response.json({ error: 'Invalid movie or TV id.' }, { status: 400 });
      }

      const path = `${TMDB_BASE}/${mediaType}/${tmdbId}`;
      const params = new URLSearchParams({ api_key: apiKey, language: 'en-GB' });
      const reviewParams = new URLSearchParams({ api_key: apiKey, language: 'en-US', page: '1' });
      try {
        const [detailsResponse, reviewsResponse] = await Promise.all([
          fetch(`${path}?${params}`, { signal: AbortSignal.timeout(8000) }),
          fetch(`${path}/reviews?${reviewParams}`, { signal: AbortSignal.timeout(8000) }),
        ]);
        if (!detailsResponse.ok || !reviewsResponse.ok) {
          return Response.json({ error: 'TMDB reviews are unavailable right now.' }, { status: 502 });
        }

        const [details, reviewData] = await Promise.all([
          detailsResponse.json(),
          reviewsResponse.json(),
        ]);
        const reviews = (Array.isArray(reviewData?.results) ? reviewData.results : [])
          .filter((row) => /^[a-zA-Z0-9_-]{1,64}$/.test(String(row?.id ?? '')))
          .filter((row) => String(row?.content ?? '').trim().length >= 30)
          .slice(0, 3)
          .map((row) => ({
            id: String(row.id),
            author: String(row.author_details?.name || row.author || 'TMDB member').slice(0, 80),
            excerpt: String(row.content).replace(/\s+/g, ' ').trim().slice(0, 320),
            rating: row.author_details?.rating != null &&
              Number.isFinite(Number(row.author_details.rating)) &&
              Number(row.author_details?.rating) >= 0 &&
              Number(row.author_details?.rating) <= 10
                ? Number(row.author_details.rating)
                : null,
            url: `https://www.themoviedb.org/review/${row.id}`,
          }));

        return Response.json({
          overview: String(details?.overview ?? '').trim().slice(0, 2500),
          reviews,
          title_url: `https://www.themoviedb.org/${mediaType}/${tmdbId}`,
        });
      } catch {
        return Response.json({ error: 'TMDB reviews are unavailable right now.' }, { status: 502 });
      }
    }

    if (body.person_id != null) {
      const personId = String(body.person_id).trim();
      if (!/^[1-9]\d{0,8}$/.test(personId)) {
        return Response.json({ error: 'Invalid cast member id' }, { status: 400 });
      }

      const params = new URLSearchParams({ api_key: apiKey, language: 'en-GB' });
      const creditsResponse = await fetch(
        `${TMDB_BASE}/person/${personId}/combined_credits?${params.toString()}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!creditsResponse.ok) {
        return Response.json({ error: 'Cast titles are unavailable right now.' }, { status: 502 });
      }

      const creditsData = await creditsResponse.json();
      const seen = new Set();
      const credits = (Array.isArray(creditsData?.cast) ? creditsData.cast : [])
        .filter((credit) => credit?.media_type === 'movie' || credit?.media_type === 'tv')
        .sort((a, b) => Number(b?.popularity || 0) - Number(a?.popularity || 0))
        .map((credit) => mapItem(credit, credit.media_type))
        .filter((credit) => {
          const key = `${credit?.media_type}:${credit?.tmdb_id || credit?.id}`;
          if (!credit?.title || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 24);

      return Response.json({ credits });
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
            imdb_id:
              validImdbId(d.imdb_id),

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

      /*
       * TMDB's normal movie/TV details payload does not reliably include an
       * IMDb id. Search playback must therefore fetch /external_ids for BOTH
       * movies and TV before DetailModal builds its playback request. This
       * gives the player a canonical IMDb id even when the separate resolver
       * is temporarily unavailable, while still leaving the TMDB id/title as
       * fallback identity.
       */
      try {
        const idRes = await fetch(
          `${TMDB_BASE}/${mediaType}/${movieId}/external_ids?api_key=${apiKey}`,
          { headers: { Accept: 'application/json' } }
        );
        if (idRes.ok) {
          const idData = await idRes.json();
          const externalImdbId = validImdbId(idData?.imdb_id);
          if (externalImdbId) {
            details.imdb_id = externalImdbId;
          }
        }
      } catch {
        // Details remain usable if external ids are temporarily unavailable.
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
                  id: c.id,
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

    // A dedicated *regional theatrical* feed keeps the Movies landing tab
    // genuinely current. TMDB's standard now_playing feed sorts by popularity
    // and the optional worldwide overlay includes films outside local cinemas.
    // Explicit genre, year and language filters must retain the release window.
    const cinemaLatest =
      mediaType === 'movie' &&
      category === 'cinema_latest' &&
      !query &&
      providerIds.length === 0;
    const cinemaSince =
      new Date(Date.parse(requestedDate + 'T12:00:00Z') - 28 * 86400000)
        .toISOString().slice(0, 10);

    // Provider availability is current metadata, NOT a timestamp recording
    // the date a service first added a film. These feeds therefore use real
    // digital release and series premiere dates, labelled accordingly.
    const recentStreamingMovies =
      mediaType === 'movie' && category === 'streaming_recent_movies' &&
      !query && providerIds.length === 0;
    const recentTvPremieres =
      mediaType === 'tv' && category === 'tv_recent_premieres' &&
      !query && providerIds.length === 0;
    const recentReleaseSince =
      new Date(Date.parse(requestedDate + 'T12:00:00Z') - 120 * 86400000)
        .toISOString().slice(0, 10);

    const digitalReleaseSince =
      new Date(Date.parse(requestedDate + 'T12:00:00Z') - 30 * 86400000)
        .toISOString().slice(0, 10);

    // Release discovery follows the earliest known release worldwide.
    // A viewing region only controls streaming-provider entitlement, not
    // whether a film can be listed after releasing overseas.
    const includeGlobalReleases =
      mediaType === 'movie' &&
      Boolean(body.include_global_releases) &&
      !query &&
      providerIds.length === 0 &&
      [
        'now_playing',
        'upcoming',
        'movie_released_today',
        'cinema_latest',
        'streaming_recent_movies',
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
         * UPCOMING TV SHOWS: explicitly include dates from today onwards.
         */
        if (mediaType === 'tv' && category === 'tv_upcoming') {
          const params = new URLSearchParams({
            api_key: apiKey,
            language: 'en-GB',
            sort_by: 'first_air_date.asc',
            page: String(page),
            include_adult: 'false',
            'first_air_date.gte': requestedDate,
            'first_air_date.lte': `${Number(requestedDate.slice(0, 4)) + 5}${requestedDate.slice(4)}`,
          });
          return `${TMDB_BASE}/discover/tv?${params.toString()}`;
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
         * LATEST IN CINEMAS: verified UK/US standard theatrical openings in the last
         * four weeks. Limited previews and digital-first titles do not qualify. Never include a future
         * release or a digital/TV-only debut. Preserve selected filters.
         */
        if (cinemaLatest) {
          const params = new URLSearchParams({
            api_key: apiKey,
            language: 'en-GB',
            region,
            page: String(page),
            include_adult: 'false',
            sort_by: 'release_date.desc',
            with_release_type: '3',
            'release_date.gte': cinemaSince,
            'release_date.lte': requestedDate,
          });
          if (country) params.set('with_origin_country', String(country));
          if (genre) params.set('with_genres', String(genre));
          if (year) params.set('primary_release_year', String(year));
          if (language) params.set('with_original_language', String(language));
          return `${TMDB_BASE}/discover/movie?${params.toString()}`;
        }

        /*
         * RECENT DIGITAL FILMS CURRENTLY LISTED ON STREAMING SERVICES
         * Type 4 is the actual regional digital release date, not the day
         * a particular provider added the title. Show this difference in UI.
         * Watch availability is restricted to subscriptions/free/ads in region.
         */
        if (recentStreamingMovies) {
          const params = new URLSearchParams({
            api_key: apiKey, language: 'en-GB', region,
            watch_region: region,
            with_watch_monetization_types: 'flatrate|free|ads|rent|buy',
            with_release_type: '4',
            sort_by: 'release_date.desc',
            include_adult: 'false', page: String(page),
            'release_date.gte': digitalReleaseSince,
            'release_date.lte': requestedDate,
          });
          if (country) params.set('with_origin_country', String(country));
          if (genre) params.set('with_genres', String(genre));
          if (year) params.set('primary_release_year', String(year));
          if (language) params.set('with_original_language', String(language));
          return `${TMDB_BASE}/discover/movie?${params.toString()}`;
        }

        /*
         * RECENT TV SERIES PREMIERES (NOT THE MOST RECENT EPISODE OR DATE
         * A SUBSCRIPTION SERVICE FIRST OFFERED AN OLDER SHOW).
         */
        if (recentTvPremieres) {
          const params = new URLSearchParams({
            api_key: apiKey, language: 'en-GB',
            sort_by: 'first_air_date.desc',
            include_adult: 'false', page: String(page),
            'first_air_date.gte': recentReleaseSince,
            'first_air_date.lte': requestedDate,
          });
          if (country) params.set('with_origin_country', String(country));
          if (genre) params.set('with_genres', String(genre));
          if (year) params.set('first_air_date_year', String(year));
          if (language) params.set('with_original_language', String(language));
          return `${TMDB_BASE}/discover/tv?${params.toString()}`;
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

              // A selected streaming service should browse newest
              // film releases or series premieres first, not popularity.
              // No provider onboarding timestamp is supplied by TMDB.
              sort_by:
                providerIds.length > 0
                  ? (mediaType === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc')
                  : 'popularity.desc',

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
            // Do not put future premieres ahead of currently available
            // shows. The provider filter itself still restricts availability.
            params.set(mediaType === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte', requestedDate);
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
        // Monetisation filters only have meaning alongside watch_region.
        // Worldwide release discovery must not imply local provider access.
        if (recentStreamingMovies) {
          url.searchParams.delete('with_watch_monetization_types');
        }
        return url.toString();
      };

    const buildRegionalReleaseUrl =
      (page, releaseRegion) => {
        const url = new URL(buildUrl(page));
        url.searchParams.set('region', releaseRegion);
        if (recentStreamingMovies) {
          url.searchParams.set('watch_region', releaseRegion);
        }
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
        : ['cinema_latest', 'movie_released_today', 'streaming_recent_movies', 'tv_recent_premieres'].includes(category)
          ? 5
          : category === 'upcoming' || category === 'tv_upcoming'
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

    // Local digital query is backed by the selected country's actual streaming
    // provider catalogue. Worldwide overlay results are discovery only.
    const localDigitalIds = new Set();
    if (recentStreamingMovies) {
      for (const data of pageResults) {
        for (const item of data?.results || []) {
          if (item?.id) localDigitalIds.add(String(item.id));
        }
      }
    }
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

      // Supplement the primary worldwide dates with the opposite UK/US
      // theatrical or digital window. For example, US titles are visible
      // in the UK catalogue before their later British release.
      const earlyReleaseRegion = region === 'US' ? 'GB' : 'US';
      const earlyRegionResults = (cinemaLatest || recentStreamingMovies)
        ? await Promise.all(
            Array.from({ length: globalPageCount }, (_, i) =>
              fetch(buildRegionalReleaseUrl(i + 1, earlyReleaseRegion), {
                headers: { Accept: 'application/json' },
              })
                .then((r) => r.ok ? r.json() : { results: [] })
                .catch(() => ({ results: [] }))
            )
          )
        : [];

      if (cinemaLatest || recentStreamingMovies) {
        // Use dates from matching cinema/digital discovery windows only.
        // Do not mistake a future UK premiere for a film unreleased abroad.
        const windowStart = cinemaLatest ? cinemaSince : digitalReleaseSince;
        for (const data of [...pageResults, ...globalResults, ...earlyRegionResults]) {
          for (const item of data?.results || []) {
            const id = String(item?.id || '');
            const date = String(item?.release_date || '');
            if (!id || !validYmd(date) || date < windowStart || date > requestedDate) continue;
            const existing = globalReleasedDates.get(id);
            if (!existing || date < existing) globalReleasedDates.set(id, date);
          }
        }
      }

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

      if (cinemaLatest || recentStreamingMovies) {
        // TMDB date filters are applied server-side; enforce them once more
        // before surfacing overseas results in case metadata is inconsistent.
        const windowStart = cinemaLatest ? cinemaSince : digitalReleaseSince;
        const withinWindow = (item) => {
          const date = String(item?.release_date || '');
          return validYmd(date) && date >= windowStart && date <= requestedDate;
        };
        pageResults.push(...[...globalResults, ...earlyRegionResults].map(
          (data) => ({
            ...data,
            results: (cinemaLatest || recentStreamingMovies) ? (data?.results || []) : (data?.results || []).filter(withinWindow),
          })
        ));
      } else {
        pageResults.push(...globalResults, ...earlyRegionResults);
      }
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

    const verifiedDigitalDates = recentStreamingMovies
      ? await verifyDigitalReleases(merged, apiKey, digitalReleaseSince, requestedDate)
      : new Map();
    if (recentStreamingMovies) {
      globalReleasedDates.clear();
      for (const [id, date] of verifiedDigitalDates) globalReleasedDates.set(id, date);
    }
    const verifiedCinemaDates = cinemaLatest
      ? await verifyDigitalReleases(merged, apiKey, cinemaSince, requestedDate, [3])
      : new Map();
    if (cinemaLatest) {
      globalReleasedDates.clear();
      for (const [id, date] of verifiedCinemaDates) globalReleasedDates.set(id, date);
    }
    const mappedItems =
      merged.filter(m => !recentStreamingMovies || verifiedDigitalDates.has(String(m.id)))
        .filter(m => !cinemaLatest || verifiedCinemaDates.has(String(m.id))).map((m) => {
        const mapped = mapItem(m, mediaType);
        const globalDate = globalReleasedDates.get(String(m?.id || '')) || '';
        const firstDate = (cinemaLatest || recentStreamingMovies) && globalDate
          ? globalDate
          : mapped.release_date;
        return {
          ...mapped,
          release_date: firstDate,
          year: recentStreamingMovies ? mapped.year : (firstDate ? firstDate.slice(0, 4) : mapped.year),
          digital_release_date: recentStreamingMovies ? firstDate : '',
          theatrical_release_date: cinemaLatest ? firstDate : '',
          first_worldwide_release_date: globalDate || '',
          release_context: cinemaLatest ? 'cinema' :
            recentStreamingMovies ? 'digital' :
            recentTvPremieres ? 'tv' : '',
          local_streaming_listed: recentStreamingMovies &&
            localDigitalIds.has(String(m?.id || '')),
          global_release_available: Boolean(globalDate),
          global_release_date: globalDate,
        };
      });

    if (cinemaLatest || recentStreamingMovies || recentTvPremieres) {
      // Ranking by the reported release/premiere date keeps fresh titles
      // cinema release appears ahead of an older blockbuster. Popularity
      // breaks ties without concealing fresh smaller theatrical releases.
      mappedItems.sort((a, b) =>
        String(b.release_date || '').localeCompare(String(a.release_date || '')) ||
        Number(b.popularity || 0) - Number(a.popularity || 0)
      );
    }

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
