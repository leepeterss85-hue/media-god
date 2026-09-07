import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const PROVIDERS = {
  realdebrid: {
    name: "Real-Debrid",
    tokenField: "rd_token",
    baseUrl: "https://api.real-debrid.com/rest/1.0",
    accountPath: "/user",
  },
  alldebrid: {
    name: "AllDebrid",
    tokenField: "alldebrid_token",
    baseUrl: "https://api.alldebrid.com/v4",
    accountPath: "/user",
  },
  torbox: {
    name: "TorBox",
    tokenField: "torbox_token",
    baseUrl: "https://api.torbox.app/v1/api",
    accountPath: "/user/me",
  },
  premiumize: {
    name: "Premiumize.me",
    tokenField: "premiumize_token",
    baseUrl: "https://www.premiumize.me/api",
    accountPath: "/account/info",
  },
  debridlink: {
    name: "Debrid-Link",
    tokenField: "debridlink_token",
    baseUrl: "https://debrid-link.com/api/v2",
    accountPath: "/account/infos",
  },
};

const DEFAULT_PRIORITY = [
  "realdebrid",
  "torbox",
  "alldebrid",
  "premiumize",
  "debridlink",
];

const VIDEO_RE = /\.(?:mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)(?:$|[?#])/i;

const clean = (value) => String(value ?? "").trim();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const providerKeys = () => Object.keys(PROVIDERS);

const normaliseProvider = (value) => {
  const key = clean(value).toLowerCase().replace(/[^a-z]/g, "");
  return PROVIDERS[key] ? key : "";
};

const normaliseHash = (value) => {
  const raw = clean(value);
  const match = raw.match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i);
  const hash = clean(match?.[1] || raw).toLowerCase();

  if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(hash)) {
    return "";
  }

  return hash;
};

const toMagnet = (value) => {
  const raw = clean(value);
  if (/^magnet:/i.test(raw)) return raw;

  const hash = normaliseHash(raw);
  return hash ? `magnet:?xt=urn:btih:${hash}` : raw;
};

const tokenFor = (user, providerKey) => {
  const provider = PROVIDERS[providerKey];
  return provider ? clean(user?.[provider.tokenField]) : "";
};

const enabledProvidersFor = (user) => {
  const saved = Array.isArray(user?.debrid_enabled_providers)
    ? user.debrid_enabled_providers.map(normaliseProvider).filter(Boolean)
    : [];

  const candidates = saved.length ? saved : DEFAULT_PRIORITY;

  return candidates.filter(
    (key, index) => candidates.indexOf(key) === index && tokenFor(user, key)
  );
};

const priorityFor = (user) => {
  const saved = Array.isArray(user?.debrid_provider_priority)
    ? user.debrid_provider_priority.map(normaliseProvider).filter(Boolean)
    : [];

  const ordered = [...saved, ...DEFAULT_PRIORITY].filter(
    (key, index, list) => list.indexOf(key) === index
  );

  return ordered;
};

const requestJson = async (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const message =
        clean(data?.error_description) ||
        clean(data?.error) ||
        clean(data?.message) ||
        clean(data?.detail) ||
        `HTTP ${response.status}`;
      throw new Error(message);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
};

const authHeaders = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  ...extra,
});

const formHeaders = (token) =>
  authHeaders(token, {
    "Content-Type": "application/x-www-form-urlencoded",
  });

const formBody = (entries) => {
  const body = new URLSearchParams();
  entries.forEach(([key, value]) => {
    if (value == null) return;
    body.append(key, String(value));
  });
  return body.toString();
};

const episodeMatchScore = (name, season, episode) => {
  if (!season || !episode) return 0;

  const text = clean(name).toLowerCase();
  const s = Number(season);
  const e = Number(episode);

  const patterns = [
    new RegExp(`s0*${s}e0*${e}(?:\\D|$)`, "i"),
    new RegExp(`(?:^|\\D)${s}x0*${e}(?:\\D|$)`, "i"),
    new RegExp(`season[ ._-]*0*${s}.*episode[ ._-]*0*${e}`, "i"),
  ];

  return patterns.some((pattern) => pattern.test(text)) ? 1000000000000 : 0;
};

const chooseVideo = (files, season = null, episode = null) => {
  const usable = (files || [])
    .filter((item) => item?.url && VIDEO_RE.test(clean(item?.name || item?.path)))
    .map((item) => ({
      ...item,
      size: Number(item?.size || 0),
      score:
        episodeMatchScore(item?.name || item?.path, season, episode) +
        Number(item?.size || 0),
    }))
    .sort((a, b) => b.score - a.score);

  return usable[0] || null;
};

