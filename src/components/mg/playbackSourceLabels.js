const clean = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const providerName = (value) => {
  const key = clean(value).toLowerCase().replace(/[^a-z]/g, "");
  return {
    realdebrid: "RD",
    alldebrid: "AllDebrid",
    torbox: "TorBox",
    premiumize: "Premiumize",
    debridlink: "Debrid-Link",
  }[key] || "";
};

const pushUnique = (parts, value) => {
  const text = clean(value);
  if (!text) return;
  if (parts.some((item) => item.toLowerCase() === text.toLowerCase())) return;
  parts.push(text);
};

export const concisePlaybackSourceLabel = (item, index = 0) => {
  const raw = clean(
    item?.label ||
      item?.name ||
      item?.title ||
      `Source ${index + 1}`
  );
  const text = clean(
    [
      raw,
      item?.description,
      item?.audioCodec,
      item?.videoCodec,
      item?.quality,
    ]
      .filter(Boolean)
      .join(" ")
  );
  const parts = [];

  if (/\b2160p?\b|\b4k\b/i.test(text)) pushUnique(parts, "4K");
  else if (/\b1080p?\b/i.test(text)) pushUnique(parts, "1080p");
  else if (/\b720p?\b/i.test(text)) pushUnique(parts, "720p");
  else if (/\b480p?\b/i.test(text)) pushUnique(parts, "480p");

  if (/\bdolby[ ._-]?vision\b|\b(?:dv|dovi)\b/i.test(text)) {
    pushUnique(parts, "Dolby Vision");
  } else if (/\bhdr10\+\b/i.test(text)) {
    pushUnique(parts, "HDR10+");
  } else if (/\bhdr10\b/i.test(text)) {
    pushUnique(parts, "HDR10");
  } else if (/\bhdr\b/i.test(text)) {
    pushUnique(parts, "HDR");
  }

  if (/\b(?:hevc|h\.?265|x265)\b/i.test(text)) pushUnique(parts, "HEVC");
  else if (/\b(?:avc|h\.?264|x264)\b/i.test(text)) pushUnique(parts, "H264");
  else if (/\bav1\b/i.test(text)) pushUnique(parts, "AV1");

  if (/\b(?:truehd|mlp)\b/i.test(text)) pushUnique(parts, "TrueHD");
  else if (/\b(?:dts(?:-?hd)?|dts:x|dca)\b/i.test(text)) pushUnique(parts, "DTS");
  else if (/\b(?:e-?ac-?3|eac3|ec-?3|ddp|dd\+)\b/i.test(text)) pushUnique(parts, "EAC3");
  else if (/\b(?:ac-?3|ac3|dolby digital)\b/i.test(text)) pushUnique(parts, "AC3");
  else if (/\b(?:aac|he-?aac|mp4a)\b/i.test(text)) pushUnique(parts, "AAC");
  else if (/\bopus\b/i.test(text)) pushUnique(parts, "Opus");

  const channelMatch = text.match(/(?:^|[^0-9])(7\.1|5\.1|2\.1|2\.0)(?:[^0-9]|$)/i);
  if (channelMatch) pushUnique(parts, channelMatch[1]);

  if (/\b(?:eng|english)\b/i.test(text)) pushUnique(parts, "English");

  if (
    item?.debridCached === true ||
    item?.viaRealDebrid ||
    /\b(?:cached|instant|ready)\b/i.test(raw)
  ) {
    pushUnique(parts, "Cached");
  }

  const provider = providerName(item?.debridProvider || item?.provider);
  if (provider) pushUnique(parts, provider);

  const addon = clean(item?.addon || item?.sourceName);
  if (addon && !/^real[ ._-]?debrid library$/i.test(addon)) {
    pushUnique(parts, addon.length > 24 ? addon.slice(0, 24) : addon);
  }

  if (parts.length >= 2) return parts.slice(0, 7).join(" · ");

  return raw.length > 88 ? `${raw.slice(0, 85)}…` : raw;
};
