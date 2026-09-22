import { detectMediaEdition } from "@/components/mg/mediaEdition";

const TRUSTED_HISTORY_KEY = "mg:trusted-cached-sources:v1";
const SUCCESSFUL_PLAYBACK_HISTORY_KEY =
  "mg:successful-playback-sources:v1";
const TRUSTED_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TRUSTED_HISTORY_LIMIT = 300;

const EDITION_ORDER = [
  "standard",
  "theatrical",
  "directors_cut",
  "extended",
  "uncut",
  "unrated",
  "final_cut",
  "special_edition",
  "ultimate_edition",
  "imax",
  "alternate",
  "assembly_cut",
  "international_cut",
  "roadshow",
  "redux",
  "anniversary",
  "collectors_edition",
  "broadcast_cut",
  "restored",
  "noir",
];

const clean = (value) => String(value || "").trim();

const magnetHash = (value) =>
  clean(value)
    .match(/btih:([a-f0-9]{40}|[a-f0-9]{64})/i)?.[1]
    ?.toLowerCase() || "";

export const trustedSourceFingerprint = (item) => {
  const hash = clean(
    item?.infoHash ||
      item?.info_hash ||
      item?.hash ||
      magnetHash(item?.richMagnet) ||
      magnetHash(item?.magnet) ||
      magnetHash(item?.src) ||
      magnetHash(item?.url)
  ).toLowerCase();

  if (hash) return `hash:${hash}`;

  const url = clean(item?.src || item?.url);
  if (url) return `url:${url}`;

  return [
    "label",
    clean(item?.addon || item?.sourceName || item?.source),
    clean(item?.label || item?.name || item?.title),
  ].join(":");
};

