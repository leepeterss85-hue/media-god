import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const RD_BASE = "https://api.real-debrid.com/rest/1.0";
const VIDEO_RE =
  /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

const normalise = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isVideoFile = (file) =>
  Boolean(
    file?.path &&
      VIDEO_RE.test(
        file.path
      )
  );

const normaliseLanguage = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

const normaliseCodec = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9+]/g,
      ""
    );

const isEnglishTrack = (track) => {
  const iso =
    normaliseLanguage(
      track?.lang_iso ||
        track?.language_iso ||
        track?.language ||
        ""
    );

  const label =
    normaliseLanguage(
      track?.lang ||
        track?.name ||
        ""
    );

  return (
    iso === "eng" ||
    iso === "en" ||
    iso.startsWith(
      "en-"
    ) ||
    label === "english" ||
    /\benglish\b/i.test(
      label
    )
  );
};

const hasKnownLanguage = (track) => {
  const iso =
    normaliseLanguage(
      track?.lang_iso ||
        track?.language_iso ||
        track?.language ||
        ""
    );

  const label =
    normaliseLanguage(
      track?.lang ||
        track?.name ||
        ""
    );

  const unknown =
    new Set([
      "",
      "und",
      "unknown",
      "undefined",
      "un",
    ]);

  return (
    !unknown.has(iso) ||
    !unknown.has(label)
  );
};

const isSafeAudioCodec = (codec) => {
  const value =
    normaliseCodec(
      codec
    );

  if (!value) {
    return false;
  }

  if (
    value.includes(
      "truehd"
    ) ||
    value.includes(
      "mlp"
    ) ||
    value.includes(
      "dts"
    ) ||
    value.includes(
      "dca"
    )
  ) {
    return false;
  }

  return (
    value.includes(
      "aac"
    ) ||
    value.includes(
      "mp3"
    ) ||
    value.includes(
      "ac3"
    ) ||
    value.includes(
      "eac3"
    ) ||
    value.includes(
      "ec3"
    ) ||
    value.includes(
      "opus"
    )
  );
};

const summariseAudioTrack = (
  track,
  key = ""
) => ({
  key,

  stream:
    track?.stream ||
    "",

  language:
    track?.lang ||
    track?.language ||
    "",

  language_iso:
    track?.lang_iso ||
    track?.language_iso ||
    "",

  codec:
    track?.codec ||
    "",

  channels:
    track?.channels ??
    null,

  english:
    isEnglishTrack(
      track
    ),

  browser_safe:
    isSafeAudioCodec(
      track?.codec
    ),
});

const jsonError = (
  error,
  status = 502,
  extra = {}
) =>
  Response.json(
    {
      error,
      ...extra,
    },
    {
      status,
    }
  );

