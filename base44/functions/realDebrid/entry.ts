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

const RD_RETRYABLE_STATUSES = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);

const isRetryableRdStatus = (status) =>
  RD_RETRYABLE_STATUSES.has(
    Number(status)
  );

const rdRetryDelayMs = (
  response,
  attempt
) => {
  const retryAfter =
    response?.headers?.get?.(
      "retry-after"
    ) || "";

  if (/^\d+(?:\.\d+)?$/.test(retryAfter)) {
    return Math.min(
      3000,
      Math.max(
        250,
        Math.round(
          Number(retryAfter) *
            1000
        )
      )
    );
  }

  const retryAt =
    Date.parse(retryAfter);

  if (
    Number.isFinite(retryAt)
  ) {
    return Math.min(
      3000,
      Math.max(
        250,
        retryAt - Date.now()
      )
    );
  }

  return [
    300,
    750,
    1500,
    2500,
  ][attempt] || 2500;
};

async function rdFetch(
  url,
  options = {},
  {
    attempts = 3,
  } = {}
) {
  let lastError = null;

  for (
    let attempt = 0;
    attempt < attempts;
    attempt += 1
  ) {
    try {
      const response =
        await fetch(
          url,
          options
        );

      if (
        !isRetryableRdStatus(
          response.status
        ) ||
        attempt ===
          attempts - 1
      ) {
        return response;
      }

      await sleep(
        rdRetryDelayMs(
          response,
          attempt
        )
      );
    } catch (error) {
      lastError = error;

      if (
        attempt ===
        attempts - 1
      ) {
        throw error;
      }

      await sleep(
        [300, 750, 1500][
          attempt
        ] || 1500
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "Real-Debrid request failed."
    )
  );
}

const rdFailureMessage = async (
  response,
  label
) => {
  let detail = "";

  try {
    const text =
      String(
        await response.text()
      ).trim();

    if (text) {
      try {
        const parsed =
          JSON.parse(text);

        detail =
          parsed?.error_description ||
          parsed?.error ||
          parsed?.message ||
          text;
      } catch {
        detail = text;
      }
    }
  } catch {
    detail = "";
  }

  return `${label} (${response.status})${
    detail
      ? `: ${String(detail).slice(0, 280)}`
      : ""
  }`;
};

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

const summariseVideoTrack = (track, key = "") => ({
  key,
  stream: track?.stream || "",
  codec: track?.codec || "",
  profile: track?.profile || "",
  width: track?.width ?? null,
  height: track?.height ?? null,
  fps: track?.fps ?? track?.frame_rate ?? null,
});

const needsVideoCodecRescue = (codec) =>
  /(?:vc-?1|wmv3|wvc1|mpeg-?4|mp4v|xvid|divx|theora)/i.test(
    String(codec || "")
  );

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
     * UNCACHED TORRENT PREFLIGHT
     *
     * Real-Debrid limits how many torrents can be actively
     * downloading at once. Repeated failed cache attempts can fill those
     * slots with dead Media God jobs and make every later uncached source
     * appear broken. Clean only stalled torrents that belong to this user's
     * Media God RdLink records, then report the live active-count limit.
     * ---------------------------------------------------------
     */
    if (action === "uncached_preflight") {
      const keepHash = String(body.keep_hash || "")
        .trim()
        .toLowerCase();

      const readActiveCount = async () => {
        const activeRes = await rdFetch(
          `${RD_BASE}/torrents/activeCount`,
          { headers: authHeaders },
          { attempts: 3 }
        );

        if (!activeRes.ok) {
          return null;
        }

        const active = await activeRes.json();
        return {
          nb: Math.max(0, Number(active?.nb || 0)),
          limit: Math.max(0, Number(active?.limit || 0)),
        };
      };

      const before = await readActiveCount();
      let cleared = 0;

      try {
        const links = await base44.entities.RdLink.filter({});
        const ownedById = new Map(
          (Array.isArray(links) ? links : [])
            .filter((link) => link?.torrent_id)
            .map((link) => [String(link.torrent_id), link])
        );

        if (ownedById.size > 0) {
          const activeListRes = await rdFetch(
            `${RD_BASE}/torrents?filter=active&limit=5000`,
            { headers: authHeaders },
            { attempts: 3 }
          );

          if (activeListRes.ok) {
            const activeTorrents = await activeListRes.json();

            for (const torrent of Array.isArray(activeTorrents)
              ? activeTorrents
              : []) {
              const torrentId = String(torrent?.id || "");
              const link = ownedById.get(torrentId);
              if (!link) continue;

              const linkedHash = String(link?.magnet || "")
                .match(/btih:([a-f0-9]{40})/i)?.[1]
                ?.toLowerCase();

              if (keepHash && linkedHash === keepHash) {
                continue;
              }

              const progress = Math.max(
                0,
                Math.min(100, Number(torrent?.progress || 0))
              );
              const ageMs = Math.max(
                0,
                Date.now() - Date.parse(String(torrent?.added || "")) || 0
              );
              const stalled =
                /^(?:magnet_conversion|queued|downloading)$/i.test(
                  String(torrent?.status || "")
                ) &&
                progress < 100 &&
                Number(torrent?.speed || 0) <= 0 &&
                Number(torrent?.seeders || 0) <= 0 &&
                ageMs >= 60_000;

              if (!stalled) continue;

              const deleteRes = await rdFetch(
                `${RD_BASE}/torrents/delete/${encodeURIComponent(torrentId)}`,
                {
                  method: "DELETE",
                  headers: authHeaders,
                },
                { attempts: 2 }
              );

              if (deleteRes.ok || deleteRes.status === 404) {
                cleared += 1;
                try {
                  await base44.entities.RdLink.update(link.id, {
                    torrent_id: "",
                  });
                } catch {
                  // Cleanup succeeded; database housekeeping is best-effort.
                }
              }
            }
          }
        }
      } catch {
        // Preflight cleanup is best-effort; never break cached playback.
      }

      const after = (cleared > 0 ? await readActiveCount() : before) || {
        nb: 0,
        limit: 0,
      };

      return Response.json({
        active_count: after.nb,
        active_limit: after.limit,
        cleared_stalled: cleared,
        saturated:
          after.limit > 0 &&
          after.nb >= after.limit,
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
     * RESET A STALE MEDIA-GOD-CREATED COMET CACHE JOB
     *
     * Earlier Media God builds could submit an uncached Comet
     * result as a bare info-hash magnet. RD accepted those jobs,
     * but without Comet's stored tracker/source metadata some sat
     * indefinitely at 0% / 0 B/s / 0 seeders. Only remove a job
     * when it is demonstrably stalled AND its torrent id is owned
     * by this user's RdLink record for the same info hash.
     * ---------------------------------------------------------
     */
    if (action === "reset_stale_hash") {
      const hash = String(
        body.info_hash ||
        body.hash ||
        ""
      )
        .trim()
        .toLowerCase();

      if (!/^[a-f0-9]{40}$/.test(hash)) {
        return Response.json(
          { error: "A valid 40-character info hash is required." },
          { status: 400 }
        );
      }

      const listRes = await rdFetch(
        `${RD_BASE}/torrents?limit=5000`,
        { headers: authHeaders },
        { attempts: 3 }
      );

      if (!listRes.ok) {
        return Response.json({
          status: "failed",
          error: await rdFailureMessage(
            listRes,
            "Real-Debrid could not list torrents"
          ),
        });
      }

      const torrents = await listRes.json();
      const match = Array.isArray(torrents)
        ? torrents.find(
            (torrent) =>
              String(torrent?.hash || "")
                .trim()
                .toLowerCase() === hash
          )
        : null;

      if (!match?.id) {
        return Response.json({ status: "not_found", cleared: false });
      }

      const progress = Math.max(
        0,
        Math.min(100, Number(match?.progress || 0))
      );
      const addedAt = Date.parse(String(match?.added || ""));
      const ageMs = Number.isFinite(addedAt)
        ? Math.max(0, Date.now() - addedAt)
        : 0;
      const hasNoActivity =
        Number(match?.speed || 0) <= 0 &&
        Number(match?.seeders || 0) <= 0;
      const stalled =
        /^(?:magnet_conversion|queued|downloading)$/i.test(
          String(match?.status || "")
        ) &&
        progress < 100 &&
        hasNoActivity &&
        (
          progress <= 0 ||
          ageMs >= 60_000
        );

      if (!stalled) {
        return Response.json({
          status: "kept",
          cleared: false,
          torrent_id: String(match.id),
        });
      }

      let ownedByMediaGod = false;
      let ownedLink = null;

      try {
        const links = await base44.entities.RdLink.filter({
          torrent_id: String(match.id),
        });

        ownedLink = Array.isArray(links) ? links[0] : null;
        const linkedHash = String(ownedLink?.magnet || "")
          .match(/btih:([a-f0-9]{40})/i)?.[1]
          ?.toLowerCase();

        ownedByMediaGod = linkedHash === hash;
      } catch {
        ownedByMediaGod = false;
      }

      const explicitPlaybackReset = body.claim_for_playback === true;

      if (!ownedByMediaGod && !explicitPlaybackReset) {
        return Response.json({
          status: "kept",
          cleared: false,
          torrent_id: String(match.id),
        });
      }

      const deleteRes = await rdFetch(
        `${RD_BASE}/torrents/delete/${encodeURIComponent(String(match.id))}`,
        {
          method: "DELETE",
          headers: authHeaders,
        },
        { attempts: 2 }
      );

      if (!deleteRes.ok && deleteRes.status !== 404) {
        return Response.json({
          status: "failed",
          cleared: false,
          error: await rdFailureMessage(
            deleteRes,
            "Real-Debrid could not reset the stalled torrent"
          ),
        });
      }

      if (ownedLink?.id) {
        try {
          await base44.entities.RdLink.update(
            ownedLink.id,
            { torrent_id: "" }
          );
        } catch {
          // The RD reset succeeded; link cleanup is only housekeeping.
        }
      }

      return Response.json({
        status: "cleared",
        cleared: true,
        torrent_id: String(match.id),
      });
    }

    /*
     * ---------------------------------------------------------
     * ADOPT EXISTING TORRENT BY INFO HASH
     *
     * Used by Comet uncached playback. Comet starts the torrent
     * with its own stored tracker/source metadata on the user's
     * device; Media God then finds that exact hash in Real-Debrid
     * and takes over progress polling/playback.
     * ---------------------------------------------------------
     */
    if (action === "adopt_hash") {
      const hash = String(
        body.info_hash ||
        body.hash ||
        ""
      )
        .trim()
        .toLowerCase();

      if (!/^[a-f0-9]{40}$/.test(hash)) {
        return Response.json(
          { error: "A valid 40-character info hash is required." },
          { status: 400 }
        );
      }

      const listRes = await rdFetch(
        `${RD_BASE}/torrents?limit=5000`,
        { headers: authHeaders },
        { attempts: 3 }
      );

      if (!listRes.ok) {
        return Response.json({
          status: "failed",
          error: await rdFailureMessage(
            listRes,
            "Real-Debrid could not list torrents"
          ),
          upstream_status: listRes.status,
        });
      }

      const torrents = await listRes.json();
      const match = Array.isArray(torrents)
        ? torrents.find(
            (torrent) =>
              String(torrent?.hash || "")
                .trim()
                .toLowerCase() === hash
          )
        : null;

      if (!match?.id) {
        return Response.json({
          status: "not_found",
          info_hash: hash,
        });
      }

      /*
       * Once Media God adopts a torrent that Comet created, remember the
       * association. This lets later playback attempts safely identify and
       * clean up the same stalled cache job instead of repeatedly adopting it.
       */
      if (body.title) {
        try {
          const title = String(body.title).trim();
          const year = body.year != null ? String(body.year) : "";
          const season = body.season != null ? String(body.season) : "";
          const episode = body.episode != null ? String(body.episode) : "";
          const magnet = `magnet:?xt=urn:btih:${hash}`;
          const existing = await base44.entities.RdLink.filter({
            title,
            year,
            season,
            episode,
          });

          if (Array.isArray(existing) && existing.length > 0) {
            await base44.entities.RdLink.update(existing[0].id, {
              magnet,
              torrent_id: String(match.id),
            });
          } else {
            await base44.entities.RdLink.create({
              title,
              year,
              season,
              episode,
              magnet,
              torrent_id: String(match.id),
            });
          }
        } catch {
          // Ownership bookkeeping must never block playback.
        }
      }

      const stream = await resolveStreamable(
        String(match.id),
        authHeaders,
        formHeaders,
        {
          title: body.title,
          year: body.year,
          season: body.season,
          episode: body.episode,
          forceAudioRescue:
            body.force_audio_rescue === true,
        }
      );

      if (stream.error) {
        return Response.json({
          status: "failed",
          torrent_id: String(match.id),
          error: stream.error,
          error_code:
            stream.error_code ||
            "RD_ADOPT_FAILED",
        });
      }

      return Response.json({
        status: stream.ready
          ? "ready"
          : "preparing",
        torrent_id: String(match.id),
        info_hash: hash,
        stream_url:
          stream.stream_url || "",
        fallback_stream_url:
          stream.fallback_stream_url || "",
        filename:
          stream.filename || "",
        rd_status:
          stream.rd_status,
        files:
          stream.files || [],
        audio_rescue:
          stream.audio_rescue || null,
        video_rescue:
          stream.video_rescue || null,
        media_info:
          stream.media_info || null,
        torrent_progress:
          stream.torrent_progress || null,
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
        return Response.json({
          status: "failed",
          error:
            stream.error,
          error_code:
            stream.error_code ||
            "RD_TORRENT_INFO_FAILED",
        });
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

        fallback_stream_url:
          stream.fallback_stream_url ||
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

        video_rescue:
          stream.video_rescue ||
          null,

        media_info:
          stream.media_info ||
          null,

        torrent_progress:
          stream.torrent_progress ||
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
        await rdFetch(
          `${RD_BASE}/unrestrict/link`,
          {
            method: "POST",
            headers:
              formHeaders,
            body:
              `link=${encodeURIComponent(
                link
              )}`,
          },
          {
            attempts: 3,
          }
        );

      if (!unRes.ok) {
        return Response.json({
          status: "failed",
          error:
            await rdFailureMessage(
              unRes,
              "Real-Debrid could not unrestrict this file"
            ),
          error_code:
            `RD_UNRESTRICT_${unRes.status}`,
        });
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
        return Response.json({
          status: "failed",
          error:
            playable.error,
          error_code:
            playable.error_code ||
            "AUDIO_RESCUE_FAILED",
          audio_rescue:
            playable.audio_rescue ||
            null,
        });
      }

      return Response.json({
        stream_url:
          playable.stream_url,

        fallback_stream_url:
          playable.fallback_stream_url ||
          "",

        filename:
          playable.filename ||
          unData.filename ||
          "",

        audio_rescue:
          playable.audio_rescue ||
          null,

        video_rescue:
          playable.video_rescue ||
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
          `${RD_BASE}/torrents?limit=1000`,
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
          `${RD_BASE}/torrents?limit=1000`,
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

      const titleStopWords =
        new Set([
          "a",
          "an",
          "and",
          "at",
          "by",
          "for",
          "from",
          "in",
          "of",
          "on",
          "the",
          "to",
          "with",
        ]);

      const titleWords =
        title
          .toLowerCase()
          .split(
            /[^a-z0-9]+/
          )
          .filter(
            (word) =>
              word.length >= 2 &&
              !titleStopWords.has(
                word
              )
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

          const matchedWords =
            titleWords.filter(
              (word) =>
                words.has(
                  word
                )
            ).length;

          const yearMatches =
            Boolean(
              wantYear &&
              fn.includes(
                wantYear
              )
            );

          /*
           * Releases sometimes translate only the subtitle while keeping the
           * identifying title prefix. Allow that only when the release year
           * also matches, so loose word overlap cannot select an unrelated
           * title from the Real-Debrid library.
           */
          const fuzzyYearMatch =
            yearMatches &&
            titleWords.length >= 2 &&
            matchedWords >= 2 &&
            matchedWords /
              titleWords.length >=
              0.45;

          if (
            !contiguous &&
            !allWords &&
            !fuzzyYearMatch
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

          if (fuzzyYearMatch) {
            score +=
              30 +
              matchedWords * 8;
          }

          if (yearMatches) {
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

          fallback_stream_url:
            stream.fallback_stream_url ||
            "",

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

          video_rescue:
            stream.video_rescue ||
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
    await rdFetch(
      `${RD_BASE}/torrents/addMagnet`,
      {
        method: "POST",
        headers:
          formHeaders,
        body:
          `magnet=${encodeURIComponent(
            magnet
          )}`,
      },
      {
        attempts: 3,
      }
    );

  if (!addRes.ok) {
    return Response.json({
      status: "failed",
      error:
        await rdFailureMessage(
          addRes,
          "Real-Debrid could not add this torrent"
        ),
      upstream_status:
        addRes.status,
      retryable:
        isRetryableRdStatus(
          addRes.status
        ),
    });
  }

  const addData =
    await addRes.json();

  const torrentId =
    String(
      addData.id
    );

  if (!torrentId) {
    return Response.json({
      status: "failed",
      error:
        "Real-Debrid did not return a torrent id.",
      error_code:
        "RD_NO_TORRENT_ID",
    });
  }

  /*
   * Select all files first.
   */
  const selectAllRes =
    await rdFetch(
      `${RD_BASE}/torrents/selectFiles/${torrentId}`,
      {
        method: "POST",
        headers:
          formHeaders,
        body:
          "files=all",
      },
      {
        attempts: 3,
      }
    );

  if (
    !selectAllRes.ok &&
    selectAllRes.status !== 202
  ) {
    return Response.json({
      status: "failed",
      error:
        await rdFailureMessage(
          selectAllRes,
          "Real-Debrid could not select the torrent files"
        ),
      upstream_status:
        selectAllRes.status,
      retryable:
        isRetryableRdStatus(
          selectAllRes.status
        ),
    });
  }

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
    return Response.json({
      status: "failed",
      error:
        stream.error,
      error_code:
        stream.error_code ||
        "RD_RESOLVE_FAILED",
    });
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

    fallback_stream_url:
      stream.fallback_stream_url ||
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

    video_rescue:
      stream.video_rescue ||
      null,

    media_info:
      stream.media_info ||
      null,

    torrent_progress:
      stream.torrent_progress ||
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
        `s0*${season}[ ._-]*e0*${episode}(?!\\d)`,
        "i"
      ),

      new RegExp(
        `(?:^|\\D)0*${season}x0*${episode}(?!\\d)`,
        "i"
      ),

      new RegExp(
        `season[ ._-]*0*${season}.*(?:episode|ep)[ ._-]*0*${episode}(?!\\d)`,
        "i"
      ),

      new RegExp(
        `s0*${season}[ ._-]+(?:ep?|episode)[ ._-]*0*${episode}(?!\\d)`,
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
   * Movie / fallback: rank the likely main feature instead of blindly using
   * the largest file. Size still matters, but title/year matching and common
   * extras/sample markers are stronger signals.
   */
  const titleWords = String(ep?.title || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !["the", "and", "with"].includes(word));
  const year = String(ep?.year || "").trim();

  const scoreFile = (file) => {
    const path = String(file?.path || "");
    const text = path.toLowerCase();
    const extension = text.split(".").pop() || "";
    let score = Number(file?.bytes || 0);

    if (/\b(?:sample|trailer|teaser|featurette|extras?|bonus|behind[ ._-]?the[ ._-]?scenes|interview|deleted[ ._-]?scene|proof)\b/i.test(text)) {
      score -= 10_000_000_000_000;
    }

    if (titleWords.length > 0) {
      const matched = titleWords.filter((word) => text.includes(word)).length;
      score += matched * 900_000_000_000;
      if (matched === titleWords.length) score += 2_500_000_000_000;
    }

    if (year && text.includes(year)) score += 700_000_000_000;

    if (["mp4", "m4v", "mkv", "webm", "mov"].includes(extension)) {
      score += 350_000_000_000;
    } else if (["ts", "m2ts", "mts", "mpg", "mpeg", "f4v", "3gp", "3g2", "ogv"].includes(extension)) {
      score += 120_000_000_000;
    }

    return score;
  };

  return files
    .slice()
    .sort((a, b) => scoreFile(b) - scoreFile(a))[0];
}

const buildTorrentProgress = (info = {}) => {
  const progress = Math.max(
    0,
    Math.min(100, Number(info?.progress || 0))
  );
  const sizeBytes = Math.max(
    0,
    Number(info?.bytes || info?.original_bytes || 0)
  );

  return {
    status: String(info?.status || ""),
    progress,
    speed_bps: Math.max(0, Number(info?.speed || 0)),
    seeders: Math.max(0, Number(info?.seeders || 0)),
    size_bytes: sizeBytes,
    downloaded_bytes:
      sizeBytes > 0
        ? Math.round(sizeBytes * (progress / 100))
        : 0,
    added: String(info?.added || ""),
    ended: String(info?.ended || ""),
  };
};

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
    await rdFetch(
      infoUrl,
      {
        headers:
          authHeaders,
      },
      {
        attempts: 3,
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
      await rdFetch(
        `${RD_BASE}/torrents/selectFiles/${torrentId}`,
        {
          method:
            "POST",

          headers:
            formHeaders,

          body:
            "files=all",
        },
        {
          attempts: 3,
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
      await rdFetch(
        infoUrl,
        {
          headers:
            authHeaders,
        },
        {
          attempts: 3,
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
    if (info.status === "downloaded") {
      return {
        error:
          "Real-Debrid finished this torrent, but no playable video file was found.",
        error_code:
          "RD_NO_VIDEO_FILE",
        rd_status:
          info.status,
        filename:
          info.filename ||
          "",
        files: [],
        torrent_progress:
          buildTorrentProgress(info),
      };
    }

    return {
      ready: false,

      rd_status:
        info.status,

      filename:
        info.filename ||
        "",

      files: [],

      torrent_progress:
        buildTorrentProgress(info),
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

      torrent_progress:
        buildTorrentProgress(info),
    };
  }

  /*
   * Turn the RD file link into a direct download/stream URL.
   */
  const unRes =
    await rdFetch(
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
      },
      {
        attempts: 3,
      }
    );

  if (!unRes.ok) {
    return {
      error:
        await rdFailureMessage(
          unRes,
          "Real-Debrid could not unrestrict this file"
        ),
      error_code:
        `RD_UNRESTRICT_${unRes.status}`,
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

    fallback_stream_url:
      playable.fallback_stream_url ||
      "",

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

    video_rescue:
      playable.video_rescue ||
      null,

    media_info:
      playable.media_info ||
      null,

    torrent_progress:
      buildTorrentProgress(info),
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

  const videoObject =
    mediaInfo?.details?.video &&
    typeof mediaInfo.details.video === "object"
      ? mediaInfo.details.video
      : {};
  const videoTracks = Object.entries(videoObject).map(
    ([key, track]) => summariseVideoTrack(track, key)
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
    video_tracks:
      videoTracks,
  };

  const videoContainerRescue =
    /\.(?:avi|wmv|asf|vob|mxf|divx|ogv|3gp|3g2|f4v)$/i.test(
      originalFilename || mediaInfo?.filename || ""
    );
  const videoCodecRescue = videoTracks.some((track) =>
    needsVideoCodecRescue(track?.codec)
  );
  const videoCompatibilityRescue =
    videoContainerRescue || videoCodecRescue;

  /*
   * MediaInfos can occasionally be incomplete for otherwise playable files.
   * Keep the unrestricted stream available and let the player prove whether
   * audio is really absent before discarding the source.
   */
  if (
    audioTracks.length ===
      0 &&
    !videoCompatibilityRescue
  ) {
    return {
      stream_url: originalUrl,
      filename: originalFilename,
      audio_rescue: {
        used: false,
        state: "no_audio_metadata_original_probe",
        reason:
          "Real-Debrid media inspection exposed no audio tracks, so Media God is probing the original stream instead of rejecting it.",
      },
      media_info: mediaSummary,
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
    audioTracks.length > 0 &&
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
    !videoCompatibilityRescue &&
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
    const audioTranscodeNeeded =
      forceAudioRescue ||
      !firstIsSafe ||
      (
        preferEnglish &&
        englishTracks.length > 0 &&
        !firstIsEnglish
      );
    const why =
      forceAudioRescue
        ? "Runtime no-sound recovery requested a browser-safe Real-Debrid transcode."
        : videoCompatibilityRescue
          ? "The original video codec/container is awkward for browser/WebView playback, so Media God selected Real-Debrid's compatibility stream."
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
      fallback_stream_url:
        originalUrl,
      filename:
        `${originalFilename || mediaInfo?.filename || "Real-Debrid Stream"} [${formatLabel}${videoCompatibilityRescue ? " Compatibility" : " Audio Rescue"}]`,
      audio_rescue: {
        used: audioTranscodeNeeded,
        state:
          audioTranscodeNeeded
            ? "transcoded"
            : "not_needed_video_compatibility",
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
      video_rescue: {
        used: videoCompatibilityRescue,
        state:
          videoCompatibilityRescue
            ? "transcoded_for_video_compatibility"
            : "not_needed",
        reason:
          videoCompatibilityRescue
            ? why
            : "",
        format: transcode.format,
        quality: transcode.quality,
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

  if (forceAudioRescue) {
    return {
      error:
        `Audio Rescue could not create a compatible stream for ${firstCodec || "this audio track"}. Media God will try another source.`,
      error_code: "AUDIO_RESCUE_UNAVAILABLE",
      audio_rescue: {
        used: false,
        state: "forced_audio_rescue_unavailable_try_next_source",
        reason:
          transcode?.error ||
          "Real-Debrid returned no compatible HLS/MP4/WebM transcode after runtime no-sound detection.",
        selected_audio:
          englishSafe ||
          englishTracks[0] ||
          firstTrack ||
          null,
      },
      media_info: mediaSummary,
    };
  }

  const hardRisk = isHardRiskAudioCodec(firstCodec);

  return {
    stream_url: originalUrl,
    filename:
      `${originalFilename || mediaInfo?.filename || "Real-Debrid Stream"}${hardRisk ? " [Original Audio Probe]" : " [Audio Rescue Fallback]"}`,
    audio_rescue: {
      used: false,
      state: hardRisk
        ? "hard_codec_original_probe"
        : "transcode_unavailable_original_fallback",
      reason:
        transcode?.error ||
        (hardRisk
          ? "No compatible transcode was returned. Media God keeps the original DTS/TrueHD-style stream available because Fire TV hardware support can exceed WebView codec reporting."
          : "No usable Real-Debrid transcode was returned, so the original stream is kept as a final compatibility fallback."),
      selected_audio:
        englishSafe ||
        englishTracks[0] ||
        firstTrack ||
        null,
    },
    media_info: mediaSummary,
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