const readHistoryForKey = (key) => {
  if (typeof window === "undefined") return {};

  try {
    const raw = JSON.parse(window.localStorage.getItem(key) || "{}");
    const now = Date.now();
    const fresh = Object.entries(raw && typeof raw === "object" ? raw : {})
      .filter(([, value]) => {
        const verifiedAt = Number(value?.verifiedAt || 0);
        return verifiedAt > 0 && now - verifiedAt < TRUSTED_HISTORY_TTL_MS;
      })
      .sort((a, b) => Number(b[1]?.verifiedAt || 0) - Number(a[1]?.verifiedAt || 0))
      .slice(0, TRUSTED_HISTORY_LIMIT);

    const cleaned = Object.fromEntries(fresh);
    window.localStorage.setItem(key, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return {};
  }
};

const readHistory = () => readHistoryForKey(TRUSTED_HISTORY_KEY);
const readSuccessfulPlaybackHistory = () =>
  readHistoryForKey(SUCCESSFUL_PLAYBACK_HISTORY_KEY);

export const recordTrustedCachedSource = (item) => {
  if (typeof window === "undefined" || !item) return;

  const fingerprint = trustedSourceFingerprint(item);
  if (!fingerprint || fingerprint === "label::") return;

  try {
    const history = readHistory();
    const edition = detectMediaEdition(item);
    history[fingerprint] = {
      verifiedAt: Date.now(),
      edition: edition.value,
      label: clean(item?.label || item?.name || item?.title),
    };

    const trimmed = Object.fromEntries(
      Object.entries(history)
        .sort((a, b) => Number(b[1]?.verifiedAt || 0) - Number(a[1]?.verifiedAt || 0))
        .slice(0, TRUSTED_HISTORY_LIMIT)
    );

    window.localStorage.setItem(TRUSTED_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Trust history is an optional device-local optimisation.
  }
};

export const forgetSuccessfulPlaybackSource = (item) => {
  if (typeof window === "undefined" || !item) return;

  const fingerprint = trustedSourceFingerprint(item);
  if (!fingerprint || fingerprint === "label::") return;

  try {
    const history = readSuccessfulPlaybackHistory();

    if (!(fingerprint in history)) {
      return;
    }

    delete history[fingerprint];

    window.localStorage.setItem(
      SUCCESSFUL_PLAYBACK_HISTORY_KEY,
      JSON.stringify(history)
    );
  } catch {
    // Playback-history cleanup is best effort.
  }
};

export const recordSuccessfulPlaybackSource = (
  item,
  {
    languageRank = 3,
  } = {}
) => {
  if (typeof window === "undefined" || !item) return;

  const fingerprint = trustedSourceFingerprint(item);
  if (!fingerprint || fingerprint === "label::") return;

  try {
    const history = readSuccessfulPlaybackHistory();
    history[fingerprint] = {
      verifiedAt: Date.now(),
      languageRank: Number(languageRank ?? 3),
      label: clean(item?.label || item?.name || item?.title),
    };

    const trimmed = Object.fromEntries(
      Object.entries(history)
        .sort((a, b) => Number(b[1]?.verifiedAt || 0) - Number(a[1]?.verifiedAt || 0))
        .slice(0, TRUSTED_HISTORY_LIMIT)
    );

    window.localStorage.setItem(
      SUCCESSFUL_PLAYBACK_HISTORY_KEY,
      JSON.stringify(trimmed)
    );
  } catch {
    // Successful playback history is only an optional local optimisation.
  }
};

const historyScore = (item, history) => {
  const record = history[trustedSourceFingerprint(item)];
  if (!record) return 0;

  const ageMs = Math.max(0, Date.now() - Number(record?.verifiedAt || 0));
  return Math.max(1, TRUSTED_HISTORY_TTL_MS - ageMs);
};

const editionRank = (value) => {
  const index = EDITION_ORDER.indexOf(String(value || "standard"));
  return index >= 0 ? index : EDITION_ORDER.length + 1;
};

const comparePoolEntries = (left, right, history) =>
  historyScore(right.item, history) - historyScore(left.item, history) ||
  Number(right.compatibility || 0) - Number(left.compatibility || 0) ||
  Number(right.resolution || 0) - Number(left.resolution || 0) ||
  Number(Boolean(right.trackerRich)) - Number(Boolean(left.trackerRich)) ||
  Number(right.reportedSeeders || 0) - Number(left.reportedSeeders || 0) ||
  Number(left.index || 0) - Number(right.index || 0);

export const markTrustedCachedPools = (entries) => {
  const list = Array.isArray(entries) ? entries : [];
  const history = readHistory();
  const successfulPlaybackHistory =
    readSuccessfulPlaybackHistory();
  const groups = new Map();

  list.forEach((entry) => {
    const edition = detectMediaEdition(entry?.item);
    entry.editionValue = edition.value;
    entry.editionLabel = edition.label;

    if (!entry?.cached) return;

    const key = edition.value || "standard";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });

  const trusted = new Set();

  /*
   * There is deliberately no per-edition ceiling here. Every source already
   * confirmed cached/ready remains trusted and eligible for the dropdown.
   */
  groups.forEach((group) => {
    group
      .slice()
      .sort((a, b) => comparePoolEntries(a, b, history))
      .forEach((entry) => trusted.add(entry.index));
  });

  return list.map((entry) => {
    const playbackRecord =
      successfulPlaybackHistory[
        trustedSourceFingerprint(entry?.item)
      ] || null;

    return {
      ...entry,
      trustedCached: Boolean(entry?.cached && trusted.has(entry.index)),
      successfulPlayback: Boolean(playbackRecord),
      successfulPlaybackLanguageRank:
        playbackRecord
          ? Number(playbackRecord?.languageRank ?? 3)
          : 3,
      successfulPlaybackAt:
        playbackRecord
          ? Number(playbackRecord?.verifiedAt || 0)
          : 0,
    };
  });
};

export const prioritiseTrustedCachedPools = (entries) => {
  const list = markTrustedCachedPools(entries);
  const history = readHistory();

  return list.slice().sort((a, b) => {
    if (a.trustedCached !== b.trustedCached) {
      return a.trustedCached ? -1 : 1;
    }

    if (a.trustedCached && b.trustedCached) {
      return (
        Number(Boolean(b.successfulPlayback)) -
          Number(Boolean(a.successfulPlayback)) ||
        Number(a.successfulPlaybackLanguageRank ?? 3) -
          Number(b.successfulPlaybackLanguageRank ?? 3) ||
        Number(b.successfulPlaybackAt || 0) -
          Number(a.successfulPlaybackAt || 0) ||
        editionRank(a.editionValue) - editionRank(b.editionValue) ||
        comparePoolEntries(a, b, history)
      );
    }

    return Number(a.index || 0) - Number(b.index || 0);
  });
};
