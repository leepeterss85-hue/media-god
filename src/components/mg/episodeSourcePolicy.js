import { hasUnusableEpisodeAudio } from "./episodeAudio.js";

const positive = value => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export const isFlixQuestEpisodeSource = item =>
  item?.flixQuestSource === true ||
  item?.episodeResolver === "flixquest" ||
  /^flixquest(?::|-)/i.test(String(item?.provider || item?.id || ""));

const episodeFileName = item => String(
  item?.behaviorHints?.filename ||
  item?.behavior_hints?.filename ||
  item?.filename ||
  item?.path ||
  item?.name ||
  item?.title ||
  item?.label ||
  ""
);

/*
 * Exact episode evidence is important for torrent alternatives, but series
 * packs often say "S01" without naming a single episode. Keep such packs
 * selectable so Real-Debrid's file picker can identify the requested file.
 * Never infer episode identity from the show's premiere year.
 */
export function episodeSourceMismatchReason(item, { season, episode } = {}) {
  if (!item) return "missing_source";
  const wantedSeason = positive(season);
  const wantedEpisode = positive(episode);
  if (!wantedSeason || !wantedEpisode) return "";

  const declaredSeason = positive(item.season ?? item.season_number ?? item.rdSeason);
  const declaredEpisode = positive(item.episode ?? item.episode_number ?? item.rdEpisode);
  if (declaredSeason && declaredSeason !== wantedSeason) return "wrong_season";
  if (declaredEpisode && declaredEpisode !== wantedEpisode) return "wrong_episode";

  const name = episodeFileName(item);
  const identified = [];
  for (const match of name.matchAll(/(?:^|[^a-z0-9])s(\d{1,2})[ ._-]*e(\d{1,3})(?:[ ._-]*e(\d{1,3}))?/gi)) {
    const from = Number(match[2]);
    const to = match[3] ? Number(match[3]) : from;
    identified.push({ season: Number(match[1]), from: Math.min(from, to), to: Math.max(from, to) });
  }
  for (const match of name.matchAll(/(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?!\d)/gi)) {
    const number = Number(match[2]);
    identified.push({ season: Number(match[1]), from: number, to: number });
  }
  // An S01E01-E04 release is a declared episode range, not a wrong E01.
  const range = /(?:^|[^a-z0-9])s(\d{1,2})[ ._-]*e(\d{1,3})\s*[-–]\s*(?:e)?(\d{1,3})(?!\d)/i.exec(name);
  if (range) {
    const start = Number(range[2]);
    const end = Number(range[3]);
    identified.push({
      season: Number(range[1]),
      from: Math.min(start, end),
      to: Math.max(start, end),
    });
  }
  if (identified.length && !identified.some(candidate =>
    candidate.season === wantedSeason &&
    wantedEpisode >= candidate.from && wantedEpisode <= candidate.to
  )) return "wrong_episode_release";

  return "";
}

export const episodeSourceMatchesRequest = (item, context = {}) =>
  episodeSourceMismatchReason(item, context) === "";

/*
 * Stremio-compatible addon results (including cached/debrid alternatives)
 * take precedence for TV. FlixQuest is a direct-stream BACKUP only.
 * Do not hide manual choices or promote foreign/commentary-only audio.
 * The legacy export name is retained for existing playback call sites.
 */
export function flixQuestFirstEpisodeSources(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const pilot = list.filter(item =>
    item?.episodeResolver === "vyla" &&
    item?.vylaPilotCandidate === true &&
    !hasUnusableEpisodeAudio(item) &&
    /^https?:\/\//i.test(String(item?.src || item?.url || ""))
  );
  const primary = list.filter(item =>
    !pilot.includes(item) &&
    !isFlixQuestEpisodeSource(item) && !hasUnusableEpisodeAudio(item)
  );
  const backup = list.filter(item =>
    isFlixQuestEpisodeSource(item) && !hasUnusableEpisodeAudio(item) &&
    /^https?:\/\//i.test(String(item?.src || item?.url || ""))
  );
  const others = list.filter(item =>
    !pilot.includes(item) && !primary.includes(item) && !backup.includes(item));
  return [...pilot, ...primary, ...backup, ...others];
}

/** A search result is not a playable episode just because one row was found. */
export function hasUsableEpisodeAddonSource(sources, context = {}) {
  return (Array.isArray(sources) ? sources : []).some(item => {
    if (!item || item.diagnostic || item.type === "status" ||
        isFlixQuestEpisodeSource(item) || hasUnusableEpisodeAudio(item) ||
        !episodeSourceMatchesRequest(item, context)) return false;
    const url = String(item.src || item.url || item.magnet || item.magnetLink || "").trim();
    return /^(?:https?:\/\/|magnet:)/i.test(url) ||
      /^[a-f\d]{40}$/i.test(String(item.infoHash || item.info_hash || ""));
  });
}
