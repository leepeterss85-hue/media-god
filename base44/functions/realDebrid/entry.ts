import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const RD_BASE =
  "https://api.real-debrid.com/rest/1.0";

const VIDEO_RE =
  /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts|mts|vob|ogv|3gp|3g2|wmv|asf|f4v|mxf|divx)$/i;

const normalise = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isVideoFile = (file) =>
  !!file?.path &&
  VIDEO_RE.test(file.path);

/*
 * Audio codecs that are normally safe to hand directly to a
 * Fire TV / Chromium-style player. The frontend still performs
 * its own runtime codec checks, but this backend catches the
 * common silent-audio cases before playback starts.
 */
const SAFE_AUDIO_CODECS = new Set([
  "aac",
  "mp3",
  "ac3",
  "eac3",
  "ec3",
  "opus",
]);

const normaliseCodec = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, "");

const normaliseLanguage = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

const isEnglishTrack = (track) => {
  const iso = normaliseLanguage(
    track?.lang_iso ||
      track?.language ||
      ""
  );

  const label = normaliseLanguage(
    track?.lang ||
      track?.name ||
      ""
  );

  return (
    iso === "eng" ||
    iso === "en" ||
    iso.startsWith("en-") ||
    label === "english" ||
    /\benglish\b/i.test(label)
  );
};

const hasKnownLanguage = (track) => {
  const iso = normaliseLanguage(
    track?.lang_iso ||
      track?.language ||
      ""
  );

  const label = normaliseLanguage(
    track?.lang ||
      track?.name ||
      ""
  );

  return ![
    "",
    "und",
    "unknown",
    "undefined",
    "un",
  ].includes(iso) ||
    ![
      "",
      "und",
      "unknown",
      "undefined",
    ].includes(label);
};

const isSafeAudioCodec = (codec) => {
  const value = normaliseCodec(codec);

  if (!value) {
    return false;
  }

  if (
    value.includes("truehd") ||
    value.includes("mlp") ||
    value.includes("dts") ||
    value.includes("dca")
  ) {
    return false;
  }

  if (
    value.includes("eac3") ||
    value.includes("ec3")
  ) {
    return true;
  }

  if (value.includes("ac3")) {
    return true;
  }

  if (value.includes("aac")) {
    return true;
  }

  if (value.includes("mp3")) {
    return true;
  }

  if (value.includes("opus")) {
    return true;
  }

  return SAFE_AUDIO_CODECS.has(value);
};

const isHardRiskAudioCodec = (codec) => {
  const value = normaliseCodec(codec);

  if (!value) {
    return false;
  }

  return (
    value.includes("truehd") ||
    value.includes("mlp") ||
    value.includes("dts") ||
    value.includes("dca")
  );
};

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

