import { base44 } from "@/api/base44Client";

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };

    const timer = window.setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });

const invoke = async (payload) => {
  const response = await base44.functions.invoke("realDebrid", payload);
  return response?.data || {};
};

const identityFields = (context = {}) => ({
  alternate_years:
    Array.isArray(context?.alternateYears)
      ? context.alternateYears
      : [],
  alternate_titles:
    Array.isArray(context?.alternateTitles)
      ? context.alternateTitles
      : [],
});

const invokeAddonStreams = async (payload) => {
  const response = await base44.functions.invoke("fetchAddonStreams", payload);
  return response?.data || {};
};

const clampProgress = (value) =>
  Math.max(0, Math.min(100, Number(value || 0)));

const hashFromMagnet = (value) =>
  String(value || "")
    .match(/btih:([a-f0-9]{40})/i)?.[1]
    ?.toLowerCase() || "";

const sourceHash = (source) =>
  String(
    source?.infoHash ||
      source?.info_hash ||
      source?.hash ||
      hashFromMagnet(source?.richMagnet) ||
      hashFromMagnet(source?.magnet) ||
      hashFromMagnet(source?.src) ||
      hashFromMagnet(source?.url) ||
      ""
  )
    .trim()
    .toLowerCase();

const sourceMagnet = (source) => {
  const candidates = [
    source?.richMagnet,
    source?.magnet,
    source?.magnetLink,
    source?.src,
    source?.url,
  ];

  const trackerRich = candidates.find(
    (value) => /^magnet:/i.test(String(value || "")) && /(?:[?&])tr=/i.test(String(value || ""))
  );

  return String(
    trackerRich || candidates.find((value) => /^magnet:/i.test(String(value || ""))) || ""
  ).trim();
};

const progressFrom = (payload) => {
  const progress = payload?.torrent_progress || {};
  return {
    ...progress,
    status:
      progress?.status ||
      payload?.rd_status ||
      payload?.status ||
      "preparing",
    progress: clampProgress(progress?.progress),
    seeders: Math.max(0, Number(progress?.seeders || 0)),
    speed_bps: Math.max(0, Number(progress?.speed_bps || 0)),
    size_bytes: Math.max(0, Number(progress?.size_bytes || 0)),
    downloaded_bytes: Math.max(0, Number(progress?.downloaded_bytes || 0)),
    added: String(progress?.added || ""),
  };
};

const cachePhaseFrom = (snapshot = {}) => {
  const status = String(snapshot?.status || "").trim().toLowerCase();
  const progress = clampProgress(snapshot?.progress);

  if (/^(?:waiting_files_selection|waiting_selection)$/.test(status)) {
    return "selecting";
  }

  if (status === "downloaded" || progress >= 100) {
    return "finalizing";
  }

  if (/^(?:magnet_conversion|queued|starting|preparing)$/.test(status)) {
    return "starting";
  }

  if (status === "restarting") {
    return "restarting";
  }

  return "downloading";
};

const readyResult = (payload) => ({
  status: "ready",
  streamUrl: String(payload?.stream_url || ""),
  fallbackStreamUrl: String(payload?.fallback_stream_url || ""),
  filename: String(payload?.filename || ""),
  files: Array.isArray(payload?.files) ? payload.files : [],
  audioRescue: payload?.audio_rescue || null,
  videoRescue: payload?.video_rescue || null,
  mediaInfo: payload?.media_info || null,
});

const failureResult = (message, extra = {}) => ({
  status: "failed",
  message: String(message || "Real-Debrid could not prepare this torrent."),
  ...extra,
});

