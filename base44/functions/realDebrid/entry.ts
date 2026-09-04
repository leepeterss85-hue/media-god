import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const RD_BASE = 'https://api.real-debrid.com/rest/1.0';
const VIDEO_RE = /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = user.rd_token;
    if (!token) {
      return Response.json({ error: 'Real-Debrid token not set. Add it in Settings.' }, { status: 400 });
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const action = body.action || 'status';
    const authHeaders = { Authorization: `Bearer ${token}` };
    const formHeaders = { ...authHeaders, 'Content-Type': 'application/x-www-form-urlencoded' };

    if (action === 'status') {
      const res = await fetch(`${RD_BASE}/user`, { headers: authHeaders });
      if (!res.ok) return Response.json({ error: `Real-Debrid rejected token (${res.status})` }, { status: 502 });
      const data = await res.json();
      return Response.json({
        valid: true,
        premium: !!data.premium,
        expires: data.expiration || '',
        points: data.points || 0,
      });
    }

    if (action === 'find_cached') {
      const title = (body.title || '').trim();
      const imdbId = (body.imdb_id || '').trim();
      if (!title && !imdbId) return Response.json({ error: 'title or imdb_id required' }, { status: 400 });
      const year = body.year != null ? String(body.year).trim() : '';
      const season = body.season != null ? String(body.season) : '';
      const episode = body.episode != null ? String(body.episode) : '';

      // 1. External Network Scrape via Torrentio FIRST (with English Language Filter)
      let torrentioUrl = '';
      if (imdbId) {
        const type = season && episode ? 'series' : 'movie';
        const streamPath = type === 'series' ? `${imdbId}:${season}:${episode}` : imdbId;
        torrentioUrl = `https://torrentio.strem.fun/stream/${type}/${streamPath}.json`;
      } else {
        let queryTitle = title;
        if (season && episode) {
          queryTitle += ` S${season.padStart(2, '0')}E${episode.padStart(2, '0')}`;
        } else if (year) {
          queryTitle += ` ${year}`;
        }
        torrentioUrl = `https://torrentio.strem.fun/stream/movie/${encodeURIComponent(queryTitle.toLowerCase())}.json`;
      }

      try {
        const scrapeRes = await fetch(torrentioUrl);
        if (scrapeRes.ok) {
          const scrapeData = await scrapeRes.json();
          const streams = scrapeData.streams || [];
          
          // Filter streams to prioritize English or Multi-audio, avoiding foreign-only dubs
          const englishStreams = streams.filter(s => {
            const desc = ((s.description || '') + (s.title || '')).toLowerCase();
            const isForeignExplicit = desc.includes('french') || desc.includes('spanish') || desc.includes('german') || desc.includes('italian') || (desc.includes('japanese') && !desc.includes('multi'));
            return !isForeignExplicit;
          });

          const validStream = englishStreams.find(s => s.infoHash || (s.url && s.url.includes('btih:'))) || streams.find(s => s.infoHash || (s.url && s.url.includes('btih:')));
          
          if (validStream) {
            let infoHash = validStream.infoHash;
            if (!infoHash && validStream.url) {
              const match = validStream.url.match(/btih:([a-fA-F0-9]{40})/i);
              if (match) infoHash = match[1];
            }

            if (infoHash) {
              const realMagnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title || imdbId)}`;
              const availRes = await fetch(`${RD_BASE}/torrents/instantAvailability/${infoHash}`, { headers: authHeaders });
              
              if (availRes.ok) {
                const availData = await availRes.json();
                const cachedVariants = availData[infoHash]?.rd;
                
                const addRes = await fetch(`${RD_BASE}/torrents/addMagnet`, {
                  method: 'POST',
                  headers: formHeaders,
                  body: `magnet=${encodeURIComponent(realMagnet)}`,
                });

                if (addRes.ok) {
                  const addData = await addRes.json();
                  await fetch(`${RD_BASE}/torrents/selectFiles/${addData.id}`, {
                    method: 'POST',
                    headers: formHeaders,
                    body: 'files=all',
                  });

                  if (cachedVariants && cachedVariants.length > 0) {
                    const stream = await resolveStreamable(addData.id, authHeaders, formHeaders);
                    if (stream.ready && stream.stream_url) {
                      return Response.json({
                        status: 'ready',
                        torrent_id: String(addData.id),
                        stream_url: stream.stream_url,
                        filename: stream.filename || '',
                      });
                    }
                  } else {
                    return Response.json({
                      status: 'downloading',
                      torrent_id: String(addData.id),
                      error: "New release not cached yet. Added to your Real-Debrid download queue."
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Torrentio scrape error:", err);
      }

      // 2. Personal Cloud Library Fallback (Only if network/Torrentio didn't yield a stream)
      try {
        const libRes = await fetch(`${RD_BASE}/torrents`, { headers: authHeaders });
        if (libRes.ok) {
          const libData = await libRes.json();
          const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const want = norm(title);
          
          const candidates = (libData || []).filter((t) => {
            if (t.status !== 'downloaded') return false;
            const fn = norm(t.filename || t.original_filename || '');
            return want ? fn.includes(want) : false;
          });

          if (candidates.length > 0) {
            const best = candidates[0];
            const stream = await resolveStreamable(best.id, authHeaders, formHeaders);
            if (stream.ready && stream.stream_url) {
              return Response.json({
                status: 'ready',
                torrent_id: String(best.id),
                stream_url: stream.stream_url,
                filename: stream.filename || '',
              });
            }
          }
        }
      } catch (err) {
        console.error("Library fallback error:", err);
      }

      return Response.json({ 
        status: "not_found", 
        error: "Stream not found on network or in your Real-Debrid library." 
      }, { status: 200 });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function resolveStreamable(torrentId, authHeaders, formHeaders) {
  const infoRes = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
  if (!infoRes.ok) return { ready: false };
  const info = await infoRes.json();

  if (info.status !== 'downloaded') return { ready: false };

  const files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
  if (files.length === 0) return { ready: false };

  const target = files[0];
  const fileLinks = info.links || [];
  const targetLink = fileLinks[0] || '';

  if (!targetLink) return { ready: false };

  const unRes = await fetch(`${RD_BASE}/unrestrict/link`, {
    method: 'POST',
    headers: formHeaders,
    body: `link=${encodeURIComponent(targetLink)}`,
  });
  if (!unRes.ok) return { ready: false };
  const unData = await unRes.json();

  return {
    ready: true,
    stream_url: unData.download,
    filename: unData.filename || target.path || '',
  };
}