const flattenAllDebridFiles = (nodes, output = []) => {
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    if (Array.isArray(node?.e)) {
      flattenAllDebridFiles(node.e, output);
      return;
    }

    if (node?.l) {
      output.push({
        name: clean(node?.n || "Video"),
        path: clean(node?.n || "Video"),
        size: Number(node?.s || 0),
        url: clean(node?.l),
      });
    }
  });

  return output;
};

const parseTorBoxCache = (data, hashes) => {
  const output = {};
  hashes.forEach((hash) => {
    output[hash] = false;
  });

  const payload = data?.data;

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    hashes.forEach((hash) => {
      const entry = payload?.[hash] || payload?.[hash.toUpperCase()];
      if (entry) output[hash] = true;
    });
  }

  if (Array.isArray(payload)) {
    payload.forEach((entry) => {
      const hash = normaliseHash(entry?.hash);
      if (hash) output[hash] = true;
    });
  }

  return output;
};

const checkCacheForProvider = async (providerKey, token, hashes) => {
  const output = {};
  hashes.forEach((hash) => {
    output[hash] = false;
  });

  if (!token || !hashes.length) return output;

  if (providerKey === "realdebrid") {
    const data = await requestJson(
      `${PROVIDERS.realdebrid.baseUrl}/torrents/instantAvailability/${hashes.join("/")}`,
      { headers: authHeaders(token) }
    );

    hashes.forEach((hash) => {
      const entry = data?.[hash] || data?.[hash.toUpperCase()];
      output[hash] = Boolean(entry?.rd && Object.keys(entry.rd).length > 0);
    });

    return output;
  }

  if (providerKey === "alldebrid") {
    const query = new URLSearchParams({ agent: "MediaGod" });
    hashes.forEach((hash) => query.append("magnets[]", hash));

    const data = await requestJson(
      `${PROVIDERS.alldebrid.baseUrl}/magnet/instant?${query.toString()}`,
      { headers: authHeaders(token) }
    );

    const magnets = data?.data?.magnets || data?.data?.torrents || [];
    (Array.isArray(magnets) ? magnets : []).forEach((item) => {
      const hash = normaliseHash(item?.hash || item?.magnet);
      if (hash) output[hash] = Boolean(item?.instant ?? item?.ready);
    });

    return output;
  }

  if (providerKey === "torbox") {
    const data = await requestJson(
      `${PROVIDERS.torbox.baseUrl}/torrents/checkcached`,
      {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ hashes }),
      }
    );

    return parseTorBoxCache(data, hashes);
  }

  if (providerKey === "premiumize") {
    const data = await requestJson(
      `${PROVIDERS.premiumize.baseUrl}/cache/check`,
      {
        method: "POST",
        headers: formHeaders(token),
        body: formBody(hashes.map((hash) => ["items[]", hash])),
      }
    );

    const response = Array.isArray(data?.response) ? data.response : [];
    hashes.forEach((hash, index) => {
      output[hash] = Boolean(response[index]);
    });

    return output;
  }

  if (providerKey === "debridlink") {
    await Promise.all(
      hashes.map(async (hash) => {
        try {
          const data = await requestJson(
            `${PROVIDERS.debridlink.baseUrl}/seedbox/cached`,
            {
              method: "POST",
              headers: formHeaders(token),
              body: formBody([["url", toMagnet(hash)]]),
            }
          );

          const value = data?.value || data?.data || data;
          const entry = value?.[hash] || value?.[hash.toUpperCase()] || value;
          output[hash] = Boolean(
            entry?.cached ||
              entry?.instant ||
              entry?.available ||
              (Array.isArray(entry?.files) && entry.files.length > 0)
          );
        } catch {
          output[hash] = false;
        }
      })
    );

    return output;
  }

  return output;
};

