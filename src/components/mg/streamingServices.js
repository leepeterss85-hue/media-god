const normaliseProviderName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const STREAMING_SERVICE_DEFINITIONS = [
  { key: "netflix", label: "Netflix", contains: ["netflix"] },
  { key: "prime", label: "Prime Video", contains: ["amazon prime video", "prime video"] },
  { key: "disney", label: "Disney+", contains: ["disney plus"] },
  { key: "apple", label: "Apple TV+", contains: ["apple tv plus"] },
  { key: "max", label: "Max / HBO Max", contains: ["hbo max", "max"] },
  { key: "hulu", label: "Hulu", exact: ["hulu"] },
  { key: "peacock", label: "Peacock", contains: ["peacock"] },
  { key: "paramount", label: "Paramount+", contains: ["paramount plus"] },
  { key: "discovery", label: "Discovery+", contains: ["discovery plus"] },
  { key: "crunchyroll", label: "Crunchyroll", contains: ["crunchyroll"] },
  { key: "youtube", label: "YouTube Premium", contains: ["youtube premium"] },
  { key: "tubi", label: "Tubi", contains: ["tubi"] },
  { key: "pluto", label: "Pluto TV", contains: ["pluto tv"] },
  { key: "mubi", label: "MUBI", contains: ["mubi"] },
  { key: "shudder", label: "Shudder", contains: ["shudder"] },
  { key: "britbox", label: "BritBox", contains: ["britbox"] },
  { key: "acorn", label: "Acorn TV", contains: ["acorn tv"] },
  { key: "starz", label: "STARZ", contains: ["starz"] },
  { key: "mgm", label: "MGM+", contains: ["mgm plus"] },
  { key: "amc", label: "AMC+", contains: ["amc plus"] },
  { key: "curiosity", label: "Curiosity Stream", contains: ["curiosity stream"] },
  { key: "viaplay", label: "Viaplay", contains: ["viaplay"] },
  { key: "rakuten", label: "Rakuten TV", contains: ["rakuten tv"] },
  { key: "canal", label: "Canal+", contains: ["canal plus"] },
  { key: "joyn", label: "Joyn", contains: ["joyn"] },
  { key: "rtl", label: "RTL+", contains: ["rtl plus"] },
  { key: "now", label: "NOW", exact: ["now", "now tv"], contains: ["now tv"] },
  { key: "sky", label: "Sky", contains: ["sky go", "sky showtime", "sky x"] },
  { key: "bbc", label: "BBC iPlayer", contains: ["bbc iplayer"] },
  { key: "itvx", label: "ITVX", contains: ["itvx"] },
  { key: "channel4", label: "Channel 4", exact: ["channel 4"] },
  { key: "my5", label: "My5", exact: ["my5"] },
  { key: "u", label: "U / UKTV Play", exact: ["u", "uktv play"] },
  { key: "stv", label: "STV Player", contains: ["stv player"] },
  { key: "jiohotstar", label: "JioHotstar / Hotstar", contains: ["jiohotstar", "hotstar"] },
  { key: "sonyliv", label: "SonyLIV", contains: ["sonyliv", "sony liv"] },
  { key: "zee5", label: "ZEE5", contains: ["zee5"] },
  { key: "viu", label: "Viu", exact: ["viu"] },
  { key: "iqiyi", label: "iQIYI", contains: ["iqiyi"] },
  { key: "wetv", label: "WeTV", exact: ["wetv"] },
  { key: "stan", label: "Stan", exact: ["stan"] },
  { key: "binge", label: "Binge", exact: ["binge"] },
  { key: "foxtel", label: "Foxtel Now", contains: ["foxtel now"] },
  { key: "abciview", label: "ABC iview", contains: ["abc iview"] },
  { key: "sbs", label: "SBS On Demand", contains: ["sbs on demand"] },
  { key: "crave", label: "Crave", exact: ["crave"] },
  { key: "cbcgem", label: "CBC Gem", contains: ["cbc gem"] },
  { key: "showmax", label: "Showmax", contains: ["showmax"] },
  { key: "osn", label: "OSN+", contains: ["osn plus"] },
  { key: "shahid", label: "Shahid", contains: ["shahid"] },
  { key: "tod", label: "TOD", exact: ["tod"] },
  { key: "hayu", label: "Hayu", contains: ["hayu"] },
];

const matchesDefinition = (providerName, definition) => {
  const name = normaliseProviderName(providerName);
  if (!name) return false;

  const exact = (definition.exact || []).map(normaliseProviderName);
  if (exact.includes(name)) return true;

  return (definition.contains || [])
    .map(normaliseProviderName)
    .some((term) => term && name.includes(term));
};

const genericService = (provider) => {
  const providerId = String(provider?.provider_id || "").trim();
  if (!providerId) return null;

  return {
    key: `provider-${providerId}`,
    label: provider?.provider_name || "Streaming service",
    providerIds: [providerId],
    logoUrl: provider?.logo_url || "",
    providerNames: [provider?.provider_name].filter(Boolean),
    displayPriority: Number(provider?.display_priority || 99999),
  };
};

export const resolveStreamingServices = (catalog = []) => {
  const matchedProviderIds = new Set();

  const preferred = STREAMING_SERVICE_DEFINITIONS.map((definition) => {
    const matches = (catalog || []).filter((provider) =>
      matchesDefinition(provider?.provider_name, definition)
    );

    const providerIds = Array.from(
      new Set(
        matches
          .map((provider) => String(provider?.provider_id || "").trim())
          .filter(Boolean)
      )
    );

    if (!providerIds.length) return null;
    providerIds.forEach((id) => matchedProviderIds.add(id));

    const logoProvider = matches.find((provider) => provider?.logo_url) || matches[0];

    return {
      ...definition,
      providerIds,
      logoUrl: logoProvider?.logo_url || "",
      providerNames: matches
        .map((provider) => provider?.provider_name)
        .filter(Boolean),
      displayPriority: Math.min(
        ...matches.map((provider) => Number(provider?.display_priority || 99999))
      ),
    };
  }).filter(Boolean);

  const regional = (catalog || [])
    .filter((provider) => {
      const id = String(provider?.provider_id || "").trim();
      return id && !matchedProviderIds.has(id);
    })
    .map(genericService)
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(a.displayPriority || 99999) - Number(b.displayPriority || 99999) ||
        String(a.label || "").localeCompare(String(b.label || ""))
    );

  return [...preferred, ...regional];
};
