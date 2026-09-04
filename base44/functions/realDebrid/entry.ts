import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const RD_BASE = "https://api.real-debrid.com/rest/1.0";

const VIDEO_RE = /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

const FOREIGN_RE = /(truefrench|vostfr|vost|subfrench|\bvf\b|\bvff\b|\bvfi\b|french|spanish|german|italian|\bdubbed\b)/i;

const RES_RE = /(2160|1080|720|480)p/i;

const DEFAULT_ADDONS = [
  { name: "Torrentio", url: "https://torrentio.strem.fun/manifest.json", installed: true, active: true },
  { name: "Comet", url: "https://comet.elfhosted.com/manifest.json", installed: true, active: true },
  { name: "Annatar", url: "https://annatar.elfhosted.com/manifest.json", installed: true, active: true },
  { name: "MediaFusion", url: "https://mediafusion.elfhosted.com/manifest.json", installed: true, active: true }
];

const clean = (value) => String(value || "").trim();

const normalise = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isHttp = (value) => /^https?:\/\//i.test(clean(value));

const isMagnet = (value) => clean(value).toLowerCase().startsWith("magnet:");

const isVideoFile = (file) => {
  const path = file?.path || file?.filename || "";
  return !!path && VIDEO_RE.test(path);
};

const magnetFromHash = (hash, title = "") => {
  const value = clean(hash);
  if (!value) return "";
  return `magnet:?xt=urn:btih:${value}${title ? `&dn=${encodeURIComponent(title)}` : ""}`;
};

