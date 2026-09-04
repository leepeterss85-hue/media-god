import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const RD_BASE =
  "https://api.real-debrid.com/rest/1.0";

const VIDEO_RE =
  /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

const normalise = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isVideoFile = (file) =>
  !!file?.path &&
  VIDEO_RE.test(file.path);

export default async function (req) {
  try {
    const base44 =
      createClientFromRequest(req);

    const user =
      await base44.auth.me();

    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token =
      user.rd_token;

    if (!token) {
      return Response.json(
        {
          error:
            "Real-Debrid token not set. Add it in Settings.",
        },
        { status: 400 }
      );
    }

    let body = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const action =
      body.action || "status";

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
     * ---------------------------------------------------------
     * STATUS
     * ---------------------------------------------------------
     */
    if (action === "status") {
      const res = await fetch(
        `${RD_BASE}/user`,
        {
          headers: authHeaders,
        }
      );

      if (!res.ok) {
        return Response.json(
          {
            error:
              `Real-Debrid rejected token (${res.status})`,
          },
          { status: 502 }
        );
      }

      const data =
        await res.json();

      return Response.json({
        valid: true,
        premium: !!data.premium,
        expires:
          data.expiration || "",
        points:
          data.points || 0,
      });
    }

    /*
     * ---------------------------------------------------------
     * ADD MAGNET
     * ---------------------------------------------------------
     */
    if (action === "add_magnet") {
      return await addMagnet({
        body,
        authHeaders,
        formHeaders,
        base44,
      });
    }

    /*
     * ---------------------------------------------------------
     * RESOLVE BEST
     *
     * This is the main playback path.
     *
     * It DOES NOT require the torrent to already be in
     * the user's Real-Debrid library.
     * ---------------------------------------------------------
     */
    if (action === "resolve_best") {
      return await addMagnet({
        body,
        authHeaders,
        formHeaders,
        base44,
        saveLink: true,
      });
    }

    /*
     * ---------------------------------------------------------
     * TORRENT INFO
     * ---------------------------------------------------------
     */
    if (action === "torrent_info") {
      const torrentId =
        body.torrent_id;

      if (!torrentId) {
        return Response.json(
          {
            error:
              "torrent_id required",
          },
          { status: 400 }
        );
      }

      const stream =
        await resolveStreamable(
          String(torrentId),
          authHeaders,
          formHeaders,
          {
            title:
              body.title,
            year:
              body.year,
            season:
              body.season,
            episode:
              body.episode,
          }
        );

      if (stream.error) {
        return Response.json(
          {
            error:
              stream.error,
          },
          { status: 502 }
        );
      }

      return Response.json({
        status: stream.ready
          ? "ready"
          : "preparing",

        torrent_id:
          String(torrentId),

        stream_url:
          stream.stream_url ||
          "",

        filename:
          stream.filename ||
          "",

        rd_status:
          stream.rd_status,

        files:
          stream.files || [],
      });
    }

    /*
     * ---------------------------------------------------------
     * TORRENT FILES
     * ---------------------------------------------------------
     */
    if (action === "torrent_files") {
      const torrentId =
        body.torrent_id;

      if (!torrentId) {
        return Response.json(
          {
            error:
              "torrent_id required",
          },
          { status: 400 }
        );
      }

      const infoRes =
        await fetch(
          `${RD_BASE}/torrents/info/${torrentId}`,
          {
            headers: authHeaders,
          }
        );

      if (!infoRes.ok) {
        return Response.json(
          {
            error:
              `info failed: ${infoRes.status}`,
          },
          { status: 502 }
        );
      }

      const info =
        await infoRes.json();

      return Response.json({
        files:
          buildFileEntries(
            info,
            null
          ),

        rd_status:
          info.status,
      });
    }

    /*
     * ---------------------------------------------------------
     * UNRESTRICT FILE
     * ---------------------------------------------------------
     */
    if (action === "unrestrict_file") {
      const link =
        body.link;

      if (!link) {
        return Response.json(
          {
            error:
              "link required",
          },
          { status: 400 }
        );
      }

      const unRes =
        await fetch(
          `${RD_BASE}/unrestrict/link`,
          {
            method: "POST",
            headers:
              formHeaders,
            body:
              `link=${encodeURIComponent(
                link
              )}`,
          }
        );

      if (!unRes.ok) {
        const text =
          await unRes.text();

        return Response.json(
          {
            error:
              `unrestrict failed: ${unRes.status} ${text}`,
          },
          { status: 502 }
        );
      }

      const unData =
        await unRes.json();

      return Response.json({
        stream_url:
          unData.download,

        filename:
          unData.filename ||
          "",
      });
    }

    /*
     * ---------------------------------------------------------
     * DELETE TORRENT
     * ---------------------------------------------------------
     */
    if (action === "torrent_delete") {
      const torrentId =
        body.torrent_id;

      if (!torrentId) {
        return Response.json(
          {
            error:
              "torrent_id required",
          },
          { status: 400 }
        );
      }

      const delRes =
        await fetch(
          `${RD_BASE}/torrents/delete/${torrentId}`,
          {
            method: "DELETE",
            headers:
              authHeaders,
          }
        );

      if (!delRes.ok) {
        return Response.json(
          {
            error:
              `delete failed: ${delRes.status}`,
          },
          { status: 502 }
        );
      }

      return Response.json({
        deleted: true,
      });
    }

    /*
     * ---------------------------------------------------------
     * TORRENTS LIST
     * ---------------------------------------------------------
     */
    if (action === "torrents_list") {
      const res =
        await fetch(
          `${RD_BASE}/torrents`,
          {
            headers:
              authHeaders,
          }
        );

      if (!res.ok) {
        return Response.json(
          {
            error:
              `RD error: ${res.status}`,
          },
          { status: 502 }
        );
      }

      const data =
        await res.json();

      const torrents =
        (data || []).map(
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
              torrent.status,

            progress:
              typeof torrent.progress ===
              "number"
                ? torrent.progress
                : 0,

            bytes:
              torrent.bytes ||
              0,

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
        );

      return Response.json({
        torrents,
      });
    }

    /*
     * ---------------------------------------------------------
     * HOSTS
     * ---------------------------------------------------------
     */
    if (action === "hosts") {
      const res =
        await fetch(
          `${RD_BASE}/hosts/status`,
          {
            headers:
              authHeaders,
          }
        );

      if (!res.ok) {
        return Response.json(
          {
            error:
              `RD error: ${res.status}`,
          },
          { status: 502 }
        );
      }

      const data =
        await res.json();

      const active =
        Object.entries(
          data || {}
        )
          .filter(
            ([, value]) =>
              value &&
              value.supported &&
              !value.disabled
          )
          .map(
            ([key]) =>
              key
          )
          .slice(0, 40);

      return Response.json({
        hosts: active,
      });
    }

    /*
     * ---------------------------------------------------------
     * FIND CACHED
     *
     * Kept for compatibility with any other part of the app.
     * This searches the user's existing RD torrents only.
     * It is NOT used as the gate for normal playback anymore.
     * ---------------------------------------------------------
     */
    if (action === "find_cached") {
      const title =
        String(
          body.title || ""
        ).trim();

      if (!title) {
        return Response.json(
          {
            error:
              "title required",
          },
          { status: 400 }
        );
      }

      const season =
        body.season != null
          ? String(
              body.season
            )
          : "";

      const episode =
        body.episode != null
          ? String(
              body.episode
            )
          : "";

      const year =
        body.year != null
          ? String(
              body.year
            ).trim()
          : "";

      const res =
        await fetch(
          `${RD_BASE}/torrents`,
          {
            headers:
              authHeaders,
          }
        );

      if (!res.ok) {
        return Response.json(
          {
            error:
              `RD error: ${res.status}`,
          },
          { status: 502 }
        );
      }

      const data =
        await res.json();

      const want =
        normalise(title);

      const wantYear =
        normalise(year);

      const titleWords =
        title
          .toLowerCase()
          .split(
            /[^a-z0-9]+/
          )
          .filter(
            (word) =>
              word.length >= 3
          );

      let epRegex =
        null;

      if (
        season &&
        episode
      ) {
        const s =
          String(
            season
          ).replace(
            /^0+/,
            ""
          );

        const e =
          String(
            episode
          ).replace(
            /^0+/,
            ""
          );

        epRegex =
          new RegExp(
            `s0*${s}(?!\\d)e0*${e}(?!\\d)`,
            "i"
          );
      }

      const scoreTorrent =
        (torrent) => {
          const filename =
            torrent.filename ||
            torrent.original_filename ||
            "";

          const fn =
            normalise(
              filename
            );

          if (
            !fn ||
            !want
          ) {
            return -1;
          }

          const words =
            new Set(
              filename
                .toLowerCase()
                .split(
                  /[^a-z0-9]+/
                )
            );

          const contiguous =
            fn.includes(
              want
            );

          const allWords =
            titleWords.length >
              0 &&
            titleWords.every(
              (word) =>
                words.has(
                  word
                )
            );

          if (
            !contiguous &&
            !allWords
          ) {
            return -1;
          }

          let score = 0;

          if (contiguous) {
            score += 100;
          }

          if (allWords) {
            score += 50;
          }

          if (
            wantYear &&
            fn.includes(
              wantYear
            )
          ) {
            score += 15;
          }

          if (
            VIDEO_RE.test(
              filename
            )
          ) {
            score += 10;
          }

          return score;
        };

      const candidates =
        (data || []).filter(
          (torrent) => {
            if (
              [
                "magnet_error",
                "error",
                "magnet_conversion",
              ].includes(
                torrent.status
              )
            ) {
              return false;
            }

            return (
              scoreTorrent(
                torrent
              ) > 0
            );
          }
        );

      let usable =
        candidates;

      if (epRegex) {
        const exact =
          candidates.filter(
            (torrent) =>
              epRegex.test(
                torrent.filename ||
                  torrent.original_filename ||
                  ""
              )
          );

        if (
          exact.length >
          0
        ) {
          usable = exact;
        }
      }

      usable.sort(
        (a, b) =>
          scoreTorrent(
            b
          ) -
            scoreTorrent(
              a
            )
      );

      if (
        usable.length ===
        0
      ) {
        return Response.json({
          status:
            "not_found",
        });
      }

      const best =
        usable[0];

      const stream =
        await resolveStreamable(
          String(
            best.id
          ),
          authHeaders,
          formHeaders,
          {
            title,
            year,
            season,
            episode,
          }
        );

      if (
        !stream.error &&
        stream.ready &&
        stream.stream_url
      ) {
        return Response.json({
          status: "ready",

          torrent_id:
            String(
              best.id
            ),

          stream_url:
            stream.stream_url,

          filename:
            stream.filename ||
            "",

          files:
            stream.files ||
            [],

          rd_status:
            stream.rd_status,
        });
      }

      return Response.json({
        status:
          "preparing",

        torrent_id:
          String(
            best.id
          ),

        rd_status:
          stream.rd_status,

        filename:
          stream.filename ||
          "",
      });
    }

    return Response.json(
      {
        error:
          "Unknown action",
      },
      { status: 400 }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Unexpected Real-Debrid error",
      },
      { status: 500 }
    );
  }
}

