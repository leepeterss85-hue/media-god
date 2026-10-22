import { secrets } from "base44:runtime";
import {
  normaliseVylaEpisodeCandidate,
  parseVylaSseFrame,
  validVylaPilotBase,
} from "../_shared/vylaSseProtocol.js";

/*
 * Controlled integration with a separately hosted, authorised Vyla instance.
 * Off by default. No credentials or endpoint URLs are sent to app clients.
 * Progressive upstream SSE is collected into a small bounded candidate batch;
 * this Base44 function does NOT claim to offer client-side SSE.
 */
const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "no-store" },
});
const positive = (value: unknown, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
};

export default async function (request: Request) {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  const enabled = String(secrets.get("VYLA_TV_PILOT_ENABLED") || "").toLowerCase() === "true";
  const base = validVylaPilotBase(secrets.get("VYLA_STREAM_API_URL"));
  if (!enabled || !base) return json({ status: "DISABLED", streams: [] });

  let input: any = {};
  try { input = await request.json(); } catch { return json({ error: "Invalid JSON", streams: [] }, 400); }

  const tmdbId = positive(input?.tmdb_id ?? input?.tmdbId, 999999999);
  const season = positive(input?.season, 100);
  const episode = positive(input?.episode, 1000);
  if (!tmdbId || !season || !episode) return json({ error: "Valid TMDB TV ID, season and episode required", streams: [] }, 400);

  const target = new URL("tv", base);
  target.searchParams.set("id", String(tmdbId));
  target.searchParams.set("season", String(season));
  target.searchParams.set("episode", String(episode));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7500);
  const sources: any[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  let finished = false;
  let upstreamStatus = 0;

  try {
    const token = String(secrets.get("VYLA_STREAM_API_TOKEN") || "").trim();
    const response = await fetch(target.toString(), {
      signal: controller.signal, redirect: "error",
      headers: {
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    upstreamStatus = response.status;
    if (!response.ok || !response.body) return json({ status: "UPSTREAM_UNAVAILABLE", streams: [], http_status: response.status });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!finished && sources.length < 5 && bytes < 262144) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        buffer += decoder.decode(chunk.value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");
        while (buffer.includes("\n\n")) {
          const cut = buffer.indexOf("\n\n");
          const frame = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = parseVylaSseFrame(frame);
          if (event?.type === "done") { finished = true; break; }
          const candidate = normaliseVylaEpisodeCandidate(event, { season, episode });
          if (candidate && !seen.has(candidate.url)) {
            seen.add(candidate.url);
            sources.push(candidate);
          }
        }
      }
    } finally {
      try { await reader.cancel(); } catch { /* upstream may already be closed */ }
    }
    return json({ status: sources.length ? "CANDIDATES" : "NO_CANDIDATES", streams: sources,
      upstream_finished: finished, http_status: upstreamStatus });
  } catch {
    // Never disclose tokens, candidate URLs or upstream error bodies.
    return json({ status: sources.length ? "PARTIAL" : "UPSTREAM_UNAVAILABLE", streams: sources, http_status: upstreamStatus });
  } finally {
    clearTimeout(timeout);
  }
}
