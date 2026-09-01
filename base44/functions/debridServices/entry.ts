import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Multi-service debrid proxy for AllDebrid, Premiumize, and DebridLink.
// Each service's personal API token is stored on the user record
// (auth.updateMe({ <service>_token })) and read server-side here — never sent
// to the client. Only the bounded actions the app needs are exposed:
// status (verify token + premium), torrents_list (cloud library), and
// resolve (pick a streamable file URL from a finished torrent).
//
// Real-Debrid has its own dedicated function (realDebrid) with richer magnet
// handling; this one covers the three additional services the user requested.

const AD_BASE = 'https://api.alldebrid.com/v4';
const PM_BASE = 'https://www.premiumize.me/api';
const DL_BASE = 'https://debrid-link.com/api/v2';
const AGENT = 'mediagod';
const VIDEO_RE = /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

const SERVICES = {
  alldebrid: { tokenField: 'alldebrid_token', label: 'AllDebrid' },
  premiumize: { tokenField: 'premiumize_token', label: 'Premiumize' },
  debridlink: { tokenField: 'debridlink_token', label: 'DebridLink' },
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch {}
    const service = body.service;
    const cfg = SERVICES[service];
    if (!cfg) return Response.json({ error: 'Unknown debrid service' }, { status: 400 });

    const token = user[cfg.tokenField];
    if (!token) {
      return Response.json({ error: `${cfg.label} token not set. Add it in Settings.` }, { status: 400 });
    }

    const action = body.action || 'status';

    if (action === 'status') return await status(service, token);
    if (action === 'torrents_list') return await torrentsList(service, token);
    if (action === 'resolve') return await resolve(service, token, body);
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ---------- AllDebrid ----------
async function adGet(path, token) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${AD_BASE}${path}${sep}agent=${AGENT}&token=${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`AllDebrid error ${res.status}`);
  const data = await res.json();
  if (data.status !== 'success') throw new Error(data.data?.error?.message || 'AllDebrid request failed');
  return data.data;
}
async function adStatus(token) {
  const d = await adGet('/user', token);
  return { valid: true, premium: !!d.user?.premium, expires: d.user?.expiresOn ? String(d.user.expiresOn) : '' };
}
async function adList(token) {
  let d;
  try { d = await adGet('/torrents', token); } catch (e) { return { torrents: [], error: e.message }; }
  const ts = (d.torrents || []).map((t) => ({
    id: String(t.id),
    service: 'alldebrid',
    filename: t.filename || '',
    status: adStatusLabel(t.statusCode),
    progress: typeof t.progress === 'number' ? t.progress : (t.statusCode === 1 ? 50 : 0),
    bytes: t.size || 0,
    ready: t.statusCode === 2,
  }));
  return { torrents: ts };
}
async function adResolve(token, body) {
  const d = await adGet(`/torrent?id=${body.torrent_id}`, token);
  const torrent = d.torrent || {};
  const links = (torrent.links || []).filter((l) => l && l.link);
  if (links.length === 0) return { error: 'No files in this torrent yet' };
  // Unlock the largest video link to a direct CDN stream URL.
  const videoLinks = links.filter((l) => VIDEO_RE.test(l.filename || l.link || ''));
  const pool = (videoLinks.length ? videoLinks : links).sort((a, b) => (b.size || 0) - (a.size || 0));
  const target = pool[0];
  const unlockRes = await fetch(`${AD_BASE}/link/unlock?agent=${AGENT}&token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `link=${encodeURIComponent(target.link)}`,
  });
  if (!unlockRes.ok) throw new Error(`AllDebrid unlock failed ${unlockRes.status}`);
  const ud = await unlockRes.json();
  if (ud.status !== 'success') throw new Error(ud.data?.error?.message || 'AllDebrid unlock failed');
  return { stream_url: ud.data.link, filename: ud.data.filename || target.filename || '' };
}
function adStatusLabel(code) {
  return { 0: 'Queued', 1: 'Downloading', 2: 'Ready', 3: 'Error', 4: 'Paused' }[code] || 'Unknown';
}

// ---------- Premiumize ----------
async function pmGet(path, token) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${PM_BASE}${path}${sep}apikey=${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Premiumize error ${res.status}`);
  const data = await res.json();
  if (data.status && data.status !== 'success') throw new Error(data.message || 'Premiumize request failed');
  return data;
}
async function pmStatus(token) {
  const d = await pmGet('/account/info', token);
  return { valid: true, premium: !!d.premium_until, expires: d.premium_until ? String(d.premium_until) : '' };
}
async function pmList(token) {
  let d;
  try { d = await pmGet('/transfer/list', token); } catch (e) { return { torrents: [], error: e.message }; }
  const ts = (d.transfers || []).map((t) => ({
    id: String(t.id),
    service: 'premiumize',
    filename: t.name || '',
    status: pmStatusLabel(t.status),
    progress: t.status === 'running' ? Math.round((t.progress || 0) * 100) : 0,
    bytes: t.size || 0,
    ready: t.status === 'finished',
    folder_id: t.folder_id || '',
  }));
  return { torrents: ts };
}
async function pmResolve(token, body) {
  const folderId = body.folder_id;
  if (!folderId) return { error: 'folder_id required to resolve a Premiumize transfer' };
  const d = await pmGet(`/folder/list?id=${encodeURIComponent(folderId)}`, token);
  const files = (d.files || []).filter((f) => f.link && VIDEO_RE.test(f.name || ''));
  if (files.length === 0) return { error: 'No video files in this transfer' };
  files.sort((a, b) => (b.size || 0) - (a.size || 0));
  const target = files[0];
  return { stream_url: target.link, filename: target.name || '' };
}
function pmStatusLabel(s) {
  return { finished: 'Ready', running: 'Downloading', queued: 'Queued', error: 'Error' }[s] || s || 'Unknown';
}