export default async function (req) {
  try {
    const base44 =
      createClientFromRequest(
        req
      );

    const user =
      await base44.auth.me();

    if (!user) {
      return jsonError(
        "Unauthorized",
        401
      );
    }

    const token =
      user.rd_token;

    if (!token) {
      return jsonError(
        "Real-Debrid token not set. Add it in Settings.",
        400
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
     * STATUS
     */
    if (
      action ===
      "status"
    ) {
      const res =
        await fetch(
          `${RD_BASE}/user`,
          {
            headers:
              authHeaders,
          }
        );

      if (!res.ok) {
        return jsonError(
          `Real-Debrid rejected token (${res.status})`
        );
      }

      const data =
        await res.json();

      return Response.json({
        valid: true,

        premium:
          Boolean(
            data.premium
          ),

        expires:
          data.expiration ||
          "",

        points:
          data.points ||
          0,
      });
    }

    /*
     * ADD MAGNET / RESOLVE BEST
     */
    if (
      action ===
        "add_magnet" ||
      action ===
        "resolve_best"
    ) {
      return addMagnet({
        body,

        authHeaders,

        formHeaders,

        base44,

        saveLink:
          action ===
          "resolve_best",
      });
    }

    /*
     * TORRENT INFO
     */
    if (
      action ===
      "torrent_info"
    ) {
      if (
        !body.torrent_id
      ) {
        return jsonError(
          "torrent_id required",
          400
        );
      }

      const stream =
        await resolveStreamable(
          String(
            body.torrent_id
          ),

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

      if (
        stream.error
      ) {
        return jsonError(
          stream.error,
          502,
          {
            error_code:
              stream.error_code,

            audio_rescue:
              stream.audio_rescue ||
              null,

            media_info:
              stream.media_info ||
              null,
          }
        );
      }

      return Response.json({
        status:
          stream.ready
            ? "ready"
            : "preparing",

        torrent_id:
          String(
            body.torrent_id
          ),

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
     * TORRENT FILES
     */
    if (
      action ===
      "torrent_files"
    ) {
      if (
        !body.torrent_id
      ) {
        return jsonError(
          "torrent_id required",
          400
        );
      }

      const infoRes =
        await fetch(
          `${RD_BASE}/torrents/info/${encodeURIComponent(
            String(
              body.torrent_id
            )
          )}`,
          {
            headers:
              authHeaders,
          }
        );

      if (
        !infoRes.ok
      ) {
        return jsonError(
          `info failed: ${infoRes.status}`
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
     * UNRESTRICT FILE
     *
     * Used when manually choosing another
     * file from a multi-file torrent.
     */
    if (
      action ===
      "unrestrict_file"
    ) {
      if (
        !body.link
      ) {
        return jsonError(
          "link required",
          400
        );
      }

      const unrestricted =
        await unrestrictRdLink(
          body.link,
          formHeaders
        );

      if (
        unrestricted.error
      ) {
        return jsonError(
          unrestricted.error
        );
      }

      const playable =
        await choosePlayableRdStream(
          {
            unData:
              unrestricted.data,

            authHeaders,

            formHeaders,

            preferEnglish:
              body.prefer_english !==
              false,

            allowTranscode:
              body.allow_transcode !==
              false,
          }
        );

      if (
        playable.error
      ) {
        return jsonError(
          playable.error,
          502,
          {
            error_code:
              playable.error_code ||
              "AUDIO_RESCUE_FAILED",

            audio_rescue:
              playable.audio_rescue ||
              null,

            media_info:
              playable.media_info ||
              null,
          }
        );
      }

      return Response.json({
        stream_url:
          playable.stream_url,

        filename:
          playable.filename ||
          unrestricted.data
            ?.filename ||
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
     * DELETE TORRENT
     */
    if (
      action ===
      "torrent_delete"
    ) {
      if (
        !body.torrent_id
      ) {
        return jsonError(
          "torrent_id required",
          400
        );
      }

      const res =
        await fetch(
          `${RD_BASE}/torrents/delete/${encodeURIComponent(
            String(
              body.torrent_id
            )
          )}`,
          {
            method:
              "DELETE",

            headers:
              authHeaders,
          }
        );

      if (!res.ok) {
        return jsonError(
          `delete failed: ${res.status}`
        );
      }

      return Response.json({
        deleted: true,
      });
    }

    /*
     * TORRENTS LIST
     */
    if (
      action ===
      "torrents_list"
    ) {
      const res =
        await fetch(
          `${RD_BASE}/torrents`,
          {
            headers:
              authHeaders,
          }
        );

      if (!res.ok) {
        return jsonError(
          `RD error: ${res.status}`
        );
      }

      const data =
        await res.json();

      return Response.json({
        torrents:
          (data || []).map(
            (
              torrent
            ) => ({
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
                  torrent.links
                    .length >
                    0
                ),
            })
          ),
      });
    }

    /*
     * HOSTS
     */
    if (
      action ===
      "hosts"
    ) {
      const res =
        await fetch(
          `${RD_BASE}/hosts/status`,
          {
            headers:
              authHeaders,
          }
        );

      if (!res.ok) {
        return jsonError(
          `RD error: ${res.status}`
        );
      }

      const data =
        await res.json();

      const hosts =
        Object.entries(
          data ||
          {}
        )
          .filter(
            ([
              ,
              value,
            ]) =>
              value &&
              value.supported &&
              !value.disabled
          )
          .map(
            ([
              key,
            ]) =>
              key
          )
          .slice(
            0,
            40
          );

      return Response.json({
        hosts,
      });
    }

    /*
     * FIND CACHED
     */
    if (
      action ===
      "find_cached"
    ) {
      return findCached({
        body,

        authHeaders,

        formHeaders,
      });
    }

    return jsonError(
      "Unknown action",
      400
    );
  } catch (
    error
  ) {
    return jsonError(
      error?.message ||
        "Unexpected Real-Debrid error",
      500
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
    return jsonError(
      "A valid magnet URI or stream source is required",
      400
    );
  }

  /*
   * Accept a bare 40-character torrent hash.
   */
  if (
    !String(
      magnet
    ).startsWith(
      "magnet:"
    ) &&
    /^[a-fA-F0-9]{40}$/.test(
      String(
        magnet
      )
    )
  ) {
    magnet =
      `magnet:?xt=urn:btih:${magnet}`;
  }

  /*
   * Direct HTTP stream.
   */
  if (
    /^https?:\/\//i.test(
      String(
        magnet
      )
    )
  ) {
    return Response.json({
      status:
        "ready",

      stream_url:
        magnet,

      filename:
        body.title ||
        "Stream",

      files: [],

      audio_rescue:
        null,

      media_info:
        null,
    });
  }

  if (
    !String(
      magnet
    ).startsWith(
      "magnet:"
    )
  ) {
    return jsonError(
      "Invalid magnet URI format",
      400
    );
  }

  const addRes =
    await fetch(
      `${RD_BASE}/torrents/addMagnet`,
      {
        method:
          "POST",

        headers:
          formHeaders,

        body:
          `magnet=${encodeURIComponent(
            magnet
          )}`,
      }
    );

  if (
    !addRes.ok
  ) {
    return jsonError(
      `addMagnet failed: ${addRes.status} ${await addRes.text()}`
    );
  }

  const addData =
    await addRes.json();

  const torrentId =
    String(
      addData.id ||
      ""
    );

  if (
    !torrentId
  ) {
    return jsonError(
      "Real-Debrid did not return a torrent id."
    );
  }

  /*
   * Select all torrent files.
   */
  await fetch(
    `${RD_BASE}/torrents/selectFiles/${encodeURIComponent(
      torrentId
    )}`,
    {
      method:
        "POST",

      headers:
        formHeaders,

      body:
        "files=all",
    }
  ).catch(
    () =>
      null
  );

  const metadata = {
    title:
      body.title,

    year:
      body.year !=
      null
        ? String(
            body.year
          )
        : "",

    season:
      body.season !=
      null
        ? String(
            body.season
          )
        : "",

    episode:
      body.episode !=
      null
        ? String(
            body.episode
          )
        : "",
  };

  /*
   * Save the title -> torrent association
   * so later plays can reuse it.
   */
  if (
    saveLink &&
    body.title
  ) {
    try {
      const filter = {
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
      };

      const existing =
        await base44.entities.RdLink.filter(
          filter
        );

      const patch = {
        magnet,

        torrent_id:
          torrentId,
      };

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
          {
            ...filter,
            ...patch,
          }
        );
      }
    } catch {
      /*
       * Saving this record is only an
       * optimisation. Never break playback.
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

  if (
    stream.error
  ) {
    return jsonError(
      stream.error,
      502,
      {
        error_code:
          stream.error_code,

        audio_rescue:
          stream.audio_rescue ||
          null,

        media_info:
          stream.media_info ||
          null,
      }
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
 * BUILD FILE LIST
 * ============================================================
 */
function buildFileEntries(
  info,
  target
) {
  return (
    info?.files ||
    []
  )
    .filter(
      isVideoFile
    )
    .map(
      (
        file
      ) => ({
        id:
          file.id,

        path:
          file.path ||
          "",

        bytes:
          file.bytes ||
          0,

        link:
          file.link ||
          "",

        selected:
          Boolean(
            target &&
            file.id ===
              target.id
          ),
      })
    );
}

/*
 * ============================================================
 * PICK CORRECT VIDEO FILE
 * ============================================================
 */
function chooseVideoFile(
  files,
  ep
) {
  if (
    !files?.length
  ) {
    return null;
  }

  /*
   * Exact TV episode match first.
   */
  if (
    ep?.season !=
      null &&
    ep?.episode !=
      null
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
        `${season}x0*${episode}(?!\\d)`,
        "i"
      ),
    ];

    const exact =
      files.find(
        (
          file
        ) =>
          patterns.some(
            (
              pattern
            ) =>
              pattern.test(
                file.path ||
                ""
              )
          )
      );

    if (exact) {
      return exact;
    }
  }

  /*
   * Movie / fallback:
   * largest video file.
   */
  return files
    .slice()
    .sort(
      (
        a,
        b
      ) =>
        (
          b.bytes ||
          0
        ) -
        (
          a.bytes ||
          0
        )
    )[0];
}

/*
 * ============================================================
 * RESOLVE TORRENT INTO PLAYABLE STREAM
 * ============================================================
 */
async function resolveStreamable(
  torrentId,
  authHeaders,
  formHeaders,
  ep
) {
  const infoUrl =
    `${RD_BASE}/torrents/info/${encodeURIComponent(
      torrentId
    )}`;

  const infoRes =
    await fetch(
      infoUrl,
      {
        headers:
          authHeaders,
      }
    );

  if (
    !infoRes.ok
  ) {
    return {
      error:
        `info failed: ${infoRes.status}`,
    };
  }

  let info =
    await infoRes.json();

  /*
   * Select files when RD is waiting.
   */
  if (
    info.status ===
    "waiting_files_selection"
  ) {
    const selectRes =
      await fetch(
        `${RD_BASE}/torrents/selectFiles/${encodeURIComponent(
          torrentId
        )}`,
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
      !selectRes.ok &&
      selectRes.status !==
        202
    ) {
      return {
        error:
          `file selection failed: ${selectRes.status}`,
      };
    }

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

  const fileEntries =
    buildFileEntries(
      info,
      target
    );

  const fileLinks =
    Array.isArray(
      info.links
    )
      ? info.links
      : [];

  const linkByFileId =
    new Map();

  /*
   * Map links to the original file array.
   */
  if (
    fileLinks.length ===
    allFiles.length
  ) {
    allFiles.forEach(
      (
        file,
        index
      ) => {
        const link =
          fileLinks[
            index
          ];

        if (link) {
          linkByFileId.set(
            file.id,
            link
          );
        }
      }
    );
  }

  let targetLink =
    target
      ? linkByFileId.get(
          target.id
        ) ||
        ""
      : "";

  /*
   * Some RD results only return links
   * for video files.
   */
  if (
    !targetLink &&
    target &&
    fileLinks.length ===
      videoFiles.length
  ) {
    const videoIndex =
      videoFiles.findIndex(
        (
          file
        ) =>
          file.id ===
          target.id
      );

    if (
      videoIndex >=
      0
    ) {
      targetLink =
        fileLinks[
          videoIndex
        ] ||
        "";
    }
  }

  /*
   * Last safe fallback.
   */
  if (
    !targetLink &&
    fileLinks.length >
      0
  ) {
    targetLink =
      fileLinks[0];
  }

  /*
   * Torrent still preparing.
   */
  if (
    !targetLink ||
    info.status !==
      "downloaded"
  ) {
    return {
      ready:
        false,

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
   * Convert torrent link into an
   * unrestricted RD download URL.
   */
  const unrestricted =
    await unrestrictRdLink(
      targetLink,
      formHeaders
    );

  if (
    unrestricted.error
  ) {
    return {
      error:
        unrestricted.error,
    };
  }

  /*
   * Smart Audio Rescue.
   */
  const playable =
    await choosePlayableRdStream(
      {
        unData:
          unrestricted.data,

        authHeaders,

        formHeaders,

        preferEnglish:
          true,

        allowTranscode:
          true,
      }
    );

  if (
    playable.error
  ) {
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
    ready:
      true,

    rd_status:
      info.status,

    stream_url:
      playable.stream_url,

    filename:
      playable.filename ||
      unrestricted.data
        ?.filename ||
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
 * UNRESTRICT ONE RD LINK
 * ============================================================
 */
async function unrestrictRdLink(
  link,
  formHeaders
) {
  try {
    const res =
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

    if (!res.ok) {
      return {
        error:
          `unrestrict failed: ${res.status} ${await res.text()}`,
      };
    }

    return {
      data:
        await res.json(),
    };
  } catch (
    error
  ) {
    return {
      error:
        error?.message ||
        "unrestrict request failed",
    };
  }
}

/*
 * ============================================================
 * SMART AUDIO RESCUE
 * ============================================================
 *
 * Order:
 *
 * 1. Inspect the RD file.
 * 2. If it literally has no audio, reject it.
 * 3. If original English audio is already safe, use original.
 * 4. If English exists but default audio is wrong, use RD stream.
 * 5. If DTS / TrueHD / risky audio is detected, use RD stream.
 * 6. Choose the highest available RD transcode quality.
 * 7. Do NOT cap Fire Stick to 1080p.
 * 8. If RD inspection/transcode itself fails, return original
 *    so frontend source failover can still recover.
 */
async function choosePlayableRdStream({
  unData,
  authHeaders,
  formHeaders,
  preferEnglish = true,
  allowTranscode = true,
}) {
  const originalUrl =
    unData?.download ||
    "";

  const originalFilename =
    unData?.filename ||
    "";

  const fileId =
    unData?.id !=
    null
      ? String(
          unData.id
        )
      : "";

  if (
    !originalUrl
  ) {
    return {
      error:
        "Real-Debrid did not return a playable download URL.",

      error_code:
        "NO_STREAM_URL",
    };
  }

  /*
   * Do not break playback if an unusual
   * RD response doesn't expose a file id.
   */
  if (
    !fileId
  ) {
    return {
      stream_url:
        originalUrl,

      filename:
        originalFilename,

      audio_rescue: {
        used:
          false,

        state:
          "inspection_unavailable",

        reason:
          "Real-Debrid did not expose a file id for media inspection.",
      },

      media_info:
        null,
    };
  }

  const inspection =
    await getRdMediaInfo(
      fileId,
      authHeaders
    );

  /*
   * RD can temporarily return 503 while
   * finding media metadata.
   *
   * Keep the original and let the
   * frontend no-audio detector decide.
   */
  if (
    !inspection.ok
  ) {
    return {
      stream_url:
        originalUrl,

      filename:
        originalFilename,

      audio_rescue: {
        used:
          false,

        state:
          "inspection_unavailable",

        reason:
          inspection.error ||
          "Real-Debrid media inspection was unavailable.",
      },

      media_info:
        null,
    };
  }

  const mediaInfo =
    inspection.data ||
    {};

  const audioObject =
    mediaInfo
      ?.details
      ?.audio &&
    typeof mediaInfo
      .details
      .audio ===
      "object"
      ? mediaInfo
          .details
          .audio
      : {};

  /*
   * Support both an object and an array
   * just in case RD changes representation.
   */
  const rawAudioEntries =
    Array.isArray(
      audioObject
    )
      ? audioObject.map(
          (
            track,
            index
          ) => [
            String(
              index
            ),
            track,
          ]
        )
      : Object.entries(
          audioObject
        );

  const audioTracks =
    rawAudioEntries.map(
      ([
        key,
        track,
      ]) =>
        summariseAudioTrack(
          track,
          key
        )
    );

  const videoObject =
    mediaInfo
      ?.details
      ?.video &&
    typeof mediaInfo
      .details
      .video ===
      "object"
      ? mediaInfo
          .details
          .video
      : {};

  const mediaSummary = {
    filename:
      mediaInfo
        ?.filename ||
      originalFilename,

    type:
      mediaInfo?.type ||
      "",

    duration:
      mediaInfo
        ?.duration ??
      null,

    bitrate:
      mediaInfo
        ?.bitrate ??
      null,

    size:
      mediaInfo?.size ??
      null,

    video_tracks:
      Object.entries(
        videoObject
      ).map(
        ([
          key,
          track,
        ]) => ({
          key,

          codec:
            track?.codec ||
            "",

          width:
            track?.width ??
            null,

          height:
            track?.height ??
            null,

          colorspace:
            track?.colorspace ||
            "",
        })
      ),

    audio_tracks:
      audioTracks,
  };

  /*
   * REAL zero-audio file.
   *
   * Don't waste time trying to play it.
   * Return an error so VideoPlayer can
   * immediately move to another source.
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
        used:
          false,

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
      (
        track
      ) =>
        track.english
    );

  const englishSafe =
    englishTracks.find(
      (
        track
      ) =>
        track.browser_safe
    );

  const unknownLanguageTracks =
    rawAudioEntries
      .filter(
        ([
          ,
          track,
        ]) =>
          !hasKnownLanguage(
            track
          )
      )
      .map(
        ([
          key,
          track,
        ]) =>
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

  /*
   * Don't reject a working source only
   * because English is missing.
   *
   * Keep it as a last resort.
   */
  if (
    explicitlyForeignOnly
  ) {
    return {
      stream_url:
        originalUrl,

      filename:
        originalFilename,

      audio_rescue: {
        used:
          false,

        state:
          "no_english_audio",

        reason:
          "All labelled audio tracks are non-English, so the original stream is kept as a last-resort fallback.",
      },

      media_info:
        mediaSummary,
    };
  }

  const firstIsEnglish =
    Boolean(
      firstTrack
        ?.english
    );

  const firstIsSafe =
    Boolean(
      firstTrack
        ?.browser_safe
    );

  /*
   * Original is already ideal.
   */
  if (
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
        used:
          false,

        state:
          "original_compatible",

        reason:
          firstIsEnglish
            ? "The original stream already starts with compatible English audio."
            : "The original stream starts with compatible audio and no conflicting labelled English track.",

        selected_audio:
          firstTrack,
      },

      media_info:
        mediaSummary,
    };
  }

  /*
   * Risky audio or wrong default language.
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
        used:
          false,

        state:
          "transcode_disabled",
      },

      media_info:
        mediaSummary,
    };
  }

  /*
   * Ask RD to prefer English for its
   * streaming/transcoding output.
   */
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

  /*
   * Request RD's stream/transcode links.
   */
  const transcode =
    await getBestRdTranscode(
      fileId,
      authHeaders
    );

  if (
    transcode?.url
  ) {
    const reason =
      preferEnglish &&
      englishTracks.length >
        0 &&
      !firstIsEnglish
        ? "English audio exists but is not the likely default track."
        : !firstIsSafe
          ? `The original ${
              firstTrack
                ?.codec ||
              "audio"
            } track is risky for Fire TV browser playback.`
          : "A Real-Debrid streaming version is safer for this file.";

    const formatLabel =
      transcode.format ===
        "apple"
        ? "HLS"
        : transcode.format ===
            "liveMP4"
          ? "MP4"
          : "WebM";

    return {
      stream_url:
        transcode.url,

      filename:
        `${
          originalFilename ||
          mediaInfo
            ?.filename ||
          "Real-Debrid Stream"
        } [${formatLabel} Audio Rescue]`,

      audio_rescue: {
        used:
          true,

        state:
          "transcoded",

        reason,

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
   * Fail-safe fallback.
   *
   * If RD itself cannot supply a streaming
   * version, keep the original URL.
   *
   * LiveVideo / VideoPlayer already has
   * silent-audio detection and source failover.
   */
  return {
    stream_url:
      originalUrl,

    filename:
      `${
        originalFilename ||
        mediaInfo
          ?.filename ||
        "Real-Debrid Stream"
      } [Audio Rescue Fallback]`,

    audio_rescue: {
      used:
        false,

      state:
        "transcode_unavailable_original_fallback",

      reason:
        transcode?.error ||
        "No usable Real-Debrid transcode was returned. The original stream is kept so frontend failover can decide.",
    },

    media_info:
      mediaSummary,
  };
}

/*
 * ============================================================
 * REAL-DEBRID MEDIA INSPECTION
 * ============================================================
 */
async function getRdMediaInfo(
  fileId,
  authHeaders
) {
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

    if (
      !response.ok
    ) {
      return {
        ok:
          false,

        error:
          `mediaInfos unavailable (${response.status})`,
      };
    }

    return {
      ok:
        true,

      data:
        await response.json(),
    };
  } catch (
    error
  ) {
    return {
      ok:
        false,

      error:
        error?.message ||
        "mediaInfos request failed",
    };
  }
}

/*
 * ============================================================
 * ASK RD TO PREFER ENGLISH
 * ============================================================
 */
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

    if (
      !settingsRes.ok
    ) {
      return false;
    }

    const settings =
      await settingsRes.json();

    const languages =
      settings
        ?.streaming_languages &&
      typeof settings
        .streaming_languages ===
        "object"
        ? settings
            .streaming_languages
        : {};

    let englishValue =
      "";

    for (
      const [
        key,
        value,
      ] of
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
        [
          "eng",
          "en",
          "english",
        ].includes(
          keyText
        ) ||
        [
          "eng",
          "en",
          "english",
        ].includes(
          valueText
        ) ||
        /\benglish\b/i.test(
          String(
            value ||
            ""
          )
        )
      ) {
        englishValue =
          String(
            key
          );

        break;
      }
    }

    if (
      !englishValue
    ) {
      return false;
    }

    if (
      String(
        settings
          ?.streaming_language_preference ||
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
          method:
            "POST",

          headers:
            formHeaders,

          body:
            updateBody.toString(),
        }
      );

    return updateRes.ok;
  } catch {
    /*
     * Language preference is an
     * optimisation only.
     */
    return false;
  }
}

/*
 * ============================================================
 * QUALITY SCORING
 * ============================================================
 *
 * Fire Stick 4K remains a 4K device.
 *
 * There is deliberately no 1080p ceiling.
 */
function transcodeQualityScore(
  quality,
  url
) {
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

  /*
   * Original / source / best should beat
   * named fixed resolutions if RD exposes one.
   */
  if (
    /\b(?:full|original|source|max|best)\b/.test(
      text
    )
  ) {
    return 10000;
  }

  const parsed =
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
    parsed
  )
    ? parsed
    : 0;
}

/*
 * ============================================================
 * GET BEST RD TRANSCODE
 * ============================================================
 */
async function getBestRdTranscode(
  fileId,
  authHeaders
) {
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

    if (
      !response.ok
    ) {
      return {
        error:
          `transcode unavailable (${response.status})`,
      };
    }

    const data =
      await response.json();

    const candidates =
      [];

    /*
     * HLS is best because LiveVideo already
     * handles it.
     *
     * Then live MP4.
     *
     * Then H264 WebM.
     *
     * DASH is deliberately ignored because
     * the current player doesn't use dash.js.
     */
    for (
      const format of [
        "apple",
        "liveMP4",
        "h264WebM",
      ]
    ) {
      const group =
        data?.[
          format
        ];

      if (
        !group ||
        typeof group !==
          "object"
      ) {
        continue;
      }

      for (
        const [
          quality,
          url,
        ] of
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

        const formatBonus =
          format ===
            "apple"
            ? 30
            : format ===
                "liveMP4"
              ? 20
              : 10;

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
            formatBonus,
        });
      }
    }

    candidates.sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    );

    return (
      candidates[0] ||
      {
        error:
          "Real-Debrid returned no HLS/MP4/WebM transcode links.",
      }
    );
  } catch (
    error
  ) {
    return {
      error:
        error?.message ||
        "transcode request failed",
    };
  }
}

/*
 * ============================================================
 * FIND EXISTING CACHED TORRENT
 * ============================================================
 */
async function findCached({
  body,
  authHeaders,
  formHeaders,
}) {
  const title =
    String(
      body.title ||
      ""
    ).trim();

  if (!title) {
    return jsonError(
      "title required",
      400
    );
  }

  const season =
    body.season !=
    null
      ? String(
          body.season
        )
      : "";

  const episode =
    body.episode !=
    null
      ? String(
          body.episode
        )
      : "";

  const year =
    body.year !=
    null
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
    return jsonError(
      `RD error: ${res.status}`
    );
  }

  const data =
    await res.json();

  const want =
    normalise(
      title
    );

  const wantYear =
    normalise(
      year
    );

  const titleWords =
    title
      .toLowerCase()
      .split(
        /[^a-z0-9]+/
      )
      .filter(
        (
          word
        ) =>
          word.length >=
          3
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
    (
      torrent
    ) => {
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
            .filter(
              Boolean
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
          (
            word
          ) =>
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
        wantYear &&
        fn.includes(
          wantYear
        )
      ) {
        score +=
          15;
      }

      if (
        VIDEO_RE.test(
          filename
        )
      ) {
        score +=
          10;
      }

      return score;
    };

  let candidates =
    (data || []).filter(
      (
        torrent
      ) => {
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
          ) >
          0
        );
      }
    );

  /*
   * Exact TV episode wins when possible.
   */
  if (
    epRegex
  ) {
    const exact =
      candidates.filter(
        (
          torrent
        ) =>
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
      candidates =
        exact;
    }
  }

  candidates.sort(
    (
      a,
      b
    ) =>
      scoreTorrent(
        b
      ) -
      scoreTorrent(
        a
      )
  );

  if (
    candidates.length ===
    0
  ) {
    return Response.json({
      status:
        "not_found",
    });
  }

  const best =
    candidates[0];

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
      status:
        "ready",

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

  if (
    stream.error
  ) {
    return jsonError(
      stream.error,
      502,
      {
        error_code:
          stream.error_code,

        audio_rescue:
          stream.audio_rescue ||
          null,

        media_info:
          stream.media_info ||
          null,
      }
    );
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