/*
 * ============================================================
 * ADD MAGNET / RESOLVE MAGNET
 * ============================================================
 */
async function addMagnet({
  body,
  authHeaders,
  formHeaders,
  base44,
  saveLink = false,
}) {
  let magnet =
    body.magnet;

  if (!magnet) {
    return Response.json(
      {
        error:
          "A valid magnet URI or stream source is required",
      },
      { status: 400 }
    );
  }

  /*
   * Accept bare info hashes.
   */
  if (
    !String(magnet)
      .startsWith("magnet:") &&
    /^[a-fA-F0-9]{40}$/.test(
      String(magnet)
    )
  ) {
    magnet =
      `magnet:?xt=urn:btih:${magnet}`;
  }

  /*
   * Direct HTTP source.
   */
  if (
    String(magnet).startsWith(
      "http://"
    ) ||
    String(magnet).startsWith(
      "https://"
    )
  ) {
    return Response.json({
      status: "ready",

      stream_url:
        magnet,

      filename:
        body.title ||
        "Stream",

      files: [],
    });
  }

  if (
    !String(magnet).startsWith(
      "magnet:"
    )
  ) {
    return Response.json(
      {
        error:
          "Invalid magnet URI format",
      },
      { status: 400 }
    );
  }

  /*
   * Add to Real-Debrid.
   *
   * This works whether or not the magnet was already
   * present in the user's library.
   */
  const addRes =
    await fetch(
      `${RD_BASE}/torrents/addMagnet`,
      {
        method: "POST",
        headers:
          formHeaders,
        body:
          `magnet=${encodeURIComponent(
            magnet
          )}`,
      }
    );

  if (!addRes.ok) {
    const text =
      await addRes.text();

    return Response.json(
      {
        error:
          `addMagnet failed: ${addRes.status} ${text}`,
      },
      { status: 502 }
    );
  }

  const addData =
    await addRes.json();

  const torrentId =
    String(
      addData.id
    );

  if (!torrentId) {
    return Response.json(
      {
        error:
          "Real-Debrid did not return a torrent id.",
      },
      { status: 502 }
    );
  }

  /*
   * Select all files first.
   */
  await fetch(
    `${RD_BASE}/torrents/selectFiles/${torrentId}`,
    {
      method: "POST",
      headers:
        formHeaders,
      body:
        "files=all",
    }
  );

  const metadata = {
    title:
      body.title,

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

  /*
   * Save the association so future plays can potentially
   * reuse it.
   */
  if (
    saveLink &&
    body.title
  ) {
    try {
      const existing =
        await base44.entities.RdLink.filter(
          {
            title:
              String(
                body.title
              ).trim(),

            year:
              metadata.year,

            season:
              metadata.season,

            episode:
              metadata.episode,
          }
        );

      if (
        existing?.length >
        0
      ) {
        await base44.entities.RdLink.update(
          existing[0].id,
          {
            magnet,
            torrent_id:
              torrentId,
          }
        );
      } else {
        await base44.entities.RdLink.create(
          {
            title:
              String(
                body.title
              ).trim(),

            year:
              metadata.year,

            season:
              metadata.season,

            episode:
              metadata.episode,

            magnet,

            torrent_id:
              torrentId,
          }
        );
      }
    } catch {
      /*
       * Saving the link is an optimisation.
       * Playback must not fail because the database write failed.
       */
    }
  }

  const stream =
    await resolveStreamable(
      torrentId,
      authHeaders,
      formHeaders,
      metadata
    );

  if (stream.error) {
    return Response.json(
      {
        error:
          stream.error,
      },
      { status: 502 }
    );
  }

  return Response.json({
    status:
      stream.ready
        ? "ready"
        : "preparing",

    torrent_id:
      torrentId,

    stream_url:
      stream.stream_url ||
      "",

    filename:
      stream.filename ||
      "",

    rd_status:
      stream.rd_status,

    files:
      stream.files ||
      [],
  });
}

/*
 * ============================================================
 * BUILD FILE ENTRIES
 * ============================================================
 */
function buildFileEntries(
  info,
  target
) {
  const files =
    (info.files || []).filter(
      isVideoFile
    );

  return files.map(
    (file) => ({
      id:
        file.id,

      path:
        file.path || "",

      bytes:
        file.bytes || 0,

      link:
        file.link || "",

      selected:
        !!(
          target &&
          file.id ===
            target.id
        ),
    })
  );
}

/*
 * ============================================================
 * PICK THE BEST VIDEO FILE
 * ============================================================
 */
function chooseVideoFile(
  files,
  ep
) {
  if (
    !files ||
    files.length ===
      0
  ) {
    return null;
  }

  /*
   * TV episode matching.
   */
  if (
    ep?.season != null &&
    ep?.episode != null
  ) {
    const season =
      String(
        ep.season
      ).replace(
        /^0+/,
        ""
      );

    const episode =
      String(
        ep.episode
      ).replace(
        /^0+/,
        ""
      );

    const patterns = [
      new RegExp(
        `s0*${season}e0*${episode}(?!\\d)`,
        "i"
      ),

      new RegExp(
        `s${season}e${episode}(?!\\d)`,
        "i"
      ),

      new RegExp(
        `${season}x${episode}(?!\\d)`,
        "i"
      ),
    ];

    const episodeMatch =
      files.find(
        (file) => {
          const path =
            file.path ||
            "";

          return patterns.some(
            (pattern) =>
              pattern.test(
                path
              )
          );
        }
      );

    if (
      episodeMatch
    ) {
      return episodeMatch;
    }
  }

  /*
   * Movie / fallback:
   * choose the largest video file.
   *
   * This avoids selecting tiny samples, subtitles,
   * trailers or featurettes when the torrent contains
   * multiple video files.
   */
  return files
    .slice()
    .sort(
      (a, b) =>
        (b.bytes || 0) -
        (a.bytes || 0)
    )[0];
}

/*
 * ============================================================
 * RESOLVE A REAL-DEBRID TORRENT
 * ============================================================
 */
async function resolveStreamable(
  torrentId,
  authHeaders,
  formHeaders,
  ep
) {
  const infoUrl =
    `${RD_BASE}/torrents/info/${torrentId}`;

  const infoRes =
    await fetch(
      infoUrl,
      {
        headers:
          authHeaders,
      }
    );

  if (!infoRes.ok) {
    return {
      error:
        `info failed: ${infoRes.status}`,
    };
  }

  let info =
    await infoRes.json();

  /*
   * Some RD torrents need file selection first.
   */
  if (
    info.status ===
    "waiting_files_selection"
  ) {
    const selectRes =
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
      !selectRes.ok
    ) {
      return {
        error:
          `file selection failed: ${selectRes.status}`,
      };
    }

    /*
     * Fetch fresh torrent information.
     */
    const retryRes =
      await fetch(
        infoUrl,
        {
          headers:
            authHeaders,
        }
      );

    if (
      retryRes.ok
    ) {
      info =
        await retryRes.json();
    }
  }

  const allFiles =
    Array.isArray(
      info.files
    )
      ? info.files
      : [];

  const videoFiles =
    allFiles.filter(
      isVideoFile
    );

  if (
    videoFiles.length ===
    0
  ) {
    return {
      ready:
        info.status ===
        "downloaded",

      rd_status:
        info.status,

      filename:
        info.filename ||
        "",

      files: [],
    };
  }

  const target =
    chooseVideoFile(
      videoFiles,
      ep
    );

  /*
   * Real-Debrid returns links corresponding to the torrent
   * file list. Build an id -> link mapping using the ORIGINAL
   * info.files array, not the filtered video-only array.
   *
   * This fixes the old indexing bug.
   */
  const fileLinks =
    Array.isArray(
      info.links
    )
      ? info.links
      : [];

  const linkByFileId =
    new Map();

  if (
    fileLinks.length ===
    allFiles.length
  ) {
    allFiles.forEach(
      (file, index) => {
        const link =
          fileLinks[index];

        if (link) {
          linkByFileId.set(
            file.id,
            link
          );
        }
      }
    );
  }

  /*
   * Some RD responses only expose links in the same order as
   * selected files. Fall back carefully if needed.
   */
  let targetLink =
    target
      ? linkByFileId.get(
          target.id
        ) || ""
      : "";

  if (
    !targetLink &&
    target &&
    fileLinks.length ===
      videoFiles.length
  ) {
    const videoIndex =
      videoFiles.findIndex(
        (file) =>
          file.id ===
          target.id
      );

    if (
      videoIndex >= 0
    ) {
      targetLink =
        fileLinks[
          videoIndex
        ] || "";
    }
  }

  /*
   * Final fallback.
   */
  if (
    !targetLink &&
    fileLinks.length >
      0
  ) {
    targetLink =
      fileLinks[0];
  }

  const fileEntries =
    buildFileEntries(
      info,
      target
    );

  /*
   * Torrent is not downloaded yet.
   */
  if (
    !targetLink ||
    info.status !==
      "downloaded"
  ) {
    return {
      ready: false,

      rd_status:
        info.status,

      filename:
        target?.path ||
        info.filename ||
        "",

      files:
        fileEntries,
    };
  }

  /*
   * Turn the RD file link into a direct download/stream URL.
   */
  const unRes =
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

  if (!unRes.ok) {
    const text =
      await unRes.text();

    return {
      error:
        `unrestrict failed: ${unRes.status} ${text}`,
    };
  }

  const unData =
    await unRes.json();

  if (!unData?.download) {
    return {
      error:
        "Real-Debrid did not return a playable download URL.",
    };
  }

  return {
    ready: true,

    rd_status:
      info.status,

    stream_url:
      unData.download,

    filename:
      unData.filename ||
      target?.path ||
      info.filename ||
      "",

    files:
      fileEntries,
  };
}
