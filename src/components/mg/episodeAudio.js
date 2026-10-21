const clean = value => String(value ?? "").trim().toLowerCase().replace(/_/g, "-");
const commentary = /commentary|audio[ ._-]*description|descriptive|visually[ ._-]*impaired/i;
const english = /(?:^|[^a-z])(?:en|eng|english)(?:-[a-z]{2})?(?=$|[^a-z])/i;
const unknown = /^(?:und|unknown|original|default|auto|n\/a|none|null|unspecified|unlabeled)$/i;
const multi = /^(?:mul)$|\b(?:multi|dual)(?:[ -]?audio)?\b/i;

const trackLabel = track => [track?.name, track?.label, track?.title, track?.description,
  track?.attrs?.NAME].filter(Boolean).join(" ");
const trackLanguage = track => clean(track?.language_iso || track?.language ||
  track?.lang_iso || track?.lang || track?.attrs?.LANGUAGE || "");
const trackIsCommentary = track => commentary.test(trackLabel(track));

export function isEnglishMainTrack(track) {
  if (trackIsCommentary(track)) return false;
  const language = trackLanguage(track);
  // A provider may call a French track "English". An actual language code
  // wins; names are useful only when the language metadata is unavailable.
  if (language && !unknown.test(language) && !multi.test(language)) {
    return english.test(language);
  }
  return english.test(trackLabel(track));
}

// Actual track metadata takes precedence over a provider's language label.
// Unknown is deliberately distinct from verified English.
export function episodeAudioState(source) {
  const tracks = [source?.mediaInfo?.audio_tracks, source?.media_info?.audio_tracks,
    source?.audioTracks, source?.audio_tracks].find(value => Array.isArray(value) && value.length);
  if (Array.isArray(tracks) && tracks.length) {
    if (tracks.some(isEnglishMainTrack)) return "english";
    const main = tracks.filter(track => !trackIsCommentary(track));
    if (!main.length) return "commentary";
    if (main.every(track => {
      const language = trackLanguage(track);
      return language && !unknown.test(language) && !multi.test(language);
    })) return "foreign";
    return "unknown";
  }
  const label = [source?.filename, source?.name, source?.description].filter(Boolean).join(" ");
  if (commentary.test(label)) return "commentary";
  const audio = [source?.audioLanguage, source?.audio_language, source?.audioLanguages, source?.audio_languages]
    .flat().filter(value => value != null && String(value).trim());
  const structured = (audio.length ? audio : [source?.language, source?.languages, source?.lang].flat())
    .filter(value => value != null && String(value).trim()).map(clean);
  if (structured.some(value => english.test(value))) return "english";
  if (structured.some(value => multi.test(value))) return "multi";
  if (structured.some(value => !unknown.test(value))) return "foreign";
  if (english.test(label)) return "english";
  if (multi.test(label)) return "multi";
  if (/\b(?:french|spanish|german|italian|russian|hindi|japanese|korean|chinese|portuguese|truefrench|vostfr|rus|spa|fra|deu|hin|jpn|kor)\b/i.test(label)) return "foreign";
  return "unknown";
}

export const episodeAudioRank = source =>
  ({ english: 0, multi: 1, unknown: 2, foreign: 3, commentary: 4 })[episodeAudioState(source)];

export const hasUnusableEpisodeAudio = source =>
  ["foreign", "commentary"].includes(episodeAudioState(source));

// Return automatic candidates without losing the full pool held by callers
// for manual source selection. Stable ordering remains within each audio tier.
export const episodeAutoplayCandidates = sources => (Array.isArray(sources) ? sources : [])
  .map((source, index) => ({ source, index }))
  .filter(({ source }) => source && !source.diagnostic && source.type !== "status" &&
    !hasUnusableEpisodeAudio(source))
  .sort((a, b) => episodeAudioRank(a.source) - episodeAudioRank(b.source) || a.index - b.index)
  .map(({ source }) => source);
