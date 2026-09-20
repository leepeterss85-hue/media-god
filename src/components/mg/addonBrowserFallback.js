import { base44 } from "@/api/base44Client";

const clean = (value) => String(value || "").trim();

const isHttp = (value) => /^https?:\/\//i.test(clean(value));

const yearQualifiedSearchIds = (values) =>
  (Array.isArray(values) ? values : [])
    .filter((value) => /^search:.*:\d{4}(?::\d+:\d+)?$/i.test(clean(value)))
    .slice(0, 2);

const isAuthoritativeStreamId = (value) => {
  const id = clean(value);

  return (
    /^(?:imdb:)?tt\d+(?::\d+:\d+)?$/i.test(id) ||
    /^tmdb:\d+(?::\d+:\d+)?$/i.test(id) ||
    /^\d+(?::\d+:\d+)?$/.test(id)
  );
};
const isMagnet = (value) =>
  clean(value).toLowerCase().startsWith("magnet:");

const infoHashFromValue = (value) => {
  const text = clean(value);

  if (/^[a-f0-9]{40}$/i.test(text)) {
    return text.toUpperCase();
  }

  const match = text.match(/btih:([a-f0-9]{40})/i);

  return match?.[1]?.toUpperCase() || "";
};

const cometPlaybackHashFromValue = (value) => {
  const text = clean(value);
  const match = text.match(/\/playback\/([a-f0-9]{40})(?:\/|$|\?)/i);
  return match?.[1]?.toUpperCase() || "";
};

const infoHashFromBehaviorHints = (stream) => {
  const bingeGroup = clean(
    stream?.behaviorHints?.bingeGroup ||
      stream?.behavior_hints?.bingeGroup ||
      stream?.behavior_hints?.binge_group
  );

  const match = bingeGroup.match(
    /(?:^|\|)([a-f0-9]{40})(?:\||$)/i
  );

  return match?.[1]?.toUpperCase() || "";
};