const infoHashFromValue = (value) => {
  const text = clean(value);
  if (!text) return "";
  if (/^[a-f0-9]{40}$/i.test(text)) return text;
  const match = text.match(/btih:([a-f0-9]{40})/i);
  return match?.[1] || "";
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const token = user.rd_token;
    if (!token) {
      return Response.json({ error: "Real-Debrid token not set. Add it in Settings." }, { status: 400 });
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const action = body.action || "status";
    const authHeaders = { Authorization: `Bearer ${token}` };
    const formHeaders = { ...authHeaders, "Content-Type": "application/x-www-form-urlencoded" };

    if (action === "status") {
      const res = await fetch(`${RD_BASE}/user`, { headers: authHeaders });
      if (!res.ok) return Response.json({ error: `Real-Debrid rejected token (${res.status})` }, { status: 502 });
      const data = await res.json();
      return Response.json({
        valid: true,
        premium: !!data.premium,
        expires: data.expiration || "",
        points: data.points || 0,
      });
    }

    if (action === "find_cached" || action === "fetch_streams") {
      const title = clean(body.title);
      const imdbId = clean(body.imdb_id || body.id);
      if (!title && !imdbId) return Response.json({ error: "title or imdb_id required" }, { status: 400 });
      const season = body.season != null ? String(body.season) : "";
      const episode = body.episode != null ? String(body.episode) : "";

      // 1. Retrieve stored addons from database using both 'installed' and 'active' keys, auto-seeding defaults if empty
      let activeAddons = DEFAULT_ADDONS;
      try {
        let dbAddons = await base44.entities.Addon.list("-created_date", 100);
        if (!dbAddons || dbAddons.length === 0) {
          for (const defAddon of DEFAULT_ADDONS) {
            await base44.entities.Addon.create(defAddon);
          }
          dbAddons = await base44.entities.Addon.list("-created_date", 100);
        }

        if (dbAddons && dbAddons.length > 0) {
          activeAddons = dbAddons
            .filter(a => (a?.installed !== false && a?.active !== false) && clean(a?.url))
            .map(a => ({
              name: a.name || "Addon",
              url: a.url
            }));
        }
      } catch (err) {
        console.error("Addon entity list error, using defaults:", err);
      }

      const providerSlug = `realdebrid=${token}`;
      let allDiscoveredStreams = [];

      // 2. Query each active addon server-side
      for (const addon of activeAddons) {
        try {
          const baseUrl = clean(addon.url)
            .replace(/\/manifest\.json\/?$/i, "")
            .replace(/\/+$/, "");

          let queryPath = "";
          const isSeries = Boolean(season && episode);
          const mediaType = isSeries ? "series" : "movie";

          if (imdbId && imdbId.startsWith("tt")) {
            queryPath = isSeries ? `${imdbId}:${season}:${episode}` : imdbId;
          } else {
            let queryTitle = title || imdbId;
            if (isSeries) {
              queryTitle += ` S${season.padStart(2, "0")}E${episode.padStart(2, "0")}`;
            }
            queryPath = `search:${encodeURIComponent(queryTitle.toLowerCase())}`;
          }

          const targetUrl = baseUrl.includes("torrentio.strem.fun")
            ? `https://torrentio.strem.fun/${providerSlug}/stream/${mediaType}/${queryPath}.json`
            : `${baseUrl}/stream/${mediaType}/${queryPath}.json`;

          const scrapeRes = await fetch(targetUrl, {
            headers: { "User-Agent": "Stremio/4.4.16 (Mozilla/5.0)" }
          });

          if (scrapeRes.ok) {
            const data = await scrapeRes.json();
            if (Array.isArray(data?.streams)) {
              for (const s of data.streams) {
                const infoHash = infoHashFromValue(s.infoHash || s.info_hash || s.url || s.link);
                const streamUrl = clean(s.url || s.link || (infoHash ? magnetFromHash(infoHash, title) : ""));

                if (streamUrl) {
                  const rawTitle = s.title || s.name || s.filename || "Stream Source";
                  allDiscoveredStreams.push({
                    label: `${addon.name}: ${clean(rawTitle).split("\n")[0]}`,
                    type: infoHash ? "rd" : "url",
                    src: streamUrl,
                    url: streamUrl,
                    magnet: infoHash ? magnetFromHash(infoHash, title || imdbId) : undefined,
                    infoHash: infoHash || undefined,
                    addon: addon.name
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error(`Addon fetch error for ${addon.name}:`, err);
        }
      }

      if (allDiscoveredStreams.length > 0) {
        if (action === "fetch_streams") {
          return Response.json({ status: "success", sources: allDiscoveredStreams, addons_checked: activeAddons.length });
        }

        for (const candidate of allDiscoveredStreams.slice(0, 10)) {
          if (candidate.infoHash) {
            const availRes = await fetch(`${RD_BASE}/torrents/instantAvailability/${candidate.infoHash}`, { headers: authHeaders });
            if (availRes.ok) {
              const availData = await availRes.json();
              const cachedVariants = availData[candidate.infoHash]?.rd;

              const addRes = await fetch(`${RD_BASE}/torrents/addMagnet`, {
                method: "POST",
                headers: formHeaders,
                body: `magnet=${encodeURIComponent(candidate.magnet)}`,
              });

              if (addRes.ok) {
                const addData = await addRes.json();
                await fetch(`${RD_BASE}/torrents/selectFiles/${addData.id}`, {
                  method: "POST",
                  headers: formHeaders,
                  body: "files=all",
                });

                if (cachedVariants && cachedVariants.length > 0) {
                  const resolved = await resolveStreamable(addData.id, authHeaders, formHeaders);
                  if (resolved.ready && resolved.stream_url) {
                    return Response.json({
                      status: "ready",
                      torrent_id: String(addData.id),
                      url: resolved.stream_url,
                      stream_url: resolved.stream_url,
                      filename: resolved.filename || "",
                      sources: allDiscoveredStreams
                    });
                  }
                } else {
                  return Response.json({
                    status: "downloading",
                    torrent_id: String(addData.id),
                    url: candidate.url,
                    stream_url: candidate.url,
                    sources: allDiscoveredStreams,
                    error: "Source not cached yet. Added to your Real-Debrid download queue."
                  }, { status: 200 });
                }
              }
            }
          }
        }
      }

      // 3. Fallback to Personal Cloud Library
      try {
        const libRes = await fetch(`${RD_BASE}/torrents`, { headers: authHeaders });
        if (libRes.ok) {
          const libData = await libRes.json();
          const want = normalise(title);
          
          const candidates = (libData || []).filter((t) => {
            if (t.status !== "downloaded") return false;
            const fn = normalise(t.filename || t.original_filename || "");
            return want ? fn.includes(want) : false;
          });

          if (candidates.length > 0) {
            const best = candidates[0];
            const stream = await resolveStreamable(best.id, authHeaders, formHeaders);
            if (stream.ready && stream.stream_url) {
              return Response.json({
                status: "ready",
                torrent_id: String(best.id),
                url: stream.stream_url,
                stream_url: stream.stream_url,
                filename: stream.filename || "",
                sources: allDiscoveredStreams
              });
            }
          }
        }
      } catch (err) {
        console.error("Library fallback error:", err);
      }

      return Response.json({ 
        status: "not_found", 
        sources: allDiscoveredStreams,
        addons_checked: activeAddons.length,
        error: "Stream not found on network or in your Real-Debrid library." 
      }, { status: 200 });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function resolveStreamable(torrentId, authHeaders, formHeaders) {
  const infoRes = await fetch(`${RD_BASE}/torrents/info/${torrentId}`, { headers: authHeaders });
  if (!infoRes.ok) return { ready: false };
  const info = await infoRes.json();

  if (info.status !== "downloaded") return { ready: false };

  const files = (info.files || []).filter((f) => f.path && VIDEO_RE.test(f.path));
  if (files.length === 0) return { ready: false };

  const target = files[0];
  const fileLinks = info.links || [];
  const targetLink = fileLinks[0] || "";

  if (!targetLink) return { ready: false };

  const unRes = await fetch(`${RD_BASE}/unrestrict/link`, {
    method: "POST",
    headers: formHeaders,
    body: `link=${encodeURIComponent(targetLink)}`,
  });
  if (!unRes.ok) return { ready: false };
  const unData = await unRes.json();

  return {
    ready: true,
    stream_url: unData.download,
    filename: unData.filename || target.path || "",
  };
}

Do you need to change anything else?
 * No other file updates are required for the core engine. Your frontend PlayerProvider.jsx and StreamSourcesBox.jsx components are already properly wired up to call this endpoint and display the resulting sources.
 * Database / Addons screen check: Because the code now looks for both installed and active flags, and auto-seeds the default manifests if the table is completely empty, you will immediately see your configured addons checked count jump from 0 to 4 upon your next playback attempt.
