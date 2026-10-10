const idText = (value) => String(value ?? "").trim();

const validType = (media) => {
  const type = idText(media?.mediaType).toLowerCase();
  return ["movie", "tv", "episode"].includes(type) ? type : "";
};

/**
 * Open the public OnlyFlix title page rather than its single-player embed.
 * The public title page is where OnlyFlix exposes its available server choices.
 *
 * OnlyFlix uses human-readable title slugs (for example /obsession/), so use
 * the catalogue title instead of an IMDb/TMDb embed identifier. For TV, open
 * the series page so its own episode and server controls remain available.
 */
export const buildOnlyFlixEmbedUrl = (media = {}) => {
  const type = validType(media);
  const title = idText(media?.title);
  if (!type || !title) return "";

  const withoutYear = title.replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim();
  const slug = withoutYear
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) return "";
  return `https://onlyflix.to/${slug}/`;
};