const isCometUncachedDownloadStream = (stream, addonName = "") => {
  const text = [
    addonName,
    stream?.name,
    stream?.title,
    stream?.description,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

  return (
    /\bcomet\b/i.test(text) &&
    /\[\s*RD\s*⬇(?:\uFE0F)?\s*\]/i.test(text)
  );
};

const addonDebridCacheSignal = (stream, addonName = "") => {
  const rawUrl = clean(
    stream?.url ||
      stream?.link ||
      stream?.src
  );
  const text = [
    addonName,
    stream?.name,
    stream?.title,
    stream?.description,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

  const explicitlyUncached =
    /\[\s*RD\s*⬇(?:\uFE0F)?\s*\]/i.test(text) ||
    /\[\s*RD\s+(?:download|uncached)\s*\]/i.test(text) ||
    /\b(?:real[\s_-]*debrid|RD)[\s_-]+(?:download|uncached|not[\s_-]+cached)\b/i.test(
      text
    );

  if (explicitlyUncached) {
    return {
      cached: false,
      resolvedUrl: "",
    };
  }

  const resolvedUrl =
    isHttp(rawUrl) && /\/resolve\/realdebrid(?:\/|$)/i.test(rawUrl)
      ? rawUrl
      : "";
  const cachedMarker =
    /\[\s*RD\s*(?:\+|⚡|✅)\s*\]/i.test(text) ||
    /\b(?:real[\s_-]*debrid|RD)\b[^\n]{0,40}\b(?:cached|instant(?:ly)?[\s_-]*available)\b/i.test(
      text
    );

  return {
    cached: Boolean(resolvedUrl || cachedMarker),
    resolvedUrl,
  };
};

const streamLabel = (stream, addonName) => {
  const detail = clean(
    stream?.title ||
      stream?.name ||
      stream?.description ||
      stream?.behaviorHints?.filename ||
      stream?.behavior_hints?.filename ||
      "Stream"
  )
    .split("\n")[0]
    .trim();

  return `${addonName}: ${detail || "Stream"}`;
};

const streamReportedSeeders = (stream) => {
  const text = [
    stream?.description,
    stream?.title,
    stream?.name,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

  const match = text.match(
    /(?:👤\s*|seeders?\s*:\s*)(\d+)/i
  );

  return match ? Math.max(0, Number(match[1] || 0)) : 0;
};

const isAddonControlStream = (stream, addonName = "") => {
  const name = clean(
    stream?.name
  );

  if (
    /^\s*\[(?:❌|⚠️|ℹ️|🔄|RD🔄)/i.test(name)
  ) {
    return true;
  }

  const text = [
    addonName,
    name,
    stream?.title,
    stream?.description,
    stream?.url,
    stream?.externalUrl,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

  return /\bcomet\s+sync\b|debrid_sync_triggered|account\s+sync\s+started|refreshing\s+your\s+debrid\s+library|obsolete\s+configuration|\[❌\]\s*comet|\b(?:public\s+)?rate[-\s]?limit(?:ed)?\s+exceeded\b|couldn['’]?t\s+start\s+this\s+stream|could\s+not\s+start\s+this\s+stream|not\s+cached[^\n]{0,80}(?:debrid|server|yet|wait)|\bwrong\s+ip\b|infringing[_\s-]?file|\bcopyright\b/i.test(
    text
  );
};

const PUBLIC_FALLBACK_TRACKERS = [
  "udp://tracker.publictracker.xyz:6969/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker2.dler.org:80/announce",
  "udp://tracker.wildkat.net:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://tracker.qu.ax:6969/announce",
  "udp://tracker.peerfect.org:6969/announce",
  "udp://tracker.opentrackr.com:6969/announce",
  "udp://tracker.ilibr.org:6969/announce",
  "udp://tracker.gmi.gd:6969/announce",
  "udp://tracker.ducks.party:1984/announce",
  "udp://tracker.dler.org:6969/announce",
  "udp://tracker.corpscorp.online:80/announce",
  "udp://tracker.bittor.pw:1337/announce",
  "udp://tracker.auctor.tv:6969/announce",
  "udp://tracker.0x7c0.com:6969/announce",
];

const normaliseTrackerList = (...values) =>
  Array.from(
    new Set(
      values
        .flatMap((value) =>
          Array.isArray(value)
            ? value
            : typeof value === "string"
              ? value.split(/[\r\n,]+/)
              : []
        )
        .map((value) => clean(value))
        .map((value) => value.replace(/^tracker:/i, ""))
        .filter((value) => /^https?:\/\/|^udp:\/\//i.test(value))
    )
  );

const enrichMagnetWithTrackers = (value, extraTrackers = []) => {
  const magnet = clean(value);

  if (!isMagnet(magnet)) {
    return magnet;
  }

  const existingTrackers = [];
  const trackerRe = /(?:[?&])tr=([^&]+)/gi;
  let match = null;

  while ((match = trackerRe.exec(magnet))) {
    try {
      existingTrackers.push(decodeURIComponent(match[1]));
    } catch {
      existingTrackers.push(match[1]);
    }
  }

  const additions = normaliseTrackerList(
    extraTrackers,
    PUBLIC_FALLBACK_TRACKERS
  ).filter(
    (tracker) =>
      !existingTrackers.some(
        (existing) => existing.toLowerCase() === tracker.toLowerCase()
      )
  );

  if (additions.length === 0) {
    return magnet;
  }

  return `${magnet}${additions
    .slice(0, Math.max(0, 20 - existingTrackers.length))
    .map((tracker) => `&tr=${encodeURIComponent(tracker)}`)
    .join("")}`;
};

const magnetFromHash = (
  hash,
  title = "",
  trackers = []
) => {
  const infoHash = infoHashFromValue(hash);

  if (!infoHash) {
    return "";
  }

  const params = [
    `xt=urn:btih:${infoHash}`,
  ];

  if (title) {
    params.push(
      `dn=${encodeURIComponent(title)}`
    );
  }

  (
    Array.isArray(trackers)
      ? trackers
      : []
  )
    .filter(Boolean)
    .slice(0, 20)
    .forEach((tracker) => {
      params.push(
        `tr=${encodeURIComponent(
          String(tracker)
        )}`
      );
    });

  return `magnet:?${params.join("&")}`;
};

const parseManifestUrl = (value) => {
  const input = clean(value);

  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    url.hash = "";

    let basePath =
      url.pathname.replace(/\/+$/, "");

    if (/\/manifest\.json$/i.test(basePath)) {
      basePath = basePath.replace(
        /\/manifest\.json$/i,
        ""
      );
    }

    return {
      origin: url.origin,
      basePath,
      search: url.search || "",
    };
  } catch {
    return null;
  }
};

const isBareElfHostedComet = (value) => {
  const parsed = parseManifestUrl(value);

  if (!parsed) {
    return false;
  }

  return (
    parsed.origin === "https://comet.elfhosted.com" &&
    (!parsed.basePath || parsed.basePath === "/")
  );
};

const buildStreamUrl = (
  manifestUrl,
  type,
  streamId
) => {
  const parsed =
    parseManifestUrl(manifestUrl);

  if (!parsed) {
    return "";
  }

  const safeType =
    encodeURIComponent(type);

  const safeId =
    encodeURIComponent(streamId)
      .replace(/%3A/gi, ":");

  const path =
    `${parsed.basePath}/stream/${safeType}/${safeId}.json`
      .replace(/\/{2,}/g, "/");

  return `${parsed.origin}${path}${parsed.search}`;
};

const requestHeaders = (stream) =>
  stream?.behaviorHints?.proxyHeaders
    ?.request ||
  stream?.behavior_hints?.proxyHeaders
    ?.request ||
  stream?.behavior_hints?.proxy_headers
    ?.request ||
  null;

const normaliseStream = (
  stream,
  addonName,
  index
) => {
  if (!stream) {
    return null;
  }

  const label =
    streamLabel(stream, addonName);
  const cometUncachedDownload =
    isCometUncachedDownloadStream(stream, addonName);

  if (!cometUncachedDownload && isAddonControlStream(stream, addonName)) {
    return {
      unsupported: true,
      reason: "addon_control_stream",
      label,
    };
  }

  const externalUrl = clean(
    stream?.externalUrl ||
      stream?.external_url
  );

  if (isHttp(externalUrl)) {
    return {
      id:
        `browser-${addonName}-${index}-provider`,

      label,

      addon:
        addonName,

      type:
        "provider",

      src:
        externalUrl,

      url:
        externalUrl,

      browserFallback:
        true,
    };
  }

  const ytId = clean(
    stream?.ytId ||
      stream?.yt_id
  );

  if (ytId) {
    const url =
      `https://www.youtube.com/watch?v=${encodeURIComponent(
        ytId
      )}`;

    return {
      id:
        `browser-${addonName}-${index}-youtube`,

      label,

      addon:
        addonName,

      type:
        "youtube",

      src:
        url,

      url,

      browserFallback:
        true,
    };
  }

  const rawUrl = clean(
    stream?.url ||
      stream?.link ||
      stream?.src
  );

  const explicitHash = clean(
    stream?.infoHash ||
      stream?.info_hash
  );

  const infoHash =
    infoHashFromValue(
      explicitHash ||
      rawUrl
    ) ||
    infoHashFromBehaviorHints(stream) ||
    (cometUncachedDownload
      ? cometPlaybackHashFromValue(rawUrl)
      : "");
  const cacheSignal = addonDebridCacheSignal(stream, addonName);
  const cachedRequestHeaders = requestHeaders(stream);
  const cachedNeedsHeaders =
    cachedRequestHeaders &&
    typeof cachedRequestHeaders === "object" &&
    Object.keys(cachedRequestHeaders).length > 0;

  if (
    cacheSignal.cached &&
    cacheSignal.resolvedUrl &&
    !cachedNeedsHeaders
  ) {
    return {
      id: `browser-${addonName}-${index}-${infoHash || "cached-rd"}-ready`,
      label,
      addon: addonName,
      type: "url",
      src: cacheSignal.resolvedUrl,
      url: cacheSignal.resolvedUrl,
      infoHash: infoHash || undefined,
      fileIdx:
        stream?.fileIdx ??
        stream?.file_idx ??
        undefined,
      behaviorHints:
        stream?.behaviorHints ||
        stream?.behavior_hints ||
        undefined,
      description: clean(stream?.description),
      reportedSeeders: streamReportedSeeders(stream),
      browserFallback: true,
      debridProvider: "realdebrid",
      viaRealDebrid: true,
      debridCached: true,
      runtimeReadyCached: true,
      debridCacheChecked: true,
      debridCacheCheckState: "cached",
      cacheRequired: false,
      cometUncached: false,
      cacheLabel: "cached",
      resolutionStrategy: "cached_debrid",
    };
  }

  if (cometUncachedDownload) {
    if (!infoHash) {
      return {
        unsupported: true,
        reason: "comet_uncached_missing_hash",
        label,
      };
    }

    const providedTrackers = normaliseTrackerList(
      stream?.sources,
      stream?.announce,
      stream?.trackers
    );

    /*
     * Prefer Comet's exact Stremio tracker list, but keep a valid uncached
     * info-hash usable even when the browser-side row omits `sources`.
     * Public fallback trackers let Real-Debrid start the torrent directly
     * instead of relying on Comet's opaque playback endpoint to create it.
     */
    const effectiveTrackers = normaliseTrackerList(
      providedTrackers,
      PUBLIC_FALLBACK_TRACKERS
    );

    const cacheMagnet = magnetFromHash(
      infoHash,
      clean(stream?.title || stream?.name || ""),
      effectiveTrackers
    );

    const originalTrackerMagnet = magnetFromHash(
      infoHash,
      clean(stream?.title || stream?.name || ""),
      providedTrackers.length > 0 ? providedTrackers : effectiveTrackers
    );

    return {
      id: `browser-${addonName}-${index}-${infoHash}-cache`,
      label,
      addon: addonName,
      type: "rd",
      src: cacheMagnet,
      url: cacheMagnet,
      magnet: cacheMagnet,
      richMagnet: originalTrackerMagnet,
      infoHash,
      fileIdx:
        stream?.fileIdx ??
        stream?.file_idx ??
        undefined,
      behaviorHints:
        stream?.behaviorHints ||
        stream?.behavior_hints ||
        undefined,
      description: clean(stream?.description),
      reportedSeeders: streamReportedSeeders(stream),
      browserFallback: true,
      debridProvider: "realdebrid",
      viaRealDebrid: true,
      cacheRequired: true,
      cometUncached: true,
      cometPlaybackUrl:
        isHttp(rawUrl) ? rawUrl : "",
      resolutionStrategy:
        providedTrackers.length > 0 ? "rd_magnet" : "comet_uncached",
      torrentTrackers: effectiveTrackers,
      torrentMetadataSource:
        providedTrackers.length > 0 ? "comet" : "public_fallback",
    };
  }

  const suppliedTrackers = normaliseTrackerList(
    stream?.sources,
    stream?.announce,
    stream?.trackers
  );

  /*
   * Cached torrents only need their info hash because Real-Debrid already
   * owns the payload. Uncached torrents are different: addon stream objects
   * (especially Torrentio/AIO-style results) often provide only infoHash and
   * fileIdx with no announce list. A bare magnet can therefore be accepted by
   * RD but sit forever at 0 peers. Enrich every torrent magnet with a current
   * public tracker set while preserving any trackers the addon supplied.
   */
  const magnet =
    isMagnet(rawUrl)
      ? enrichMagnetWithTrackers(rawUrl, suppliedTrackers)
      : infoHash
        ? magnetFromHash(
            infoHash,
            clean(
              stream?.title ||
              stream?.name ||
              ""
            ),
            normaliseTrackerList(
              suppliedTrackers,
              PUBLIC_FALLBACK_TRACKERS
            )
          )
        : "";

  if (magnet) {
    return {
      id:
        `browser-${addonName}-${index}-${infoHash || "magnet"}`,

      label,

      addon:
        addonName,

      type:
        "rd",

      src:
        magnet,

      url:
        magnet,

      magnet,

      infoHash:
        infoHash ||
        undefined,

      fileIdx:
        stream?.fileIdx ??
        stream?.file_idx ??
        undefined,

      behaviorHints:
        stream?.behaviorHints ||
        stream?.behavior_hints ||
        undefined,

      browserFallback:
        true,

      debridProvider:
        cacheSignal.cached ? "realdebrid" : undefined,

      viaRealDebrid:
        cacheSignal.cached ? true : undefined,

      debridCached:
        cacheSignal.cached ? true : undefined,

      debridCacheChecked:
        cacheSignal.cached ? true : undefined,

      debridCacheCheckState:
        cacheSignal.cached ? "cached" : undefined,

      cacheRequired:
        cacheSignal.cached ? false : undefined,

      cacheLabel:
        cacheSignal.cached ? "cached" : undefined,

      resolutionStrategy:
        cacheSignal.cached ? "cached_debrid" : "rd_magnet",

      torrentTrackers:
        suppliedTrackers,
    };
  }

  if (isHttp(rawUrl)) {
    const headers =
      requestHeaders(stream);

    if (
      headers &&
      typeof headers === "object" &&
      Object.keys(headers).length > 0
    ) {
      return {
        unsupported:
          true,

        reason:
          "requires_request_headers",
      };
    }

    return {
      id:
        `browser-${addonName}-${index}-${rawUrl.slice(-24)}`,

      label,

      addon:
        addonName,

      type:
        "url",

      src:
        rawUrl,

      url:
        rawUrl,

      behaviorHints:
        stream?.behaviorHints ||
        stream?.behavior_hints ||
        undefined,

      browserFallback:
        true,
      debridProvider:
        cacheSignal.cached ? "realdebrid" : undefined,
      viaRealDebrid:
        cacheSignal.cached ? true : undefined,
      debridCached:
        cacheSignal.cached ? true : undefined,
      runtimeReadyCached:
        cacheSignal.cached ? true : undefined,
      debridCacheChecked:
        cacheSignal.cached ? true : undefined,
      debridCacheCheckState:
        cacheSignal.cached ? "cached" : undefined,
      cacheRequired:
        cacheSignal.cached ? false : undefined,
      cacheLabel:
        cacheSignal.cached ? "cached" : undefined,
      resolutionStrategy:
        cacheSignal.cached ? "cached_debrid" : undefined,
    };
  }

  return null;
};

const magnetRichness = (value) => {
  const magnet = clean(value);

  if (!/^magnet:\?/i.test(magnet)) {
    return -1;
  }

  const trackerCount = (magnet.match(/(?:[?&])tr=/gi) || []).length;
  const hasName = /(?:[?&])dn=/i.test(magnet) ? 1 : 0;

  return trackerCount * 10000 + hasName * 1000 + Math.min(magnet.length, 999);
};

const richestMagnet = (...values) =>
  values
    .map((value) => clean(value))
    .filter((value) => /^magnet:\?/i.test(value))
    .sort((a, b) => magnetRichness(b) - magnetRichness(a))[0] || "";

const mergeSameHashSource = (current, incoming, hash) => {
  const mergedTorrentTrackers = normaliseTrackerList(
    current?.torrentTrackers,
    incoming?.torrentTrackers
  );
  const hasAuthoritativeTorrentMetadata = [current, incoming].some((item) => {
    const trackers = Array.isArray(item?.torrentTrackers)
      ? item.torrentTrackers.filter(Boolean)
      : [];

    return (
      trackers.length > 0 &&
      item?.torrentMetadataSource !== "public_fallback"
    );
  });
  const mergedCometPlaybackUrl =
    current?.cometPlaybackUrl || incoming?.cometPlaybackUrl || "";
  const mergedCometUncached =
    current?.cometUncached === true || incoming?.cometUncached === true;
  const mergedAuthoritativeCached = [current, incoming].some(
    (item) =>
      item?.debridCached === true ||
      item?.runtimeReadyCached === true
  );
  const cachedResolvedSource = [current, incoming].find(
    (item) =>
      item?.runtimeReadyCached === true &&
      isHttp(item?.src || item?.url)
  );
  const cachedResolvedUrl = clean(
    cachedResolvedSource?.src || cachedResolvedSource?.url
  );
  const fallbackMagnet = richestMagnet(
    current?.richMagnet,
    incoming?.richMagnet,
    current?.magnet,
    incoming?.magnet,
    current?.src,
    incoming?.src
  );
  const mergedTitle = clean(
    current?.label ||
      incoming?.label ||
      current?.name ||
      incoming?.name ||
      ""
  );
  const directTrackerMagnet =
    hash && mergedTorrentTrackers.length > 0
      ? magnetFromHash(hash, mergedTitle, mergedTorrentTrackers)
      : "";
  const playbackMagnet = directTrackerMagnet
    ? enrichMagnetWithTrackers(directTrackerMagnet, mergedTorrentTrackers)
    : fallbackMagnet;

  const addons = Array.from(
    new Set(
      [
        ...(Array.isArray(current?.sourceAddons) ? current.sourceAddons : []),
        current?.addon,
        ...(Array.isArray(incoming?.sourceAddons) ? incoming.sourceAddons : []),
        incoming?.addon,
      ]
        .map((value) => clean(value))
        .filter(Boolean)
    )
  );

  return {
    ...incoming,
    ...current,
    infoHash: current?.infoHash || incoming?.infoHash || hash || undefined,
    fileIdx:
      current?.fileIdx ??
      incoming?.fileIdx ??
      undefined,
    ...(cachedResolvedUrl
      ? {
          type: "url",
          src: cachedResolvedUrl,
          url: cachedResolvedUrl,
        }
      : playbackMagnet
        ? {
            src: playbackMagnet,
            url: playbackMagnet,
            magnet: playbackMagnet,
          }
        : {}),
    richMagnet:
      directTrackerMagnet ||
      fallbackMagnet ||
      current?.richMagnet ||
      incoming?.richMagnet ||
      undefined,
    torrentTrackers: mergedTorrentTrackers,
    reportedSeeders: Math.max(
      0,
      Number(current?.reportedSeeders || 0),
      Number(incoming?.reportedSeeders || 0)
    ),
    cometPlaybackUrl:
      mergedCometPlaybackUrl,
    debridProvider:
      mergedAuthoritativeCached
        ? "realdebrid"
        : current?.debridProvider || incoming?.debridProvider || undefined,
    debridCached:
      mergedAuthoritativeCached
        ? true
        : current?.debridCached ?? incoming?.debridCached,
    runtimeReadyCached:
      Boolean(
        cachedResolvedUrl ||
        current?.runtimeReadyCached === true ||
        incoming?.runtimeReadyCached === true
      ),
    debridCacheChecked:
      mergedAuthoritativeCached
        ? true
        : current?.debridCacheChecked ?? incoming?.debridCacheChecked,
    debridCacheCheckState:
      mergedAuthoritativeCached
        ? "cached"
        : current?.debridCacheCheckState || incoming?.debridCacheCheckState || undefined,
    cacheRequired:
      mergedAuthoritativeCached
        ? false
        : Boolean(current?.cacheRequired === true || incoming?.cacheRequired === true),
    cacheLabel:
      mergedAuthoritativeCached
        ? "cached"
        : current?.cacheLabel || incoming?.cacheLabel || undefined,
    cometUncached:
      mergedAuthoritativeCached ? false : mergedCometUncached,
    torrentMetadataSource:
      hasAuthoritativeTorrentMetadata
        ? current?.torrentMetadataSource === "comet" ||
          incoming?.torrentMetadataSource === "comet"
          ? "comet"
          : "addon"
        : current?.torrentMetadataSource ||
          incoming?.torrentMetadataSource ||
          undefined,
    resolutionStrategy:
      mergedAuthoritativeCached
        ? "cached_debrid"
        : mergedCometUncached &&
            !hasAuthoritativeTorrentMetadata &&
            /^https?:\/\//i.test(mergedCometPlaybackUrl)
          ? "comet_uncached"
          : mergedTorrentTrackers.length > 0
            ? "rd_magnet"
            : current?.resolutionStrategy || incoming?.resolutionStrategy || undefined,
    behaviorHints:
      current?.behaviorHints || incoming?.behaviorHints || undefined,
    description:
      current?.description || incoming?.description || undefined,
    sourceAddons: addons,
  };
};

const dedupe = (items) => {
  const output = [];
  const indexByKey = new Map();

  for (const item of items || []) {
    const raw = clean(
      item?.magnet ||
        item?.url ||
        item?.src
    );

    const hash = clean(
      item?.infoHash ||
        infoHashFromValue(raw)
    ).toLowerCase();

    const fileIdx =
      item?.fileIdx ??
      item?.file_idx ??
      "";
    const fileKey =
      fileIdx === "" || fileIdx == null
        ? ""
        : `:${String(fileIdx)}`;

    /*
     * Preserve distinct playable files from the same torrent. Hash-only
     * deduplication made Continue Watching appear to find just one file.
     */
    const key =
      hash
        ? `hash:${hash}${fileKey}`
        : clean(
            item?.url ||
              item?.src ||
              item?.magnet
          );

    if (!key) {
      continue;
    }

    if (!indexByKey.has(key)) {
      indexByKey.set(key, output.length);
      output.push({
        ...item,
        ...(hash && /^magnet:\?/i.test(raw) && item?.cometUncached !== true
          ? { richMagnet: raw }
          : {}),
      });
      continue;
    }

    const existingIndex = indexByKey.get(key);

    if (hash && Number.isInteger(existingIndex)) {
      output[existingIndex] = mergeSameHashSource(
        output[existingIndex],
        item,
        hash
      );
    }
  }

  return output;
};

const fetchJson = async (
  url,
  timeoutMs = 10000
) => {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          mode:
            "cors",

          credentials:
            "omit",

          redirect:
            "follow",

          cache:
            "no-store",

          signal:
            controller.signal,

          headers: {
            Accept:
              "application/json, text/plain, */*",
          },
        }
      );

    if (!response.ok) {
      return {
        ok:
          false,

        status:
          response.status,

        data:
          null,

        error:
          `HTTP ${response.status}`,
      };
    }

    const text =
      await response.text();

    try {
      return {
        ok:
          true,

        status:
          response.status,

        data:
          text
            ? JSON.parse(text)
            : {},

        error:
          "",
      };
    } catch {
      return {
        ok:
          false,

        status:
          response.status,

        data:
          null,

        error:
          "Response was not valid JSON.",
      };
    }
  } catch (error) {
    const timedOut =
      error?.name ===
      "AbortError";

    return {
      ok:
        false,

      status:
        0,

      data:
        null,

      error:
        timedOut
          ? "Timed out"
          : error?.message ||
            "Browser request failed or was blocked by CORS.",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const isTorrentioRequest = (value) => {
  try {
    const parsed = new URL(clean(value));
    return /(^|\.)torrentio\.strem\.fun$/i.test(parsed.hostname);
  } catch {
    return false;
  }
};

const wait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const fetchBrowserJson = async (
  url,
  timeoutMs = 10000
) => {
  let result = await fetchJson(
    url,
    timeoutMs
  );

  const retryableStatus =
    result?.status === 429 ||
    result?.status === 500 ||
    result?.status === 502 ||
    result?.status === 503 ||
    result?.status === 504 ||
    (
      result?.status === 403 &&
      isTorrentioRequest(url)
    );

  if (retryableStatus) {
    await wait(
      result?.status === 429
        ? 650
        : 300
    );

    result = await fetchJson(
      url,
      timeoutMs
    );
  }

  return result;
};

const fetchOneAddon = async ({
  addon,
  type,
  streamId,
  alternateStreamIds = [],
}) => {
  const addonName =
    clean(addon?.name) ||
    "Addon";

  if (isBareElfHostedComet(addon?.url)) {
    return {
      streams: [],
      diagnostic: {
        name: addonName,
        status: "browser_configuration_required",
        playable_count: 0,
        stream_count: 0,
        message:
          "Comet needs a configured manifest URL before browser fallback can use it.",
        browser: true,
      },
    };
  }

  const url =
    buildStreamUrl(
      addon?.url,
      type,
      streamId
    );

  if (!url) {
    return {
      streams:
        [],

      diagnostic: {
        name:
          addonName,

        status:
          "browser_invalid_url",

        playable_count:
          0,

        stream_count:
          0,

        message:
          "Browser fallback could not build a valid stream URL.",

        browser:
          true,
      },
    };
  }

  let result =
    await fetchBrowserJson(
      url,
      10000
    );

  let alternateIdUsed = "";

  /*
   * Match the server-side 404 behaviour. A newly released title can be absent
   * under one identifier (often TMDB) while the same configured addon already
   * recognises an IMDb or title/year identifier. Do not surface the first 404
   * until every alternate identifier prepared by Media God has been tried.
   */
  if (
    !result.ok &&
    result.status === 404 &&
    Array.isArray(alternateStreamIds) &&
    alternateStreamIds.length > 0
  ) {
    for (const alternateStreamId of alternateStreamIds) {
      if (!alternateStreamId || alternateStreamId === streamId) {
        continue;
      }

      const alternateUrl = buildStreamUrl(
        addon?.url,
        type,
        alternateStreamId
      );

      if (!alternateUrl) {
        continue;
      }

      const alternateResult = await fetchBrowserJson(
        alternateUrl,
        10000
      );

      if (alternateResult.ok) {
        result = alternateResult;
        alternateIdUsed = alternateStreamId;
        break;
      }
    }
  }

  if (!result.ok) {
    return {
      streams:
        [],

      diagnostic: {
        name:
          addonName,

        status:
          result.status > 0
            ? `browser_http_${result.status}`
            : "browser_cors_or_network",

        playable_count:
          0,

        stream_count:
          0,

        message:
          result.status === 404
            ? "Browser fallback found no indexed source for this title after trying the available identifiers."
            : result.status > 0
              ? `Browser fallback returned HTTP ${result.status}.`
              : `Browser fallback failed: ${result.error}`,

        browser:
          true,
      },
    };
  }

  let rawStreams =
    Array.isArray(
      result.data?.streams
    )
      ? result.data.streams
      : [];

  if (
    rawStreams.length === 0 &&
    Array.isArray(alternateStreamIds) &&
    alternateStreamIds.length > 0
  ) {
    for (const alternateStreamId of alternateStreamIds) {
      if (!alternateStreamId || alternateStreamId === streamId) {
        continue;
      }

      const alternateUrl = buildStreamUrl(
        addon?.url,
        type,
        alternateStreamId
      );

      if (!alternateUrl) {
        continue;
      }

      const alternateResult = await fetchBrowserJson(
        alternateUrl,
        10000
      );

      const alternateStreams =
        alternateResult.ok &&
        Array.isArray(alternateResult.data?.streams)
          ? alternateResult.data.streams
          : [];

      if (alternateStreams.length > 0) {
        rawStreams = alternateStreams;
        alternateIdUsed = alternateStreamId;
        break;
      }
    }
  }

  /*
   * Mirror the server-side exhaustive lookup in the device/browser path.
   * A non-empty IMDb/TMDb response can still be only the fast-start source;
   * year-qualified title results contain the remaining releases without
   * crossing into another remake/reboot year.
   */
  if (rawStreams.length > 0 &&
    !isAuthoritativeStreamId(alternateIdUsed || streamId)) {
    for (const alternateStreamId of yearQualifiedSearchIds(alternateStreamIds)) {
      if (
        !alternateStreamId ||
        alternateStreamId === streamId ||
        alternateStreamId === alternateIdUsed
      ) {
        continue;
      }

      const alternateUrl = buildStreamUrl(
        addon?.url,
        type,
        alternateStreamId
      );

      if (!alternateUrl) {
        continue;
      }

      const alternateResult = await fetchBrowserJson(
        alternateUrl,
        10000
      );

      const alternateStreams =
        alternateResult.ok &&
        Array.isArray(alternateResult.data?.streams)
          ? alternateResult.data.streams
          : [];

      if (alternateStreams.length > 0) {
        rawStreams = dedupe([
          ...rawStreams,
          ...alternateStreams,
        ]);
        alternateIdUsed = alternateStreamId;
      }
    }
  }

  let unsupportedHeaders =
    0;

  let unsupportedControlStreams =
    0;

  const streams =
    rawStreams
      .map(
        (
          stream,
          index
        ) =>
          normaliseStream(
            stream,
            addonName,
            index
          )
      )
      .filter(
        (item) => {
          if (
            item?.unsupported
          ) {
            if (
              item.reason ===
              "requires_request_headers"
            ) {
              unsupportedHeaders +=
                1;
            }

            if (
              item.reason ===
              "addon_control_stream"
            ) {
              unsupportedControlStreams +=
                1;
            }

            return false;
          }

          return Boolean(item);
        }
      );

  return {
    streams,

    diagnostic: {
      name:
        addonName,

      status:
        streams.length > 0
          ? "browser_ok"
          : "browser_no_playable_streams",

      playable_count:
        streams.length,

      stream_count:
        rawStreams.length,

      message:
        streams.length > 0
          ? `Browser fallback recovered ${streams.length} playable source${
              streams.length === 1
                ? ""
                : "s"
            }${alternateIdUsed ? ` using alternate id ${alternateIdUsed}` : ""}.`
          : unsupportedControlStreams > 0
            ? `${unsupportedControlStreams} addon sync/control item${
                unsupportedControlStreams === 1 ? " was" : "s were"
              } returned and ignored because it is not playable media.`
            : unsupportedHeaders > 0
            ? `${rawStreams.length} stream${
                rawStreams.length === 1
                  ? " was"
                  : "s were"
              } returned, but ${unsupportedHeaders} require request headers the browser player cannot apply.`
            : `Browser fallback returned ${rawStreams.length} stream${
                rawStreams.length === 1
                  ? ""
                  : "s"
              }, with no supported playable source.`,

      browser:
        true,
    },
  };
};

export async function fetchBrowserAddonStreams({
  imdbId,
  tmdbId = "",
  title = "",
  year = "",
  alternateYears = [],
  excludeAddonNames = [],
  mediaType = "movie",
  season = null,
  episode = null,
}) {
  const suppliedImdb =
    clean(imdbId);

  const suppliedTmdb =
    clean(tmdbId);

  const suppliedTitle =
    clean(title);

  const hasValidImdb =
    /^tt\d+$/i.test(
      suppliedImdb
    );

  if (
    !hasValidImdb &&
    !suppliedTmdb &&
    !suppliedTitle
  ) {
    return {
      streams:
        [],

      diagnostics:
        [],

      addonsChecked:
        0,

      attempted:
        false,

      error:
        "A usable IMDb id, TMDb id, or title is required for browser fallback.",
    };
  }

  if (
    mediaType === "tv" &&
    (
      season == null ||
      episode == null
    )
  ) {
    return {
      streams:
        [],

      diagnostics:
        [],

      addonsChecked:
        0,

      attempted:
        false,

      error:
        "Season and episode are required for browser fallback.",
    };
  }

  let addons = [];

  try {
    addons =
      await base44.entities.Addon.list(
        "-created_date",
        100
      );
  } catch (error) {
    return {
      streams:
        [],

      diagnostics: [
        {
          name:
            "Browser fallback",

          status:
            "browser_addon_list_failed",

          playable_count:
            0,

          stream_count:
            0,

          message:
            error?.message ||
            "Could not read configured addons in the browser.",

          browser:
            true,
        },
      ],

      addonsChecked:
        0,

      attempted:
        true,

      error:
        error?.message ||
        "Could not load configured addons.",
    };
  }

  const excludedAddonNames =
    new Set(
      (
        Array.isArray(
          excludeAddonNames
        )
          ? excludeAddonNames
          : []
      )
        .map(
          (value) =>
            clean(value).toLowerCase()
        )
        .filter(Boolean)
    );

  const activeAddons =
    (addons || []).filter(
      (addon) =>
        addon?.installed !== false &&
        addon?.active !== false &&
        addon?.url &&
        !excludedAddonNames.has(
          clean(addon?.name).toLowerCase()
        )
    );

  if (
    activeAddons.length ===
    0
  ) {
    return {
      streams:
        [],

      diagnostics:
        [],

      addonsChecked:
        0,

      attempted:
        true,

      error:
        "No active configured addons are available for browser fallback.",
    };
  }

  const type =
    mediaType === "tv"
      ? "series"
      : "movie";

  /*
   * Keep the requested year in the primary title lookup. Bare franchise-title
   * searches can return every instalment before the year-qualified fallback is
   * reached, which is especially visible with names such as Resident Evil.
   */
  const streamId =
    hasValidImdb
      ? mediaType === "tv"
        ? `${suppliedImdb}:${Number(season)}:${Number(episode)}`
        : suppliedImdb
      : suppliedTmdb
        ? mediaType === "tv"
          ? `tmdb:${suppliedTmdb}:${Number(season)}:${Number(episode)}`
          : `tmdb:${suppliedTmdb}`
        : clean(year)
          ? `search:${suppliedTitle}:${clean(year)}${mediaType === "tv" ? `:${Number(season)}:${Number(episode)}` : ""}`
          : mediaType === "tv"
            ? `search:${suppliedTitle}:${Number(season)}:${Number(episode)}`
            : `search:${suppliedTitle}`;

  const episodeSuffix =
    mediaType === "tv"
      ? `:${Number(season)}:${Number(episode)}`
      : "";

  const cleanAlternateYears =
    (Array.isArray(alternateYears) ? alternateYears : [])
      .map(clean)
      .filter(
        (value) =>
          /^\d{4}$/.test(value) &&
          value !== clean(year)
      )
      .filter(
        (value, index, list) =>
          list.indexOf(value) === index
      );

  const titleWords =
    suppliedTitle
      .split(/\s+/)
      .filter(Boolean);

  const ambiguousShortTitle =
    titleWords.length === 1 &&
    suppliedTitle.length <= 6;

  const yearSearchIds =
    suppliedTitle
      ? [
          clean(year),
          ...cleanAlternateYears,
        ]
          .filter(Boolean)
          .map(
            (candidateYear) =>
              `search:${suppliedTitle}:${candidateYear}${episodeSuffix}`
          )
      : [];

  const alternateStreamIds = [
    suppliedTmdb
      ? `tmdb:${suppliedTmdb}${episodeSuffix}`
      : "",
    hasValidImdb
      ? `imdb:${suppliedImdb}${episodeSuffix}`
      : "",
    suppliedTmdb
      ? `${suppliedTmdb}${episodeSuffix}`
      : "",
    ...yearSearchIds,
    suppliedTitle &&
    !clean(year) &&
    !(
      ambiguousShortTitle &&
      (hasValidImdb || suppliedTmdb)
    )
      ? `search:${suppliedTitle}${episodeSuffix}`
      : "",
  ]
    .filter(Boolean)
    .filter(
      (value, index, list) =>
        value !== streamId &&
        list.indexOf(value) === index
    )
    .slice(0, 6);

  const settled =
    await Promise.allSettled(
      activeAddons.map(
        (addon) =>
          fetchOneAddon({
            addon,
            type,
            streamId,
            alternateStreamIds,
          })
      )
    );

  const streams =
    dedupe(
      settled.flatMap(
        (result) =>
          result.status ===
          "fulfilled"
            ? result.value.streams
            : []
      )
    );

  const diagnostics =
    settled.map(
      (
        result,
        index
      ) => {
        if (
          result.status ===
          "fulfilled"
        ) {
          return result.value
            .diagnostic;
        }

        return {
          name:
            clean(
              activeAddons[index]
                ?.name
            ) ||
            `Addon ${index + 1}`,

          status:
            "browser_error",

          playable_count:
            0,

          stream_count:
            0,

          message:
            result.reason
              ?.message ||
            "Browser fallback lookup failed.",

          browser:
            true,
        };
      }
    );

  return {
    streams,

    diagnostics,

    addonsChecked:
      activeAddons.length,

    attempted:
      true,

    error:
      "",
  };
}

export function mergeAddonStreams(
  ...groups
) {
  return dedupe(
    groups.flatMap(
      (group) =>
        Array.isArray(group)
          ? group
          : []
    )
  );
}

export function shouldUseBrowserAddonFallback(
  lookup
) {
  const streams =
    Array.isArray(
      lookup?.streams
    )
      ? lookup.streams
      : [];

  const diagnostics =
    Array.isArray(
      lookup?.diagnostics
    )
      ? lookup.diagnostics
      : [];

  if (
    streams.length === 0
  ) {
    return true;
  }

  return diagnostics.some(
    (item) => {
      const status = clean(
        item?.status
      ).toLowerCase();

      return (
        [
          "unreachable",
          "no_playable_streams",
          "browser_required",
          "error",
        ].includes(status) ||
        /^http_(?:403|408|429|5\d\d)$/.test(status)
      );
    }
  );
}
