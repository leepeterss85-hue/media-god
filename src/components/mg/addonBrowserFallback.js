import { base44 } from "@/api/base44Client";

const clean = (value) => String(value || "").trim();

const isHttp = (value) => /^https?:\/\//i.test(clean(value));
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
    );

  const magnet =
    isMagnet(rawUrl)
      ? rawUrl
      : infoHash
        ? magnetFromHash(
            infoHash,
            clean(
              stream?.title ||
              stream?.name ||
              ""
            ),
            stream?.announce ||
            stream?.trackers ||
            []
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
    };
  }

  return null;
};

const dedupe = (items) => {
  const seen = new Set();

  return (items || []).filter(
    (item) => {
      const key = clean(
        item?.url ||
          item?.src ||
          item?.magnet ||
          item?.infoHash
      );

      if (
        !key ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
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

const fetchOneAddon = async ({
  addon,
  type,
  streamId,
}) => {
  const addonName =
    clean(addon?.name) ||
    "Addon";

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

  const result =
    await fetchJson(
      url,
      10000
    );

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
          result.status > 0
            ? `Browser fallback returned HTTP ${result.status}.`
            : `Browser fallback failed: ${result.error}`,

        browser:
          true,
      },
    };
  }

  const rawStreams =
    Array.isArray(
      result.data?.streams
    )
      ? result.data.streams
      : [];

  let unsupportedHeaders =
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
            }.`
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
  mediaType = "movie",
  season = null,
  episode = null,
}) {
  if (
    !/^tt\d+$/i.test(
      clean(imdbId)
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
        "IMDb id is required for browser fallback.",
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

  const activeAddons =
    (addons || []).filter(
      (addon) =>
        addon?.installed !== false &&
        addon?.active !== false &&
        addon?.url
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

  const streamId =
    mediaType === "tv"
      ? `${clean(imdbId)}:${Number(
          season
        )}:${Number(
          episode
        )}`
      : clean(imdbId);

  const settled =
    await Promise.allSettled(
      activeAddons
        .slice(
          0,
          30
        )
        .map(
          (addon) =>
            fetchOneAddon({
              addon,
              type,
              streamId,
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
    ).slice(
      0,
      80
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
    (item) =>
      [
        "http_403",
        "unreachable",
        "no_playable_streams",
        "error",
      ].includes(
        clean(
          item?.status
        ).toLowerCase()
      )
  );
}