const resolveRealDebrid = async ({ token, source, season, episode }) => {
  const addData = await requestJson(
    `${PROVIDERS.realdebrid.baseUrl}/torrents/addMagnet`,
    {
      method: "POST",
      headers: formHeaders(token),
      body: formBody([["magnet", toMagnet(source)]]),
    }
  );

  const torrentId = clean(addData?.id);
  if (!torrentId) throw new Error("Real-Debrid did not return a torrent id.");

  await requestJson(
    `${PROVIDERS.realdebrid.baseUrl}/torrents/selectFiles/${encodeURIComponent(torrentId)}`,
    {
      method: "POST",
      headers: formHeaders(token),
      body: "files=all",
    }
  );

  const info = await requestJson(
    `${PROVIDERS.realdebrid.baseUrl}/torrents/info/${encodeURIComponent(torrentId)}`,
    { headers: authHeaders(token) }
  );

  const selected = (Array.isArray(info?.files) ? info.files : []).filter(
    (file) => file?.selected === 1 || file?.selected === true
  );
  const links = Array.isArray(info?.links) ? info.links : [];

  const files = selected.map((file, index) => ({
    name: clean(file?.path || `File ${index + 1}`),
    path: clean(file?.path || ""),
    size: Number(file?.bytes || 0),
    url: clean(links[index] || ""),
  }));

  const chosen = chooseVideo(files, season, episode) || files.find((file) => file.url);
  if (!chosen?.url) throw new Error("Real-Debrid produced no playable file link.");

  const unrestricted = await requestJson(
    `${PROVIDERS.realdebrid.baseUrl}/unrestrict/link`,
    {
      method: "POST",
      headers: formHeaders(token),
      body: formBody([["link", chosen.url]]),
    }
  );

  const url = clean(unrestricted?.download);
  if (!url) throw new Error("Real-Debrid did not return a direct download URL.");

  return {
    url,
    filename: clean(unrestricted?.filename || chosen.name),
    size: Number(unrestricted?.filesize || chosen.size || 0),
    provider: "realdebrid",
  };
};

const resolveAllDebrid = async ({ token, source, season, episode }) => {
  const uploaded = await requestJson(
    `${PROVIDERS.alldebrid.baseUrl}/magnet/upload`,
    {
      method: "POST",
      headers: formHeaders(token),
      body: formBody([["magnets[]", toMagnet(source)]]),
    }
  );

  const magnet = uploaded?.data?.magnets?.[0];
  const id = magnet?.id;
  if (!id) throw new Error("AllDebrid did not return a magnet id.");

  if (!magnet?.ready) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await wait(1200);
      const status = await requestJson(
        `${PROVIDERS.alldebrid.baseUrl}.1/magnet/status?id=${encodeURIComponent(id)}`,
        { headers: authHeaders(token) }
      );
      const item = status?.data?.magnets?.[0] || status?.data?.magnets;
      if (item?.ready || String(item?.status || "").toLowerCase() === "ready") break;
    }
  }

  const filesData = await requestJson(
    `${PROVIDERS.alldebrid.baseUrl}/magnet/files`,
    {
      method: "POST",
      headers: formHeaders(token),
      body: formBody([["id[]", id]]),
    }
  );

  const files = flattenAllDebridFiles(filesData?.data?.magnets?.[0]?.files || []);
  const chosen = chooseVideo(files, season, episode) || files.find((file) => file.url);
  if (!chosen?.url) throw new Error("AllDebrid produced no playable file link.");

  const unlocked = await requestJson(
    `${PROVIDERS.alldebrid.baseUrl}/link/unlock`,
    {
      method: "POST",
      headers: formHeaders(token),
      body: formBody([["link", chosen.url]]),
    }
  );

  const url = clean(unlocked?.data?.link);
  if (!url) throw new Error("AllDebrid did not return a direct download URL.");

  return {
    url,
    filename: clean(unlocked?.data?.filename || chosen.name),
    size: Number(unlocked?.data?.filesize || chosen.size || 0),
    provider: "alldebrid",
  };
};

const resolvePremiumize = async ({ token, source, season, episode }) => {
  const data = await requestJson(
    `${PROVIDERS.premiumize.baseUrl}/transfer/directdl`,
    {
      method: "POST",
      headers: formHeaders(token),
      body: formBody([["src", toMagnet(source)]]),
    },
    20000
  );

  const files = (Array.isArray(data?.content) ? data.content : []).map((file) => ({
    name: clean(file?.path || "Video"),
    path: clean(file?.path || ""),
    size: Number(file?.size || 0),
    url: clean(file?.link || ""),
  }));

  const chosen = chooseVideo(files, season, episode) || files.find((file) => file.url);
  if (!chosen?.url) throw new Error("Premiumize did not return a playable file.");

  return {
    url: chosen.url,
    filename: chosen.name,
    size: chosen.size,
    provider: "premiumize",
  };
};

