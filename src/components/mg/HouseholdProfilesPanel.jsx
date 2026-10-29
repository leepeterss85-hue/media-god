import React, { useEffect, useState } from "react";
import { UserRound, Plus } from "lucide-react";
import {
  activeHouseholdProfileId,
  createHouseholdProfile,
  readHouseholdProfiles,
  selectHouseholdProfile,
  syncHouseholdProfilesFromAccount,
  saveHouseholdProfilesToAccount,
} from "@/components/mg/householdProfiles";

export default function HouseholdProfilesPanel() {
  const [profiles, setProfiles] = useState(readHouseholdProfiles);
  const [selected, setSelected] = useState(activeHouseholdProfileId);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    syncHouseholdProfilesFromAccount().then(rows => {
      if (mounted) setProfiles(rows);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const switchTo = id => {
    if (id === selected || !selectHouseholdProfile(id)) return;
    setSelected(id);
    // Refresh the existing page so no previously loaded library rows from
    // the old profile remain visible. Never interrupt an active video:
    // profiles are switched only from Settings, outside the player.
    window.location.reload();
  };

  const add = event => {
    event.preventDefault();
    const added = createHouseholdProfile(name);
    if (!added) {
      setError("Choose a unique name. You can have up to six profiles.");
      return;
    }
    setProfiles(readHouseholdProfiles());
    saveHouseholdProfilesToAccount().catch(() => {});
    setSelected(added.id);
    setName("");
    setError("");
    window.location.reload();
  };

  return (
    <section data-mg-household-profiles="true" aria-label="Household profiles"
      className="mt-6 rounded-xl border border-white/10 bg-mg-card p-4 3xl:p-6">
      <div className="flex items-center gap-2 text-mg-green">
        <UserRound className="h-5 w-5" />
        <h2 className="text-base font-bold text-white">Household profiles</h2>
      </div>
      <p className="mt-2 text-xs text-white/55">
        Optional. Each profile keeps its own Watchlist, Favorites and Continue Watching.
        The original Main profile keeps everything you've already saved.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {profiles.map(profile => (
          <button key={profile.id} type="button" onClick={() => switchTo(profile.id)}
            aria-pressed={selected === profile.id}
            className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-mg-green ${selected === profile.id
              ? "border-mg-green bg-mg-green/15 text-mg-green"
              : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"}`}>
            {profile.name}
          </button>
        ))}
      </div>
      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="mg-add-household-profile">New profile name</label>
        <input id="mg-add-household-profile" value={name}
          onChange={event => setName(event.target.value)}
          maxLength={24} placeholder="New profile name"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-mg-green" />
        <button type="submit" disabled={!name.trim() || profiles.length >= 6}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-mg-green px-4 text-sm font-bold text-black disabled:opacity-40">
          <Plus className="h-4 w-4" /> Add profile
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <p className="mt-2 text-[11px] text-white/40">
        Profile names sync with your Media God account. Your selected profile remains specific to this device; profiles are not separate secure logins.
      </p>
    </section>
  );
}
