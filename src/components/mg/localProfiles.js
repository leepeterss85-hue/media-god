import { base44 as originalBase44 } from "@/api/base44Client";

const PROFILES_KEY = "mg:local-profiles:v1";
const ACTIVE_KEY = "mg:active-local-profile:v1";
const COLLECTION_PREFIX = "mg:profile-collections:v1:";
const COLLECTIONS = new Set(["ContinueWatching", "WatchlistItem", "Favorite"]);
export const PROFILE_CHANGE_EVENT = "mg:local-profile-changed";
const MAIN_PROFILE = { id: "main", name: "Main" };

const storage = () => {
  try { return typeof window !== "undefined" ? window.localStorage : null; }
  catch { return null; }
};
const safeProfiles = value => [
  MAIN_PROFILE,
  ...(Array.isArray(value) ? value : [])
    .filter(profile => /^p-[a-z0-9-]{6,48}$/i.test(String(profile?.id || "")))
    .map(profile => ({
      id: String(profile.id),
      name: String(profile.name || "Profile").trim().slice(0, 28) || "Profile",
    }))
    .slice(0, 4),
];

export const readProfiles = () => {
  try { return safeProfiles(JSON.parse(storage()?.getItem(PROFILES_KEY) || "[]")); }
  catch { return [MAIN_PROFILE]; }
};
export const activeProfileId = () => {
  const selected = storage()?.getItem(ACTIVE_KEY) || "main";
  return readProfiles().some(profile => profile.id === selected) ? selected : "main";
};
export const activeProfile = () => readProfiles().find(profile => profile.id === activeProfileId()) || MAIN_PROFILE;

export const createLocalProfile = name => {
  const trimmed = String(name || "").trim().slice(0, 28);
  if (!trimmed) throw new Error("Enter a profile name.");
  const profiles = readProfiles();
  if (profiles.length >= 5) throw new Error("You can create up to four additional profiles.");
  if (profiles.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) throw new Error("That profile name already exists.");
  const id = "p-" + Array.from(cryptoFallback(), n => n.toString(16).padStart(2, "0")).join("");
  const result = { id, name: trimmed };
  storage()?.setItem(PROFILES_KEY, JSON.stringify([...profiles.filter(p=>p.id!=="main"), result]));
  return result;
};
const cryptoFallback = () => {
  // Profiles are a convenience label, not an authentication/security boundary.
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") return crypto.getRandomValues(bytes);
  return bytes.map(() => Math.floor(Math.random() * 256));
};
export const selectLocalProfile = id => {
  if (!readProfiles().some(p => p.id === id)) return false;
  storage()?.setItem(ACTIVE_KEY, id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROFILE_CHANGE_EVENT, { detail: { id } }));
  }
  return true;
};

// No backend schema mutations or server-side multi-user permission claims:
// Main uses the exact existing account collections, optional profiles use
// device-local records. This also prevents temporary signed video URLs being
// copied into another household member's profile.
const localKey = (profile, entity) => COLLECTION_PREFIX + profile + ":" + entity;
const rowsFor = (profile, entity) => {
  try {
    const result = JSON.parse(storage()?.getItem(localKey(profile, entity)) || "[]");
    return Array.isArray(result) ? result : [];
  } catch { return []; }
};
const publishRows = (profile, entity, rows) => {
  if (!storage()) throw new Error("Device storage is unavailable for this profile.");
  storage().setItem(localKey(profile, entity), JSON.stringify(rows.slice(-500)));
  window.dispatchEvent(new CustomEvent("mg:profile-collection-change", {
    detail: { profile, entity },
  }));
};
const matches = (row, criteria) =>
  Object.entries(criteria || {}).every(([key, value]) => String(row?.[key] ?? "") === String(value ?? ""));

const localEntity = entity => ({
  async list(order = "-updated_date", limit = 100) {
    const items = rowsFor(activeProfileId(), entity);
    const key = String(order).replace(/^-/, "");
    const descending = String(order).startsWith("-");
    return items.sort((a, b) => {
      const left = String(a[key] ?? "");
      const right = String(b[key] ?? "");
      return descending ? right.localeCompare(left) : left.localeCompare(right);
    }).slice(0, Math.max(0, Number(limit) || 100));
  },
  async filter(criteria = {}) {
    return rowsFor(activeProfileId(), entity).filter(row => matches(row, criteria));
  },
  async create(data) {
    const profile = activeProfileId();
    const timestamp = new Date().toISOString();
    const record = {
      ...(data || {}),
      id: `local-${profile}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      created_date: timestamp,
      updated_date: timestamp,
    };
    publishRows(profile, entity, [...rowsFor(profile, entity), record]);
    return record;
  },
  async update(id, data) {
    const profile = activeProfileId();
    let record = null;
    const next = rowsFor(profile, entity).map(row => {
      if (String(row.id) !== String(id)) return row;
      record = { ...row, ...(data || {}), id: row.id, updated_date: new Date().toISOString() };
      return record;
    });
    if (!record) throw new Error("Profile record no longer exists.");
    publishRows(profile, entity, next);
    return record;
  },
  async delete(id) {
    const profile = activeProfileId();
    publishRows(profile, entity, rowsFor(profile, entity).filter(row => String(row.id) !== String(id)));
    return true;
  },
  subscribe(listener) {
    const profile = activeProfileId();
    const notify = event => {
      if (event.type === "storage") {
        if (event.key?.startsWith(localKey(profile, entity))) listener();
      } else if (event.detail?.profile === profile && event.detail?.entity === entity) {
        listener();
      }
    };
    window.addEventListener("mg:profile-collection-change", notify);
    window.addEventListener("storage", notify);
    return () => {
      window.removeEventListener("mg:profile-collection-change", notify);
      window.removeEventListener("storage", notify);
    };
  },
});

// Every existing entity/function/auth call still uses Base44 when the Main
// profile is active; only the three specified collection APIs are scoped.
const scopedEntities = new Proxy(originalBase44.entities, {
  get(target, key) {
    if (!COLLECTIONS.has(String(key)) || activeProfileId() === "main") return target[key];
    return localEntity(String(key));
  },
});
export const base44 = new Proxy(originalBase44, {
  get(target, key) {
    if (key === "entities") return scopedEntities;
    return Reflect.get(target, key);
  },
});
