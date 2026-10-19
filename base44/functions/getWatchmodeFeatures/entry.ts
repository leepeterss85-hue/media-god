import { secrets } from "base44:runtime";

const API_BASE = "https://api.watchmode.com/v1";
const clean = (value) => String(value ?? "").trim();
const validRegion = (value) => /^[A-Z]{2}$/.test(clean(value).toUpperCase())
  ? clean(value).toUpperCase()
  : "GB";

const readJson = async (url, apiKey) => {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
    signal: AbortSignal.timeout(12000),
  });
  let data = {};
  try { data = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    const message = clean(data?.message || data?.error || data?.detail);
    const error = new Error(message || `Watchmode request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
};

const buildUrl = (path, params = {}) => {
  const url = new URL(`${API_BASE}/${String(path).replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
};

export default async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const apiKey = clean(secrets.get("WATCHMODE_API_KEY"));
  if (!apiKey) {
    return Response.json({
      configured: false,
      error: "Watchmode is not connected yet. Add WATCHMODE_API_KEY to the Base44 backend secrets to enable these features.",
    }, { status: 503 });
  }

  const action = clean(body?.action);
  const region = validRegion(body?.region);

  try {
    if (action === "coverage") {
      const coverage = await readJson(buildUrl("live-coverage"), apiKey);
      return Response.json({ configured: true, coverage });
    }

    if (action === "live-leagues") {
      const leagues = await readJson(buildUrl("live-leagues", { region, page: 1, limit: 100 }), apiKey);
      return Response.json({ configured: true, region, leagues });
    }

    if (action === "source-changes") {
      const changes = await readJson(buildUrl("changes/titles_sources_changed", {
        regions: region,
        page: 1,
        limit: 50,
      }), apiKey);
      return Response.json({ configured: true, region, changes });
    }

    if (action === "live-events") {
      const now = new Date();
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const events = await readJson(buildUrl("live-events", {
        region,
        date_from: from.toISOString(),
        date_to: to.toISOString(),
        limit: 25,
        page: 1,
        include_sources: "true",
      }), apiKey);
      return Response.json({ configured: true, region, events });
    }

    if (action === "leaving") {
      const today = new Date();
      const end = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
      const ymd = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const leaving = await readJson(buildUrl("title-leaving-dates", {
        regions: region,
        start_date: ymd(today),
        end_date: ymd(end),
        page: 1,
        limit: 50,
      }), apiKey);
      return Response.json({ configured: true, region, leaving });
    }

    if (action === "awards") {
      const title = clean(body?.title);
      if (title.length < 2 || title.length > 120) {
        return Response.json({ error: "Enter a title to search for awards." }, { status: 400 });
      }
      const search = await readJson(buildUrl("search", {
        search_field: "name",
        search_value: title,
        types: "movie,tv",
      }), apiKey);
      const results = Array.isArray(search?.title_results)
        ? search.title_results
        : Array.isArray(search?.results)
          ? search.results
          : [];
      const match = results.find((item) =>
        clean(item?.title || item?.name).toLowerCase() === title.toLowerCase()
      ) || results[0];
      if (!match?.id) {
        return Response.json({ configured: true, title, awards: [], matched_title: null });
      }
      const awards = await readJson(buildUrl(`title/${encodeURIComponent(match.id)}/awards`), apiKey);
      return Response.json({
        configured: true,
        title,
        matched_title: clean(match?.title || match?.name),
        awards: Array.isArray(awards) ? awards : (awards?.awards || awards?.results || []),
      });
    }

    return Response.json({ error: "Unknown Watchmode action." }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 502);
    return Response.json({
      configured: true,
      error: clean(error?.message) || "Watchmode data is temporarily unavailable.",
      code: status === 403 ? "PLAN_OR_ACCESS" : status === 401 ? "API_KEY" : status === 429 ? "RATE_LIMIT" : "UPSTREAM",
    }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}
