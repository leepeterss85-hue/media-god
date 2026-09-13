const EV_SPORTS_HOME = "https://saptarshiorg.github.io/";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const fetchText = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,text/csv,text/plain,*/*",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; MediaGod) AppleWebKit/537.36 Chrome/153 Safari/537.36",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < String(text || "").length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === ",") {
      row.push(current.trim());
      current = "";
      continue;
    }

    if (character === "\n") {
      row.push(current.trim());
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    if (character !== "\r") {
      current += character;
    }
  }

  if (current || row.length) {
    row.push(current.trim());
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((value) => clean(value)));
};

const normaliseHeader = (value, index) => {
  const key = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return key || `column_${index}`;
};

const csvObjects = (text) => {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(normaliseHeader);
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))
  );
};

const activeFlag = (row) =>
  clean(
    row?.active_true_false ||
      row?.active ||
      row?.is_active ||
      row?.enabled ||
      row?.show ||
      row?.visible
  )
    .replace(/^['"]+|['"]+$/g, "")
    .toUpperCase();

const isActive = (row) =>
  !new Set(["FALSE", "NO", "N", "0", "OFF", "DISABLED"]).has(activeFlag(row));

const absoluteUrl = (value) => {
  const raw = clean(value);
  if (!raw) return "";

  try {
    const url = new URL(raw, EV_SPORTS_HOME);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
};

const qualityNumber = (value) => {
  const text = clean(value).toLowerCase();
  if (/\b(?:4k|uhd|2160)\b/.test(text)) return 2160;
  if (/\b(?:fhd|1080)\b/.test(text)) return 1080;
  if (/\b(?:hd|720)\b/.test(text)) return 720;
  if (/\b576\b/.test(text)) return 576;
  if (/\b(?:sd|480)\b/.test(text)) return 480;
  return 0;
};

const countryFromRow = (row, url, group, name) => {
  const explicit = clean(row?.country || row?.country_code).toUpperCase();
  if (/^[A-Z]{2}$/.test(explicit)) return explicit === "UK" ? "GB" : explicit;

  const joined = `${group} ${name} ${url}`.toLowerCase();
  if (/\b(?:uk|united kingdom)\b|[-_/]uk(?:[/?#]|$)/i.test(joined)) return "GB";
  if (/\b(?:nz|new zealand)\b|[-_/]nz(?:[/?#]|$)/i.test(joined)) return "NZ";
  if (/\b(?:usa|united states)\b|[-_/]usa(?:[/?#]|$)/i.test(joined)) return "US";
  if (/\b(?:india|star sports|sony sports)\b/i.test(joined)) return "IN";
  if (/\baustralia\b|\bfox[- ]?(?:50[1-7])\b/i.test(joined)) return "AU";
  return "";
};

const rowToChannel = (row, context = {}) => {
  const name = clean(row?.channel_name || row?.name || row?.title);
  const url = absoluteUrl(
    row?.watch_url ||
      row?.stream_url ||
      row?.stream ||
      row?.url ||
      row?.embed
  );

  if (!name || !url || !isActive(row)) return null;

  const group = clean(
    row?.group ||
      row?.category ||
      context?.displayTitle ||
      context?.sheetName ||
      "EV SPORTS"
  );
  const logo = absoluteUrl(
    row?.icon_url || row?.logo_url || row?.logo || row?.image_url || row?.image
  );
  const qualityText = clean(row?.quality || row?.quality_badge || row?.resolution);
  const country = countryFromRow(row, url, group, name);
  const panelId = clean(context?.panelId);
  const sourceSheet = clean(context?.sheetName || "LIVE CHANNELS");
  const idSeed = `${sourceSheet}:${panelId}:${name}:${url}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

  return {
    id: `evsports:${idSeed || name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    url,
    logo,
    group,
    country,
    quality: qualityNumber(qualityText),
    qualityLabel: qualityText,
    status: clean(row?.status_live_off || row?.status || ""),
    programme: clean(row?.program_text || row?.programme || row?.program || ""),
    sourceSheet,
    panelId,
    panelTitle: clean(context?.displayTitle),
  };
};

const sheetUrl = (sheetId, sheetName) =>
  `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    sheetId
  )}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

const fetchSheet = async (sheetId, sheetName) => {
  const text = await fetchText(sheetUrl(sheetId, sheetName));
  return csvObjects(text);
};

const dedupeChannels = (channels) => {
  const seen = new Set();
  const result = [];

  for (const channel of channels || []) {
    if (!channel?.url || !channel?.name) continue;
    const key = `${clean(channel.name).toLowerCase()}|${clean(channel.url).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(channel);
  }

  return result;
};

export default async function () {
  try {
    const homeHtml = await fetchText(EV_SPORTS_HOME);
    const sheetId = clean(
      homeHtml.match(/\bSHEET_ID\s*=\s*['"]([^'"]+)['"]/i)?.[1]
    );

    if (!sheetId) {
      throw new Error("EV SPORTS public channel sheet was not found.");
    }

    const [liveRows, panelRows] = await Promise.all([
      fetchSheet(sheetId, "LIVE CHANNELS"),
      fetchSheet(sheetId, "PANELS").catch(() => []),
    ]);

    const channels = liveRows
      .map((row) => rowToChannel(row, { sheetName: "LIVE CHANNELS" }))
      .filter(Boolean);

    const panels = [];
    const activePanels = panelRows.filter(
      (row) => isActive(row) && clean(row?.tab_name || row?.panel_id)
    );

    const panelResults = await Promise.allSettled(
      activePanels.map(async (panel) => {
        const sheetName = clean(
          panel?.tab_name ||
            `${clean(panel?.panel_id).toUpperCase()} CHANNELS`
        );
        const rows = await fetchSheet(sheetId, sheetName);
        return {
          panel,
          sheetName,
          rows,
        };
      })
    );

    for (const result of panelResults) {
      if (result.status !== "fulfilled") continue;

      const panelId = clean(result.value.panel?.panel_id);
      const displayTitle = clean(
        result.value.panel?.display_title || result.value.sheetName
      );
      const panelChannels = result.value.rows
        .map((row) =>
          rowToChannel(row, {
            sheetName: result.value.sheetName,
            panelId,
            displayTitle,
          })
        )
        .filter(Boolean);

      channels.push(...panelChannels);
      panels.push({
        id: panelId,
        title: displayTitle,
        sheetName: result.value.sheetName,
        count: panelChannels.length,
      });
    }

    const deduped = dedupeChannels(channels);

    return Response.json({
      ok: true,
      source: "EV SPORTS / Saptarshi",
      homeUrl: EV_SPORTS_HOME,
      sheetId,
      count: deduped.length,
      liveChannelCount: liveRows.filter(isActive).length,
      panelCount: panels.length,
      panels,
      channels: deduped,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        source: "EV SPORTS / Saptarshi",
        homeUrl: EV_SPORTS_HOME,
        error: clean(error?.message) || "EV SPORTS channels could not be loaded.",
        channels: [],
      },
      { status: 502 }
    );
  }
}
