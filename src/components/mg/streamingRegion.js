const REGION_STORAGE_KEY = "mg:streaming-region";
const REGION_RE = /^[A-Z]{2}$/;

export const normaliseStreamingRegion = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  const region = { UK: "GB", GBR: "GB", USA: "US" }[raw] || raw;
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

/*
 * This is the preferred catalogue/playback region, not a claim about network
 * geolocation. Timezone can correct en-US locale defaults on UK Android devices.
 * A manually chosen region always wins; providers still enforce their own rights.
 */
export const inferStreamingRegion = ({ override = "", timezone = "", locales = [] } = {}) => {
  const selected = normaliseStreamingRegion(override);
  if (selected) return { region: selected, source: "manual" };

  if (/^Europe\\/(?:London|Belfast|Guernsey|Isle_of_Man|Jersey)$/i.test(String(timezone))) {
    return { region: "GB", source: "timezone" };
  }

  for (const locale of locales) {
    const region = regionFromLocale(locale);
    if (region) return { region, source: "locale" };
  }

  return { region: "US", source: "default" };
};

export const getStreamingRegionDetails = () => {
  const locales = [];
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) locales.push(...navigator.languages);
    locales.push(navigator.language, navigator.userLanguage);
  }

  try {
    locales.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Older WebViews may not expose a locale.
  }

  return inferStreamingRegion({
    override: getStreamingRegionOverride(),
    timezone: detectStreamingTimezone(),
    locales,
  });
};

export const detectStreamingRegion = () => getStreamingRegionDetails().region;

export const detectStreamingTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const getStreamingRegionOverride = () => {
  if (typeof window === "undefined") return "";

  try {
    return normaliseStreamingRegion(
      window.localStorage?.getItem(REGION_STORAGE_KEY)
    );
  } catch {
    return "";
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
