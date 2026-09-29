const plain = (value) => String(value ?? "").trim();

export const normaliseReviewTitle = (value) =>
  plain(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export const sameTitle = (candidate, titles) => {
  const key = normaliseReviewTitle(candidate);
  return Boolean(
    key &&
      titles.some((title) => normaliseReviewTitle(title) === key)
  );
};

export const nearRelease = (releaseYear, date, ongoingSeries = false) => {
  const year = Number(releaseYear);
  const published = Number(String(date ?? "").slice(0, 4));
  return (
    Number.isInteger(year) &&
    year >= 1888 &&
    Number.isInteger(published) &&
    (ongoingSeries
      ? published >= year && published <= new Date().getUTCFullYear() + 1
      : Math.abs(published - year) <= 2)
  );
};

export const trustedReviewUrl = (value, domain) => {
  try {
    const url = new URL(plain(value));
    if (url.protocol === "http:") url.protocol = "https:";
    return (
      url.protocol === "https:" &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    )
      ? url.toString()
      : "";
  } catch {
    return "";
  }
};

export const guardianReviewTitle = (value) => {
  const match = plain(value).match(
    /^(.+?)(?:\s+(?:season|series)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))?\s+review\s*(?:[–—:|-]|$)/i
  );
  return match?.[1]?.trim() ?? "";
};

export const cleanReviewText = (value, limit = 220) =>
  plain(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);

export const selectNytReviews = (rows, titles, releaseYear) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) =>
      sameTitle(row?.display_title, titles) &&
      nearRelease(releaseYear, row?.opening_date || row?.publication_date)
    )
    .map((row) => ({
      id: `nyt:${row?.link?.url}`,
      publisher: "The New York Times",
      headline: cleanReviewText(row?.headline || `${row?.display_title} review`, 160),
      author: cleanReviewText(row?.byline, 80),
      excerpt: cleanReviewText(row?.summary_short || row?.capsule_review),
      date: plain(row?.publication_date).slice(0, 10),
      url: trustedReviewUrl(row?.link?.url, "nytimes.com"),
    }))
    .filter((row) => row.url && row.headline)
    .slice(0, 2);

export const selectGuardianReviews = (rows, titles, releaseYear, ongoingSeries = false) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) =>
      sameTitle(guardianReviewTitle(row?.webTitle), titles) &&
      nearRelease(releaseYear, row?.webPublicationDate, ongoingSeries)
    )
    .map((row) => ({
      id: `guardian:${row?.id}`,
      publisher: "The Guardian",
      headline: cleanReviewText(row?.webTitle, 160),
      author: cleanReviewText(row?.fields?.byline, 80),
      excerpt: cleanReviewText(row?.fields?.trailText),
      date: plain(row?.webPublicationDate).slice(0, 10),
      url: trustedReviewUrl(row?.webUrl, "theguardian.com"),
    }))
    .filter((row) => row.url && row.headline)
    .slice(0, 2);
