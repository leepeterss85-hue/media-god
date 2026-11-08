/**
 * Order catalogue results by the dates TMDB actually supplies.
 * A film's release or digital-release date and a show's first-air date are
 * NOT the day a subscription provider first added a title.
 */
const validDate = value => {
  const date = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(date + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date ? date : "";
};

export const catalogueReleaseDate = item =>
  validDate(item?.digital_release_date) ||
  validDate(item?.release_date) ||
  validDate(item?.first_air_date) ||
  validDate(item?.air_date) ||
  "";

export const formatCatalogueDate = item => {
  const date = catalogueReleaseDate(item);
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : "";
};

export const sortCatalogueNewestFirst = (items = []) =>
  [...items].sort((a, b) => {
    const da = catalogueReleaseDate(a);
    const db = catalogueReleaseDate(b);
    if (da !== db) return db.localeCompare(da);
    return Number(b?.popularity || 0) - Number(a?.popularity || 0);
  });
