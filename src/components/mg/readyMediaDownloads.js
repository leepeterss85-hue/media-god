import { isDebridReady } from "./debridLibraryUtils.js";

const words = value => String(value ?? "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const number = value => {
  const valueNumber = Number(value);
  return Number.isInteger(valueNumber) && valueNumber > 0 ? valueNumber : null;
};

/**
 * Only suggest existing completed files that match the selected movie or
 * exact TV episode. Never offer a loosely matched series pack or other title
 * as a one-click download from a detail page.
 */
export function readyMediaDownloads(torrents, { title, year, mediaType, season, episode } = {}) {
  const wanted = words(title);
  if (!wanted || wanted.length < 3) return [];
  const isEpisode = mediaType === "tv";
  const wantedSeason = number(season);
  const wantedEpisode = number(episode);
  if (isEpisode && (!wantedSeason || !wantedEpisode)) return [];

  return (Array.isArray(torrents) ? torrents : [])
    .filter(isDebridReady)
    .filter(item => {
      const filename = String(item?.filename || item?.name || "");
      const cleanName = words(filename);
      const expectedTitle = cleanName === wanted ||
        cleanName.startsWith(wanted + " ") ||
        cleanName.startsWith("the " + wanted + " ");
      if (!expectedTitle) return false;
      if (isEpisode) {
        const episodes = [...filename.matchAll(/(?:^|[^a-z0-9])s(\d{1,2})[ ._-]*e(\d{1,3})(?!\d)|(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?!\d)/gi)];
        return episodes.some(match =>
          Number(match[1] || match[3]) === wantedSeason &&
          Number(match[2] || match[4]) === wantedEpisode
        );
      }
      // Do not offer a TV episode file for a film with the same title.
      if (/(?:^|[^a-z0-9])s\d{1,2}[ ._-]*e\d{1,3}(?!\d)/i.test(filename)) return false;
      const requestedYear = number(year);
      if (requestedYear && requestedYear >= 1900 && requestedYear <= 2100) {
        const years = [...filename.matchAll(/(?:^|[^\d])(19\d{2}|20\d{2})(?!\d)/g)]
          .map(match => Number(match[1]));
        if (years.length && !years.includes(requestedYear)) return false;
      }
      return true;
    })
    .slice(0, 12);
}