// ---------- DebridLink ----------
async function dlGet(path, token) {
  const res = await fetch(`${DL_BASE}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DebridLink error ${res.status}`);
  const data = await res.json();
  if (data.success === false) throw new Error(data.error?.message || 'DebridLink request failed');
  return data;
}
async function dlStatus(token) {
  const d = await dlGet('/account', token);
  return { valid: true, premium: !!d.account?.premium, expires: d.account?.premiumExpires ? String(d.account.premiumExpires) : '' };
}
async function dlList(token) {
  let d;
  try { d = await dlGet('/torrents', token); } catch (e) { return { torrents: [], error: e.message }; }
  const ts = (d.data || d.torrents || []).map((t) => ({
    id: String(t.id),
    service: 'debridlink',
    filename: t.name || '',
    status: dlStatusLabel(t.status),
    progress: t.status === 1 ? Math.round((t.progress || 0) * 100) : 0,
    bytes: t.size || 0,
    ready: t.status === 2,
  }));
  return { torrents: ts };
}
async function dlResolve(token, body) {
  const d = await dlGet(`/torrent/${body.torrent_id}`, token);
  const torrent = d.data || d.torrent || {};
  const links = (torrent.links || []).filter((l) => l && (l.link || l.url));
  if (links.length === 0) return { error: 'No files in this torrent yet' };
  const videoLinks = links.filter((l) => VIDEO_RE.test(l.name || l.filename || l.link || l.url || ''));
  const pool = (videoLinks.length ? videoLinks : links).sort((a, b) => (b.size || 0) - (a.size || 0));
  const target = pool[0];
  return { stream_url: target.link || target.url, filename: target.name || target.filename || '' };
}
function dlStatusLabel(code) {
  return { 0: 'Queued', 1: 'Downloading', 2: 'Ready', 3: 'Error', 4: 'Paused', 5: 'Uploading' }[code] || 'Unknown';
}

// ---------- dispatchers ----------
async function status(service, token) {
  try {
    if (service === 'alldebrid') return Response.json(await adStatus(token));
    if (service === 'premiumize') return Response.json(await pmStatus(token));
    if (service === 'debridlink') return Response.json(await dlStatus(token));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
async function torrentsList(service, token) {
  if (service === 'alldebrid') return Response.json(await adList(token));
  if (service === 'premiumize') return Response.json(await pmList(token));
  if (service === 'debridlink') return Response.json(await dlList(token));
}
async function resolve(service, token, body) {
  try {
    if (service === 'alldebrid') return Response.json(await adResolve(token, body));
    if (service === 'premiumize') return Response.json(await pmResolve(token, body));
    if (service === 'debridlink') return Response.json(await dlResolve(token, body));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}