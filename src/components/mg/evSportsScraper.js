const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normaliseChannel = (channel, index) => {
  const url = clean(channel?.url);
  const name = clean(channel?.name || `EV SPORTS ${index + 1}`);
  const group = clean(channel?.group || channel?.panelTitle || "Sports");
  const country = clean(channel?.country).toUpperCase();
  const quality = Number(channel?.quality || 0);
  const sourceSheet = clean(channel?.sourceSheet || "LIVE CHANNELS");
  const panelTitle = clean(channel?.panelTitle);

  return {
    id: clean(channel?.id) || `evsports:${index}:${name}`,
    tvgId: "",
    name,
    rawName: name,
    group,
    country,
    logo: clean(channel?.logo),
    url,
    officialUrl: url,
    officialLabel: "Open on EV SPORTS",
    kind: "external",
    format: "external",
    sourceId: "evsports-live",
    sourceName: "EV SPORTS · Saptarshi",
    sourceNames: ["EV SPORTS · Saptarshi"],
    sourcePriority: 132,
    sourceCategory: "Sports",
    browserPlayable: true,
    browserReason: "",
    geoRestricted: false,
    geoBlocked: false,
    quality,
    live: true,
    tags: [
      "Sports",
      "EV SPORTS",
      "Saptarshi",
      group,
      sourceSheet,
      panelTitle,
      country,
    ].filter(Boolean),
    score: 7600 + quality,
    alternatives: [],
    evSports: {
      sourceSheet,
      panelId: clean(channel?.panelId),
      panelTitle,
      qualityLabel: clean(channel?.qualityLabel),
      status: clean(channel?.status),
      programme: clean(channel?.programme),
    },
  };
};

export async function fetchEvSportsChannels() {
  // Keep the Base44 client lazy so Node regression tests can import the
  // playlist module without needing Vite's @ alias resolution.
  const { base44 } = await import("../../api/base44Client.js");
  const response = await base44.functions.invoke("evSportsLive", {});
  const data = response?.data ?? response ?? {};

  if (data?.ok === false || data?.error) {
    throw new Error(clean(data?.error) || "EV SPORTS channels could not be loaded.");
  }

  return (Array.isArray(data?.channels) ? data.channels : [])
    .map(normaliseChannel)
    .filter((channel) => channel.name && /^https?:\/\//i.test(channel.url));
}
