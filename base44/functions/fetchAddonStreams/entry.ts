import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const clean = (value) =>
  String(value || "").trim();

const isHttp = (value) =>
  /^https?:\/\//i.test(
    clean(value)
  );

const isHttps = (value) =>
  /^https:\/\//i.test(
    clean(value)
  );

const isMagnet = (value) =>
  clean(value)
    .toLowerCase()
    .startsWith(
      "magnet:"
    );

const infoHashFromValue = (value) => {
  const text =
    clean(value);

  if (
    /^[a-f0-9]{40}$/i.test(
      text
    )
  ) {
    return text;
  }

  return (
    text.match(
      /btih:([a-f0-9]{40})/i
    )?.[1] ||
    ""
  );
};

const magnetFromHash = (
  hash,
  title = ""
) => {
  const value =
    clean(hash);

  if (!value) {
    return "";
  }

  return `magnet:?xt=urn:btih:${value}${
    title
      ? `&dn=${encodeURIComponent(
          title
        )}`
      : ""
  }`;
};

const getManifestUrl = (value) => {
  const url =
    clean(value).replace(
      /\/+$/,
      ""
    );

  if (!url) {
    return "";
  }

  if (
    /\/manifest\.json(?:\?.*)?$/i.test(
      url
    )
  ) {
    return url;
  }

  return `${url}/manifest.json`;
};

const getAddonBaseUrl = (value) =>
  clean(value)
    .replace(
      /\/manifest\.json(?:\?.*)?$/i,
      ""
    )
    .replace(
      /\/+$/,
      ""
    );

const streamTitle = (stream) =>
  clean(
    stream?.title ||
      stream?.name ||
      stream?.filename ||
      "Stream"
  )
    .split(
      "\n"
    )[0]
    .trim();

const fetchJsonWithTimeout =
  async (
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
            signal:
              controller.signal,

            headers: {
              Accept:
                "application/json",

              "User-Agent":
                "Media-God/1.0",
            },
          }
        );

      if (
        !response.ok
      ) {
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

      return {
        ok:
          true,

        status:
          response.status,

        data:
          await response.json(),
      };
    } catch (error) {
      return {
        ok:
          false,

        status:
          0,

        data:
          null,

        error:
          error?.name ===
          "AbortError"
            ? "Timed out"
            : error?.message ||
              "Request failed",
      };
    } finally {
      clearTimeout(
        timeout
      );
    }
  };

const resourceSupportsStreams =
  (
    manifest
  ) => {
    const resources =
      Array.isArray(
        manifest?.resources
      )
        ? manifest.resources
        : [];

    if (
      resources.length ===
      0
    ) {
      return null;
    }

    return resources.some(
      (resource) => {
        if (
          typeof resource ===
          "string"
        ) {
          return (
            resource ===
            "stream"
          );
        }

        return (
          resource?.name ===
          "stream"
        );
      }
    );
  };

const manifestSupportsType =
  (
    manifest,
    mediaType
  ) => {
    const types =
      Array.isArray(
        manifest?.types
      )
        ? manifest.types
        : [];

    if (
      types.length ===
      0
    ) {
      return null;
    }

    return types.includes(
      mediaType ===
      "tv"
        ? "series"
        : "movie"
    );
  };

const requiredProxyHeaders =
  (
    stream
  ) => {
    const requestHeaders =
      stream
        ?.behaviorHints
        ?.proxyHeaders
        ?.request ||
      stream
        ?.behavior_hints
        ?.proxyHeaders
        ?.request ||
      stream
        ?.behavior_hints
        ?.proxy_headers
        ?.request ||
      null;

    return Boolean(
      requestHeaders &&
        typeof requestHeaders ===
          "object" &&
        Object.keys(
          requestHeaders
        ).length >
          0
    );
  };

