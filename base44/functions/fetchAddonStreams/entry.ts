import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const clean = (value) => String(value || "").trim();

const isHttp = (value) => /^https?:\/\//i.test(clean(value));

const isMagnet = (value) =>
  clean(value).toLowerCase().startsWith("magnet:");

const infoHashFromValue = (value) => {
  const text = clean(value);

  if (/^[a-f0-9]{40}$/i.test(text)) {
    return text;
  }

  const match = text.match(/btih:([a-f0-9]{40})/i);
  return match?.[1] || "";
};

const cometPlaybackHashFromValue = (value) => {
  const text = clean(value);
  const match = text.match(/\/playback\/([a-f0-9]{40})(?:\/|$|\?)/i);
  return match?.[1] || "";
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

const magnetFromHash = (hash, title = "") => {
  const value = clean(hash);

  if (!value) {
    return "";
  }

  return `magnet:?xt=urn:btih:${value}${
    title ? `&dn=${encodeURIComponent(title)}` : ""
  }`;
};

const parseAddonUrl = (value) => {
  const input = clean(value);

  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    url.hash = "";

    let basePath = url.pathname.replace(/\/+$/, "");

    if (/\/manifest\.json$/i.test(basePath)) {
      basePath = basePath.replace(/\/manifest\.json$/i, "");
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
  const parsed = parseAddonUrl(value);

  if (!parsed) {
    return false;
  }

  return (
    parsed.origin === "https://comet.elfhosted.com" &&
    (!parsed.basePath || parsed.basePath === "/")
  );
};

const buildAddonUrl = (addonUrl, resourcePath) => {
  const parsed = parseAddonUrl(addonUrl);

  if (!parsed) {
    return "";
  }

  const path = String(resourcePath || "").replace(/^\/+/, "");

  const joinedPath =
    `${parsed.basePath}/${path}`.replace(/\/{2,}/g, "/");

  return `${parsed.origin}${joinedPath}${parsed.search}`;
};

const getManifestUrl = (value) =>
  buildAddonUrl(value, "manifest.json");

const getStreamUrl = (value, type, streamId) =>
  buildAddonUrl(
    value,
    `stream/${encodeURIComponent(type)}/${encodeURIComponent(
      streamId
    )}.json`
  );

const streamTitle = (stream) =>
  String(
    stream?.title ||
      stream?.name ||
      stream?.filename ||
      "Stream"
  )
    .split("\n")[0]
    .trim();

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

  const cometUncachedDownload =
    /\bcomet\b/i.test(clean(addonName)) &&
    /\[\s*RD\s*⬇(?:\uFE0F)?\s*\]/i.test(text);

  return (
    cometUncachedDownload ||
    /\bcomet\s+sync\b|debrid_sync_triggered|account\s+sync\s+started|refreshing\s+your\s+debrid\s+library|obsolete\s+configuration|\[❌\]\s*comet|\b(?:public\s+)?rate[-\s]?limit(?:ed)?\s+exceeded\b|couldn['’]?t\s+start\s+this\s+stream|could\s+not\s+start\s+this\s+stream|not\s+cached[^\n]{0,80}(?:debrid|server|yet|wait)|\bwrong\s+ip\b|infringing[_\s-]?file|\bcopyright\b/i.test(
      text
    )
  );
};

const addonSupportsStreams = (manifest) => {
  const resources = Array.isArray(manifest?.resources)
    ? manifest.resources
    : [];

  if (resources.length === 0) {
    return null;
  }

  return resources.some((resource) => {
    if (typeof resource === "string") {
      return resource === "stream";
    }

    return resource?.name === "stream";
  });
};

const addonSupportsType = (manifest, mediaType) => {
  const types = Array.isArray(manifest?.types)
    ? manifest.types
    : [];

  if (types.length === 0) {
    return null;
  }

  const wanted =
    mediaType === "tv"
      ? "series"
      : "movie";

  return types.includes(wanted);
};

const fetchJsonWithTimeout = async (
  url,
  timeoutMs = 4500
) => {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",

      headers: {
        Accept:
          "application/json, text/plain, */*",

        "User-Agent":
          "Media-God/1.0 Stremio-Compatible-Client",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: `HTTP ${response.status}`,
      };
    }

    const text = await response.text();

    try {
      return {
        ok: true,
        status: response.status,
        data:
          text
            ? JSON.parse(text)
            : {},
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        data: null,
        error:
          "Response was not valid JSON.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,

      error:
        error?.name === "AbortError"
          ? "Timed out"
          : error?.message ||
            "Request failed",
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

const fetchAddonJson = async (
  url,
  timeoutMs = 4500
) => {
  let result = await fetchJsonWithTimeout(
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

    result = await fetchJsonWithTimeout(
      url,
      timeoutMs
    );
  }

  return result;
};

const getRequestHeaders = (stream) =>
  stream?.behaviorHints?.proxyHeaders?.request ||
  stream?.behavior_hints?.proxyHeaders?.request ||
  stream?.behavior_hints?.proxy_headers?.request ||
  null;

const hasRequiredRequestHeaders = (stream) => {
  const requestHeaders =
    getRequestHeaders(stream);

  return (
    requestHeaders &&
    typeof requestHeaders === "object" &&
    Object.keys(requestHeaders).length > 0
  );
};

const normaliseStream = (
  stream,
  addonName,
  index
) => {
  if (!stream) {
    return null;
  }

  const label =
    `${addonName}: ${streamTitle(stream)}`;

  if (isAddonControlStream(stream, addonName)) {
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
        `${addonName}-${index}-provider`,

      label,
      addon: addonName,
      type: "provider",
      src: externalUrl,
      url: externalUrl,
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
        `${addonName}-${index}-youtube`,

      label,
      addon: addonName,
      type: "youtube",
      src: url,
      url,
    };
  }

  const rawUrl = clean(
    stream?.url ||
      stream?.link ||
      stream?.src
  );

  const infoHash =
    clean(
      stream?.infoHash ||
        stream?.info_hash
    ) ||
    infoHashFromValue(rawUrl);

  const magnet =
    isMagnet(rawUrl)
      ? rawUrl
      : infoHash
        ? magnetFromHash(
            infoHash,
            streamTitle(stream)
          )
        : "";

  if (magnet) {
    return {
      id:
        `${addonName}-${index}-${infoHash || "magnet"}`,

      label,
      addon: addonName,

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
    };
  }

  if (isHttp(rawUrl)) {
    if (
      hasRequiredRequestHeaders(stream)
    ) {
      return {
        unsupported:
          true,

        reason:
          "requires_request_headers",

        label,
      };
    }

    return {
      id:
        `${addonName}-${index}-${rawUrl.slice(-24)}`,

      label,
      addon: addonName,

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
    };
  }

  return null;
};

const dedupe = (items) => {
  const seen = new Set();

  return items.filter((item) => {
    const raw = clean(
      item?.magnet ||
        item?.url ||
        item?.src
    );

    const hash = clean(
      item?.infoHash ||
        infoHashFromValue(raw)
    ).toLowerCase();

    const key =
      hash
        ? `hash:${hash}`
        : clean(
            item?.url ||
              item?.magnet ||
              item?.src
          );

    if (
      !key ||
      seen.has(key)
    ) {
      return false;
    }

    seen.add(key);

    return true;
  });
};

const healthCheckAddon = async (addon) => {
  const addonName =
    clean(addon?.name) ||
    "Addon";

  if (isBareElfHostedComet(addon?.url)) {
    return {
      name: addonName,
      status: "configuration_required",
      stream_count: 0,
      playable_count: 0,
      message:
        "Comet needs a configured manifest URL for Media God. Open Comet Configure, add your debrid service, then paste its generated manifest URL.",
    };
  }

  const manifestUrl =
    getManifestUrl(
      addon?.url
    );

  if (!manifestUrl) {
    return {
      name:
        addonName,

      status:
        "invalid_url",

      stream_count:
        0,

      playable_count:
        0,

      message:
        "Addon URL is invalid.",
    };
  }

  const result =
    await fetchAddonJson(
      manifestUrl,
      8000
    );

  if (!result.ok) {
    return {
      name:
        addonName,

      status:
        result.status === 0
          ? "unreachable"
          : `http_${result.status}`,

      stream_count:
        0,

      playable_count:
        0,

      message:
        result.error ||
        `Manifest endpoint returned ${result.status}.`,
    };
  }

  const manifest =
    result.data ||
    {};

  const supportsStreams =
    addonSupportsStreams(
      manifest
    );

  if (
    supportsStreams === false
  ) {
    return {
      name:
        addonName,

      status:
        "no_stream_resource",

      stream_count:
        0,

      playable_count:
        0,

      message:
        "Manifest is reachable but does not advertise stream support.",
    };
  }

  return {
    name:
      addonName,

    status:
      "ok",

    stream_count:
      0,

    playable_count:
      0,

    message:
      `Manifest reachable${
        manifest?.name
          ? ` (${clean(manifest.name)})`
          : ""
      }.`,
  };
};

const lookupAddon = async ({
  addon,
  type,
  streamId,
  alternateStreamIds = [],
  mediaType,
  skipManifest = false,
  manifestTimeoutMs = 3000,
  streamTimeoutMs = 5000,
}) => {
  const addonName =
    clean(addon?.name) ||
    "Addon";

  if (isBareElfHostedComet(addon?.url)) {
    return {
      streams: [],
      diagnostic: {
        name: addonName,
        status: "configuration_required",
        stream_count: 0,
        playable_count: 0,
        message:
          "Comet is using its bare public manifest. Add a configured Comet manifest to enable stream lookup.",
      },
    };
  }

  const manifestUrl =
    getManifestUrl(
      addon?.url
    );

  const targetUrl =
    getStreamUrl(
      addon?.url,
      type,
      streamId
    );

  if (
    !manifestUrl ||
    !targetUrl
  ) {
    return {
      streams:
        [],

      diagnostic: {
        name:
          addonName,

        status:
          "invalid_url",

        stream_count:
          0,

        playable_count:
          0,

        message:
          "Addon URL is invalid.",
      },
    };
  }

  let manifest =
    null;

  let manifestStatus =
    "unknown";

  if (!skipManifest) {
    const manifestResult =
      await fetchAddonJson(
        manifestUrl,
        manifestTimeoutMs
      );

    if (
      manifestResult.ok
    ) {
      manifest =
        manifestResult.data;

      manifestStatus =
        "ok";

      const supportsStreams =
        addonSupportsStreams(
          manifest
        );

      if (
        supportsStreams === false
      ) {
        return {
          streams:
            [],

          diagnostic: {
            name:
              addonName,

            status:
              "no_stream_resource",

            stream_count:
              0,

            playable_count:
              0,

            message:
              "Manifest does not advertise stream support.",
          },
        };
      }

      const supportsType =
        addonSupportsType(
          manifest,
          mediaType
        );

      if (
        supportsType === false
      ) {
        return {
          streams:
            [],

          diagnostic: {
            name:
              addonName,

            status:
              "wrong_media_type",

            stream_count:
              0,

            playable_count:
              0,

            message:
              "Addon does not advertise this media type.",
          },
        };
      }
    } else {
      manifestStatus =
        manifestResult.status === 0
          ? "unreachable"
          : `http_${manifestResult.status}`;
    }
  } else {
    manifestStatus =
      "skipped_fast";
  }

  const result =
    await fetchAddonJson(
      targetUrl,
      streamTimeoutMs
    );

  if (
    !result.ok
  ) {
    return {
      streams:
        [],

      diagnostic: {
        name:
          addonName,

        status:
          result.status === 0
            ? "unreachable"
            : `http_${result.status}`,

        stream_count:
          0,

        playable_count:
          0,

        message:
          result.error ||
          `Stream endpoint returned ${result.status}. Manifest status: ${manifestStatus}.`,
      },
    };
  }

  let rawStreams =
    Array.isArray(
      result.data?.streams
    )
      ? result.data.streams
      : [];

  let alternateIdUsed = "";

  if (
    rawStreams.length === 0 &&
    Array.isArray(alternateStreamIds) &&
    alternateStreamIds.length > 0
  ) {
    for (const alternateStreamId of alternateStreamIds) {
      if (!alternateStreamId || alternateStreamId === streamId) {
        continue;
      }

      const alternateUrl = getStreamUrl(
        addon?.url,
        type,
        alternateStreamId
      );

      if (!alternateUrl) {
        continue;
      }

      const alternateResult = await fetchAddonJson(
        alternateUrl,
        streamTimeoutMs
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

  let unsupportedHeaders =
    0;

  let unsupportedControlStreams =
    0;

  let ipBoundCometDirectStreams =
    0;

  const addonUrlParts =
    parseAddonUrl(addon?.url);

  const deferCometDirectToBrowser =
    addonUrlParts?.origin === "https://comet.elfhosted.com" &&
    Boolean(addonUrlParts?.basePath && addonUrlParts.basePath !== "/");

  const normalised =
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

          /*
           * ElfHosted Comet binds generated direct debrid URLs to the IP
           * address that requested the stream resource. A URL generated here
           * on the Base44 server will therefore fail with "Wrong IP" when the
           * user's phone/TV later tries to play it. Keep torrent/info-hash
           * results server-side, but deliberately defer Comet's direct HTTP
           * links so Media God's browser fallback requests them from the
           * actual playback device instead.
           */
          if (
            deferCometDirectToBrowser &&
            item?.type === "url"
          ) {
            ipBoundCometDirectStreams += 1;
            return false;
          }

          return Boolean(item);
        }
      );

  return {
    streams:
      normalised,

    diagnostic: {
      name:
        addonName,

      status:
        ipBoundCometDirectStreams > 0
          ? "browser_required"
          : normalised.length > 0
            ? "ok"
            : "no_playable_streams",

      stream_count:
        rawStreams.length,

      playable_count:
        normalised.length,

      message:
        ipBoundCometDirectStreams > 0
          ? `${ipBoundCometDirectStreams} Comet direct source${
              ipBoundCometDirectStreams === 1 ? " was" : "s were"
            } deferred to the playback device because Comet binds these links to the requesting IP.${
              normalised.length > 0
                ? ` ${normalised.length} non-IP-bound source${normalised.length === 1 ? " remains" : "s remain"} usable from the server.`
                : ""
            }`
          : normalised.length > 0
            ? `${normalised.length} playable source${
                normalised.length === 1
                  ? ""
                  : "s"
              } found${alternateIdUsed ? ` using alternate id ${alternateIdUsed}` : ""}.`
          : unsupportedControlStreams > 0
            ? `${unsupportedControlStreams} addon sync/control item${
                unsupportedControlStreams === 1 ? " was" : "s were"
              } returned and ignored because it is not playable media.`
            : unsupportedHeaders > 0
            ? `${rawStreams.length} stream${
                rawStreams.length === 1
                  ? " was"
                  : "s were"
              } returned, but ${unsupportedHeaders} require request headers that the browser player cannot safely apply.`
            : rawStreams.length > 0
              ? `${rawStreams.length} stream${
                  rawStreams.length === 1
                    ? " was"
                    : "s were"
                } returned, but none contained a supported direct URL, external URL, YouTube id, magnet, or info hash.`
              : `Addon returned zero streams. Manifest status: ${manifestStatus}.`,
    },
  };
};

export default async function (req) {
  try {
    const base44 =
      createClientFromRequest(req);

    const user =
      await base44.auth.me();

    if (!user) {
      return Response.json(
        {
          error:
            "Unauthorized",
        },
        {
          status:
            401,
        }
      );
    }

    let body =
      {};

    try {
      body =
        await req.json();
    } catch {
      body =
        {};
    }

    let addons =
      [];

    try {
      addons =
        await base44.entities.Addon.list(
          "-created_date",
          100
        );
    } catch {
      addons =
        [];
    }

    const excludedAddonNames =
      new Set(
        (
          Array.isArray(
            body?.exclude_addons
          )
            ? body.exclude_addons
            : []
        )
          .map(
            (value) =>
              clean(value).toLowerCase()
          )
          .filter(Boolean)
      );

    const allActiveAddons =
      (addons || []).filter(
        (addon) =>
          addon?.installed !== false &&
          addon?.active !== false &&
          addon?.url
      );

    const activeAddons =
      allActiveAddons.filter(
        (addon) =>
          !excludedAddonNames.has(
            clean(addon?.name).toLowerCase()
          )
      );

    if (
      allActiveAddons.length === 0
    ) {
      return Response.json({
        streams:
          [],

        diagnostics:
          [],

        addons_checked:
          0,

        addons_available:
          0,

        reason:
          "No server-side playback addons are configured. Only Addon records saved in Base44 are searched.",
      });
    }

    if (
      activeAddons.length === 0
    ) {
      return Response.json({
        streams:
          [],

        diagnostics:
          [],

        addons_checked:
          0,

        addons_available:
          allActiveAddons.length,

        reason:
          "All active addons were already satisfied by the fast source pass.",
      });
    }

    const action =
      clean(
        body?.action
      ).toLowerCase();

    if (
      action === "health"
    ) {
      const settled =
        await Promise.allSettled(
          activeAddons
            .slice(
              0,
              30
            )
            .map(
              (addon) =>
                healthCheckAddon(
                  addon
                )
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
              return result.value;
            }

            return {
              name:
                clean(
                  activeAddons[index]?.name
                ) ||
                `Addon ${index + 1}`,

              status:
                "error",

              stream_count:
                0,

              playable_count:
                0,

              message:
                result.reason?.message ||
                "Addon health check failed.",
            };
          }
        );

      return Response.json({
        action:
          "health",

        streams:
          [],

        diagnostics,

        addons_checked:
          activeAddons.length,

        addons_available:
          allActiveAddons.length,
      });
    }

    const imdbId =
      clean(
        body.imdb_id ||
          body.imdbId
      );

    const title =
      clean(
        body.title
      );

    const tmdbId =
      clean(
        body.tmdb_id ||
          body.tmdbId
      );

    const year =
      clean(
        body.year
      );

    const mediaType =
      body.media_type === "tv" ||
      body.mediaType === "tv"
        ? "tv"
        : "movie";

    const season =
      body.season != null &&
      body.season !== ""
        ? Number(
            body.season
          )
        : null;

    const episode =
      body.episode != null &&
      body.episode !== ""
        ? Number(
            body.episode
          )
        : null;

    if (
      mediaType === "tv" &&
      (
        season == null ||
        episode == null ||
        !Number.isFinite(
          season
        ) ||
        !Number.isFinite(
          episode
        )
      )
    ) {
      return Response.json({
        streams:
          [],

        diagnostics:
          [],

        addons_checked:
          activeAddons.length,

        addons_available:
          allActiveAddons.length,

        reason:
          "Select a valid season and episode first.",
      });
    }

    if (
      !imdbId &&
      !tmdbId &&
      !title
    ) {
      return Response.json(
        {
          error:
            "An IMDb id or title is required.",

          streams:
            [],

          diagnostics:
            [],

          addons_checked:
            activeAddons.length,

          addons_available:
            allActiveAddons.length,
        },
        {
          status:
            400,
        }
      );
    }

    const type =
      mediaType === "tv"
        ? "series"
        : "movie";

    const streamId =
      imdbId
        ? mediaType === "tv"
          ? `${imdbId}:${season}:${episode}`
          : imdbId
        : tmdbId
          ? mediaType === "tv"
            ? `tmdb:${tmdbId}:${season}:${episode}`
            : `tmdb:${tmdbId}`
          : mediaType === "tv"
            ? `search:${title}:${season}:${episode}`
            : `search:${title}`;

    const fastMode =
      body?.fast_mode === true ||
      body?.fastMode === true;

    const episodeSuffix =
      mediaType === "tv"
        ? `:${season}:${episode}`
        : "";

    const broadAlternateStreamIds = [
      tmdbId
        ? `tmdb:${tmdbId}${episodeSuffix}`
        : "",
      imdbId
        ? `imdb:${imdbId}${episodeSuffix}`
        : "",
      tmdbId
        ? `${tmdbId}${episodeSuffix}`
        : "",
      title
        ? `search:${title}${year ? `:${year}` : ""}${episodeSuffix}`
        : "",
      title
        ? `search:${title}${episodeSuffix}`
        : "",
    ]
      .filter(Boolean)
      .filter(
        (value, index, list) =>
          value !== streamId &&
          list.indexOf(value) === index
      );

    const alternateStreamIds =
      fastMode
        ? broadAlternateStreamIds.slice(0, 1)
        : broadAlternateStreamIds.slice(0, 5);

    const selectedAddons =
      fastMode
        ? activeAddons.slice(0, 6)
        : activeAddons;

    const settled =
      await Promise.allSettled(
        selectedAddons.map(
          (addon) =>
            lookupAddon({
              addon,
              type,
              streamId,
              alternateStreamIds,
              mediaType,
              skipManifest:
                fastMode,
              manifestTimeoutMs:
                fastMode ? 900 : 3000,
              streamTimeoutMs:
                fastMode ? 1800 : 5000,
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
            return result.value.diagnostic;
          }

          return {
            name:
              clean(
                selectedAddons[index]?.name
              ) ||
              `Addon ${index + 1}`,

            status:
              "error",

            stream_count:
              0,

            playable_count:
              0,

            message:
              result.reason?.message ||
              "Addon lookup failed.",
          };
        }
      );

    return Response.json({
      streams,

      diagnostics,

      addons_checked:
        selectedAddons.length,

      addons_available:
        allActiveAddons.length,

      fast_mode:
        fastMode,

      media_type:
        mediaType,

      imdb_id:
        imdbId,

      title,

      season,

      episode,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Unable to fetch addon streams.",

        streams:
          [],

        diagnostics:
          [],
      },
      {
        status:
          500,
      }
    );
  }
}