const summariseAudioTrack = (track, key = "") => ({
  key,
  stream: track?.stream || "",
  language:
    track?.lang ||
    track?.language ||
    "",
  language_iso:
    track?.lang_iso ||
    track?.language_iso ||
    "",
  codec: track?.codec || "",
  channels:
    track?.channels ?? null,
  english: isEnglishTrack(track),
  browser_safe: isSafeAudioCodec(
    track?.codec
  ),
});

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
            forceAudioRescue:
              body.force_audio_rescue === true,
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

        audio_rescue:
          stream.audio_rescue ||
          null,

        media_info:
          stream.media_info ||
          null,
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
     *
     * Smart Audio Rescue is also applied when the user manually
     * chooses another file from a multi-file torrent.
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

      const playable =
        await choosePlayableRdStream({
          unData,
          authHeaders,
          formHeaders,
          preferEnglish:
            body.prefer_english !== false,
          allowTranscode:
            body.allow_transcode !== false,
          forceAudioRescue:
            body.force_audio_rescue === true,
        });

      if (playable.error) {
        return Response.json(
          {
            error:
              playable.error,
            error_code:
              playable.error_code ||
              "AUDIO_RESCUE_FAILED",
            audio_rescue:
              playable.audio_rescue ||
              null,
          },
          { status: 502 }
        );
      }

      return Response.json({
        stream_url:
          playable.stream_url,

        filename:
          playable.filename ||
          unData.filename ||
          "",

        audio_rescue:
          playable.audio_rescue ||
          null,

        media_info:
          playable.media_info ||
          null,
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

          audio_rescue:
            stream.audio_rescue ||
            null,

          media_info:
            stream.media_info ||
            null,
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

    forceAudioRescue:
      body.force_audio_rescue === true,
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

    audio_rescue:
      stream.audio_rescue ||
      null,

    media_info:
      stream.media_info ||
      null,
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
  const allFiles = Array.isArray(info?.files) ? info.files : [];
  const files = allFiles.filter(isVideoFile);
  const links = Array.isArray(info?.links) ? info.links : [];
  const linkById = new Map();

  if (links.length === allFiles.length) {
    allFiles.forEach((file, index) => {
      if (links[index]) linkById.set(file.id, links[index]);
    });
  } else {
    const selectedFiles = allFiles.filter(
      (file) => file?.selected === 1 || file?.selected === true
    );

    if (selectedFiles.length > 0 && links.length === selectedFiles.length) {
      selectedFiles.forEach((file, index) => {
        if (links[index]) linkById.set(file.id, links[index]);
      });
    } else if (links.length === files.length) {
      files.forEach((file, index) => {
        if (links[index]) linkById.set(file.id, links[index]);
      });
    }
  }

  return files.map(
    (file) => ({
      id: file.id,
      path: file.path || "",
      bytes: file.bytes || 0,
      link: file.link || linkById.get(file.id) || "",
      rd_selected: file?.selected === 1 || file?.selected === true,
      extension:
        String(file.path || "")
          .split(".")
          .pop()
          ?.toLowerCase() || "",
      selected: !!(
        target &&
        file.id === target.id
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

  const playable =
    await choosePlayableRdStream({
      unData,
      authHeaders,
      formHeaders,
      preferEnglish: true,
      allowTranscode: true,
      forceAudioRescue:
        ep?.forceAudioRescue === true,
    });

  if (playable.error) {
    return {
      error:
        playable.error,
      error_code:
        playable.error_code ||
        "AUDIO_RESCUE_FAILED",
      audio_rescue:
        playable.audio_rescue ||
        null,
      media_info:
        playable.media_info ||
        null,
    };
  }

  return {
    ready: true,

    rd_status:
      info.status,

    stream_url:
      playable.stream_url,

    filename:
      playable.filename ||
      unData.filename ||
      target?.path ||
      info.filename ||
      "",

    files:
      fileEntries,

    audio_rescue:
      playable.audio_rescue ||
      null,

    media_info:
      playable.media_info ||
      null,
  };
}

/*
 * ============================================================
 * SMART AUDIO RESCUE
 *
 * Strategy:
 *
 * 1. Keep the original unrestricted URL whenever its audio is
 *    already suitable.
 * 2. Prefer English.
 * 3. If the selected/default track is risky (DTS/TrueHD/etc.)
 *    or English exists but is not the likely default track,
 *    ask Real-Debrid for its own streaming transcode.
 * 4. If metadata proves the file has NO audio, reject it so the
 *    frontend immediately moves to the next source.
 * 5. If RD metadata itself is temporarily unavailable, keep the
 *    original stream and let the frontend's existing runtime
 *    no-audio detector/failover handle it. This is the fail-safe.
 *
 * Video is never deliberately limited to 1080p here. When RD
 * exposes a 2160p/4K HLS or live MP4 transcode, it scores highest.
 * ============================================================
 */
async function choosePlayableRdStream({
  unData,
  authHeaders,
  formHeaders,
  preferEnglish = true,
  allowTranscode = true,
  forceAudioRescue = false,
}) {
  const originalUrl =
    unData?.download ||
    "";

  const originalFilename =
    unData?.filename ||
    "";

  const fileId =
    unData?.id != null
      ? String(
          unData.id
        )
      : "";

  if (!originalUrl) {
    return {
      error:
        "Real-Debrid did not return a playable download URL.",
      error_code:
        "NO_STREAM_URL",
    };
  }

  /*
   * Older/unusual RD responses may not expose an id. Do not
   * break working playback just because we cannot inspect it.
   */
  if (!fileId) {
    return {
      stream_url:
        originalUrl,
      filename:
        originalFilename,
      audio_rescue: {
        used: false,
        state:
          "inspection_unavailable",
        reason:
          "Real-Debrid did not expose a file id for media inspection.",
      },
      media_info: null,
    };
  }

  const inspection =
    await getRdMediaInfo(
      fileId,
      authHeaders
    );

  /*
   * A 503 from mediaInfos can be transient. Falling back to the
   * original stream is safer than killing a source that may be
   * perfectly playable. The frontend still has its no-audio
   * detector and will move to the next source if necessary.
   */
  if (!inspection.ok) {
    return {
      stream_url:
        originalUrl,
      filename:
        originalFilename,
      audio_rescue: {
        used: false,
        state:
          "inspection_unavailable",
        reason:
          inspection.error ||
          "Real-Debrid media inspection was unavailable.",
      },
      media_info: null,
    };
  }

  const mediaInfo =
    inspection.data ||
    {};

  const audioObject =
    mediaInfo?.details?.audio &&
    typeof mediaInfo.details.audio ===
      "object"
      ? mediaInfo.details.audio
      : {};

  const audioEntries =
    Object.entries(
      audioObject
    );

  const audioTracks =
    audioEntries.map(
      ([key, track]) =>
        summariseAudioTrack(
          track,
          key
        )
    );

  const mediaSummary = {
    filename:
      mediaInfo?.filename ||
      originalFilename,
    type:
      mediaInfo?.type ||
      "",
    duration:
      mediaInfo?.duration ??
      null,
    bitrate:
      mediaInfo?.bitrate ??
      null,
    size:
      mediaInfo?.size ??
      null,
    audio_tracks:
      audioTracks,
  };

  /*
   * A successful mediaInfos response with zero audio tracks means
   * the file really has no audio to decode. Skip it immediately.
   */
  if (
    audioTracks.length ===
    0
  ) {
    return {
      error:
        "This file contains no audio track. Media God will try another source.",
      error_code:
        "NO_AUDIO_TRACK",
      audio_rescue: {
        used: false,
        state:
          "no_audio_track",
        reason:
          "Real-Debrid media inspection reported zero audio tracks.",
      },
      media_info:
        mediaSummary,
    };
  }

  const firstTrack =
    audioTracks[0];

  const englishTracks =
    audioTracks.filter(
      (track) =>
        track.english
    );

  const englishSafe =
    englishTracks.find(
      (track) =>
        track.browser_safe
    );

  const unknownLanguageTracks =
    audioEntries
      .filter(
        ([, track]) =>
          !hasKnownLanguage(
            track
          )
      )
      .map(
        ([key, track]) =>
          summariseAudioTrack(
            track,
            key
          )
      );

  const explicitlyForeignOnly =
    preferEnglish &&
    englishTracks.length ===
      0 &&
    unknownLanguageTracks.length ===
      0;

  if (
    explicitlyForeignOnly
  ) {
    return {
      stream_url:
        originalUrl,
      filename:
        originalFilename,
      audio_rescue: {
        used: false,
        state:
          "no_english_audio",
        reason:
          "Every labelled audio track is non-English. The original stream is kept as a last-resort fallback.",
      },
      media_info:
        mediaSummary,
    };
  }

  const firstIsEnglish =
    !!firstTrack?.english;

  const firstIsSafe =
    !!firstTrack?.browser_safe;

  /*
   * The original file is ideal when the likely/default first track
   * is already safe and either English or not language-labelled.
   */
  if (
    !forceAudioRescue &&
    firstIsSafe &&
    (
      !preferEnglish ||
      firstIsEnglish ||
      englishTracks.length ===
        0
    )
  ) {
    return {
      stream_url:
        originalUrl,
      filename:
        originalFilename,
      audio_rescue: {
        used: false,
        state:
          "original_compatible",
        reason:
          firstIsEnglish
            ? "The original stream already starts with compatible English audio."
            : "The original stream has a compatible audio track and no conflicting labelled English track.",
        selected_audio:
          firstTrack,
      },
      media_info:
        mediaSummary,
    };
  }

  /*
   * If English exists but is not the likely/default safe track, or
   * if the first track is a risky codec, ask RD for a transcode.
   */
  if (
    !allowTranscode
  ) {
    return {
      error:
        "The selected file needs audio rescue, but transcoding is disabled.",
      error_code:
        "TRANSCODE_DISABLED",
      audio_rescue: {
        used: false,
        state:
          "transcode_disabled",
      },
      media_info:
        mediaSummary,
    };
  }

  if (
    preferEnglish &&
    englishTracks.length >
      0
  ) {
    await ensureRdEnglishStreamingPreference(
      authHeaders,
      formHeaders
    );
  }

  const transcode =
    await getBestRdTranscode(
      fileId,
      authHeaders
    );

  if (
    transcode?.url
  ) {
    const why =
      forceAudioRescue
        ? "Runtime no-sound recovery requested a browser-safe Real-Debrid transcode."
        : preferEnglish &&
            englishTracks.length >
              0 &&
            !firstIsEnglish
          ? "English audio exists but is not the likely default track."
          : !firstIsSafe
            ? `The original ${firstTrack?.codec || "audio"} track is risky for Fire TV browser playback.`
            : "A Real-Debrid streaming version is safer for this file.";

    const formatLabel =
      transcode.format ===
        "apple"
        ? "HLS"
        : transcode.format ===
            "liveMP4"
          ? "MP4"
          : "Stream";

    return {
      stream_url:
        transcode.url,
      filename:
        `${originalFilename || mediaInfo?.filename || "Real-Debrid Stream"} [${formatLabel} Audio Rescue]`,
      audio_rescue: {
        used: true,
        state:
          "transcoded",
        reason: why,
        selected_audio:
          englishSafe ||
          englishTracks[0] ||
          firstTrack ||
          null,
        format:
          transcode.format,
        quality:
          transcode.quality,
      },
      media_info:
        mediaSummary,
    };
  }

  /*
   * A known DTS / TrueHD style first track is exactly the case Audio
   * Rescue exists to fix. If RD could not produce a safer stream, do
   * NOT return the original and wait for silent playback. Reject this
   * source now so VideoPlayer can immediately try the next source.
   *
   * Unknown/less-certain codecs still get the conservative original
   * fallback because some Fire TV builds may decode them successfully.
   */
  const firstCodec =
    firstTrack?.codec ||
    "";

  if (
    forceAudioRescue ||
    isHardRiskAudioCodec(
      firstCodec
    )
  ) {
    return {
      error:
        `The selected source uses ${firstCodec || "an unsupported audio codec"} and Real-Debrid could not create a compatible audio stream. Media God will try another source.`,
      error_code:
        "AUDIO_RESCUE_UNAVAILABLE",
      audio_rescue: {
        used: false,
        state:
          forceAudioRescue
            ? "forced_audio_rescue_unavailable_try_next_source"
            : "known_unsupported_audio_try_next_source",
        reason:
          transcode?.error ||
          (forceAudioRescue
            ? "Real-Debrid returned no compatible HLS/MP4/WebM transcode after runtime no-sound detection."
            : "Real-Debrid returned no compatible HLS/MP4/WebM transcode for a known-risky audio codec."),
        selected_audio:
          englishSafe ||
          englishTracks[0] ||
          firstTrack ||
          null,
      },
      media_info:
        mediaSummary,
    };
  }

  return {
    stream_url:
      originalUrl,
    filename:
      `${originalFilename || mediaInfo?.filename || "Real-Debrid Stream"} [Audio Rescue Fallback]`,
    audio_rescue: {
      used: false,
      state:
        "transcode_unavailable_original_fallback",
      reason:
        transcode?.error ||
        "No usable Real-Debrid transcode was returned. The codec is not a known hard-failure codec, so the original stream is kept as a final compatibility fallback.",
      selected_audio:
        englishSafe ||
        englishTracks[0] ||
        firstTrack ||
        null,
    },
    media_info:
      mediaSummary,
  };
}

async function getRdMediaInfo(
  fileId,
  authHeaders
) {
  const waits = [
    0,
    350,
    900,
  ];

  let lastError =
    "Real-Debrid media inspection was unavailable.";

  for (
    let attempt = 0;
    attempt < waits.length;
    attempt += 1
  ) {
    if (waits[attempt] > 0) {
      await sleep(
        waits[attempt]
      );
    }

    try {
      const response =
        await fetch(
          `${RD_BASE}/streaming/mediaInfos/${encodeURIComponent(
            fileId
          )}`,
          {
            headers:
              authHeaders,
          }
        );

      if (response.ok) {
        return {
          ok: true,
          data:
            await response.json(),
          attempts:
            attempt + 1,
        };
      }

      lastError =
        `mediaInfos unavailable (${response.status})`;

      /*
       * 503 is explicitly documented by Real-Debrid for temporary
       * metadata lookup failure. Other 5xx responses can also be
       * transient. Authentication/permission/429 errors should not
       * be hammered with retries.
       */
      const retryable =
        response.status ===
          503 ||
        (
          response.status >=
            500 &&
          response.status <
            600
        );

      if (!retryable) {
        break;
      }
    } catch (error) {
      lastError =
        error?.message ||
        "mediaInfos request failed";
    }
  }

  return {
    ok: false,
    error:
      lastError,
  };
}

async function ensureRdEnglishStreamingPreference(
  authHeaders,
  formHeaders
) {
  try {
    const settingsRes =
      await fetch(
        `${RD_BASE}/settings`,
        {
          headers:
            authHeaders,
        }
      );

    if (!settingsRes.ok) {
      return false;
    }

    const settings =
      await settingsRes.json();

    const languages =
      settings?.streaming_languages &&
      typeof settings.streaming_languages ===
        "object"
        ? settings.streaming_languages
        : {};

    let englishValue =
      "";

    for (
      const [key, value] of
      Object.entries(
        languages
      )
    ) {
      const keyText =
        normaliseLanguage(
          key
        );

      const valueText =
        normaliseLanguage(
          value
        );

      if (
        keyText === "eng" ||
        keyText === "en" ||
        keyText === "english" ||
        valueText === "eng" ||
        valueText === "en" ||
        valueText === "english" ||
        /\benglish\b/i.test(
          String(value || "")
        )
      ) {
        /*
         * RD documents streaming_languages as the possible values
         * for streaming_language_preference; the object key is the
         * setting value and the object value is its display label.
         */
        englishValue =
          String(key);
        break;
      }
    }

    if (!englishValue) {
      return false;
    }

    if (
      String(
        settings?.streaming_language_preference ||
          ""
      ) ===
      englishValue
    ) {
      return true;
    }

    const updateBody =
      new URLSearchParams();

    updateBody.set(
      "setting_name",
      "streaming_language_preference"
    );

    updateBody.set(
      "setting_value",
      englishValue
    );

    const updateRes =
      await fetch(
        `${RD_BASE}/settings/update`,
        {
          method: "POST",
          headers:
            formHeaders,
          body:
            updateBody.toString(),
        }
      );

    return updateRes.ok;
  } catch {
    /*
     * Preference update is an optimisation. Transcode can still
     * succeed, and failure here must never crash playback.
     */
    return false;
  }
}

const transcodeQualityScore = (
  quality,
  url
) => {
  const text =
    `${String(
      quality ||
        ""
    )} ${String(
      url ||
        ""
    )}`.toLowerCase();

  if (
    /\b(?:4320p?|8k)\b/.test(
      text
    )
  ) {
    return 4320;
  }

  if (
    /\b(?:2160p?|4k|uhd)\b/.test(
      text
    )
  ) {
    return 2160;
  }

  if (
    /\b1440p?\b/.test(
      text
    )
  ) {
    return 1440;
  }

  if (
    /\b1080p?\b/.test(
      text
    )
  ) {
    return 1080;
  }

  if (
    /\b720p?\b/.test(
      text
    )
  ) {
    return 720;
  }

  if (
    /\b576p?\b/.test(
      text
    )
  ) {
    return 576;
  }

  if (
    /\b480p?\b/.test(
      text
    )
  ) {
    return 480;
  }

  if (
    /\b360p?\b/.test(
      text
    )
  ) {
    return 360;
  }

  if (
    /\b(?:full|original|source|max|best)\b/.test(
      text
    )
  ) {
    return 10000;
  }

  const number =
    Number.parseInt(
      String(
        quality ||
          ""
      ).replace(
        /[^0-9]/g,
        ""
      ),
      10
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
};

async function getBestRdTranscode(
  fileId,
  authHeaders
) {
  const waits = [
    0,
    400,
    1000,
  ];

  let lastError =
    "Real-Debrid returned no HLS/MP4/WebM transcode links.";

  for (
    let attempt = 0;
    attempt < waits.length;
    attempt += 1
  ) {
    if (waits[attempt] > 0) {
      await sleep(
        waits[attempt]
      );
    }

    try {
      const response =
        await fetch(
          `${RD_BASE}/streaming/transcode/${encodeURIComponent(
            fileId
          )}`,
          {
            headers:
              authHeaders,
          }
        );

      if (!response.ok) {
        lastError =
          `transcode unavailable (${response.status})`;

        const retryable =
          response.status ===
            503 ||
          (
            response.status >=
              500 &&
            response.status <
              600
          );

        if (!retryable) {
          break;
        }

        continue;
      }

      const data =
        await response.json();

      const candidates =
        [];

      /*
       * HLS is first choice because LiveVideo handles it reliably on
       * Fire TV. liveMP4 is second. H264 WebM remains a final rescue
       * option. DASH is intentionally excluded because the current
       * Media God player does not include dash.js.
       */
      for (
        const format of [
          "apple",
          "liveMP4",
          "h264WebM",
        ]
      ) {
        const group =
          data?.[format];

        if (
          !group ||
          typeof group !==
            "object"
        ) {
          continue;
        }

        for (
          const [quality, url] of
          Object.entries(
            group
          )
        ) {
          if (
            typeof url !==
              "string" ||
            !/^https?:\/\//i.test(
              url
            )
          ) {
            continue;
          }

          candidates.push({
            format,
            quality:
              String(
                quality
              ),
            url,
            score:
              transcodeQualityScore(
                quality,
                url
              ) *
                100 +
              (
                format ===
                  "apple"
                  ? 30
                  : format ===
                      "liveMP4"
                    ? 20
                    : 10
              ),
          });
        }
      }

      candidates.sort(
        (a, b) =>
          b.score -
          a.score
      );

      if (
        candidates.length >
        0
      ) {
        return {
          ...candidates[0],
          attempts:
            attempt + 1,
        };
      }

      lastError =
        "Real-Debrid returned no HLS/MP4/WebM transcode links yet.";
    } catch (error) {
      lastError =
        error?.message ||
        "transcode request failed";
    }
  }

  return {
    error:
      lastError,
  };
}
