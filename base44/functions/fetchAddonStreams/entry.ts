import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const clean = (value) => String(value || "").trim();

const isHttp = (value) =>
  /^https?:\/\//i.test(clean(value));

const isMagnet = (value) =>
  clean(value)
    .toLowerCase()
    .startsWith("magnet:");

const infoHashFromValue = (value) => {
  const text = clean(value);

  if (/^[a-f0-9]{40}$/i.test(text)) {
    return text;
  }

  const match = text.match(
    /btih:([a-f0-9]{40})/i
  );

  return match?.[1] || "";
};

const magnetFromHash = (
  hash,
  title = ""
) => {
  const value = clean(hash);

  if (!value) {
    return "";
  }

  return `magnet:?xt=urn:btih:${value}${
    title
      ? `&dn=${encodeURIComponent(title)}`
      : ""
  }`;
};

const getAddonBaseUrl = (value) =>
  clean(value)
    .replace(
      /\/manifest\.json\/?$/i,
      ""
    )
    .replace(/\/+$/, "");

const streamTitle = (stream) =>
  String(
    stream?.title ||
      stream?.name ||
      stream?.filename ||
      "Stream"
  )
    .split("\n")[0]
    .trim();

const fetchJsonWithTimeout = async (
  url,
  timeoutMs = 10000
) => {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(
      url,
      {
        signal: controller.signal,
        headers: {
          Accept:
            "application/json",
          "User-Agent":
            "Media-God/1.0",
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const dedupe = (items) => {
  const seen = new Set();

  return items.filter((item) => {
    const key = clean(
      item?.url ||
        item?.magnet ||
        item?.infoHash ||
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
          status: 401,
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

    const imdbId = clean(
      body.imdb_id ||
        body.imdbId
    );

    const mediaType =
      body.media_type === "tv" ||
      body.mediaType === "tv"
        ? "tv"
        : "movie";

    const season =
      body.season != null
        ? Number(body.season)
        : null;

    const episode =
      body.episode != null
        ? Number(body.episode)
        : null;

    if (
      !/^tt\d+$/i.test(
        imdbId
      )
    ) {
      return Response.json(
        {
          error:
            "A valid IMDb id is required.",
          streams: [],
        },
        {
          status: 400,
        }
      );
    }

    if (
      mediaType === "tv" &&
      (
        season == null ||
        episode == null
      )
    ) {
      return Response.json({
        streams: [],
        reason:
          "Select a season and episode first.",
      });
    }

    let addons = [];

    try {
      addons =
        await base44.entities.Addon.list(
          "-created_date",
          100
        );
    } catch {
      addons = [];
    }

    const activeAddons =
      (addons || []).filter(
        (addon) =>
          addon?.active &&
          addon?.url
      );

    if (
      activeAddons.length ===
      0
    ) {
      return Response.json({
        streams: [],
        addons_checked: 0,
      });
    }

    const type =
      mediaType === "tv"
        ? "series"
        : "movie";

    const streamId =
      mediaType === "tv"
        ? `${imdbId}:${season}:${episode}`
        : imdbId;

    const results =
      await Promise.allSettled(
        activeAddons
          .slice(0, 30)
          .map(
            async (addon) => {
              const baseUrl =
                getAddonBaseUrl(
                  addon.url
                );

              if (!baseUrl) {
                return [];
              }

              const data =
                await fetchJsonWithTimeout(
                  `${baseUrl}/stream/${type}/${streamId}.json`
                );

              if (
                !Array.isArray(
                  data?.streams
                )
              ) {
                return [];
              }

              return data.streams
                .map(
                  (
                    stream,
                    index
                  ) => {
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
                              streamTitle(
                                stream
                              )
                            )
                          : "";

                    const directUrl =
                      isHttp(
                        rawUrl
                      )
                        ? rawUrl
                        : "";

                    if (
                      !directUrl &&
                      !magnet
                    ) {
                      return null;
                    }

                    const addonName =
                      addon?.name ||
                      "Addon";

                    return {
                      id:
                        `${addonName}-${index}-${infoHash || directUrl.slice(-24)}`,

                      label:
                        `${addonName}: ${streamTitle(
                          stream
                        )}`,

                      addon:
                        addonName,

                      type:
                        magnet
                          ? "rd"
                          : "url",

                      src:
                        magnet ||
                        directUrl,

                      url:
                        directUrl ||
                        magnet,

                      magnet:
                        magnet ||
                        undefined,

                      infoHash:
                        infoHash ||
                        undefined,

                      behaviorHints:
                        stream?.behaviorHints ||
                        stream?.behavior_hints ||
                        undefined,
                    };
                  }
                )
                .filter(Boolean);
            }
          )
      );

    const streams =
      dedupe(
        results.flatMap(
          (result) =>
            result.status ===
            "fulfilled"
              ? result.value
              : []
        )
      ).slice(0, 60);

    return Response.json({
      streams,
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
      },
      {
        status: 500,
      }
    );
  }
}