const normaliseStream =
  (
    stream,
    addonName,
    index
  ) => {
    if (!stream) {
      return null;
    }

    const title =
      streamTitle(
        stream
      );

    const label =
      `${addonName}: ${title}`;

    const externalUrl =
      clean(
        stream?.externalUrl ||
          stream?.external_url
      );

    if (
      isHttp(
        externalUrl
      )
    ) {
      return {
        id:
          `${addonName}-${index}-provider`,

        label,

        addon:
          addonName,

        type:
          "provider",

        src:
          externalUrl,

        url:
          externalUrl,
      };
    }

    const ytId =
      clean(
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

        addon:
          addonName,

        type:
          "youtube",

        src:
          url,

        url,
      };
    }

    const rawUrl =
      clean(
        stream?.url ||
          stream?.link ||
          stream?.src
      );

    const infoHash =
      clean(
        stream?.infoHash ||
          stream?.info_hash
      ) ||
      infoHashFromValue(
        rawUrl
      );

    const magnet =
      isMagnet(
        rawUrl
      )
        ? rawUrl
        : infoHash
          ? magnetFromHash(
              infoHash,
              title
            )
          : "";

    if (magnet) {
      return {
        id:
          `${addonName}-${index}-${infoHash || "magnet"}`,

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

        behaviorHints:
          stream
            ?.behaviorHints ||
          stream
            ?.behavior_hints ||
          undefined,
      };
    }

    if (
      isHttp(
        rawUrl
      )
    ) {
      if (
        requiredProxyHeaders(
          stream
        )
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
          `${addonName}-${index}-${rawUrl.slice(
            -24
          )}`,

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
          stream
            ?.behaviorHints ||
          stream
            ?.behavior_hints ||
          undefined,
      };
    }

    return null;
  };

const dedupeStreams = (items) => {
  const seen =
    new Set();

  return items.filter(
    (item) => {
      const key =
        clean(
          item?.url ||
            item?.magnet ||
            item?.infoHash ||
            item?.src ||
            item?.label
        );

      if (
        !key ||
        seen.has(
          key
        )
      ) {
        return false;
      }

      seen.add(
        key
      );

      return true;
    }
  );
};

const getActiveAddons =
  async (
    base44
  ) => {
    try {
      const addons =
        await base44.entities.Addon.list(
          "-created_date",
          100
        );

      return (
        addons ||
        []
      ).filter(
        (addon) =>
          addon?.installed !==
            false &&
          addon?.active !==
            false &&
          isHttps(
            addon?.url
          )
      );
    } catch {
      return [];
    }
  };

const checkAddonManifest =
  async (
    addon
  ) => {
    const name =
      clean(
        addon?.name
      ) ||
      "Addon";

    const manifestUrl =
      getManifestUrl(
        addon?.url
      );

    if (
      !manifestUrl ||
      !isHttps(
        manifestUrl
      )
    ) {
      return {
        name,

        status:
          "invalid_url",

        message:
          "Use an HTTPS manifest URL.",
      };
    }

    const result =
      await fetchJsonWithTimeout(
        manifestUrl,
        7000
      );

    if (
      !result.ok
    ) {
      return {
        name,

        status:
          result.status ===
          0
            ? "unreachable"
            : `http_${result.status}`,

        message:
          result.error ||
          "Manifest request failed.",
      };
    }

    const manifest =
      result.data ||
      {};

    const supportsStreams =
      resourceSupportsStreams(
        manifest
      );

    if (
      supportsStreams ===
      false
    ) {
      return {
        name,

        status:
          "no_stream_resource",

        message:
          "Manifest does not advertise a stream resource.",
      };
    }

    return {
      name,

      status:
        "ok",

      message:
        clean(
          manifest?.name
        ) ||
        "Manifest reachable.",

      types:
        Array.isArray(
          manifest?.types
        )
          ? manifest.types
          : [],
    };
  };

