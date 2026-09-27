const SKIPDB_BASE = "https://api.skipdb.tv/api/segments";
const INTRODB_BASE = "https://api.introdb.app/segments";

const clean = (value: unknown) => String(value ?? "").trim();
const isImdbId = (value: unknown) => /^tt\d+$/i.test(clean(value));

const positiveInt = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const positiveDuration = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 60 && number <= 8 * 60 * 60
    ? number
    : null;
};

const finiteMs = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
    },
  });

const fetchJson = async (url: URL) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "MediaGod/skip-segments",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null as any,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: await response.json(),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null as any,
    };
  } finally {
    clearTimeout(timeout);
  }
};

type SegmentCandidate = {
  startMs: number;
  endMs: number;
  confidence: number;
  provider: "skipdb" | "introdb";
  match: string;
  durationAware: boolean;
};

const saneSegment = (
  startMs: number | null,
  endMs: number | null,
  maxLengthMs: number
) => {
  if (startMs == null || endMs == null) return false;
  if (endMs <= startMs) return false;
  const length = endMs - startMs;
  return length >= 4_000 && length <= maxLengthMs;
};

const skipDbCandidate = (
  value: any,
  maxLengthMs: number,
  durationWasSupplied: boolean
): SegmentCandidate | null => {
  if (!value || typeof value !== "object") return null;

  const startMs = finiteMs(value?.start_ms);
  const endMs = finiteMs(value?.end_ms);
  const confidence = Math.max(0, Math.min(1, Number(value?.confidence ?? 0)));
  const match = clean(value?.match).toLowerCase();

  if (!saneSegment(startMs, endMs, maxLengthMs)) return null;
  if (match === "out-of-range") return null;

  // Duration-aware exact/shifted matches have the strongest release evidence.
  // Without stream duration, only accept approved agnostic data at SkipDB's
  // normal 0.75 confidence floor; never use its season-length estimate as a
  // fabricated per-episode marker.
  const threshold =
    durationWasSupplied && (match === "exact" || match === "shifted")
      ? 0.65
      : 0.75;

  if (confidence < threshold) return null;

  return {
    startMs: startMs!,
    endMs: endMs!,
    confidence,
    provider: "skipdb",
    match: match || "agnostic",
    durationAware:
      durationWasSupplied &&
      (match === "exact" || match === "shifted"),
  };
};

const introDbCandidate = (
  value: any,
  maxLengthMs: number
): SegmentCandidate | null => {
  if (!value || typeof value !== "object") return null;

  const startMs =
    finiteMs(value?.start_ms) ??
    (Number.isFinite(Number(value?.start_sec))
      ? Math.round(Number(value.start_sec) * 1000)
      : null);
  const endMs =
    finiteMs(value?.end_ms) ??
    (Number.isFinite(Number(value?.end_sec))
      ? Math.round(Number(value.end_sec) * 1000)
      : null);
  const confidenceRaw = Number(value?.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0.8;

  if (!saneSegment(startMs, endMs, maxLengthMs)) return null;
  if (confidence < 0.75) return null;

  return {
    startMs: startMs!,
    endMs: endMs!,
    confidence,
    provider: "introdb",
    match: "community",
    durationAware: false,
  };
};

const chooseCandidate = (
  skipDb: SegmentCandidate | null,
  introDb: SegmentCandidate | null
) => {
  if (skipDb?.durationAware) return skipDb;
  if (introDb && skipDb) {
    const startsAgree = Math.abs(introDb.startMs - skipDb.startMs) <= 8_000;
    const endsAgree = Math.abs(introDb.endMs - skipDb.endMs) <= 8_000;
    if (startsAgree && endsAgree) {
      return introDb.confidence >= skipDb.confidence ? introDb : skipDb;
    }
  }
  if (introDb && introDb.confidence >= 0.9) return introDb;
  return skipDb || introDb;
};

const seconds = (ms: number) => Math.round(ms) / 1000;

export default async function (req: Request) {
  let body: any = {};

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const imdbId = clean(body?.imdb_id ?? body?.imdbId).toLowerCase();
  const season = positiveInt(body?.season);
  const episode = positiveInt(body?.episode);
  const duration = positiveDuration(
    body?.duration ?? body?.duration_seconds ?? body?.durationSeconds
  );

  if (!isImdbId(imdbId) || !season || !episode) {
    return json(
      {
        markers: {},
        providers: [],
        error: "A valid IMDb id, season and episode are required.",
      },
      400
    );
  }

  const skipUrl = new URL(SKIPDB_BASE);
  skipUrl.searchParams.set("imdb_id", imdbId);
  skipUrl.searchParams.set("season", String(season));
  skipUrl.searchParams.set("episode", String(episode));
  skipUrl.searchParams.set("adjust", "conservative");
  if (duration) {
    skipUrl.searchParams.set("duration", String(duration));
  }

  const introUrl = new URL(INTRODB_BASE);
  introUrl.searchParams.set("imdb_id", imdbId);
  introUrl.searchParams.set("season", String(season));
  introUrl.searchParams.set("episode", String(episode));

  const [skipResult, introResult] = await Promise.all([
    fetchJson(skipUrl),
    fetchJson(introUrl),
  ]);

  const skipSegments = skipResult.data?.segments || {};
  const introData = introResult.data || {};

  const intro = chooseCandidate(
    skipDbCandidate(skipSegments?.intro, 5 * 60_000, Boolean(duration)),
    introDbCandidate(introData?.intro, 5 * 60_000)
  );
  const recap = chooseCandidate(
    skipDbCandidate(skipSegments?.recap, 5 * 60_000, Boolean(duration)),
    introDbCandidate(introData?.recap, 5 * 60_000)
  );
  const outro = chooseCandidate(
    skipDbCandidate(skipSegments?.outro, 15 * 60_000, Boolean(duration)),
    introDbCandidate(introData?.outro, 15 * 60_000)
  );

  const markers: Record<string, any> = {};
  const provenance: Record<string, any> = {};

  if (intro) {
    markers.intro = {
      start: seconds(intro.startMs),
      end: seconds(intro.endMs),
    };
    provenance.intro = intro;
  }

  if (recap) {
    markers.recap = {
      start: seconds(recap.startMs),
      end: seconds(recap.endMs),
    };
    provenance.recap = recap;
  }

  if (outro) {
    markers.credits = {
      start: seconds(outro.startMs),
      end: seconds(outro.endMs),
    };
    provenance.credits = outro;
  }

  return json({
    imdb_id: imdbId,
    season,
    episode,
    duration: duration || null,
    markers,
    provenance,
    providers: [
      ...(skipResult.ok ? ["SkipDB"] : []),
      ...(introResult.ok ? ["IntroDB"] : []),
    ],
    source_note:
      "Community skip timestamps. Explicit playback-request markers remain authoritative.",
  });
}
