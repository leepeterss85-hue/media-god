const REGION_STORAGE_KEY = "mg:streaming-region";
const REGION_RE = /^[A-Z]{2}$/;

export const normaliseStreamingRegion = (value) => {
  const region = String(value || "").trim().toUpperCase();
  return REGION_RE.test(region) ? region : "";
};

const regionFromLocale = (locale) => {
  const value = String(locale || "").trim();
  if (!value) return "";

  try {
    const region = new Intl.Locale(value).region;
    if (region) return normaliseStreamingRegion(region);
  } catch {
    // Fall through to a conservative locale parser.
  }

  const match = value.match(/[-_]([A-Za-z]{2})(?:[-_]|$)/);
  return normaliseStreamingRegion(match?.[1]);
};

export const detectStreamingRegion = () => {
  if (typeof window !== "undefined") {
    try {
      const stored = normaliseStreamingRegion(
        window.localStorage?.getItem(REGION_STORAGE_KEY)
      );
      if (stored) return stored;
    } catch {
      // Storage is optional.
    }
  }

  const locales = [];

  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) {
      locales.push(...navigator.languages);
    }
    locales.push(navigator.language, navigator.userLanguage);
  }

  try {
    locales.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Intl may be restricted on older WebViews.
  }

  for (const locale of locales) {
    const region = regionFromLocale(locale);
    if (region) return region;
  }

  // Neutral fallback when the device does not expose a region.
  return "US";
};

export const detectStreamingTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const setStreamingRegionOverride = (value) => {
  const region = normaliseStreamingRegion(value);
  if (typeof window === "undefined") return region;

  try {
    if (region) {
      window.localStorage?.setItem(REGION_STORAGE_KEY, region);
    } else {
      window.localStorage?.removeItem(REGION_STORAGE_KEY);
    }
  } catch {
    // Storage is optional.
  }

  return region;
};

export const streamingRegionName = (value) => {
  const region = normaliseStreamingRegion(value) || detectStreamingRegion();

  try {
    const display = new Intl.DisplayNames(undefined, { type: "region" });
    return display.of(region) || region;
  } catch {
    return region;
  }
};
