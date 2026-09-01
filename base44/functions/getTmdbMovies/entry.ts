import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

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

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const mediaType = body.media_type === 'tv' ? 'tv' : 'movie';
    const country = body.country || '';
    const genre = body.genre || '';
    const year = body.year || '';
    const language = body.language || '';
    const movieId = body.movie_id;
    const seasonNumber = body.season_number;

    const apiKey = secrets.get('TMDB_API_KEY');
    if (!apiKey) return Response.json({ error: 'TMDB API key not configured' }, { status: 500 });

    // Season episodes for a TV show.
    if (movieId && mediaType === 'tv' && seasonNumber !== undefined && seasonNumber !== null && seasonNumber !== '') {
      const sRes = await fetch(
        `${TMDB_BASE}/tv/${movieId}/season/${seasonNumber}?api_key=${apiKey}&language=en-GB`,
        { headers: { Accept: 'application/json' } }
      );
      if (!sRes.ok) return Response.json({ error: `TMDB error: ${sRes.status}` }, { status: 502 });
      const sData = await sRes.json();
      const episodes = (sData.episodes || []).map((e) => ({
        episode_number: e.episode_number,
        name: e.name || `Episode ${e.episode_number}`,
        overview: e.overview || '',
        still_url: e.still_path ? `https://image.tmdb.org/t/p/w300${e.still_path}` : '',
        air_date: e.air_date || '',
        runtime: (e.runtime || (e.episode_run_time || [])[0]) || '',
      }));
      return Response.json({ season_name: sData.name || `Season ${seasonNumber}`, episodes });
    }

    // Trailer lookup for a specific movie or show
    if (movieId) {
      const vRes = await fetch(
        `${TMDB_BASE}/${mediaType}/${movieId}/videos?api_key=${apiKey}&language=en-GB`,
        { headers: { Accept: 'application/json' } }
      );
      if (!vRes.ok) return Response.json({ error: `TMDB error: ${vRes.status}` }, { status: 502 });
      const vData = await vRes.json();
      const results = vData.results || [];
      const yt = results.find((v) => v.site === 'YouTube' && v.type === 'Trailer')
        || results.find((v) => v.site === 'YouTube');
      const key = yt?.key || '';
      // Legal "where to watch" streaming providers (JustWatch data via TMDB).
      // Surfaces subscription (flatrate), free/ad-supported (free, ads), and
      // transactional (rent, buy) tiers so users land on a legal source.
      let providers = [];
      try {
        const wRes = await fetch(
          `${TMDB_BASE}/${mediaType}/${movieId}/watch/providers?api_key=${apiKey}`,
          { headers: { Accept: 'application/json' } }
        );
        if (wRes.ok) {
          const wData = await wRes.json();
          const results = wData.results || {};
          const region = results.GB || results.US || {};
          const link = region.link || '';
          const tierMap = [
            ['flatrate', 'Subscription'],
            ['free', 'Free'],
            ['ads', 'Free with Ads'],
            ['rent', 'Rent'],
            ['buy', 'Buy'],
          ];
          const seen = new Set();
          const out = [];
          for (const [key, tier] of tierMap) {
            for (const p of region[key] || []) {
              if (!p.provider_id || seen.has(p.provider_id)) continue;
              seen.add(p.provider_id);
              out.push({
                name: p.provider_name,
                logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : '',
                tier,
                link,
              });
            }
            if (out.length >= 12) break;
          }
          providers = out;
        }
      } catch {}

      // Full details + cast for the detail popup.
      let details = {};
      let cast = [];
      try {
        const dRes = await fetch(
          `${TMDB_BASE}/${mediaType}/${movieId}?api_key=${apiKey}&language=en-GB`,
          { headers: { Accept: 'application/json' } }
        );
        if (dRes.ok) {
          const d = await dRes.json();
          details = {
            overview: d.overview || '',
            rating: d.vote_average ? Number(d.vote_average).toFixed(1) : '',
            runtime: mediaType === 'tv' ? (d.episode_run_time || [])[0] : d.runtime,
            genres: (d.genres || []).map((g) => g.name),
            backdrop_url: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : '',
            release_date: d.release_date || d.first_air_date || '',
            seasons: mediaType === 'tv' ? (d.seasons || [])
              .filter((s) => s.season_number !== 0)
              .map((s) => ({ season_number: s.season_number, name: s.name, episode_count: s.episode_count, poster_url: s.poster_path ? `https://image.tmdb.org/t/p/w185${s.poster_path}` : '' })) : [],
          };
        }
      } catch {}
      try {
        const cRes = await fetch(
          `${TMDB_BASE}/${mediaType}/${movieId}/credits?api_key=${apiKey}&language=en-GB`,
          { headers: { Accept: 'application/json' } }
        );
        if (cRes.ok) {
          const cData = await cRes.json();
          cast = (cData.cast || []).slice(0, 12).map((c) => ({
            name: c.name,
            character: c.character,
            profile_url: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : '',
          }));
        }
      } catch {}

      return Response.json({
        trailer_key: key,
        trailer_url: key ? `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&mute=1&rel=0&playsinline=1` : '',
        watch_providers: providers,
        details,
        cast,
      });
    }

    const category = body.category || (mediaType === 'tv' ? 'tv_popular' : 'now_playing');

    // Trending (all media types) for the home hero + row.
    if (category === 'trending') {
      const trendUrl = (page) => `${TMDB_BASE}/trending/all/week?api_key=${apiKey}&language=en-GB&page=${page}`;
      const trendPages = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          fetch(trendUrl(i + 1), { headers: { Accept: 'application/json' } })
            .then((r) => (r.ok ? r.json() : { results: [] }))
            .catch(() => ({ results: [] }))
        )
      );
      const seen = new Set();
      const merged = [];
      for (const data of trendPages) {
        for (const m of data.results || []) {
          if (!m || seen.has(m.id)) continue;
          seen.add(m.id);
          merged.push(m);
        }
      }
      const items = merged.map((m) => {
        const isTv = m.media_type === 'tv' || (!!m.name && !m.title);
        const title = isTv ? (m.name || m.title) : (m.title || m.name);
        const date = isTv ? (m.first_air_date || '') : (m.release_date || '');
        return {
          id: String(m.id),
          title,
          year: date.slice(0, 4),
          release_date: date,
          poster_url: m.poster_path ? `${IMG_BASE}${m.poster_path}` : '',
          backdrop_url: m.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : '',
          description: m.overview || '',
          tmdb_id: m.id,
          genre_ids: m.genre_ids || [],
          media_type: isTv ? 'tv' : 'movie',
          vote_average: m.vote_average || 0,
        };
      });
      return Response.json({ movies: items });
    }

    const query = body.query || '';

    const hasFilters = country || genre || year || language;

    // Build the base URL for a single page (page param appended per request).
    // Fetching several pages and merging surfaces far more new releases than
    // the single 20-item page TMDB returns by default — so newer or less
    // prominent titles (e.g. a fresh indie release) actually appear.
    const buildUrl = (page) => {
      if (query) {
        const params = new URLSearchParams({
          api_key: apiKey,
          language: 'en-GB',
          query,
          page: String(page),
          include_adult: 'false',
        });
        return `${TMDB_BASE}/search/${mediaType}?${params.toString()}`;
      }
      if (hasFilters) {
        const params = new URLSearchParams({
          api_key: apiKey,
          language: 'en-GB',
          sort_by: 'popularity.desc',
          page: String(page),
        });
        if (country) params.set('with_origin_country', country);
        if (genre) params.set('with_genres', genre);
        if (year) {
          if (mediaType === 'tv') params.set('first_air_date_year', year);
          else params.set('primary_release_year', year);
        }
        if (language) params.set('with_original_language', language);
        return `${TMDB_BASE}/discover/${mediaType}?${params.toString()}`;
      }
      const path = mediaType === 'tv' ? TV_ENDPOINTS[category] || TV_ENDPOINTS.tv_popular
        : MOVIE_ENDPOINTS[category] || MOVIE_ENDPOINTS.now_playing;
      return `${TMDB_BASE}/${path}?api_key=${apiKey}&language=en-GB&page=${page}`;
    };

    const PAGES = query ? 2 : 3;
    const pageResults = await Promise.all(
      Array.from({ length: PAGES }, (_, i) =>
        fetch(buildUrl(i + 1), { headers: { Accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : { results: [] }))
          .catch(() => ({ results: [] }))
      )
    );

    const seen = new Set();
    const merged = [];
    for (const data of pageResults) {
      for (const m of data.results || []) {
        if (!m || seen.has(m.id)) continue;
        seen.add(m.id);
        merged.push(m);
      }
    }

    const items = merged.map((m) => {
      const isTv = mediaType === 'tv' || !!m.name;
      const title = isTv ? (m.name || m.title) : (m.title || m.name);
      const date = isTv ? (m.first_air_date || '') : (m.release_date || '');
      return {
        id: String(m.id),
        title,
        year: date.slice(0, 4),
        release_date: date,
        poster_url: m.poster_path ? `${IMG_BASE}${m.poster_path}` : '',
        backdrop_url: m.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : '',
        description: m.overview || '',
        tmdb_id: m.id,
        genre_ids: m.genre_ids || [],
        media_type: isTv ? 'tv' : 'movie',
        vote_average: m.vote_average || 0,
      };
    });

    return Response.json({ movies: items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}