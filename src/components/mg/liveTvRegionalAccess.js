import { normaliseStreamingRegion } from "./streamingRegion.js";

/*
 * A playlist country is the origin of a feed, not proof of licensing rights.
 * Never remove streams on these hints: only distinguish marked feeds from one
 * another, after freely accessible / unmarked feeds have already been preferred.
 */
export const liveTvGeoPreferenceTier = (candidate, viewerRegion) => {
  if (candidate?.geoRestricted !== true) return 0;

  const viewer = normaliseStreamingRegion(viewerRegion);
  const country = normaliseStreamingRegion(candidate?.country);
  return viewer && country && viewer === country ? 1 : 2;
};

/* Recognise definitive region messages without mistaking a generic 403 for a geo block. */
export const classifyLiveTvAccessIssue = (error) => {
  const status = Number(error?.response?.status || error?.status || 0);
  const detail = String(
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    (typeof error === "string" ? error : "")
  );

  if (
    status === 451 ||
    /geo[- ]?(?:block|restrict)|not available in (?:your|this) (?:country|region)|not available in your location|outside (?:your|the) (?:country|region)|territor(?:y|ial) restriction/i.test(detail)
  ) {
    return {
      reason: "region",
      message: "This provider reports a regional restriction. Try another authorised feed or its official live service.",
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    /unauthori[sz]ed|forbidden|subscription required|access denied|sign[ -]?in required/i.test(detail)
  ) {
    return {
      reason: "access",
      message: "The provider denied access. An account, subscription or authorised player may be required.",
    };
  }

  if (status === 404 || status === 410 || /\bnot found\b|\bstream expired\b/i.test(detail)) {
    return {
      reason: "missing",
      message: "This feed is no longer available. Try an alternate source.",
    };
  }

  if (/unsupported (?:media|format|codec)|MEDIA_ERR_SRC_NOT_SUPPORTED|decoder/i.test(detail)) {
    return {
      reason: "format",
      message: "This device cannot decode the current feed. Try a compatible backup.",
    };
  }

  if (/\btimeout\b|\bnetwork error\b|\bfailed to fetch\b|\boffline\b/i.test(detail)) {
    return {
      reason: "network",
      message: "The connection to this feed failed. Check connectivity or try another source.",
    };
  }

  return {
    reason: "unknown",
    message: "The feed could not be started. Try another source or the broadcaster's official player.",
  };
};