const isPermanentRdHashFailure = (payload = {}) => {
  const upstreamCode = Number(payload?.upstream_error_code);
  const upstreamStatus = Number(payload?.upstream_status);
  const errorCode = String(payload?.error_code || "").toUpperCase();
  const text = [
    payload?.error,
    payload?.upstream_error,
    payload?.message,
  ]
    .map((value) => String(value || ""))
    .join(" ");

  /*
   * Real-Debrid documents 28 as File not allowed and 35 as Infringing file.
   * In May 2026 many otherwise valid movie/TV hashes also began failing with
   * HTTP 451 at add/unrestrict time. These are permanent for the selected hash,
   * not cache-progress failures, so retrying the same torrent cannot fix them.
   */
  return (
    upstreamCode === 28 ||
    upstreamCode === 35 ||
    upstreamStatus === 451 ||
    errorCode.includes("UNRESTRICT_451") ||
    /\binfringing(?:[_ -]?file)?\b|copyright|file\s+not\s+allowed|unavailable\s+for\s+legal\s+reasons/i.test(
      text
    )
  );
};

const permanentRdFailureResult = (payload, fallbackCode) =>
  failureResult(
    payload?.error ||
      "Real-Debrid permanently rejected this torrent file. Media God will try a different torrent hash.",
    {
      hashFailed: true,
      errorCode:
        payload?.error_code ||
        fallbackCode ||
        "RD_HASH_PERMANENTLY_REJECTED",
      upstreamStatus: payload?.upstream_status ?? null,
      upstreamErrorCode: payload?.upstream_error_code ?? null,
    }
  );

const isTerminalTorrentStatus = (value) =>
  /^(?:dead|error|magnet_error|virus)$/i.test(String(value || ""));

export const staleWindowMs = (snapshot) => {
  const status = String(snapshot?.status || "").trim().toLowerCase();
  const speed = Math.max(0, Number(snapshot?.speed_bps || 0));
  const size = Math.max(0, Number(snapshot?.size_bytes || 0));
  const progress = clampProgress(snapshot?.progress);
  const seeders = Math.max(0, Number(snapshot?.seeders || 0));

  /*
   * Real-Debrid reports percentage in fairly coarse steps for large files.
   * A perfectly healthy transfer can therefore sit at 3-5% for a while even
   * though bytes are still arriving. The old 75s/2m watchdog was aggressive
   * enough to restart legitimate downloads and then abandon the hash.
   *
   * Metadata conversion, file selection and queueing also legitimately take
   * several minutes, so never classify those phases as stale quickly.
   */
  if (/^(?:magnet_conversion|waiting_files_selection|waiting_selection|queued|starting|preparing)$/.test(status)) {
    return 10 * 60_000;
  }

  if (speed > 0 && size > 0) {
    const remainingBytes = Math.max(0, size * (1 - progress / 100));
    const expectedRemainingMs = (remainingBytes / speed) * 1000;
    return Math.min(
      60 * 60_000,
      Math.max(10 * 60_000, expectedRemainingMs * 6)
    );
  }

  if (speed > 0) return 15 * 60_000;
  if (seeders > 0) return 12 * 60_000;
  if (progress > 0) return 10 * 60_000;
  return 8 * 60_000;
};

const deleteTorrent = async (torrentId) => {
  if (!torrentId) return;
  try {
    await invoke({
      action: "torrent_delete",
      torrent_id: String(torrentId),
    });
  } catch {
    // Cleanup is best effort after a hash has been proven unusable.
  }
};

const restartExactTorrent = async ({
  torrentId,
  hash,
  magnet,
  context,
}) =>
  invoke({
    action: "restart_playback_torrent",
    torrent_id: String(torrentId),
    info_hash: hash,
    magnet,
    prefer_browser_transcode: context.preferBrowserTranscode === true,
    title: context.title || "",
    ...(context.year != null ? { year: context.year } : {}),
    ...identityFields(context),
    ...(context.season != null ? { season: context.season } : {}),
    ...(context.episode != null ? { episode: context.episode } : {}),
    ...(context.fileIdx != null && Number.isFinite(Number(context.fileIdx))
      ? { file_idx: Number(context.fileIdx) }
      : {}),
  });

