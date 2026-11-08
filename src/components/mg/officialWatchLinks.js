/**
 * Turn Watchmode's official provider records into safe per-title destinations.
 * Links are metadata only: never add them to playable scraper/decoder sources.
 */
export const safeWatchUrl = (candidate) => {
  const raw = String(candidate || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
};

const TYPE_LABELS = {
  sub: "Subscription",
  subscription: "Subscription",
  free: "Free",
  tve: "TV provider",
  rent: "Rent",
  buy: "Buy",
  ads: "Free with ads",
};

export const watchmodeSourceLinks = (sources, { region = "", preferTv = false } = {}) => {
  const targetRegion = String(region || "").trim().toUpperCase();
  const seen = new Set();
  const preferredFields = preferTv
    ? ["android_tv_url", "web_url", "android_url"]
    : ["web_url", "android_url", "android_tv_url"];

  return (Array.isArray(sources) ? sources : []).flatMap((source) => {
    if (!source || typeof source !== "object") return [];
    const sourceRegion = String(source.region || "").trim().toUpperCase();
    if (targetRegion && sourceRegion && sourceRegion !== targetRegion) return [];

    const url = preferredFields
      .map((field) => safeWatchUrl(source[field]))
      .find(Boolean);
    if (!url) return [];

    const name = String(source.name || source.source_name || "").trim();
    if (!name) return [];
    const rawType = String(source.type || "").toLowerCase();
    const tier = TYPE_LABELS[rawType] || "Watch";

    // A service can have several formats; show one entry per service and tier.
    const key = `${name.toLowerCase()}|${tier.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ key, name, tier, url }];
  });
};
