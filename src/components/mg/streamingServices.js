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
  { key: "paramount", label: "Paramount+", contains: ["paramount plus"] },
  { key: "now", label: "NOW", exact: ["now", "now tv"], contains: ["now tv"] },
  { key: "sky", label: "Sky Go", exact: ["sky go"] },
  { key: "bbc", label: "BBC iPlayer", contains: ["bbc iplayer"] },
  { key: "itvx", label: "ITVX", contains: ["itvx"] },
  { key: "channel4", label: "Channel 4", exact: ["channel 4"] },
  { key: "my5", label: "My5", exact: ["my5"] },
  { key: "discovery", label: "Discovery+", contains: ["discovery plus"] },
  { key: "crunchyroll", label: "Crunchyroll", contains: ["crunchyroll"] },
  { key: "britbox", label: "BritBox", contains: ["britbox"] },
  { key: "u", label: "U / UKTV Play", exact: ["u", "uktv play"] },
  { key: "hayu", label: "Hayu", contains: ["hayu"] },
  { key: "mubi", label: "MUBI", contains: ["mubi"] },
  { key: "shudder", label: "Shudder", contains: ["shudder"] },
  { key: "acorn", label: "Acorn TV", contains: ["acorn tv"] },
  { key: "stv", label: "STV Player", contains: ["stv player"] },
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

export const resolveStreamingServices = (catalog = []) =>
  STREAMING_SERVICE_DEFINITIONS.map((definition) => {
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

    const logoProvider = matches.find((provider) => provider?.logo_url) || matches[0];

    return {
      ...definition,
      providerIds,
      logoUrl: logoProvider?.logo_url || "",
      providerNames: matches
        .map((provider) => provider?.provider_name)
        .filter(Boolean),
    };
  }).filter(Boolean);
