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

// Share the catalogue of household profiles through the signed-in account.
// Device-specific selection is deliberately retained to avoid switching a
// currently playing stream on another device.
export const mergeAccountHouseholdProfiles = remote => {
  if (!Array.isArray(remote)) return readHouseholdProfiles();
  const seen = new Set();
  const valid = [...remote, ...readHouseholdProfiles().slice(1)].filter(p => {
    if (!p || p.id === 'main' || !/^[a-z0-9-]{6,50}$/i.test(p.id) ||
        typeof p.name !== 'string' || !p.name.trim() || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  }).slice(0, 5);
  storage()?.setItem(PROFILES_KEY, JSON.stringify(valid));
  return [MAIN, ...valid];
};

export const syncHouseholdProfilesFromAccount = async () => {
  const user = await base44.auth.me();
  const remote = user?.preferences?.mediaGodHouseholdProfiles;
  return Array.isArray(remote) ? mergeAccountHouseholdProfiles(remote) : readHouseholdProfiles();
};

export const saveHouseholdProfilesToAccount = async () => {
  const user = await base44.auth.me();
  if (!user) throw new Error('Sign in to sync profiles');
  const remote = user?.preferences?.mediaGodHouseholdProfiles;
  const merged = mergeAccountHouseholdProfiles(Array.isArray(remote) ? remote : []);
  await base44.auth.updateMe({preferences: {
    ...(user.preferences || {}), mediaGodHouseholdProfiles: merged.slice(1),
  }});
  return merged;
};

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
 * Profile names/IDs are shared via account preferences when synced;
 * active selection remains local to each device.
 */
const scopedEntity = name => {
  const target = base44.entities[name];
  return {
    list: async (...args) => {
      const profileId = activeHouseholdProfileId();
      const [sort = "-created_date", requested = 100, ...rest] = args;
      const count = Number.isInteger(Number(requested)) ? Number(requested) : 100;
      // The secondary profile is queried server-side; Main preserves all
      // historical rows with a missing/default profile_id. This is more
      // reliable than fetching 4x another profile's rows and filtering later.
      const rows = profileId === "main"
        ? await target.list(sort, Math.min(500, Math.max(count, count * 4)), ...rest)
        : await target.filter({ profile_id: profileId }, sort, count, ...rest);
      return (Array.isArray(rows) ? rows : [])
        .filter(row => profileOwnsRow(row, profileId)).slice(0, count);
    },
    filter: async (criteria = {}, ...rest) => {
      const profileId = activeHouseholdProfileId();
      const rows = await target.filter(profileId === "main"
        ? criteria
        : { ...criteria, profile_id: profileId }, ...rest);
      return (Array.isArray(rows) ? rows : []).filter(row => profileOwnsRow(row, profileId));
    },
    create: async row => target.create({ ...row, profile_id: activeHouseholdProfileId() }),
    update: (...args) => target.update(...args),
    delete: (...args) => target.delete(...args),
    subscribe: (...args) => target.subscribe(...args),
  };
};
export const profiledLibrary = Object.fromEntries(
  LIBRARIES.map(name => [name, scopedEntity(name)])
);
