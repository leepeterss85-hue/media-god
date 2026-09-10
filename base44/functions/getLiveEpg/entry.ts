import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const EPG_BASE_URL = "https://epgshare01.online/epgshare01";
const CACHE_MS = 8 * 60 * 1000;
const MAX_TARGETS = 400;
const MAX_COUNTRIES_PER_REQUEST = 8;

/*
 * EPGshare01 publishes separate XMLTV files per country. Keep country feeds
 * isolated so similarly named channels in different countries can never share
 * programme data. A few countries have multiple current files; those are
 * searched together, with exact tvg-id matches preferred over name matches.
 *
 * This list was verified against the provider's live index rather than using
 * the enormous ALL_SOURCES feed, which keeps memory/network usage predictable.
 */
const COUNTRY_EPG_TAGS = {
  AE: ["AE1"],
  AL: ["AL1"],
  AR: ["AR1"],
  AT: ["AT1"],
  AU: ["AU1"],
  BA: ["BA1"],
  BB: ["BB1"],
  BE: ["BE2"],
  BG: ["BG1"],
  BR: ["BR1", "BR2"],
  CA: ["CA2"],
  CH: ["CH1"],
  CL: ["CL1"],
  CO: ["CO1"],
  CR: ["CR1"],
  CY: ["CY1"],
  CZ: ["CZ1"],
  DE: ["DE1"],
  DK: ["DK1"],
  DO: ["DO1"],
  EC: ["EC1"],
  EG: ["EG1"],
  ES: ["ES1"],
  FI: ["FI1"],
  FR: ["FR1"],
  GB: ["UK1"],
  GR: ["GR1"],
  HK: ["HK1"],
  HR: ["HR1"],
  HU: ["HU1"],
  ID: ["ID1"],
  IE: ["IE1"],
  IL: ["IL1"],
  IN: ["IN1", "IN2", "IN4"],
  IT: ["IT1"],
  JM: ["JM1"],
  JP: ["JP1", "JP2"],
  KE: ["KE1"],
  KR: ["KR1"],
  KZ: ["KZ1"],
  LT: ["LT1"],
  LU: ["LU1"],
  LV: ["LV1"],
  MN: ["MN1"],
  MT: ["MT1"],
  MX: ["MX1"],
  MY: ["MY1"],
  NG: ["NG1"],
  NL: ["NL1"],
  NO: ["NO1"],
  NZ: ["NZ1"],
  PA: ["PA1"],
  PE: ["PE1"],
  PH: ["PH1", "PH2"],
  PK: ["PK1"],
  PL: ["PL1"],
  PT: ["PT1"],
  RO: ["RO1", "RO2"],
  RS: ["RS1"],
  SA: ["SA1", "SA2"],
  SE: ["SE1"],
  SG: ["SG1"],
  SK: ["SK1"],
  SV: ["SV1"],
  TH: ["TH1"],
  TR: ["TR1", "TR3"],
  US: ["US2", "US_LOCALS1", "US_SPORTS1"],
  UY: ["UY1"],
  VN: ["VN1"],
  ZA: ["ZA1"],
};

const cachedXmlByTag = new Map();

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

const nameAliases = (value) => {
  const base = normaliseName(value);
  const aliases = new Set();
  const add = (candidate) => {
    const cleanCandidate = String(candidate || "").replace(/\s+/g, " ").trim();
    if (cleanCandidate) aliases.add(cleanCandidate);
  };

  add(base);
  add(base.replace(/\bitv\s+([1-4])\b/g, "itv$1"));
  add(base.replace(/\bitv([1-4])\b/g, "itv $1"));
  add(base.replace(/\b5\s+(usa|star|action|select)\b/g, "5$1"));
  add(base.replace(/\b5(usa|star|action|select)\b/g, "5 $1"));
  add(base.replace(/^u\s+and\s+/, ""));
  add(base.replace(/^bbc\s+1\b/, "bbc one"));
  add(base.replace(/^bbc\s+one\b/, "bbc 1"));
  add(base.replace(/^bbc\s+2\b/, "bbc two"));
  add(base.replace(/^bbc\s+two\b/, "bbc 2"));
  add(base.replace(/^c4\b/, "channel 4"));
  add(base.replace(/^channel\s+4\b/, "c4"));
  add(base.replace(/^five\b/, "channel 5"));
  add(base.replace(/^channel\s+5\b/, "five"));
  add(base.replace(/^bbc\s+news\s+channel\b/, "bbc news"));

  return Array.from(aliases);
};