const monitorTorrent = async ({
  torrentId,
  hash,
  magnet,
  context,
  signal,
  onProgress,
  repairCount = 0,
  inheritedProgress = null,
}) => {
  let lastProgress =
    inheritedProgress == null ? -1 : clampProgress(inheritedProgress);
  let lastMoveAt = Date.now();
  let sameProgressChecks = 0;
  let consecutiveStatusFailures = 0;

  for (let attempt = 0; attempt < 2400; attempt += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    let data = {};

    try {
      data = await invoke({
        action: "torrent_info",
        torrent_id: String(torrentId),
        prefer_browser_transcode: context.preferBrowserTranscode === true,
        title: context.title || "",
        ...(context.year != null ? { year: context.year } : {}),
        ...identityFields(context),
        ...(context.season != null ? { season: context.season } : {}),
        ...(context.episode != null ? { episode: context.episode } : {}),
        ...(context.fileIdx != null && Number.isFinite(Number(context.fileIdx))
          ? { file_idx: Number(context.fileIdx) }
          : {}),
      });
    } catch (error) {
      consecutiveStatusFailures += 1;

      if (consecutiveStatusFailures >= 8) {
        return failureResult(
          error?.message ||
            "Real-Debrid's torrent status service is temporarily unavailable.",
          {
            retryable: true,
            retrySameSource: true,
            errorCode: "RD_CACHE_STATUS_UNAVAILABLE",
          }
        );
      }

      await sleep(Math.min(8000, 2000 + attempt * 250), signal);
      continue;
    }

    if (data?.status === "ready" && data?.stream_url) {
      consecutiveStatusFailures = 0;
      return readyResult(data);
    }

    if (data?.error) {
      if (isPermanentRdHashFailure(data)) {
        await deleteTorrent(torrentId);
        return permanentRdFailureResult(data, "RD_CACHE_HASH_REJECTED");
      }

      const upstreamStatus = Number(data?.upstream_status || 0);
      const retryableFinalLinkFailure =
        [408, 425, 429, 500, 502, 503, 504].includes(upstreamStatus) ||
        /^RD_UNRESTRICT_(?:408|425|429|500|502|503|504)$/i.test(
          String(data?.error_code || "")
        );

      if (
        String(data?.error_code || "") === "RD_TORRENT_INFO_FAILED" ||
        retryableFinalLinkFailure
      ) {
        consecutiveStatusFailures += 1;

        if (consecutiveStatusFailures >= 8) {
          return failureResult(data.error, {
            retryable: true,
            retrySameSource: true,
            errorCode:
              retryableFinalLinkFailure && lastProgress >= 99.999
                ? "RD_CACHE_FINAL_LINK_UNAVAILABLE"
                : "RD_CACHE_STATUS_UNAVAILABLE",
          });
        }

        if (lastProgress >= 99.999) {
          onProgress?.({
            status: "downloaded",
            progress: 100,
            torrent_id: String(torrentId),
            phase: "finalizing",
            attempt: attempt + 1,
          });
        }

        await sleep(
          lastProgress >= 99.999
            ? 1000
            : Math.min(8000, 2000 + attempt * 250),
          signal
        );
        continue;
      }

      return failureResult(data.error, {
        errorCode: data?.error_code || "RD_CACHE_STATUS_FAILED",
      });
    }

    consecutiveStatusFailures = 0;
    const snapshot = progressFrom(data);
    onProgress?.({
      ...snapshot,
      torrent_id: String(torrentId),
      phase: cachePhaseFrom(snapshot),
      attempt: attempt + 1,
    });

    if (isTerminalTorrentStatus(snapshot.status)) {
      if (repairCount < 1 && magnet && hash) {
        const restarted = await restartExactTorrent({
          torrentId,
          hash,
          magnet,
          context,
        });

        if (restarted?.error_code === "RD_RESTART_RESUMED_STALE_PARTIAL") {
          return failureResult(restarted.error, {
            hashFailed: true,
            errorCode: restarted.error_code,
            progress: clampProgress(
              restarted?.fresh_progress ?? restarted?.previous_progress
            ),
          });
        }

        if (restarted?.status === "ready" && restarted?.stream_url) {
          return readyResult(restarted);
        }

        if (restarted?.torrent_id) {
          onProgress?.({
            ...progressFrom(restarted),
            progress: clampProgress(restarted?.torrent_progress?.progress),
            torrent_id: String(restarted.torrent_id),
            phase: "restarting",
            attempt: 0,
          });

          return monitorTorrent({
            torrentId: String(restarted.torrent_id),
            hash,
            magnet,
            context,
            signal,
            onProgress,
            repairCount: repairCount + 1,
            inheritedProgress: restarted?.torrent_progress?.progress,
          });
        }
      }

      return failureResult(
        `Real-Debrid stopped this torrent: ${snapshot.status}.`,
        {
          hashFailed: true,
          errorCode: "RD_CACHE_TERMINAL",
          progress: snapshot.progress,
        }
      );
    }

    const progress = clampProgress(snapshot.progress);
    if (lastProgress < 0 || Math.abs(progress - lastProgress) > 0.001) {
      lastProgress = progress;
      lastMoveAt = Date.now();
      sameProgressChecks = 0;
    } else {
      sameProgressChecks += 1;
    }

    const flatForMs = Date.now() - lastMoveAt;
    const stallMs = staleWindowMs(snapshot);

    if (
      progress < 100 &&
      sameProgressChecks >= 3 &&
      flatForMs >= stallMs
    ) {
      if (repairCount < 1 && magnet && hash) {
        onProgress?.({
          ...snapshot,
          status: "restarting",
          progress: 0,
          speed_bps: 0,
          seeders: 0,
          downloaded_bytes: 0,
          torrent_id: String(torrentId),
          phase: "restarting",
          attempt: attempt + 1,
        });

        const restarted = await restartExactTorrent({
          torrentId,
          hash,
          magnet,
          context,
        });

        if (restarted?.error_code === "RD_RESTART_RESUMED_STALE_PARTIAL") {
          return failureResult(restarted.error, {
            hashFailed: false,
            retryable: true,
            retrySameSource: true,
            errorCode: restarted.error_code,
            progress: clampProgress(
              restarted?.fresh_progress ?? restarted?.previous_progress ?? progress
            ),
          });
        }

        if (restarted?.status === "ready" && restarted?.stream_url) {
          return readyResult(restarted);
        }

        if (restarted?.torrent_id) {
          const restartedSnapshot = progressFrom(restarted);
          onProgress?.({
            ...restartedSnapshot,
            torrent_id: String(restarted.torrent_id),
            phase: "restarting",
            attempt: 0,
          });

          return monitorTorrent({
            torrentId: String(restarted.torrent_id),
            hash,
            magnet,
            context,
            signal,
            onProgress,
            repairCount: repairCount + 1,
            inheritedProgress: restartedSnapshot.progress,
          });
        }

        return failureResult(
          restarted?.error || "Real-Debrid did not return a fresh torrent after restart.",
          {
            hashFailed: true,
            errorCode: restarted?.error_code || "RD_CACHE_RESTART_FAILED",
            progress,
          }
        );
      }

      return failureResult(
        `Real-Debrid stayed at ${Math.round(progress)}% after a verified restart. The torrent has been left in Real-Debrid so Retry can reconnect to the same job.`,
        {
          hashFailed: false,
          retryable: true,
          retrySameSource: true,
          errorCode: "RD_CACHE_RESTART_STALLED",
          progress,
        }
      );
    }

    await sleep(progress >= 100 ? 750 : 3000, signal);
  }

  return failureResult("Real-Debrid preparation timed out.", {
    errorCode: "RD_CACHE_TIMEOUT",
  });
};

