import { base44 } from "@/api/base44Client";

export const PROFILE_CHANGED_EVENT = "mg:household-profile-changed";
const PROFILES_KEY = "mg:household-profiles:v1";
const ACTIVE_KEY = "mg:household-active-profile:v1";
const MAIN = { id: "main", name: "Main" };
const LIBRARIES = ["WatchlistItem", "Favorite", "ContinueWatching"];

const storage = () => {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
};

export const readHouseholdProfiles = () => {
  try {
    const parsed = JSON.parse(storage()?.getItem(PROFILES_KEY) || "[]");
    const valid = Array.isArray(parsed) ? parsed.filter(profile =>
      profile && /^[a-z0-9-]{6,50}$/i.test(profile.id) &&
      typeof profile.name === "string" && profile.name.trim()
    ).slice(0, 5) : [];
    return [MAIN, ...valid.filter(profile => profile.id !== MAIN.id)];
  } catch { return [MAIN]; }
};

export const activeHouseholdProfileId = () => {
  const selected = storage()?.getItem(ACTIVE_KEY) || MAIN.id;
  return readHouseholdProfiles().some(profile => profile.id === selected)
    ? selected : MAIN.id;
};
export const activeHouseholdProfile = () =>
  readHouseholdProfiles().find(p => p.id === activeHouseholdProfileId()) || MAIN;

const notify = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT, {
      detail: { profileId: activeHouseholdProfileId() },
    }));
  }
};
export const selectHouseholdProfile = id => {
  if (!readHouseholdProfiles().some(profile => profile.id === id)) return false;
  storage()?.setItem(ACTIVE_KEY, id);
  notify();
  return true;
};
export const createHouseholdProfile = name => {
  const clean = String(name || "").trim().slice(0, 24);
  if (!clean) return null;
  const current = readHouseholdProfiles();
  if (current.length >= 6) return null;
  if (current.some(p => p.name.toLowerCase() === clean.toLowerCase())) return null;
  const id = "p-" + (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const next = { id, name: clean };
  storage()?.setItem(PROFILES_KEY, JSON.stringify([...current.slice(1), next]));
  selectHouseholdProfile(id);
  return next;
};
export const profileOwnsRow = (row, profileId = activeHouseholdProfileId()) =>
  (String(row?.profile_id || "main") === profileId);

/**
 * Same-account household preferences, not separate authenticated identities.
 * The Base44 entities still enforce per-account RLS. We filter everything
 * before displaying it, scope new writes and preserve all legacy rows as Main.
 * The household profile names/IDs are local to each device.
 */
const scopedEntity = name => {
  const target = base44.entities[name];
  return {
    list: async (...args) => (await target.list(...args) || [])
      .filter(row => profileOwnsRow(row)),
    filter: async (criteria = {}, ...rest) => (await target.filter(criteria, ...rest) || [])
      .filter(row => profileOwnsRow(row)),
    create: async row => target.create({ ...row, profile_id: activeHouseholdProfileId() }),
    update: (...args) => target.update(...args),
    delete: (...args) => target.delete(...args),
    subscribe: (...args) => target.subscribe(...args),
  };
};
export const profiledLibrary = Object.fromEntries(
  LIBRARIES.map(name => [name, scopedEntity(name)])
);