const PREFERRED_GUIDE_IDS = {
  GB: new Map([
    ["bbc one", "BBC.One.Lon.HD.uk"],
    ["bbc 1", "BBC.One.Lon.HD.uk"],
    ["bbc two", "BBC.Two.HD.uk"],
    ["bbc 2", "BBC.Two.HD.uk"],
    ["bbc three", "BBC.Three.HD.uk"],
    ["bbc four", "BBC.Four.HD.uk"],
    ["bbc news", "BBC.NEWS.HD.uk"],
    ["bbc parliament", "BBC.Parliament.HD.uk"],
    ["cbbc", "CBBC.HD.uk"],
    ["cbeebies", "CBeebies.HD.uk"],
    ["itv1", "ITV1.HD.uk"],
    ["itv 1", "ITV1.HD.uk"],
    ["itv2", "ITV2.HD.uk"],
    ["itv 2", "ITV2.HD.uk"],
    ["itv3", "ITV3.HD.uk"],
    ["itv 3", "ITV3.HD.uk"],
    ["itv4", "ITV4.HD.uk"],
    ["itv 4", "ITV4.HD.uk"],
    ["channel 4", "Channel.4.HD.uk"],
    ["c4", "Channel.4.HD.uk"],
    ["channel 5", "Channel.5.HD.uk"],
    ["five", "Channel.5.HD.uk"],
    ["e4", "E4.HD.uk"],
    ["more4", "More4.HD.uk"],
    ["film4", "Film4.HD.uk"],
    ["sky mix", "Sky.Mix.HD.uk"],
    ["sky news", "Sky.News.HD.uk"],
    ["5 usa", "5.USA.uk"],
    ["5usa", "5.USA.uk"],
    ["5star", "5STAR.uk"],
    ["5 star", "5STAR.uk"],
    ["5action", "5ACTION.uk"],
    ["5 action", "5ACTION.uk"],
    ["5select", "5SELECT.uk"],
    ["5 select", "5SELECT.uk"],
    ["s4c", "S4C.HD.uk"],
    ["dave", "U.and.Dave.HD.uk"],
    ["yesterday", "U.and.YESTERDAY.uk"],
    ["drama", "U.and.Drama.uk"],
  ]),
};

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
  const offsetMinutes =
    (Number(oh) * 60 + Number(om)) * (sign === "+" ? 1 : -1);

  return localAsUtc - offsetMinutes * 60 * 1000;
};

const countryCodeForTarget = (target) => {
  const explicit = clean(target?.country).toUpperCase();
  if (explicit === "UK") return "GB";
  if (/^[A-Z]{2}$/.test(explicit)) return explicit;

  const tvgId = clean(target?.tvgId);
  const suffix = tvgId.match(/\.([a-z]{2})(?:@.*)?$/i)?.[1]?.toUpperCase() || "";
  if (suffix === "UK") return "GB";
  return /^[A-Z]{2}$/.test(suffix) ? suffix : "";
};

const fetchXml = async (tag) => {
  const cached = cachedXmlByTag.get(tag);
  if (cached?.xml && Date.now() - Number(cached.at || 0) < CACHE_MS) {
    return cached.xml;
  }

  const url = `${EPG_BASE_URL}/epg_ripper_${tag}.xml.gz`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "MediaGod/1.0 EPG",
      Accept: "application/gzip, application/xml, text/xml, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`${tag} returned ${response.status}`);
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
    throw new Error(`${tag} did not return XMLTV data`);
  }

  cachedXmlByTag.set(tag, { xml, at: Date.now() });
  return xml;
};

