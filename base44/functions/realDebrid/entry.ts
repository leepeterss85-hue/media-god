import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const RD_BASE =
  "https://api.real-debrid.com/rest/1.0";

const VIDEO_RE =
  /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

const FOREIGN_RE =
  /(truefrench|vostfr|vost|subfrench|\bvf\b|\bvff\b|\bvfi\b|french|spanish|german|italian|\bdubbed\b)/i;

const RES_RE =
  /(2160|1080|720|480)p/i;

const clean = (value) =>
  String(value || "").trim();

const normalise = (value) =>
  clean(value)
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      ""
    );

const isHttp = (value) =>
  /^https?:\/\//i.test(
    clean(value)
  );

const isMagnet = (value) =>
  clean(value)
    .toLowerCase()
    .startsWith(
      "magnet:"
    );

const isVideoFile = (
  file
) => {
  const path =
    file?.path ||
    file?.filename ||
    "";

  return (
    !!path &&
    VIDEO_RE.test(
      path
    )
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

const infoHashFromValue = (
  value
) => {
  const text =
    clean(value);

  if (!text) {
    return "";
  }

  if (
    /^[a-f0-9]{40}$/i.test(
      text
    )
  ) {
    return text;
  }

  const match =
    text.match(
      /btih:([a-f0-9]{40})/i
    );

  return (
    match?.[1] ||
    ""
  );
};

const getAddonBaseUrl = (
  value
) =>
  clean(value)
    .replace(
      /\/manifest\.json\/?$/i,
      ""
    )
    .replace(
      /\/+$/,
      ""
    );

const streamLabel = (
  stream,
  addonName
) => {
  const raw =
    stream?.title ||
    stream?.name ||
    stream?.filename ||
    "Stream";

  return `${addonName}: ${String(
    raw
  ).split("\n")[0]}`;
};

const scoreLabel = (
  label
) => {
  const text =
    clean(label);

  const resolution =
    Number(
      (
        text.match(
          RES_RE
        ) ||
        []
      )[1] ||
        0
    );

  const foreignPenalty =
    FOREIGN_RE.test(
      text
    )
      ? 10000
      : 0;

  return (
    resolution -
    foreignPenalty
  );
};

const dedupeBySource = (
  items
) => {
  const seen =
    new Set();

  return items.filter(
    (item) => {
      const key =
        clean(
          item?.url ||
            item?.magnet ||
            item?.infoHash ||
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

async function fetchJsonWithTimeout(
  url,
  init = {},
  timeoutMs = 10000
) {
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
          ...init,
          signal:
            controller.signal,
        }
      );

    if (
      !response.ok
    ) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(
      timeout
    );
  }
}

async function discoverAddonSources({
  base44,
  imdbId,
  mediaType,
  season,
  episode,
}) {
  const id =
    clean(imdbId);

  if (
    !id ||
    !id.startsWith(
      "tt"
    )
  ) {
    return [];
  }

  const isSeries =
    mediaType ===
      "tv" ||
    (
      season != null &&
      episode != null
    );

  if (
    isSeries &&
    (
      season == null ||
      episode == null
    )
  ) {
    return [];
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

  let active =
    (
      addons ||
      []
    ).filter(
      (addon) =>
        addon?.active &&
        addon?.url
    );

  /*
   * The original Media God
   * seeds Torrentio as a
   * default addon.
   */
  if (
    active.length ===
    0
  ) {
    active = [
      {
        name:
          "Torrentio",

        url:
          "https://torrentio.strem.fun/manifest.json",

        active:
          true,
      },
    ];
  }

  const type =
    isSeries
      ? "series"
      : "movie";

  const streamId =
    isSeries
      ? `${id}:${season}:${episode}`
      : id;

  const results =
    await Promise.allSettled(
      active
        .slice(
          0,
          20
        )
        .map(
          async (
            addon
          ) => {
            const baseUrl =
              getAddonBaseUrl(
                addon.url
              );

            if (!baseUrl) {
              return [];
            }

            const data =
              await fetchJsonWithTimeout(
                `${baseUrl}/stream/${type}/${streamId}.json`,
                {
                  headers: {
                    "User-Agent":
                      "Stremio/4.4.16 (Mozilla/5.0)",

                    Accept:
                      "application/json",
                  },
                },
                10000
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
                  stream
                ) => {
                  const url =
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
                      url
                    );

                  const magnet =
                    isMagnet(
                      url
                    )
                      ? url
                      : infoHash
                        ? magnetFromHash(
                            infoHash
                          )
                        : "";

                  if (
                    !url &&
                    !magnet
                  ) {
                    return null;
                  }

                  return {
                    label:
                      streamLabel(
                        stream,
                        addon?.name ||
                          "Addon"
                      ),

                    addon:
                      addon?.name ||
                      "Addon",

                    url:
                      isHttp(
                        url
                      )
                        ? url
                        : "",

                    magnet,

                    infoHash,
                  };
                }
              )
              .filter(
                Boolean
              );
          }
        )
    );

  const collected =
    results.flatMap(
      (result) =>
        result.status ===
        "fulfilled"
          ? result.value
          : []
    );

  return dedupeBySource(
    collected
  ).sort(
    (
      a,
      b
    ) =>
      scoreLabel(
        b.label
      ) -
      scoreLabel(
        a.label
      )
  );
}

async function isInstantlyAvailable(
  infoHash,
  authHeaders
) {
  const hash =
    clean(infoHash);

  if (!hash) {
    return false;
  }

  try {
    const response =
      await fetch(
        `${RD_BASE}/torrents/instantAvailability/${hash}`,
        {
          headers:
            authHeaders,
        }
      );

    if (
      !response.ok
    ) {
      return false;
    }

    const data =
      await response.json();

    const entry =
      data?.[hash] ||
      data?.[
        hash.toLowerCase()
      ] ||
      data?.[
        hash.toUpperCase()
      ];

    return (
      Array.isArray(
        entry?.rd
      ) &&
      entry.rd.length >
        0
    );
  } catch {
    return false;
  }
}

function chooseVideoFile(
  files,
  {
    season,
    episode,
  } = {}
) {
  if (
    !Array.isArray(
      files
    ) ||
    files.length ===
      0
  ) {
    return null;
  }

  if (
    season != null &&
    episode != null
  ) {
    const s =
      String(
        Number(
          season
        )
      );

    const e =
      String(
        Number(
          episode
        )
      );

    const patterns = [
      new RegExp(
        `s0*${s}(?!\\d)e0*${e}(?!\\d)`,
        "i"
      ),

      new RegExp(
        `${s}x0*${e}(?!\\d)`,
        "i"
      ),
    ];

    const match =
      files.find(
        (file) =>
          patterns.some(
            (pattern) =>
              pattern.test(
                file?.path ||
                  ""
              )
          )
      );

    if (match) {
      return match;
    }
  }

  return [
    ...files,
  ].sort(
    (
      a,
      b
    ) =>
      Number(
        b?.bytes ||
          0
      ) -
      Number(
        a?.bytes ||
          0
      )
  )[0];
}

function buildFileEntries(
  info,
  selectedTarget = null
) {
  const allFiles =
    Array.isArray(
      info?.files
    )
      ? info.files
      : [];

  const selectedFiles =
    allFiles.filter(
      (file) =>
        file?.selected !==
        0
    );

  const links =
    Array.isArray(
      info?.links
    )
      ? info.links
      : [];

  const linkByFileId =
    new Map();

  if (
    selectedFiles.length ===
    links.length
  ) {
    selectedFiles.forEach(
      (
        file,
        index
      ) => {
        if (
          links[
            index
          ]
        ) {
          linkByFileId.set(
            file.id,
            links[index]
          );
        }
      }
    );
  } else if (
    allFiles.length ===
    links.length
  ) {
    allFiles.forEach(
      (
        file,
        index
      ) => {
        if (
          links[
            index
          ]
        ) {
          linkByFileId.set(
            file.id,
            links[index]
          );
        }
      }
    );
  }

  return allFiles
    .filter(
      isVideoFile
    )
    .map(
      (file) => ({
        id:
          file.id,

        path:
          file.path ||
          "",

        bytes:
          Number(
            file.bytes ||
              0
          ),

        link:
          linkByFileId.get(
            file.id
          ) ||
          "",

        selected:
          selectedTarget
            ? file.id ===
              selectedTarget.id
            : false,
      })
    );
}

async function resolveStreamable(
  torrentId,
  authHeaders,
  formHeaders,
  metadata = {}
) {
  const infoUrl =
    `${RD_BASE}/torrents/info/${torrentId}`;

  let infoResponse =
    await fetch(
      infoUrl,
      {
        headers:
          authHeaders,
      }
    );

  if (
    !infoResponse.ok
  ) {
    return {
      error:
        `Real-Debrid torrent info failed (${infoResponse.status}).`,
    };
  }

  let info =
    await infoResponse.json();

  if (
    info.status ===
    "waiting_files_selection"
  ) {
    const selectResponse =
      await fetch(
        `${RD_BASE}/torrents/selectFiles/${torrentId}`,
        {
          method:
            "POST",

          headers:
            formHeaders,

          body:
            "files=all",
        }
      );

    if (
      !selectResponse.ok
    ) {
      return {
        error:
          `Real-Debrid file selection failed (${selectResponse.status}).`,
      };
    }

    infoResponse =
      await fetch(
        infoUrl,
        {
          headers:
            authHeaders,
        }
      );

    if (
      !infoResponse.ok
    ) {
      return {
        error:
          `Real-Debrid torrent refresh failed (${infoResponse.status}).`,
      };
    }

    info =
      await infoResponse.json();
  }

  const videoFiles =
    (
      info.files ||
      []
    ).filter(
      isVideoFile
    );

  const target =
    chooseVideoFile(
      videoFiles,
      metadata
    );

  const files =
    buildFileEntries(
      info,
      target
    );

  if (!target) {
    return {
      ready:
        false,

      rd_status:
        info.status,

      progress:
        Number(
          info.progress ||
            0
        ),

      filename:
        info.filename ||
        "",

      files,
    };
  }

  const targetEntry =
    files.find(
      (file) =>
        file.id ===
        target.id
    );

  const targetLink =
    targetEntry?.link ||
    "";

  if (
    info.status !==
      "downloaded" ||
    !targetLink
  ) {
    return {
      ready:
        false,

      rd_status:
        info.status,

      progress:
        Number(
          info.progress ||
            0
        ),

      filename:
        target.path ||
        info.filename ||
        "",

      files,
    };
  }

  const unrestrictResponse =
    await fetch(
      `${RD_BASE}/unrestrict/link`,
      {
        method:
          "POST",

        headers:
          formHeaders,

        body:
          `link=${encodeURIComponent(
            targetLink
          )}`,
      }
    );

  if (
    !unrestrictResponse.ok
  ) {
    const text =
      await unrestrictResponse.text();

    return {
      error:
        `Real-Debrid unrestrict failed (${unrestrictResponse.status}): ${text}`,
    };
  }

  const unrestricted =
    await unrestrictResponse.json();

  if (
    !unrestricted?.download
  ) {
    return {
      error:
        "Real-Debrid did not return a playable URL.",
    };
  }

  return {
    ready:
      true,

    rd_status:
      info.status,

    progress:
      100,

    stream_url:
      unrestricted.download,

    filename:
      unrestricted.filename ||
      target.path ||
      info.filename ||
      "",

    files,
  };
}

async function addMagnetAndResolve({
  magnet,
  title,
  year,
  season,
  episode,
  base44,
  authHeaders,
  formHeaders,
  saveLink = true,
}) {
  let value =
    clean(magnet);

  if (!value) {
    return {
      error:
        "A magnet link is required.",
    };
  }

  if (
    isHttp(
      value
    )
  ) {
    return {
      status:
        "ready",

      stream_url:
        value,

      filename:
        title ||
        "Stream",

      files:
        [],
    };
  }

  if (
    /^[a-f0-9]{40}$/i.test(
      value
    )
  ) {
    value =
      magnetFromHash(
        value,
        title
      );
  }

  if (
    !isMagnet(
      value
    )
  ) {
    return {
      error:
        "Invalid magnet link.",
    };
  }

  const addResponse =
    await fetch(
      `${RD_BASE}/torrents/addMagnet`,
      {
        method:
          "POST",

        headers:
          formHeaders,

        body:
          `magnet=${encodeURIComponent(
            value
          )}`,
      }
    );

  if (
    !addResponse.ok
  ) {
    const text =
      await addResponse.text();

    return {
      error:
        `Real-Debrid could not add this magnet (${addResponse.status}): ${text}`,
    };
  }

  const added =
    await addResponse.json();

  const torrentId =
    clean(
      added?.id
    );

  if (!torrentId) {
    return {
      error:
        "Real-Debrid did not return a torrent id.",
    };
  }

  await fetch(
    `${RD_BASE}/torrents/selectFiles/${torrentId}`,
    {
      method:
        "POST",

      headers:
        formHeaders,

      body:
        "files=all",
    }
  ).catch(
    () => {}
  );

  if (
    saveLink &&
    title
  ) {
    try {
      const key = {
        title:
          clean(
            title
          ),

        year:
          year != null
            ? String(
                year
              )
            : "",

        season:
          season != null
            ? String(
                season
              )
            : "",

        episode:
          episode != null
            ? String(
                episode
              )
            : "",
      };

      const existing =
        await base44.entities.RdLink.filter(
          key
        );

      const patch = {
        ...key,

        magnet:
          value,

        torrent_id:
          torrentId,
      };

      if (
        existing?.length
      ) {
        await base44.entities.RdLink.update(
          existing[0].id,
          patch
        );
      } else {
        await base44.entities.RdLink.create(
          patch
        );
      }
    } catch {
      /*
       * Saving the shortcut
       * must never prevent
       * playback.
       */
    }
  }

  const resolved =
    await resolveStreamable(
      torrentId,
      authHeaders,
      formHeaders,
      {
        season,
        episode,
      }
    );

  if (
    resolved.error
  ) {
    return {
      error:
        resolved.error,
    };
  }

  return {
    status:
      resolved.ready
        ? "ready"
        : "preparing",

    torrent_id:
      torrentId,

    stream_url:
      resolved.stream_url ||
      "",

    filename:
      resolved.filename ||
      "",

    progress:
      Number(
        resolved.progress ||
          0
      ),

    rd_status:
      resolved.rd_status ||
      "",

    files:
      resolved.files ||
      [],
  };
}

async function findLibraryMatch({
  title,
  year,
  season,
  episode,
  authHeaders,
  formHeaders,
}) {
  const response =
    await fetch(
      `${RD_BASE}/torrents?limit=100`,
      {
        headers:
          authHeaders,
      }
    );

  if (
    !response.ok
  ) {
    return null;
  }

  const torrents =
    await response.json();

  const wantedTitle =
    normalise(
      title
    );

  const wantedYear =
    normalise(
      year
    );

  if (
    !wantedTitle
  ) {
    return null;
  }

  const episodePattern =
    season != null &&
    episode != null
      ? new RegExp(
          `s0*${Number(
            season
          )}(?!\\d)e0*${Number(
            episode
          )}(?!\\d)`,
          "i"
        )
      : null;

  const candidates =
    (
      torrents ||
      []
    )
      .filter(
        (torrent) =>
          torrent?.status ===
          "downloaded"
      )
      .map(
        (torrent) => {
          const filename =
            torrent?.filename ||
            torrent?.original_filename ||
            "";

          const normalized =
            normalise(
              filename
            );

          if (
            !normalized.includes(
              wantedTitle
            )
          ) {
            return null;
          }

          let score =
            100;

          if (
            wantedYear &&
            normalized.includes(
              wantedYear
            )
          ) {
            score +=
              20;
          }

          if (
            episodePattern &&
            episodePattern.test(
              filename
            )
          ) {
            score +=
              60;
          }

          return {
            torrent,
            score,
          };
        }
      )
      .filter(
        Boolean
      )
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      );

  if (
    !candidates.length
  ) {
    return null;
  }

  const best =
    candidates[0]
      .torrent;

  const resolved =
    await resolveStreamable(
      String(
        best.id
      ),
      authHeaders,
      formHeaders,
      {
        season,
        episode,
      }
    );

  if (
    !resolved.ready ||
    !resolved.stream_url
  ) {
    return null;
  }

  return {
    status:
      "ready",

    torrent_id:
      String(
        best.id
      ),

    stream_url:
      resolved.stream_url,

    filename:
      resolved.filename ||
      best.filename ||
      "",

    files:
      resolved.files ||
      [],

    source:
      "library",
  };
}

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

    const token =
      clean(
        user.rd_token
      );

    if (!token) {
      return Response.json(
        {
          error:
            "Real-Debrid token not set. Add it in Settings.",
        },
        {
          status:
            400,
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
      body.action ||
      "status";

    const authHeaders = {
      Authorization:
        `Bearer ${token}`,
    };

    const formHeaders = {
      ...authHeaders,

      "Content-Type":
        "application/x-www-form-urlencoded",
    };

    /*
     * =========================
     * STATUS
     * =========================
     */
    if (
      action ===
      "status"
    ) {
      const response =
        await fetch(
          `${RD_BASE}/user`,
          {
            headers:
              authHeaders,
          }
        );

      if (
        !response.ok
      ) {
        return Response.json(
          {
            error:
              `Real-Debrid rejected token (${response.status})`,
          },
          {
            status:
              502,
          }
        );
      }

      const data =
        await response.json();

      return Response.json({
        valid:
          true,

        premium:
          !!data.premium,

        expires:
          data.expiration ||
          "",

        points:
          data.points ||
          0,
      });
    }

    /*
     * =========================
     * FIND TITLE
     * =========================
     *
     * This is deliberately not
     * restricted to the user's
     * existing RD library.
     */
    if (
      action ===
      "find_cached"
    ) {
      const title =
        clean(
          body.title
        );

      const imdbId =
        clean(
          body.imdb_id ||
            body.imdbId ||
            body.id
        );

      const year =
        body.year != null
          ? String(
              body.year
            )
          : "";

      const season =
        body.season != null
          ? Number(
              body.season
            )
          : null;

      const episode =
        body.episode != null
          ? Number(
              body.episode
            )
          : null;

      const mediaType =
        body.media_type ===
          "tv" ||
        body.mediaType ===
          "tv" ||
        season != null
          ? "tv"
          : "movie";

      if (
        !title &&
        !imdbId
      ) {
        return Response.json(
          {
            error:
              "title or imdb_id required",
          },
          {
            status:
              400,
          }
        );
      }

      /*
       * Search active installed
       * addons from the backend.
       *
       * Doing this server-side
       * avoids browser CORS
       * failures.
       */
      const addonSources =
        await discoverAddonSources(
          {
            base44,
            imdbId,
            mediaType,
            season,
            episode,
          }
        );

      /*
       * If an installed addon
       * supplied a direct HTTP
       * stream, it can be played
       * directly.
       */
      const direct =
        addonSources.find(
          (source) =>
            source.url
        );

      if (
        direct?.url
      ) {
        return Response.json({
          status:
            "ready",

          stream_url:
            direct.url,

          filename:
            direct.label,

          source:
            "addon-direct",
        });
      }

      const magnetCandidates =
        addonSources.filter(
          (source) =>
            source.magnet &&
            source.infoHash
        );

      /*
       * Prefer an RD-cached
       * source when one exists.
       */
      for (
        const candidate
        of magnetCandidates.slice(
          0,
          12
        )
      ) {
        const cached =
          await isInstantlyAvailable(
            candidate.infoHash,
            authHeaders
          );

        if (!cached) {
          continue;
        }

        const result =
          await addMagnetAndResolve(
            {
              magnet:
                candidate.magnet,

              title,
              year,
              season,
              episode,
              base44,
              authHeaders,
              formHeaders,
              saveLink:
                true,
            }
          );

        if (
          result.status ===
            "ready" &&
          result.stream_url
        ) {
          return Response.json({
            ...result,

            source:
              "addon-cached",
          });
        }
      }

      /*
       * Existing personal RD
       * library is still useful,
       * but it is now a fallback,
       * not the only source.
       */
      const library =
        await findLibraryMatch(
          {
            title,
            year,
            season,
            episode,
            authHeaders,
            formHeaders,
          }
        );

      if (library) {
        return Response.json(
          library
        );
      }

      /*
       * Source found but not
       * immediately cached.
       *
       * Give the actual magnet
       * back to VideoPlayer.
       * VideoPlayer will call
       * resolve_best and poll RD.
       */
      if (
        magnetCandidates.length >
        0
      ) {
        return Response.json({
          status:
            "source",

          magnet:
            magnetCandidates[0]
              .magnet,

          filename:
            magnetCandidates[0]
              .label,

          source:
            "addon-magnet",
        });
      }

      return Response.json({
        status:
          "not_found",

        error:
          "No Real-Debrid source was found for this title.",
      });
    }

    /*
     * =========================
     * ADD / RESOLVE MAGNET
     * =========================
     */
    if (
      action ===
        "add_magnet" ||
      action ===
        "resolve_best"
    ) {
      const result =
        await addMagnetAndResolve(
          {
            magnet:
              body.magnet ||
              body.url ||
              body.src ||
              body.infoHash,

            title:
              body.title ||
              "",

            year:
              body.year,

            season:
              body.season,

            episode:
              body.episode,

            base44,
            authHeaders,
            formHeaders,
            saveLink:
              true,
          }
        );

      if (
        result.error
      ) {
        return Response.json(
          {
            error:
              result.error,
          },
          {
            status:
              502,
          }
        );
      }

      return Response.json(
        result
      );
    }

    /*
     * =========================
     * TORRENT INFO / POLLING
     * =========================
     */
    if (
      action ===
      "torrent_info"
    ) {
      const torrentId =
        clean(
          body.torrent_id ||
            body.torrentId
        );

      if (!torrentId) {
        return Response.json(
          {
            error:
              "torrent_id required",
          },
          {
            status:
              400,
          }
        );
      }

      const resolved =
        await resolveStreamable(
          torrentId,
          authHeaders,
          formHeaders,
          {
            season:
              body.season,

            episode:
              body.episode,
          }
        );

      if (
        resolved.error
      ) {
        return Response.json(
          {
            error:
              resolved.error,
          },
          {
            status:
              502,
          }
        );
      }

      return Response.json({
        status:
          resolved.ready
            ? "ready"
            : "preparing",

        torrent_id:
          torrentId,

        stream_url:
          resolved.stream_url ||
          "",

        filename:
          resolved.filename ||
          "",

        progress:
          Number(
            resolved.progress ||
              0
          ),

        rd_status:
          resolved.rd_status ||
          "",

        files:
          resolved.files ||
          [],
      });
    }

    /*
     * =========================
     * TORRENT FILES
     * =========================
     */
    if (
      action ===
      "torrent_files"
    ) {
      const torrentId =
        clean(
          body.torrent_id ||
            body.torrentId
        );

      if (!torrentId) {
        return Response.json(
          {
            error:
              "torrent_id required",
          },
          {
            status:
              400,
          }
        );
      }

      const response =
        await fetch(
          `${RD_BASE}/torrents/info/${torrentId}`,
          {
            headers:
              authHeaders,
          }
        );

      if (
        !response.ok
      ) {
        return Response.json(
          {
            error:
              `Real-Debrid torrent info failed (${response.status})`,
          },
          {
            status:
              502,
          }
        );
      }

      const info =
        await response.json();

      return Response.json({
        files:
          buildFileEntries(
            info
          ),

        rd_status:
          info.status ||
          "",

        progress:
          Number(
            info.progress ||
              0
          ),
      });
    }

    /*
     * =========================
     * UNRESTRICT ONE FILE
     * =========================
     */
    if (
      action ===
      "unrestrict_file"
    ) {
      const link =
        clean(
          body.link
        );

      if (!link) {
        return Response.json(
          {
            error:
              "link required",
          },
          {
            status:
              400,
          }
        );
      }

      const response =
        await fetch(
          `${RD_BASE}/unrestrict/link`,
          {
            method:
              "POST",

            headers:
              formHeaders,

            body:
              `link=${encodeURIComponent(
                link
              )}`,
          }
        );

      if (
        !response.ok
      ) {
        const text =
          await response.text();

        return Response.json(
          {
            error:
              `Real-Debrid unrestrict failed (${response.status}): ${text}`,
          },
          {
            status:
              502,
          }
        );
      }

      const data =
        await response.json();

      return Response.json({
        stream_url:
          data.download ||
          "",

        filename:
          data.filename ||
          "",
      });
    }

    /*
     * =========================
     * LIBRARY LIST
     * =========================
     */
    if (
      action ===
      "torrents_list"
    ) {
      const response =
        await fetch(
          `${RD_BASE}/torrents?limit=100`,
          {
            headers:
              authHeaders,
          }
        );

      if (
        !response.ok
      ) {
        return Response.json(
          {
            error:
              `Real-Debrid torrents failed (${response.status})`,
          },
          {
            status:
              502,
          }
        );
      }

      const data =
        await response.json();

      return Response.json({
        torrents:
          (
            data ||
            []
          ).map(
            (torrent) => ({
              id:
                String(
                  torrent.id
                ),

              filename:
                torrent.filename ||
                torrent.original_filename ||
                "",

              status:
                torrent.status ||
                "",

              progress:
                Number(
                  torrent.progress ||
                    0
                ),

              bytes:
                Number(
                  torrent.bytes ||
                    0
                ),

              added:
                torrent.added ||
                "",

              ended:
                torrent.ended ||
                "",

              ready:
                torrent.status ===
                  "downloaded" ||
                (
                  Array.isArray(
                    torrent.links
                  ) &&
                  torrent.links.length >
                    0
                ),
            })
          ),
      });
    }

    /*
     * =========================
     * DELETE TORRENT
     * =========================
     */
    if (
      action ===
      "torrent_delete"
    ) {
      const torrentId =
        clean(
          body.torrent_id ||
            body.torrentId
        );

      if (!torrentId) {
        return Response.json(
          {
            error:
              "torrent_id required",
          },
          {
            status:
              400,
          }
        );
      }

      const response =
        await fetch(
          `${RD_BASE}/torrents/delete/${torrentId}`,
          {
            method:
              "DELETE",

            headers:
              authHeaders,
          }
        );

      if (
        !response.ok &&
        response.status !==
          204
      ) {
        return Response.json(
          {
            error:
              `Real-Debrid delete failed (${response.status})`,
          },
          {
            status:
              502,
          }
        );
      }

      return Response.json({
        deleted:
          true,
      });
    }

    /*
     * =========================
     * HOSTS
     * =========================
     */
    if (
      action ===
      "hosts"
    ) {
      const response =
        await fetch(
          `${RD_BASE}/hosts/status`,
          {
            headers:
              authHeaders,
          }
        );

      if (
        !response.ok
      ) {
        return Response.json(
          {
            error:
              `Real-Debrid hosts failed (${response.status})`,
          },
          {
            status:
              502,
          }
        );
      }

      const data =
        await response.json();

      const hosts =
        Object.entries(
          data ||
          {}
        )
          .filter(
            (
              [
                ,
                value,
              ]
            ) =>
              value?.supported &&
              !value?.disabled
          )
          .map(
            (
              [
                host,
              ]
            ) =>
              host
          );

      return Response.json({
        hosts,
      });
    }

    return Response.json(
      {
        error:
          "Unknown action",
      },
      {
        status:
          400,
      }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Unexpected Real-Debrid error",
      },
      {
        status:
          500,
      }
    );
  }
}