const adoptByHash = async ({ hash, context }) =>
  invoke({
    action: "adopt_hash",
    info_hash: hash,
    prefer_browser_transcode: context.preferBrowserTranscode === true,
    title: context.title || "",
    ...(context.year != null ? { year: context.year } : {}),
    ...identityFields(context),
    ...(context.season != null ? { season: context.season } : {}),
    ...(context.episode != null ? { episode: context.episode } : {}),
  });

const startViaComet = async ({
  source,
  hash,
  magnet,
  context,
  signal,
  onProgress,
}) => {
  let reset = {};

  try {
    reset = await invoke({
      action: "reset_stale_hash",
      info_hash: hash,
      claim_for_playback: true,
      title: context.title || "",
    });
  } catch {
    reset = {};
  }

  if (reset?.status === "failed" && reset?.error) {
    return failureResult(reset.error, {
      errorCode: reset?.error_code || "RD_CACHE_DELETE_FAILED",
    });
  }

  const clearedProgress = clampProgress(reset?.cleared_progress);
  const clearedTorrentId = String(reset?.torrent_id || "").trim();
  const cometUrl = String(source?.cometPlaybackUrl || "").trim();

  if (!/^https?:\/\//i.test(cometUrl)) {
    return failureResult(
      "Comet did not provide the playback endpoint required to start this uncached torrent.",
      { errorCode: "COMET_NO_START_URL" }
    );
  }

  onProgress?.({
    status: reset?.cleared ? "restarting" : "comet_starting",
    progress: reset?.cleared ? 0 : clearedProgress,
    seeders: Math.max(0, Number(source?.reportedSeeders || 0)),
    speed_bps: 0,
    downloaded_bytes: 0,
    size_bytes: 0,
    torrent_id: "",
    phase: "starting",
    attempt: 0,
  });

  /*
   * Comet's current playback handler is server-side: it can read the exact
   * stored torrent sources for the chosen info hash and then ask the configured
   * debrid provider to add/generate the link. Trigger it through our Base44
   * backend so mobile-browser CORS, opaque redirects and WebView cancellation
   * cannot prevent an uncached torrent from ever reaching Real-Debrid.
   */
  let trigger = {};

  try {
    trigger = await invokeAddonStreams({
      action: "trigger_comet_playback",
      playback_url: cometUrl,
    });
  } catch (error) {
    return failureResult(
      error?.message || "Media God could not ask Comet to start this torrent.",
      { errorCode: "COMET_TRIGGER_FAILED" }
    );
  }

  if (trigger?.triggered !== true) {
    return failureResult(
      trigger?.error || "Comet did not accept the uncached playback request.",
      { errorCode: trigger?.error_code || "COMET_TRIGGER_FAILED" }
    );
  }

  let sameClearedProgressChecks = 0;

  try {
    for (let attempt = 0; attempt < 48; attempt += 1) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (attempt > 0) await sleep(1250, signal);

      const adopted = await adoptByHash({ hash, context });

      if (adopted?.status === "ready" && adopted?.stream_url) {
        return readyResult(adopted);
      }

      if (adopted?.status === "stale" && adopted?.torrent_id && magnet) {
        const restarted = await restartExactTorrent({
          torrentId: String(adopted.torrent_id),
          hash,
          magnet,
          context,
        });

        if (restarted?.error_code === "RD_RESTART_RESUMED_STALE_PARTIAL") {
          return failureResult(restarted.error, {
            hashFailed: true,
            errorCode: restarted.error_code,
            progress: clampProgress(
              restarted?.fresh_progress ?? restarted?.previous_progress
            ),
          });
        }

        if (restarted?.status === "ready" && restarted?.stream_url) {
          return readyResult(restarted);
        }

        if (restarted?.torrent_id) {
          return monitorTorrent({
            torrentId: String(restarted.torrent_id),
            hash,
            magnet,
            context,
            signal,
            onProgress,
            repairCount: 1,
            inheritedProgress: restarted?.torrent_progress?.progress,
          });
        }
      }

      if (adopted?.status === "preparing" && adopted?.torrent_id) {
        const snapshot = progressFrom(adopted);
        const adoptedTorrentId = String(adopted.torrent_id).trim();
        const sameDeletedPartial =
          clearedProgress > 0 &&
          clearedProgress < 100 &&
          adoptedTorrentId !== clearedTorrentId &&
          Math.abs(snapshot.progress - clearedProgress) <= 0.001;

        if (sameDeletedPartial) {
          sameClearedProgressChecks += 1;
          onProgress?.({
            ...snapshot,
            torrent_id: adoptedTorrentId,
            phase: "verifying-restart",
            attempt: attempt + 1,
          });

          if (sameClearedProgressChecks < 5) continue;

          await deleteTorrent(adoptedTorrentId);
          return failureResult(
            `Real-Debrid removed the old ${Math.round(clearedProgress)}% job, but the same torrent hash resumed at the identical percentage and still did not move.`,
            {
              hashFailed: true,
              errorCode: "RD_COMET_RESUMED_STALE_PARTIAL",
              progress: snapshot.progress,
            }
          );
        }

        return monitorTorrent({
          torrentId: adoptedTorrentId,
          hash,
          magnet,
          context,
          signal,
          onProgress,
          inheritedProgress: snapshot.progress,
        });
      }

      if (adopted?.status === "failed") {
        if (isPermanentRdHashFailure(adopted)) {
          return permanentRdFailureResult(adopted, "RD_COMET_HASH_REJECTED");
        }

        return failureResult(
          adopted?.error || "Real-Debrid rejected the Comet torrent.",
          { errorCode: adopted?.error_code || "RD_COMET_ADOPT_FAILED" }
        );
      }
    }
  } finally {
    // The caller's AbortSignal owns this cache session end-to-end.
  }

  return failureResult(
    "Comet did not create a Real-Debrid torrent within about one minute.",
    { errorCode: "COMET_START_TIMEOUT" }
  );
};