const resolveDebridLink = async ({ token, source, season, episode }) => {
  const data = await requestJson(
    `${PROVIDERS.debridlink.baseUrl}/seedbox/add`,
    {
      method: "POST",
      headers: formHeaders(token),
      body: formBody([
        ["url", toMagnet(source)],
        ["async", "true"],
      ]),
    },
    20000
  );

  const rawFiles = data?.value?.files || data?.data?.files || [];
  const files = (Array.isArray(rawFiles) ? rawFiles : []).map((file) => ({
    name: clean(file?.name || file?.filename || "Video"),
    path: clean(file?.name || file?.filename || ""),
    size: Number(file?.size || 0),
    url: clean(file?.downloadUrl || file?.download_url || file?.link || ""),
  }));

  const chosen = chooseVideo(files, season, episode) || files.find((file) => file.url);
  if (!chosen?.url) throw new Error("Debrid-Link did not return a playable file.");

  return {
    url: chosen.url,
    filename: chosen.name,
    size: chosen.size,
    provider: "debridlink",
  };
};

const resolveTorBox = async ({ token, source, season, episode }) => {
  const form = new FormData();
  form.append("magnet", toMagnet(source));
  form.append("seed", "3");
  form.append("add_only_if_cached", "true");

  const created = await requestJson(
    `${PROVIDERS.torbox.baseUrl}/torrents/createtorrent`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: form,
    },
    20000
  );

  const torrentId = created?.data?.torrent_id;
  if (torrentId == null) throw new Error("TorBox did not return a torrent id.");

  const listData = await requestJson(
    `${PROVIDERS.torbox.baseUrl}/torrents/mylist?id=${encodeURIComponent(
      torrentId
    )}&bypass_cache=true`,
    { headers: authHeaders(token) },
    20000
  );

  const item = Array.isArray(listData?.data) ? listData.data[0] : listData?.data;
  const files = (Array.isArray(item?.files) ? item.files : []).map((file) => ({
    id: file?.id,
    name: clean(file?.name || file?.short_name || "Video"),
    path: clean(file?.name || file?.absolute_path || ""),
    size: Number(file?.size || 0),
    url: file?.id == null ? "" : `torbox-file:${file.id}`,
  }));

  const chosen = chooseVideo(files, season, episode) || files.find((file) => file.id != null);
  if (!chosen || chosen.id == null) throw new Error("TorBox produced no playable file.");

  const query = new URLSearchParams({
    token,
    torrent_id: String(torrentId),
    file_id: String(chosen.id),
    redirect: "false",
    append_name: "true",
  });

  const linkData = await requestJson(
    `${PROVIDERS.torbox.baseUrl}/torrents/requestdl?${query.toString()}`,
    { headers: authHeaders(token) },
    20000
  );

  const url = clean(linkData?.data);
  if (!/^https?:\/\//i.test(url)) throw new Error("TorBox did not return a direct download URL.");

  return {
    url,
    filename: chosen.name,
    size: chosen.size,
    provider: "torbox",
  };
};

const resolveForProvider = async ({
  providerKey,
  token,
  source,
  season,
  episode,
}) => {
  if (providerKey === "realdebrid") {
    return resolveRealDebrid({ token, source, season, episode });
  }
  if (providerKey === "alldebrid") {
    return resolveAllDebrid({ token, source, season, episode });
  }
  if (providerKey === "torbox") {
    return resolveTorBox({ token, source, season, episode });
  }
  if (providerKey === "premiumize") {
    return resolvePremiumize({ token, source, season, episode });
  }
  if (providerKey === "debridlink") {
    return resolveDebridLink({ token, source, season, episode });
  }

  throw new Error("Unsupported debrid provider.");
};