const channelNames = (xml) => {
  const byId = new Map();
  const byIdLower = new Map();
  const idsByName = new Map();
  const regex = /<channel\s+[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/gi;
  let match;

  while ((match = regex.exec(xml))) {
    const id = decodeXml(match[1]);
    const block = match[2];
    const displayNames = Array.from(
      block.matchAll(/<display-name(?:\s[^>]*)?>([\s\S]*?)<\/display-name>/gi)
    ).map((entry) => decodeXml(entry[1]));

    byId.set(id, displayNames);
    byIdLower.set(id.toLowerCase(), id);

    [id, ...displayNames].forEach((name) => {
      nameAliases(name).forEach((normalised) => {
        if (!normalised) return;
        const ids = idsByName.get(normalised) || new Set();
        ids.add(id);
        idsByName.set(normalised, ids);
      });
    });
  }

  /*
   * A normalised display name is safe only when it identifies exactly one
   * XMLTV channel in this country feed. Ambiguous names are deliberately left
   * unmatched instead of showing plausible-looking but incorrect programme
   * information.
   */
  const byName = new Map();
  idsByName.forEach((ids, name) => {
    if (ids.size === 1) {
      byName.set(name, Array.from(ids)[0]);
    }
  });

  return { byId, byIdLower, byName };
};

const findGuideMatch = (target, lookup) => {
  const tvgId = clean(target?.tvgId);

  if (tvgId && lookup.byId.has(tvgId)) {
    return { guideId: tvgId, strength: 300 };
  }

  const caseInsensitiveId = tvgId
    ? lookup.byIdLower.get(tvgId.toLowerCase())
    : "";
  if (caseInsensitiveId) {
    return { guideId: caseInsensitiveId, strength: 290 };
  }

  for (const normalisedId of nameAliases(tvgId)) {
    if (lookup.byName.has(normalisedId)) {
      return { guideId: lookup.byName.get(normalisedId), strength: 220 };
    }
  }

  for (const name of nameAliases(target?.name)) {
    if (lookup.byName.has(name)) {
      return { guideId: lookup.byName.get(name), strength: 180 };
    }
  }

  const country = countryCodeForTarget(target);
  const preferredGuideId = (PREFERRED_GUIDE_IDS[country] || new Map())
    .get(normaliseName(target?.name));

  if (preferredGuideId && lookup.byId.has(preferredGuideId)) {
    return { guideId: preferredGuideId, strength: 160 };
  }

  return null;
};

const programmesForWanted = (xml, wantedGuideIds, nowMs, windowEnd) => {
  const programmesByGuide = new Map();
  const programmeRegex = /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
  let match;

  while ((match = programmeRegex.exec(xml))) {
    const attributes = match[1] || "";
    const block = match[2] || "";
    const startText = attributes.match(/\bstart="([^"]+)"/i)?.[1] || "";
    const stopText = attributes.match(/\bstop="([^"]+)"/i)?.[1] || "";
    const channelText = attributes.match(/\bchannel="([^"]+)"/i)?.[1] || "";
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

  return programmesByGuide;
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
      ? body.channels.slice(0, MAX_TARGETS)
      : [];

    if (targets.length === 0) {
      return Response.json({ items: [], matched: 0, countries: [] });
    }

    const targetsByCountry = new Map();
    targets.forEach((target, index) => {
      const country = countryCodeForTarget(target);
      const clientKey = clean(target?.key) || String(index);
      const entry = { ...target, clientKey, country };
      const list = targetsByCountry.get(country) || [];
      list.push(entry);
      targetsByCountry.set(country, list);
    });

    const supportedCountryEntries = Array.from(targetsByCountry.entries())
      .filter(([country]) => Array.isArray(COUNTRY_EPG_TAGS[country]))
      .slice(0, MAX_COUNTRIES_PER_REQUEST);

    const guideRefByClientKey = new Map();
    const wantedGuideIdsByTag = new Map();
    const xmlByTag = new Map();
    const usedGuideRefs = new Set();
    const sourceErrors = [];
    const loadedCountries = [];

    for (const [country, countryTargets] of supportedCountryEntries) {
      const tags = COUNTRY_EPG_TAGS[country] || [];
      const feeds = [];

      const results = await Promise.allSettled(
        tags.map(async (tag) => {
          const xml = await fetchXml(tag);
          return { tag, xml, lookup: channelNames(xml) };
        })
      );

      results.forEach((result, index) => {
        const tag = tags[index];
        if (result.status === "fulfilled") {
          feeds.push(result.value);
          xmlByTag.set(tag, result.value.xml);
        } else {
          sourceErrors.push(`${tag}: ${clean(result.reason?.message || result.reason)}`);
        }
      });

      if (feeds.length === 0) continue;
      loadedCountries.push(country);

      countryTargets.forEach((target) => {
        const matches = feeds
          .map((feed, feedIndex) => {
            const match = findGuideMatch(target, feed.lookup);
            return match
              ? { ...match, tag: feed.tag, feedIndex }
              : null;
          })
          .filter(Boolean)
          .sort(
            (a, b) =>
              b.strength - a.strength || a.feedIndex - b.feedIndex
          );

        const best = matches[0];
        if (!best) return;

        const refKey = `${best.tag}\u0000${best.guideId}`;

        /*
         * One XMLTV channel may describe only one visible Live TV row in this
         * request. This is the final guard against a guide-key collision
         * painting one programme across unrelated channel cards.
         */
        if (usedGuideRefs.has(refKey)) return;

        usedGuideRefs.add(refKey);
        guideRefByClientKey.set(target.clientKey, {
          tag: best.tag,
          guideId: best.guideId,
        });

        const wanted = wantedGuideIdsByTag.get(best.tag) || new Set();
        wanted.add(best.guideId);
        wantedGuideIdsByTag.set(best.tag, wanted);
      });
    }

    const nowMs = Date.now();
    const windowEnd = nowMs + 12 * 60 * 60 * 1000;
    const programmesByTag = new Map();

    wantedGuideIdsByTag.forEach((wantedGuideIds, tag) => {
      const xml = xmlByTag.get(tag);
      if (!xml) return;
      programmesByTag.set(
        tag,
        programmesForWanted(xml, wantedGuideIds, nowMs, windowEnd)
      );
    });

    const items = targets.map((target, index) => {
      const key = clean(target?.key) || String(index);
      const ref = guideRefByClientKey.get(key) || null;
      const list = ref
        ? (programmesByTag.get(ref.tag)?.get(ref.guideId) || []).sort(
            (a, b) => a.startMs - b.startMs
          )
        : [];
      const currentIndex = list.findIndex(
        (item) => item.startMs <= nowMs && item.stopMs > nowMs
      );
      const current = currentIndex >= 0 ? list[currentIndex] : null;
      const next =
        currentIndex >= 0
          ? list
              .slice(currentIndex + 1)
              .find((item) => item.startMs >= current.stopMs - 60000) || null
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
        guide_id: ref?.guideId || "",
        guide_source: ref?.tag || "",
        now: stripInternal(current),
        next: stripInternal(next),
        upcoming: upcoming.map(stripInternal),
      };
    });

    return Response.json({
      items,
      matched: items.filter((item) => item.guide_id).length,
      source: "Worldwide country XMLTV",
      countries: loadedCountries,
      supported_countries: Object.keys(COUNTRY_EPG_TAGS),
      source_errors: sourceErrors.slice(0, 12),
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
