const clean = (value) => String(value || "").trim();

const AUDIO_FILE_RE = /\.(?:mp3|flac|wav|m4a|m4b|ogg|opus|wma|aac)(?:$|[?#])/i;
const AUDIO_ONLY_RE =
  /\b(?:soundtrack|original[\s._-]+soundtrack|ost|audio[\s._-]*only|audiobook|audio[\s._-]*commentary|commentary[\s._-]*track|isolated[\s._-]*score|score[\s._-]*album)\b/i;
const VIDEO_EVIDENCE_RE =
  /\b(?:2160p|1440p|1080p|720p|576p|480p|4k|uhd|bluray|blu[\s._-]*ray|bdrip|brrip|web[\s._-]*dl|webrip|remux|hdtv|x264|x265|h264|h265|hevc|av1|avc)\b|\.(?:mkv|mp4|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts|mts|vob|wmv)(?:$|[?#])/i;

const SEQUEL_MARKERS = new Set([
  "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
]);

const identityText = (item) =>
  [
    item?.label,
    item?.name,
    item?.title,
    item?.description,
    item?.behaviorHints?.filename,
    item?.behavior_hints?.filename,
    item?.filename,
    item?.path,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

const releaseNameText = (item) =>
  clean(
    item?.behaviorHints?.filename ||
      item?.behavior_hints?.filename ||
      item?.filename ||
      item?.path ||
      item?.title ||
      item?.label ||
      item?.name
  );

const strictReleaseFilenameText = (item) =>
  clean(
    item?.behaviorHints?.filename ||
      item?.behavior_hints?.filename ||
      item?.filename ||
      item?.path
  );

const RELEASE_BOUNDARY_MARKERS = new Set([
  "proper", "repack", "rerip", "internal", "extended", "unrated",
  "theatrical", "imax", "remastered", "remaster", "directors", "director",
  "cut", "final", "complete", "hybrid", "multi", "dual", "dubbed",
  "english", "eng", "en", "subbed", "subs", "bluray", "blu", "ray",
  "bdrip", "brrip", "web", "webrip", "webdl", "hdtv", "remux",
  "dvdrip", "hdrip", "uhd", "hdr", "hdr10", "dv", "dolby", "vision",
  "atmos", "aac", "ac3", "eac3", "dd", "ddp", "dts", "truehd",
  "flac", "opus", "x264", "x265", "h264", "h265", "hevc", "av1",
  "avc", "2160p", "1440p", "1080p", "720p", "576p", "480p",
]);

const isReleaseBoundaryToken = (value) =>
  !value ||
  /^(?:19|20)\d{2}$/.test(value) ||
  RELEASE_BOUNDARY_MARKERS.has(value);

const tokens = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const findContiguous = (haystack, needle) => {
  if (needle.length === 0 || haystack.length < needle.length) return -1;

  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let matches = true;

    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }

    if (matches) return index;
  }

  return -1;
};

const titleTokenSets = (title, alternateTitles = []) => {
  const seen = new Set();

  return [
    title,
    ...(Array.isArray(alternateTitles) ? alternateTitles : []),
  ]
    .map(clean)
    .filter(Boolean)
    .map((value) => ({
      value,
      tokens: tokens(value),
    }))
    .filter(({ tokens: valueTokens }) => valueTokens.length > 0)
    .filter(({ tokens: valueTokens }) => {
      const key = valueTokens.join(" ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.tokens.length - left.tokens.length);
};

const bestTitleTokenMatch = (haystack, candidateTokenSets) => {
  for (const candidate of candidateTokenSets) {
    const index = findContiguous(haystack, candidate.tokens);

    if (index >= 0) {
      return {
        ...candidate,
        index,
      };
    }
  }

  return null;
};

const explicitYears = (value) =>
  Array.from(
    clean(value).matchAll(/\b(?:19|20)\d{2}\b/g),
    (match) => match[0]
  );

export const sourceIdentityMismatchReason = (
  item,
  {
    title = "",
    year = "",
    alternateYears = [],
    alternateTitles = [],
    mediaType = "movie",
  } = {}
) => {
  if (!item) return "missing_source";

  const requestedTitle = clean(title);
  if (!requestedTitle) return "";

  const text = identityText(item);
  const releaseName = releaseNameText(item);

  /*
   * Soundtracks/commentary/audio-only downloads are not playable movie
   * alternatives. Keep normal movie releases that merely mention an audio
   * codec, but reject a naked "Audio" release when it has no video evidence.
   */
  if (
    AUDIO_FILE_RE.test(releaseName) ||
    AUDIO_ONLY_RE.test(releaseName) ||
    (/\baudio\b/i.test(releaseName) && !VIDEO_EVIDENCE_RE.test(releaseName))
  ) {
    return "audio_only_release";
  }

  const isTv =
    String(mediaType || "movie").toLowerCase() === "tv";

  const allowedYears = new Set(
    [
      clean(year),
      ...(Array.isArray(alternateYears) ? alternateYears : []).map(clean),
    ].filter((value) => /^\d{4}$/.test(value))
  );

  /*
   * A TV request's year is normally the SERIES premiere year, not the episode
   * release year. Long-running shows such as The Simpsons (1989-) legitimately
   * have current-season files carrying 2025/2026 in their release names.
   * Rejecting those years removes valid episode sources and can leave only the
   * show-level trailer fallback. Movie identity still keeps the strict year
   * protection because a movie's requested year identifies that exact title.
   */
  if (!isTv && allowedYears.size > 0) {
    const foundYears = explicitYears(text);

    /*
     * If the release names a year, it must be this title's requested year (or
     * an explicitly supplied alternate release year). A 2002/2004 franchise
     * torrent must never satisfy a 2026 request just because the title prefix
     * happens to match.
     */
    if (
      foundYears.length > 0 &&
      !foundYears.some((candidate) => allowedYears.has(candidate))
    ) {
      return "conflicting_release_year";
    }
  }

  if (!isTv) {
    const acceptedTitleTokens = titleTokenSets(
      requestedTitle,
      alternateTitles
    );
    const releaseTokens = tokens(releaseName);
    const releaseTitleMatch = bestTitleTokenMatch(
      releaseTokens,
      acceptedTitleTokens
    );
    const strictFilename = strictReleaseFilenameText(item);

    /*
     * A real torrent/file filename is stronger evidence than an addon display
     * label. Once we have that filename, it must actually contain the requested
     * movie title OR one of the title's verified alternate release names.
     * Year/sequel/suffix checks still run below, so an alias is not a broad
     * fuzzy-title bypass.
     */
    if (strictFilename && acceptedTitleTokens.length > 0) {
      const strictTokens = tokens(strictFilename);
      const strictTitleMatch = bestTitleTokenMatch(
        strictTokens,
        acceptedTitleTokens
      );

      if (!strictTitleMatch) {
        return "conflicting_release_title";
      }
    }

    if (releaseTitleMatch) {
      const matchedTokens = releaseTitleMatch.tokens;
      const titleIndex = releaseTitleMatch.index;
      const requestedEndsInSequelMarker = SEQUEL_MARKERS.has(
        matchedTokens[matchedTokens.length - 1]
      );
      const nextToken = releaseTokens[titleIndex + matchedTokens.length] || "";

      /*
       * "Resident Evil" must not match "Resident Evil 2". The same rule helps
       * other numbered franchises while still allowing titles whose canonical
       * name itself ends in the sequel number.
       */
      if (
        !requestedEndsInSequelMarker &&
        SEQUEL_MARKERS.has(nextToken)
      ) {
        return "conflicting_sequel_number";
      }

      /*
       * Also reject named franchise siblings such as
       * "Resident Evil Apocalypse" or "Resident Evil Welcome to Raccoon City".
       * Normal release metadata begins with a year, edition, quality, source,
       * language or codec marker; an unexpected lexical token immediately after
       * the requested title is evidence that this is a different movie.
       */
      if (
        !requestedEndsInSequelMarker &&
        nextToken &&
        !isReleaseBoundaryToken(nextToken)
      ) {
        return "conflicting_title_suffix";
      }
    }
  }

  return "";
};

export const sourceMatchesRequestedIdentity = (item, request = {}) =>
  sourceIdentityMismatchReason(item, request) === "";

export const filterSourcesForRequestedIdentity = (items, request = {}) =>
  (Array.isArray(items) ? items : []).filter((item) =>
    sourceMatchesRequestedIdentity(item, request)
  );