const providerStatus = async (providerKey, token) => {
  const provider = PROVIDERS[providerKey];

  if (!token) {
    return {
      key: providerKey,
      name: provider.name,
      configured: false,
      valid: false,
    };
  }

  try {
    const data = await requestJson(`${provider.baseUrl}${provider.accountPath}`, {
      headers: authHeaders(token),
    });

    const payload = data?.data || data?.value || data || {};

    return {
      key: providerKey,
      name: provider.name,
      configured: true,
      valid: true,
      username: clean(payload?.username || payload?.email || payload?.user || ""),
      premium: Boolean(
        payload?.premium ||
          payload?.isPremium ||
          payload?.accountType === 1 ||
          String(payload?.type || "").toLowerCase() === "premium"
      ),
    };
  } catch (error) {
    return {
      key: providerKey,
      name: provider.name,
      configured: true,
      valid: false,
      error: clean(error?.message || "Connection check failed"),
    };
  }
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const action = clean(body?.action || "status").toLowerCase();

    if (action === "save_tokens") {
      const patch = {};
      const tokens = body?.tokens && typeof body.tokens === "object" ? body.tokens : {};

      ["alldebrid", "torbox", "premiumize", "debridlink"].forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(tokens, key)) return;
        patch[PROVIDERS[key].tokenField] = clean(tokens[key]);
      });

      if (Array.isArray(body?.enabledProviders)) {
        patch.debrid_enabled_providers = body.enabledProviders
          .map(normaliseProvider)
          .filter((key) => key && key !== "realdebrid");

        if (tokenFor(user, "realdebrid")) {
          patch.debrid_enabled_providers.unshift("realdebrid");
        }
      }

      if (Array.isArray(body?.priority)) {
        patch.debrid_provider_priority = body.priority
          .map(normaliseProvider)
          .filter(Boolean);
      }

      if (Object.keys(patch).length > 0) {
        await base44.auth.updateMe(patch);
      }

      return Response.json({ ok: true });
    }

    if (action === "status") {
      const enabled = enabledProvidersFor(user);
      const statuses = await Promise.all(
        providerKeys().map((key) => providerStatus(key, tokenFor(user, key)))
      );

      return Response.json({
        providers: statuses.map((status) => ({
          ...status,
          enabled: enabled.includes(status.key),
        })),
        priority: priorityFor(user),
      });
    }

    if (action === "check_cache") {
      const hashes = (Array.isArray(body?.hashes) ? body.hashes : [])
        .map(normaliseHash)
        .filter(Boolean)
        .slice(0, 100)
        .filter((hash, index, list) => list.indexOf(hash) === index);

      if (!hashes.length) {
        return Response.json({ cached: {}, bestProviderByHash: {} });
      }

      const requested = Array.isArray(body?.providers)
        ? body.providers.map(normaliseProvider).filter(Boolean)
        : enabledProvidersFor(user);

      const priority = priorityFor(user).filter((key) => requested.includes(key));
      const cached = {};

      await Promise.all(
        priority.map(async (key) => {
          const token = tokenFor(user, key);
          if (!token) return;

          try {
            cached[key] = await checkCacheForProvider(key, token, hashes);
          } catch (error) {
            cached[key] = Object.fromEntries(hashes.map((hash) => [hash, false]));
            cached[key].__error = clean(error?.message || "Cache check failed");
          }
        })
      );

      const bestProviderByHash = {};
      hashes.forEach((hash) => {
        const provider = priority.find((key) => cached?.[key]?.[hash] === true);
        if (provider) bestProviderByHash[hash] = provider;
      });

      return Response.json({
        cached,
        bestProviderByHash,
        providersChecked: priority,
      });
    }

    if (action === "resolve") {
      const source = clean(body?.source || body?.magnet || body?.hash || "");
      if (!source) {
        return Response.json({ error: "A magnet, hash or source URL is required." }, { status: 400 });
      }

      let providerKey = normaliseProvider(body?.provider);
      const hash = normaliseHash(source);
      const enabled = enabledProvidersFor(user);
      const priority = priorityFor(user).filter((key) => enabled.includes(key));

      if (!providerKey && hash) {
        const cacheResult = {};

        for (const key of priority) {
          const token = tokenFor(user, key);
          if (!token) continue;

          try {
            const result = await checkCacheForProvider(key, token, [hash]);
            cacheResult[key] = Boolean(result?.[hash]);
            if (cacheResult[key]) {
              providerKey = key;
              break;
            }
          } catch {
            cacheResult[key] = false;
          }
        }
      }

      providerKey = providerKey || priority[0] || "";
      const token = tokenFor(user, providerKey);

      if (!providerKey || !token) {
        return Response.json(
          { error: "No enabled debrid provider with a saved token is available." },
          { status: 400 }
        );
      }

      const resolved = await resolveForProvider({
        providerKey,
        token,
        source,
        season: Number(body?.season || 0) || null,
        episode: Number(body?.episode || 0) || null,
      });

      return Response.json({
        ...resolved,
        providerName: PROVIDERS[providerKey].name,
      });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: clean(error?.message || "Multi-debrid request failed.") },
      { status: 500 }
    );
  }
}
