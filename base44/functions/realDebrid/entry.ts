import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const RD_BASE = "https://api.real-debrid.com/rest/1.0";

const VIDEO_RE =
  /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

const SAMPLE_RE =
  /(^|[\s._-])(sample|trailer|featurette|extras?|behind[ ._-]?the[ ._-]?scenes)([\s._-]|$)/i;

const clean = (value) =>
  String(value || "").trim();

const normalise = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isHttp = (value) =>
  /^https?:\/\//i.test(clean(value));

const isMagnet = (value) =>
  clean(value)
    .toLowerCase()
    .startsWith("magnet:");

const isVideoFile = (file) => {
  const path =
    clean(
      file?.path ||
        file?.filename
    );

  return Boolean(
    path &&
      VIDEO_RE.test(path)
  );
};

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

const episodeRegex = (
  season,
  episode
) => {
  if (
    season == null ||
    episode == null
  ) {
    return null;
  }

  const s =
    Number(season);

  const e =
    Number(episode);

  if (
    !Number.isFinite(s) ||
    !Number.isFinite(e)
  ) {
    return null;
  }

  return new RegExp(
    `(?:s0*${s}(?!\\d)e0*${e}(?!\\d)|${s}x0*${e}(?!\\d))`,
    "i"
  );
};

const chooseVideoFile = (
  files,
  metadata = {}
) => {
  const videos =
    (files || []).filter(
      isVideoFile
    );

  if (
    videos.length ===
    0
  ) {
    return null;
  }

  const epRe =
    episodeRegex(
      metadata.season,
      metadata.episode
    );

  if (epRe) {
    const episodeMatch =
      videos.find(
        (file) =>
          epRe.test(
            clean(
              file.path
            )
          )
      );

    if (
      episodeMatch
    ) {
      return episodeMatch;
    }
  }

  const withoutSamples =
    videos.filter(
      (file) =>
        !SAMPLE_RE.test(
          clean(
            file.path
          )
        )
    );

  const pool =
    withoutSamples.length >
    0
      ? withoutSamples
      : videos;

  return [...pool].sort(
    (a, b) =>
      Number(
        b?.bytes ||
          0
      ) -
      Number(
        a?.bytes ||
          0
      )
  )[0];
};

const buildFileEntries = (
  info,
  selectedTarget = null
) => {
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
            links[
              index
            ]
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
            links[
              index
            ]
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
          clean(
            file.path
          ),

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
};

const fetchTorrentInfo =
  async (
    torrentId,
    authHeaders
  ) => {
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
      return {
        error:
          `Real-Debrid torrent info failed (${response.status}).`,
      };
    }

    return {
      data:
        await response.json(),
    };
  };

const selectAllFiles =
  async (
    torrentId,
    formHeaders
  ) => {
    const response =
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
      !response.ok &&
      response.status !==
        204
    ) {
      return {
        error:
          `Real-Debrid file selection failed (${response.status}).`,
      };
    }

    return {
      ok: true,
    };
  };

const unrestrictLink =
  async (
    link,
    formHeaders
  ) => {
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
        await response
          .text()
          .catch(
            () => ""
          );

      return {
        error:
          `Real-Debrid unrestrict failed (${response.status})${
            text
              ? `: ${text}`
              : ""
          }`,
      };
    }

    const data =
      await response.json();

    if (
      !data?.download
    ) {
      return {
        error:
          "Real-Debrid did not return a playable download URL.",
      };
    }

    return {
      stream_url:
        data.download,

      filename:
        clean(
          data.filename
        ),
    };
  };

