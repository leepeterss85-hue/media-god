import { base44 } from "@/api/base44Client";
import { episodeSourceMatchesRequest } from "./episodeSourcePolicy.js";
import { hasUnusableEpisodeAudio } from "./episodeAudio.js";

/* Build-time pilot opt-in; never embed the server endpoint or secret in Vite. */
export const vylaTvPilotEnabled = () =>
  String(import.meta.env.VITE_MG_VYLA_TV_PILOT_ENABLED || "").toLowerCase() === "true";

const positive = v => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const validateVylaPilotRows = (rows, { season, episode } = {}) =>
  (Array.isArray(rows) ? rows : [])
    .filter(row =>
      row?.episodeResolver === "vyla" &&
      row?.vylaPilotCandidate === true &&
      row?.type === "url" &&
      /^https:\/\//i.test(String(row?.src || row?.url || "")) &&
      episodeSourceMatchesRequest(row, { season, episode }) &&
      !hasUnusableEpisodeAudio(row)
    )
    .slice(0, 5);

export const fetchVylaEpisodePilot = async ({ tmdbId, season, episode }) => {
  const id = positive(tmdbId), s = positive(season), e = positive(episode);
  if (!vylaTvPilotEnabled() || !id || !s || !e) {
    return { status: "DISABLED", streams: [] };
  }
  try {
    const response = await base44.functions.invoke("vylaEpisodePilot", {
      tmdb_id: id, season: s, episode: e,
    });
    const data = response?.data ?? response ?? {};
    return {
      status: String(data.status || "UNKNOWN"),
      streams: validateVylaPilotRows(data.streams, { season: s, episode: e }),
    };
  } catch {
    return { status: "FAILED", streams: [] };
  }
};
