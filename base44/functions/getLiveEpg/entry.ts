import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const EPG_URL =
  "https://epgshare01.online/epgshare01/epg_ripper_UK1.xml.gz";
const CACHE_MS = 8 * 60 * 1000;

let cachedXml = "";
let cachedAt = 0;

const clean = (value) => String(value || "").trim();

const decodeXml = (value) =>
  clean(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const normaliseName = (value) =>
  decodeXml(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(?:uk|hd|fhd|uhd|4k|1080p?|720p?|sd)\b/g, " ")
    .replace(/\+1\b/g, " plus one ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseXmlTvDate = (value) => {
  const match = clean(value).match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-])(\d{2})(\d{2})/
  );

  if (!match) return 0;

  const [, y, mo, d, h, mi, s, sign, oh, om] = match;
  const localAsUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );
  const offsetMinutes = (Number(oh) * 60 + Number(om)) *
    (sign === "+" ? 1 : -1);

  return localAsUtc - offsetMinutes * 60 * 1000;
};

const fetchXml = async () => {
  if (cachedXml && Date.now() - cachedAt < CACHE_MS) {
    return cachedXml;
  }

  const response = await fetch(EPG_URL, {
    headers: {
      "User-Agent": "MediaGod/1.0 EPG",
      Accept: "application/gzip, application/xml, text/xml, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`EPG source returned ${response.status}.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  let xml = "";

  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    xml = await new Response(stream).text();
  } else {
    xml = new TextDecoder().decode(bytes);
  }

  if (!xml.includes("<tv") || !xml.includes("<programme")) {
    throw new Error("EPG source did not return XMLTV data.");
  }

  cachedXml = xml;
  cachedAt = Date.now();
  return xml;
};

const channelNames = (xml) => {
  const byId = new Map();
  const byName = new Map();
  const regex = /<channel\s+[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/gi;
  let match;

  while ((match = regex.exec(xml))) {
    const id = decodeXml(match[1]);
    const block = match[2];
    const displayNames = Array.from(
      block.matchAll(/<display-name(?:\s[^>]*)?>([\s\S]*?)<\/display-name>/gi)
    ).map((entry) => decodeXml(entry[1]));

    byId.set(id, displayNames);

    [id, ...displayNames].forEach((name) => {
      const normalised = normaliseName(name);
      if (normalised && !byName.has(normalised)) {
        byName.set(normalised, id);
      }
    });
  }

  return { byId, byName };
};

const findGuideId = (target, lookup) => {
  const country = clean(target?.country).toUpperCase();
  const tvgId = clean(target?.tvgId);

  /*
   * This function uses a UK-only XMLTV feed. Never attach that guide to a
   * channel explicitly identified as another country; global Live TV sources
   * often reuse similar channel names and would otherwise receive unrelated UK
   * programmes.
   */
  if (country && country !== "GB" && country !== "UK") {
    return "";
  }

  if (tvgId && lookup.byId.has(tvgId)) {
    return tvgId;
  }

  const normalisedId = normaliseName(tvgId);
  if (normalisedId && lookup.byName.has(normalisedId)) {
    return lookup.byName.get(normalisedId);
  }

  const name = normaliseName(target?.name);
  if (name && lookup.byName.has(name)) {
    return lookup.byName.get(name);
  }

  /*
   * Do not use prefix/substring matching here. A loose match such as one guide
   * name starting with another can assign the same programme schedule to an
   * unrelated channel. Exact normalised IDs/names are intentionally preferred
   * over showing confident-looking but incorrect Now/Next information.
   */
  return "";
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const targets = Array.isArray(body?.channels)
      ? body.channels.slice(0, 350)
      : [];

    if (targets.length === 0) {
      return Response.json({ items: [], matched: 0 });
    }

    const xml = await fetchXml();
    const lookup = channelNames(xml);
    const guideIdByClientKey = new Map();
    const wantedGuideIds = new Set();
    const usedGuideIds = new Set();

    targets.forEach((target, index) => {
      const clientKey = clean(target?.key) || String(index);
      const guideId = findGuideId(target, lookup);

      /*
       * One XMLTV channel may describe only one visible Live TV row in this
       * request. This prevents a guide-key collision from painting the same
       * programme title across multiple unrelated channel cards.
       */
      if (guideId && !usedGuideIds.has(guideId)) {
        usedGuideIds.add(guideId);
        guideIdByClientKey.set(clientKey, guideId);
        wantedGuideIds.add(guideId);
      }
    });

    const nowMs = Date.now();
    const windowEnd = nowMs + 12 * 60 * 60 * 1000;
    const programmesByGuide = new Map();
    const programmeRegex =
      /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
    let match;

    while ((match = programmeRegex.exec(xml))) {
      const attributes = match[1] || "";
      const block = match[2] || "";
      const startText =
        attributes.match(/\bstart="([^"]+)"/i)?.[1] || "";
      const stopText =
        attributes.match(/\bstop="([^"]+)"/i)?.[1] || "";
      const channelText =
        attributes.match(/\bchannel="([^"]+)"/i)?.[1] || "";
      const start = parseXmlTvDate(startText);
      const stop = parseXmlTvDate(stopText);
      const guideId = decodeXml(channelText);

      if (!wantedGuideIds.has(guideId) || !start || !stop) {
        continue;
      }

      if (stop < nowMs - 5 * 60 * 1000 || start > windowEnd) {
        continue;
      }

      const titleMatch = block.match(
        /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i
      );
      const descMatch = block.match(
        /<desc(?:\s[^>]*)?>([\s\S]*?)<\/desc>/i
      );
      const entry = {
        title: decodeXml(titleMatch?.[1] || "Programme"),
        description: decodeXml(descMatch?.[1] || "").slice(0, 500),
        start: new Date(start).toISOString(),
        stop: new Date(stop).toISOString(),
        startMs: start,
        stopMs: stop,
      };

      const list = programmesByGuide.get(guideId) || [];
      list.push(entry);
      programmesByGuide.set(guideId, list);
    }

    const items = targets.map((target, index) => {
      const key = clean(target?.key) || String(index);
      const guideId = guideIdByClientKey.get(key) || "";
      const list = (programmesByGuide.get(guideId) || []).sort(
        (a, b) => a.startMs - b.startMs
      );
      const currentIndex = list.findIndex(
        (item) => item.startMs <= nowMs && item.stopMs > nowMs
      );
      const current = currentIndex >= 0 ? list[currentIndex] : null;
      const next =
        currentIndex >= 0
          ? list.slice(currentIndex + 1).find((item) => item.startMs >= current.stopMs - 60000) || null
          : list.find((item) => item.startMs > nowMs) || null;

      const upcoming = list
        .filter((item) => item.stopMs > nowMs)
        .slice(0, 6);

      const stripInternal = (item) =>
        item
          ? {
              title: item.title,
              description: item.description,
              start: item.start,
              stop: item.stop,
            }
          : null;

      return {
        key,
        guide_id: guideId,
        now: stripInternal(current),
        next: stripInternal(next),
        upcoming: upcoming.map(stripInternal),
      };
    });

    return Response.json({
      items,
      matched: items.filter((item) => item.guide_id).length,
      source: "UK XMLTV",
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        error: error?.message || "Could not load Live TV guide data.",
        items: [],
      },
      { status: 200 }
    );
  }
}
