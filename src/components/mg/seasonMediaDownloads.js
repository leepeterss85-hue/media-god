import { isDebridReady } from "./debridLibraryUtils.js";

const normalise = (value) => String(value || "")
  .toLowerCase().replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const validEpisodeNumber = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 999 ? number : null;
};

export const seasonEpisodeNumbers = (episodes) =>
  [...new Set((Array.isArray(episodes) ? episodes : [])
    .map((episode) => validEpisodeNumber(episode?.episode_number))
    .filter(Boolean))]
    .sort((a, b) => a - b);

const episodeMentions = (filename) => {
  const text = String(filename || "");
  const matches = [
    ...text.matchAll(/(?:^|[^a-z0-9])s(\d{1,2})[ ._-]*e(\d{1,3})(?!\d)/gi),
    ...text.matchAll(/(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?!\d)/gi),
    ...text.matchAll(/(?:^|[^a-z0-9])season[ ._-]*(\d{1,2})[ ._-]*episode[ ._-]*(\d{1,3})(?!\d)/gi),
  ];
  return matches.map((match) => [Number(match[1]), Number(match[2])]);
};

export const fileMatchesSeasonEpisode = (filename, season, episode) => {
  const wantedSeason = Number(season);
  const wantedEpisode = validEpisodeNumber(episode);
  if (!Number.isInteger(wantedSeason) || wantedSeason <= 0 || !wantedEpisode) return false;
  const mentions = episodeMentions(filename);
  return mentions.length > 0 && mentions.every(([s, e]) =>
    s === wantedSeason && e === wantedEpisode
  );
};

const showMatchesTorrent = (filename, title) => {
  const wanted = normalise(title);
  const found = normalise(filename);
  return wanted.length >= 3 && (
    found === wanted || found.startsWith(wanted + " ") ||
    found.startsWith("the " + wanted + " ")
  );
};

export const readySeasonTorrentCandidates = (torrents, { title, season } = {}) => {
  const number = Number(season);
  if (!Number.isInteger(number) || number <= 0 || number > 99) return [];

  return (Array.isArray(torrents) ? torrents : [])
    .filter(isDebridReady)
    .filter((torrent) => {
      const name = String(torrent?.filename || torrent?.name || "");
      if (!showMatchesTorrent(name, title)) return false;
      const mentions = episodeMentions(name);
      if (mentions.length) return mentions.some(([s]) => s === number) &&
        mentions.every(([s]) => s === number);
      return new RegExp("(?:^|[^a-z0-9])s0?" + number + "(?!\\d)|season[ ._-]*0?" + number + "(?!\\d)", "i").test(name);
    });
};

export const candidatesForSeasonEpisode = (torrents, season, episode) => {
  const singles = [];
  const packs = [];
  for (const torrent of (Array.isArray(torrents) ? torrents : [])) {
    const name = String(torrent?.filename || torrent?.name || "");
    const mentions = episodeMentions(name);
    if (mentions.length) {
      if (fileMatchesSeasonEpisode(name, season, episode)) singles.push(torrent);
    } else {
      packs.push(torrent);
    }
  }
  return [...singles, ...packs];
};