const fetchStreamsFromAddon =
  async ({
    addon,
    imdbId,
    mediaType,
    season,
    episode,
  }) => {
    const addonName =
      clean(
        addon?.name
      ) ||
      "Addon";

    const baseUrl =
      getAddonBaseUrl(
        addon?.url
      );

    const manifestUrl =
      getManifestUrl(
        addon?.url
      );

    if (
      !baseUrl ||
      !manifestUrl ||
      !isHttps(
        manifestUrl
      )
    ) {
      return {
        streams: [],

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
            "Use an HTTPS manifest URL.",
        },
      };
    }

    const manifestResult =
      await fetchJsonWithTimeout(
        manifestUrl,
        6000
      );

    if (
      !manifestResult.ok
    ) {
      return {
        streams: [],

        diagnostic: {
          name:
            addonName,

          status:
            manifestResult.status ===
            0
              ? "unreachable"
              : `http_${manifestResult.status}`,

          stream_count:
            0,

          playable_count:
            0,

          message:
            manifestResult.error ||
            "Manifest request failed.",
        },
      };
    }

    const manifest =
      manifestResult.data ||
      {};

    const supportsStreams =
      resourceSupportsStreams(
        manifest
      );

    if (
      supportsStreams ===
      false
    ) {
      return {
        streams: [],

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
      manifestSupportsType(
        manifest,
        mediaType
      );

    if (
      supportsType ===
      false
    ) {
      return {
        streams: [],

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

    const stremioType =
      mediaType ===
      "tv"
        ? "series"
        : "movie";

    const streamId =
      mediaType ===
      "tv"
        ? `${imdbId}:${season}:${episode}`
        : imdbId;

    const result =
      await fetchJsonWithTimeout(
        `${baseUrl}/stream/${stremioType}/${streamId}.json`,
        10000
      );

    if (
      !result.ok
    ) {
      return {
        streams: [],

        diagnostic: {
          name:
            addonName,

          status:
            result.status ===
            0
              ? "unreachable"
              : `http_${result.status}`,

          stream_count:
            0,

          playable_count:
            0,

          message:
            result.error ||
            "Stream request failed.",
        },
      };
    }

    const rawStreams =
      Array.isArray(
        result.data
          ?.streams
      )
        ? result.data
            .streams
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
              item
                ?.unsupported
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

            return Boolean(
              item
            );
          }
        );

    return {
      streams,

      diagnostic: {
        name:
          addonName,

        status:
          streams.length >
          0
            ? "ok"
            : "no_playable_streams",

        stream_count:
          rawStreams.length,

        playable_count:
          streams.length,

        message:
          streams.length >
          0
            ? `${streams.length} usable source${
                streams.length ===
                1
                  ? ""
                  : "s"
              } found.`
            : unsupportedHeaders >
                0
              ? "Streams were returned, but they require request headers the browser player cannot apply."
              : "Addon returned no usable sources.",
      },
    };
  };

export default async function (
  req
) {
  try {
    const base44 =
      createClientFromRequest(
        req
      );

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

    let body = {};

    try {
      body =
        await req.json();
    } catch {
      body = {};
    }

    const action =
      clean(
        body?.action
      ) ||
      "streams";

    const activeAddons =
      await getActiveAddons(
        base44
      );

    if (
      action ===
      "health"
    ) {
      const settled =
        await Promise.allSettled(
          activeAddons
            .slice(
              0,
              30
            )
            .map(
              checkAddonManifest
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
                  activeAddons[
                    index
                  ]?.name
                ) ||
                `Addon ${
                  index +
                  1
                }`,

              status:
                "error",

              message:
                result.reason
                  ?.message ||
                "Manifest check failed.",
            };
          }
        );

      return Response.json({
        addons_checked:
          activeAddons.length,

        diagnostics,
      });
    }

    const imdbId =
      clean(
        body?.imdb_id ||
          body?.imdbId
      );

    const mediaType =
      body?.media_type ===
        "tv" ||
      body?.mediaType ===
        "tv"
        ? "tv"
        : "movie";

    const season =
      body?.season != null
        ? Number(
            body.season
          )
        : null;

    const episode =
      body?.episode != null
        ? Number(
            body.episode
          )
        : null;

    if (
      !/^tt\d+$/i.test(
        imdbId
      )
    ) {
      return Response.json({
        streams: [],

        diagnostics: [],

        addons_checked:
          activeAddons.length,

        reason:
          "A valid IMDb id is required before addon sources can be checked.",
      });
    }

    if (
      mediaType ===
        "tv" &&
      (
        season == null ||
        episode == null
      )
    ) {
      return Response.json({
        streams: [],

        diagnostics: [],

        addons_checked:
          activeAddons.length,

        reason:
          "Select a season and episode first.",
      });
    }

    if (
      activeAddons.length ===
      0
    ) {
      return Response.json({
        streams: [],

        diagnostics: [],

        addons_checked:
          0,

        reason:
          "No active playback addons are configured. Add an authorised Stremio-compatible manifest in Streaming Addons.",
      });
    }

    const settled =
      await Promise.allSettled(
        activeAddons
          .slice(
            0,
            30
          )
          .map(
            (addon) =>
              fetchStreamsFromAddon({
                addon,
                imdbId,
                mediaType,
                season,
                episode,
              })
          )
      );

    const streams =
      dedupeStreams(
        settled.flatMap(
          (result) =>
            result.status ===
            "fulfilled"
              ? result.value
                  .streams
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
                activeAddons[
                  index
                ]?.name
              ) ||
              `Addon ${
                index +
                1
              }`,

            status:
              "error",

            stream_count:
              0,

            playable_count:
              0,

            message:
              result.reason
                ?.message ||
              "Addon lookup failed.",
          };
        }
      );

    return Response.json({
      streams,

      diagnostics,

      addons_checked:
        activeAddons.length,

      media_type:
        mediaType,

      imdb_id:
        imdbId,

      season,

      episode,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Unable to fetch addon streams.",

        streams: [],

        diagnostics: [],
      },
      {
        status:
          500,
      }
    );
  }
}
