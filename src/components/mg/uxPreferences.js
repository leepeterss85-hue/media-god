const STORAGE_KEY = "mg:ux-preferences:v1";
export const UX_PREFERENCES_EVENT = "mg:ux-preferences-changed";

export const HOME_SECONDARY_SECTIONS = [
  { id: "continue-watching", label: "Continue Watching" },
  { id: "new-films", label: "New Films" },
  { id: "new-tv", label: "New TV Shows" },
  { id: "new-episodes", label: "New Episodes" },
  { id: "because-you-watched", label: "Because You Watched" },
  { id: "more-tv-today", label: "More TV Airing Today" },
  { id: "recently-watched", label: "Recently Watched" },
  { id: "watchlist", label: "My Watchlist" },
  { id: "favorites", label: "My Favorites" },
  { id: "trending", label: "Trending Now" },
  { id: "streaming-services", label: "Movies & TV by Streaming Service" },
  { id: "popular-movies", label: "Popular Movies" },
  { id: "popular-tv", label: "Popular TV Shows" },
  { id: "top-rated", label: "Top Rated Movies" },
];

export const DEFAULT_UX_PREFERENCES = {
  textScale: "standard",
  highContrast: false,
  reducedMotion: false,
  compactCards: false,
  homeHidden: [],
  homeOrder: HOME_SECONDARY_SECTIONS.map((section) => section.id),
};

const cleanOrder = (value) => {
  const allowed = new Set(HOME_SECONDARY_SECTIONS.map((section) => section.id));
  const supplied = Array.isArray(value)
    ? value.filter((id) => allowed.has(String(id)))
    : [];
  const missing = HOME_SECONDARY_SECTIONS
    .map((section) => section.id)
    .filter((id) => !supplied.includes(id));
  return [...supplied, ...missing];
};

export const normaliseUxPreferences = (value) => {
  const raw = value && typeof value === "object" ? value : {};
  const allowedHidden = new Set(HOME_SECONDARY_SECTIONS.map((section) => section.id));

  return {
    textScale: ["standard", "large", "extra-large"].includes(raw.textScale)
      ? raw.textScale
      : DEFAULT_UX_PREFERENCES.textScale,
    highContrast:
      typeof raw.highContrast === "boolean"
        ? raw.highContrast
        : DEFAULT_UX_PREFERENCES.highContrast,
    reducedMotion:
      typeof raw.reducedMotion === "boolean"
        ? raw.reducedMotion
        : DEFAULT_UX_PREFERENCES.reducedMotion,
    compactCards:
      typeof raw.compactCards === "boolean"
        ? raw.compactCards
        : DEFAULT_UX_PREFERENCES.compactCards,
    homeHidden: Array.isArray(raw.homeHidden)
      ? [...new Set(raw.homeHidden.map(String).filter((id) => allowedHidden.has(id)))]
      : [],
    homeOrder: cleanOrder(raw.homeOrder),
  };
};

export const readUxPreferences = () => {
  if (typeof window === "undefined") return DEFAULT_UX_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw
      ? normaliseUxPreferences(JSON.parse(raw))
      : DEFAULT_UX_PREFERENCES;
  } catch {
    return DEFAULT_UX_PREFERENCES;
  }
};

export const applyUxPreferences = (value) => {
  if (typeof document === "undefined") return normaliseUxPreferences(value);

  const prefs = normaliseUxPreferences(value);
  const root = document.documentElement;

  root.dataset.mgTextScale = prefs.textScale;
  root.classList.toggle("mg-high-contrast", prefs.highContrast);
  root.classList.toggle("mg-reduced-motion", prefs.reducedMotion);
  root.classList.toggle("mg-compact-cards", prefs.compactCards);

  return prefs;
};

export const writeUxPreferences = (value) => {
  const prefs = normaliseUxPreferences(value);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Local preferences are best effort.
    }

    applyUxPreferences(prefs);
    window.dispatchEvent(
      new CustomEvent(UX_PREFERENCES_EVENT, { detail: prefs })
    );
  }

  return prefs;
};

export const moveHomeSection = (preferences, sectionId, direction) => {
  const prefs = normaliseUxPreferences(preferences);
  const order = [...prefs.homeOrder];
  const index = order.indexOf(sectionId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
    return prefs;
  }

  [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
  return { ...prefs, homeOrder: order };
};

export const setHomeSectionVisible = (preferences, sectionId, visible) => {
  const prefs = normaliseUxPreferences(preferences);
  const hidden = new Set(prefs.homeHidden);

  if (visible) hidden.delete(sectionId);
  else hidden.add(sectionId);

  return { ...prefs, homeHidden: [...hidden] };
};