export async function runRealDebridCacheSession({
  source,
  context,
  signal,
  onProgress,
}) {
  const hash = sourceHash(source);
  const magnet = sourceMagnet(source);

  if (!/^[a-f0-9]{40}$/i.test(hash)) {
    return failureResult("This torrent source is missing a valid info hash.", {
      errorCode: "RD_CACHE_NO_HASH",
    });
  }

  const strategy = String(
    source?.resolutionStrategy || source?.resolution_strategy || ""
  ).toLowerCase();

  /*
   * IMPORTANT: every uncached torrent is now created in the SAME Real-Debrid
   * account Media God is monitoring. Older Comet uncached handling could ask
   * Comet's configured debrid account to create the torrent, then poll Media
   * God's separately connected RD account for the hash. If those credentials
   * differed, the download existed in one account while this player watched
   * another, making every uncached source appear stuck/not-created.
   *
   * fetchAddonStreams already recovers Comet Torrent Mode tracker metadata when
   * available. When Comet omits those trackers, the source still carries the
   * same info hash with our public fallback tracker set. Either way, submit the
   * magnet directly through Media God's own RD OAuth session and keep Comet as
   * discovery metadata only — never as the owner of the download lifecycle.
   */
  const directOwnAccountStrategy =
    strategy === "comet_uncached" ||
    strategy === "rd_magnet" ||
    strategy === "";

  if (!directOwnAccountStrategy) {
    return failureResult(
      `Unsupported uncached Real-Debrid strategy: ${strategy || "unknown"}.`,
      { errorCode: "RD_CACHE_UNSUPPORTED_STRATEGY" }
    );
  }

  if (!/^magnet:/i.test(magnet)) {
    return failureResult("This uncached torrent does not include a usable magnet.", {
      errorCode: "RD_CACHE_NO_MAGNET",
    });
  }

  /*
   * Retry must reconnect to the exact RD job the player was already watching
   * before it performs a hash-wide adoption or submits another magnet. This
   * prevents a normal Retry from creating duplicate same-hash torrents while a
   * healthy download is still running in the user's Real-Debrid account.
   */
  const preferredTorrentId = String(context?.preferredTorrentId || "").trim();

  if (preferredTorrentId) {
    try {
      const existing = await invoke({
        action: "torrent_info",
        torrent_id: preferredTorrentId,
        prefer_browser_transcode: context.preferBrowserTranscode === true,
        title: context.title || "",
        ...(context.year != null ? { year: context.year } : {}),
        ...identityFields(context),
        ...(context.season != null ? { season: context.season } : {}),
        ...(context.episode != null ? { episode: context.episode } : {}),
        ...(context.fileIdx != null && Number.isFinite(Number(context.fileIdx))
          ? { file_idx: Number(context.fileIdx) }
          : {}),
      });

      if (existing?.status === "ready" && existing?.stream_url) {
        return readyResult(existing);
      }

      if (existing?.status === "preparing") {
        const snapshot = progressFrom(existing);
        onProgress?.({
          ...snapshot,
          torrent_id: preferredTorrentId,
          phase: cachePhaseFrom(snapshot),
          attempt: 0,
          resumedExisting: true,
        });

        return monitorTorrent({
          torrentId: preferredTorrentId,
          hash,
          magnet,
          context,
          signal,
          onProgress,
          inheritedProgress: snapshot.progress,
        });
      }

      if (
        existing?.status === "failed" &&
        /^RD_TORRENT_(?:MAGNET_ERROR|ERROR|DEAD|VIRUS)$/i.test(
          String(existing?.error_code || "")
        )
      ) {
        const restarted = await restartExactTorrent({
          torrentId: preferredTorrentId,
          hash,
          magnet,
          context,
        });

        if (restarted?.status === "ready" && restarted?.stream_url) {
          return readyResult(restarted);
        }

        if (restarted?.torrent_id) {
          const snapshot = progressFrom(restarted);
          onProgress?.({
            ...snapshot,
            torrent_id: String(restarted.torrent_id),
            phase: "restarting",
            attempt: 0,
          });

          return monitorTorrent({
            torrentId: String(restarted.torrent_id),
            hash,
            magnet,
            context,
            signal,
            onProgress,
            repairCount: 1,
            inheritedProgress: snapshot.progress,
          });
        }
      }
    } catch {
      /*
       * A transient exact-id lookup failure must not force a new torrent. The
       * hash adoption below gets a second chance to find the same live RD job.
       */
    }
  }

  const adopted = await adoptByHash({ hash, context });

  if (adopted?.status === "ready" && adopted?.stream_url) {
    return readyResult(adopted);
  }

  if (adopted?.status === "stale" && adopted?.torrent_id) {
    onProgress?.({
      ...progressFrom(adopted),
      status: "restarting",
      progress: 0,
      speed_bps: 0,
      seeders: 0,
      torrent_id: String(adopted.torrent_id),
      phase: "restarting",
      attempt: 0,
    });

    const restarted = await restartExactTorrent({
      torrentId: String(adopted.torrent_id),
      hash,
      magnet,
      context,
    });

    if (restarted?.error_code === "RD_RESTART_RESUMED_STALE_PARTIAL") {
      return failureResult(restarted.error, {
        hashFailed: true,
        errorCode: restarted.error_code,
        progress: clampProgress(
          restarted?.fresh_progress ?? restarted?.previous_progress
        ),
      });
    }

    if (restarted?.status === "ready" && restarted?.stream_url) {
      return readyResult(restarted);
    }

    if (restarted?.torrent_id) {
      return monitorTorrent({
        torrentId: String(restarted.torrent_id),
        hash,
        magnet,
        context,
        signal,
        onProgress,
        repairCount: 1,
        inheritedProgress: restarted?.torrent_progress?.progress,
      });
    }

    return failureResult(
      restarted?.error || "Real-Debrid could not restart this torrent.",
      {
        hashFailed: true,
        errorCode: restarted?.error_code || "RD_CACHE_RESTART_FAILED",
      }
    );
  }

  if (adopted?.status === "preparing" && adopted?.torrent_id) {
    const snapshot = progressFrom(adopted);
    onProgress?.({
      ...snapshot,
      torrent_id: String(adopted.torrent_id),
      phase: cachePhaseFrom(snapshot),
      attempt: 0,
    });

    return monitorTorrent({
      torrentId: String(adopted.torrent_id),
      hash,
      magnet,
      context,
      signal,
      onProgress,
      inheritedProgress: snapshot.progress,
    });
  }

  /*
   * The v2 cache engine is the only owner of uncached-torrent startup, so the
   * Real-Debrid active-slot preflight must live here too. The older player path
   * still contains a preflight for backwards compatibility, but every source
   * that actually requires caching bypasses that path before it can run.
   *
   * Keep this best-effort for API/diagnostic failures, but when RD explicitly
   * says the account is saturated do not submit another magnet. Slot exhaustion
   * is account-wide; trying a different hash cannot fix it and must not poison
   * the selected source's reliability history.
   */
  try {
    const preflight = await invoke({
      action: "uncached_preflight",
      keep_hash: hash,
    });

    if (preflight?.saturated === true) {
      const activeCount = Math.max(0, Number(preflight?.active_count || 0));
      const activeLimit = Math.max(0, Number(preflight?.active_limit || 0));

      return failureResult(
        activeLimit > 0
          ? `Real-Debrid has ${activeCount}/${activeLimit} active torrent slots in use. Finish or remove one active torrent, then retry this source.`
          : "Real-Debrid has no free active torrent slot for an uncached download.",
        {
          accountBlocked: true,
          retryable: true,
          errorCode: "RD_ACTIVE_SLOTS_FULL",
          activeCount,
          activeLimit,
          clearedStalled: Math.max(0, Number(preflight?.cleared_stalled || 0)),
        }
      );
    }
  } catch {
    // Preflight cleanup/diagnostics are best-effort. The normal RD add call
    // below still reports the authoritative failure if the service is down.
  }

  onProgress?.({
    status: "starting",
    progress: 0,
    seeders: Math.max(0, Number(source?.reportedSeeders || 0)),
    speed_bps: 0,
    downloaded_bytes: 0,
    size_bytes: 0,
    torrent_id: "",
    phase: "starting",
    attempt: 0,
  });

  const started = await invoke({
    action: "resolve_best",
    magnet,
    prefer_browser_transcode: context.preferBrowserTranscode === true,
    title: context.title || "",
    ...(context.year != null ? { year: context.year } : {}),
    ...identityFields(context),
    ...(context.season != null ? { season: context.season } : {}),
    ...(context.episode != null ? { episode: context.episode } : {}),
    ...(context.fileIdx != null && Number.isFinite(Number(context.fileIdx))
      ? { file_idx: Number(context.fileIdx) }
      : {}),
  });

  if (started?.status === "ready" && started?.stream_url) {
    return readyResult(started);
  }

  if (started?.torrent_id) {
    const snapshot = progressFrom(started);
    onProgress?.({
      ...snapshot,
      torrent_id: String(started.torrent_id),
      phase: cachePhaseFrom(snapshot),
      attempt: 0,
    });

    return monitorTorrent({
      torrentId: String(started.torrent_id),
      hash,
      magnet,
      context,
      signal,
      onProgress,
      inheritedProgress: snapshot.progress,
    });
  }

  if (isPermanentRdHashFailure(started)) {
    return permanentRdFailureResult(started, "RD_CACHE_HASH_REJECTED");
  }

  return failureResult(
    started?.error || "Real-Debrid did not create a torrent job.",
    { errorCode: started?.error_code || "RD_CACHE_START_FAILED" }
  );
}