const resolveStreamable =
  async (
    torrentId,
    authHeaders,
    formHeaders,
    metadata = {}
  ) => {
    let infoResult =
      await fetchTorrentInfo(
        torrentId,
        authHeaders
      );

    if (
      infoResult.error
    ) {
      return infoResult;
    }

    let info =
      infoResult.data;

    if (
      info?.status ===
      "waiting_files_selection"
    ) {
      const selected =
        await selectAllFiles(
          torrentId,
          formHeaders
        );

      if (
        selected.error
      ) {
        return selected;
      }

      infoResult =
        await fetchTorrentInfo(
          torrentId,
          authHeaders
        );

      if (
        infoResult.error
      ) {
        return infoResult;
      }

      info =
        infoResult.data;
    }

    const target =
      chooseVideoFile(
        info?.files,
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
          clean(
            info?.status
          ),

        progress:
          Number(
            info?.progress ||
              0
          ),

        filename:
          clean(
            info?.filename
          ),

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
      clean(
        targetEntry?.link
      );

    if (
      info?.status !==
        "downloaded" ||
      !targetLink
    ) {
      return {
        ready:
          false,

        rd_status:
          clean(
            info?.status
          ),

        progress:
          Number(
            info?.progress ||
              0
          ),

        filename:
          clean(
            target?.path ||
              info?.filename
          ),

        files,
      };
    }

    const unrestricted =
      await unrestrictLink(
        targetLink,
        formHeaders
      );

    if (
      unrestricted.error
    ) {
      return unrestricted;
    }

    return {
      ready:
        true,

      rd_status:
        clean(
          info?.status
        ),

      progress:
        100,

      stream_url:
        unrestricted.stream_url,

      filename:
        unrestricted.filename ||
        clean(
          target?.path ||
            info?.filename
        ),

      files,
    };
  };

const saveRdLink =
  async (
    base44,
    body,
    magnet,
    torrentId
  ) => {
    if (
      !body?.title
    ) {
      return;
    }

    const key = {
      title:
        clean(
          body.title
        ),

      year:
        body.year != null
          ? String(
              body.year
            )
          : "",

      season:
        body.season != null
          ? String(
              body.season
            )
          : "",

      episode:
        body.episode != null
          ? String(
              body.episode
            )
          : "",
    };

    const patch = {
      ...key,

      magnet,

      torrent_id:
        String(
          torrentId
        ),
    };

    try {
      const existing =
        await base44.entities.RdLink.filter(
          key
        );

      if (
        existing?.length >
        0
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
      // RdLink is optional.
    }
  };

const addMagnetAndResolve =
  async ({
    body,
    base44,
    authHeaders,
    formHeaders,
  }) => {
    let value =
      clean(
        body?.magnet ||
          body?.url ||
          body?.src ||
          body?.infoHash
      );

    if (!value) {
      return Response.json(
        {
          error:
            "A magnet link, info hash, or direct URL is required.",
        },
        {
          status:
            400,
        }
      );
    }

    if (
      isHttp(
        value
      )
    ) {
      return Response.json({
        status:
          "ready",

        stream_url:
          value,

        filename:
          clean(
            body?.title
          ) ||
          "Stream",

        files: [],
      });
    }

    if (
      /^[a-f0-9]{40}$/i.test(
        value
      )
    ) {
      value =
        magnetFromHash(
          value,
          clean(
            body?.title
          )
        );
    }

    if (
      !isMagnet(
        value
      )
    ) {
      const hash =
        infoHashFromValue(
          value
        );

      if (hash) {
        value =
          magnetFromHash(
            hash,
            clean(
              body?.title
            )
          );
      }
    }

    if (
      !isMagnet(
        value
      )
    ) {
      return Response.json(
        {
          error:
            "Invalid magnet or info hash.",
        },
        {
          status:
            400,
        }
      );
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
        await addResponse
          .text()
          .catch(
            () => ""
          );

      return Response.json(
        {
          error:
            `Real-Debrid could not add this magnet (${addResponse.status})${
              text
                ? `: ${text}`
                : ""
            }`,
        },
        {
          status:
            502,
        }
      );
    }

    const added =
      await addResponse.json();

    const torrentId =
      clean(
        added?.id
      );

    if (!torrentId) {
      return Response.json(
        {
          error:
            "Real-Debrid did not return a torrent id.",
        },
        {
          status:
            502,
        }
      );
    }

    await selectAllFiles(
      torrentId,
      formHeaders
    );

    await saveRdLink(
      base44,
      body,
      value,
      torrentId
    );

    const resolved =
      await resolveStreamable(
        torrentId,
        authHeaders,
        formHeaders,
        {
          title:
            body?.title,

          year:
            body?.year,

          season:
            body?.season,

          episode:
            body?.episode,
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
  };

const titleWords = (
  title
) =>
  clean(
    title
  )
    .toLowerCase()
    .split(
      /[^a-z0-9]+/
    )
    .filter(
      (word) =>
        word.length >=
        3
    );

const scoreLibraryTorrent =
  (
    torrent,
    body
  ) => {
    const filename =
      clean(
        torrent?.filename ||
          torrent?.original_filename
      );

    const normalizedFilename =
      normalise(
        filename
      );

    const wanted =
      normalise(
        body?.title
      );

    if (
      !filename ||
      !wanted
    ) {
      return -1;
    }

    const words =
      titleWords(
        body?.title
      );

    const filenameWords =
      new Set(
        filename
          .toLowerCase()
          .split(
            /[^a-z0-9]+/
          )
          .filter(
            Boolean
          )
      );

    const contiguous =
      normalizedFilename.includes(
        wanted
      );

    const allWords =
      words.length >
        0 &&
      words.every(
        (word) =>
          filenameWords.has(
            word
          )
      );

    if (
      !contiguous &&
      !allWords
    ) {
      return -1;
    }

    const epRe =
      episodeRegex(
        body?.season,
        body?.episode
      );

    if (
      epRe &&
      !epRe.test(
        filename
      )
    ) {
      return -1;
    }

    let score =
      0;

    if (
      contiguous
    ) {
      score +=
        100;
    }

    if (
      allWords
    ) {
      score +=
        50;
    }

    if (
      epRe
    ) {
      score +=
        60;
    }

    const year =
      clean(
        body?.year
      );

    if (
      year &&
      normalizedFilename.includes(
        normalise(
          year
        )
      )
    ) {
      score +=
        20;
    }

    if (
      torrent?.status ===
      "downloaded"
    ) {
      score +=
        30;
    }

    if (
      !SAMPLE_RE.test(
        filename
      )
    ) {
      score +=
        5;
    }

    return score;
  };

const findCachedLibraryStream =
  async ({
    body,
    authHeaders,
    formHeaders,
  }) => {
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
            `Real-Debrid library lookup failed (${response.status}).`,
        },
        {
          status:
            502,
        }
      );
    }

    const torrents =
      await response.json();

    const candidates =
      (torrents || [])
        .map(
          (torrent) => ({
            torrent,

            score:
              scoreLibraryTorrent(
                torrent,
                body
              ),
          })
        )
        .filter(
          (item) =>
            item.score >=
            0
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

    for (
      const candidate
      of candidates.slice(
        0,
        10
      )
    ) {
      const torrentId =
        clean(
          candidate
            ?.torrent?.id
        );

      if (
        !torrentId
      ) {
        continue;
      }

      const resolved =
        await resolveStreamable(
          torrentId,
          authHeaders,
          formHeaders,
          {
            season:
              body?.season,

            episode:
              body?.episode,
          }
        );

      if (
        resolved.ready &&
        resolved.stream_url
      ) {
        return Response.json({
          status:
            "ready",

          source:
            "library",

          torrent_id:
            torrentId,

          stream_url:
            resolved.stream_url,

          url:
            resolved.stream_url,

          filename:
            resolved.filename ||
            clean(
              candidate
                ?.torrent
                ?.filename
            ),

          files:
            resolved.files ||
            [],
        });
      }
    }

    return Response.json({
      status:
        "not_found",

      source:
        "library",
    });
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

    const token =
      clean(
        user?.rd_token
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
      clean(
        body?.action
      ) ||
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
              `Real-Debrid rejected token (${response.status}).`,
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
          Boolean(
            data?.premium
          ),

        expires:
          clean(
            data?.expiration
          ),

        points:
          Number(
            data?.points ||
              0
          ),
      });
    }

    if (
      action ===
      "find_cached"
    ) {
      if (
        !clean(
          body?.title
        )
      ) {
        return Response.json(
          {
            error:
              "title required",
          },
          {
            status:
              400,
          }
        );
      }

      return await findCachedLibraryStream({
        body,
        authHeaders,
        formHeaders,
      });
    }

    if (
      action ===
        "add_magnet" ||
      action ===
        "resolve_best"
    ) {
      return await addMagnetAndResolve({
        body,
        base44,
        authHeaders,
        formHeaders,
      });
    }

    if (
      action ===
      "torrent_info"
    ) {
      const torrentId =
        clean(
          body?.torrent_id ||
            body?.torrentId
        );

      if (
        !torrentId
      ) {
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
            title:
              body?.title,

            year:
              body?.year,

            season:
              body?.season,

            episode:
              body?.episode,
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

    if (
      action ===
      "torrent_files"
    ) {
      const torrentId =
        clean(
          body?.torrent_id ||
            body?.torrentId
        );

      if (
        !torrentId
      ) {
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

      const infoResult =
        await fetchTorrentInfo(
          torrentId,
          authHeaders
        );

      if (
        infoResult.error
      ) {
        return Response.json(
          {
            error:
              infoResult.error,
          },
          {
            status:
              502,
          }
        );
      }

      const target =
        chooseVideoFile(
          infoResult.data
            ?.files,
          {
            season:
              body?.season,

            episode:
              body?.episode,
          }
        );

      return Response.json({
        files:
          buildFileEntries(
            infoResult.data,
            target
          ),

        rd_status:
          clean(
            infoResult.data
              ?.status
          ),

        progress:
          Number(
            infoResult.data
              ?.progress ||
              0
          ),
      });
    }

    if (
      action ===
      "unrestrict_file"
    ) {
      const link =
        clean(
          body?.link
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

      const unrestricted =
        await unrestrictLink(
          link,
          formHeaders
        );

      if (
        unrestricted.error
      ) {
        return Response.json(
          {
            error:
              unrestricted.error,
          },
          {
            status:
              502,
          }
        );
      }

      return Response.json(
        unrestricted
      );
    }

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
              `Real-Debrid torrents failed (${response.status}).`,
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
          (data || []).map(
            (torrent) => ({
              id:
                String(
                  torrent.id
                ),

              filename:
                clean(
                  torrent.filename ||
                    torrent.original_filename
                ),

              status:
                clean(
                  torrent.status
                ),

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
                clean(
                  torrent.added
                ),

              ended:
                clean(
                  torrent.ended
                ),

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

    if (
      action ===
      "torrent_delete"
    ) {
      const torrentId =
        clean(
          body?.torrent_id ||
            body?.torrentId
        );

      if (
        !torrentId
      ) {
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
              `Real-Debrid delete failed (${response.status}).`,
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
              `Real-Debrid hosts failed (${response.status}).`,
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
        hosts:
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
            ),
      });
    }

    if (
      action ===
      "fetch_streams"
    ) {
      return Response.json({
        status:
          "moved",

        sources: [],

        error:
          "Source discovery is handled by the fetchAddonStreams function. Real-Debrid only resolves the selected source.",
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
          "Unexpected Real-Debrid error.",
      },
      {
        status:
          500,
      }
    );
  }
}
