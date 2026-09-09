import { getFreeTvChannels } from './src/components/mg/freeTVPlaylist.js';

const NEW_SOURCES = new Set([
  'Samsung TV Plus GB',
  'Samsung TV Plus UK Mirror',
  'Samsung TV Plus Community',
  'JPT Free-TV UK Mirror',
  'JPT Free-TV Global Mirror',
]);

const result = await getFreeTvChannels({ force: true });
const channels = (result.channels || []).filter(ch => {
  const names = new Set([ch.sourceName, ...(ch.sourceNames || []), ...(ch.alternatives || []).map(a => a?.sourceName)].filter(Boolean));
  return [...names].some(n => NEW_SOURCES.has(n));
});

const items = [];
for (const ch of channels) {
  for (const c of [ch, ...(ch.alternatives || [])]) {
    if (!NDEW_SOURCES.has(c?.sourceName)) continue;
    const url = String(c?.url || '').trim();
    if (!/^https?:\\/\\/i.test(url)) continue;
    items.push({
      channel: ch.name,
      sourceName: c.sourceName,
      url,
      country: ch.country || c.country || '',
      group: ch.group || c.group || '',
    });
  }
}

const seen = new Set();
const unique = items.filter(i => {
  const k = i.url;
  if (seen.has(k)) return false;
  seen.add(k); return true;
});

async function probe(item) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  const started = Date.now();
  try {
    const r = await fetch(item.url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Media God health check)',
        'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,video/*,*/*;q=0.8',
        'Range': 'bytes=0-4095',
      },
    });
    const ct = String(r.headers.get('content-type') || '').toLowerCase();
    let text = '';
    try { text = (await r.text()).slice(0, 4096); } catch {}
    const t = text.trimStart();
    const hls = /#EXTM3U/i.test(text) || /mpegurl|vnd\\.apple\\.mpegurl/.test(ct);
    const html = /^<!doctype html|^<html/i.test(t) || ct.includes('text/html');
    let verdict = 'other';
    if (r.ok && hls) verdict = 'working_playlist';
    else if (r.ok && !html && /video|octet-stream|mp2t/.test(ct)) verdict = 'working_media';
    else if (r.status === 403 || r.status === 451) verdict = 'blocked_from_test_server';
    else if (r.status === 404 || r.status === 410) verdict = 'dead_http';
    else if (html) verdict = 'html_not_video';
    else if (!r.ok) verdict = `http_${r.status}`;
    else verdict = 'unknown_response';
    return { ...item, verdict, status: r.status, contentType: ct, ms: Date.now()-started, finalUrl: r.url };
  } catch (e) {
    const name = e?.name || '';
    const msg = String(e?.message || e);
    const verdict = name === 'AbortError' ? 'timeout' : /ENOTFOUND|EAI_AGAIN|getaddrinfo|fetch failed/i.test(msg) ? 'network_or_dns' : 'request_error';
    return { ...item, verdict, status: 0, contentType: '', ms: Date.now()-started, error: msg };
  } finally { clearTimeout(timer); }
}

const out = [];
let next = 0;
async function worker() {
  while (true) {
    const i = next++;
    if (i >= unique.length) return;
    out[i] = await probe(unique[i]);
  }
}
await Promise.all(Array.from({ length: 30 }, worker));

const counts = {};
for (const x of out) counts[x.verdict] = (counts[x.verdict] || 0) + 1;

const problem = out.filter(x => !['working_playlist','working_media'].includes(x.verdict));
const definitelyBad = problem.filter(x => ['dead_http','html_not_video','network_or_dns','request_error'].includes(x.verdict));
const uncertain = problem.filter(x => ['blocked_from_test_server','timeout','unknown_response'].includes(x.verdict) || x.verdict.startsWith('http_'));

console.log(JSON.stringify({
  tested: out.length,
  counts,
  definitelyBadCount: definitelyBad.length,
  uncertainCount: uncertain.length,
  definitelyBad,
  uncertain
}, null, 2));
