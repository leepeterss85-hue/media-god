import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { activeHouseholdProfile, profiledLibrary } from "./householdProfiles";
import { notifyContinueWatchingSaved } from "./continueWatchingSync";

export default function ContinueWatchingSyncPanel() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const check = async () => {
    const request = ++version.current;
    setBusy(true);
    setError("");
    setSnapshot(null);
    try {
      const profile = activeHouseholdProfile();
      const user = await base44.auth.me();
      const rows = await profiledLibrary.ContinueWatching.list("-updated_date", 250);
      const currentUser = await base44.auth.me();
      if (request !== version.current) return;
      if (user?.id !== currentUser?.id || profile.id !== activeHouseholdProfile().id) {
        throw new Error("Session changed");
      }
      setSnapshot({
        account: user.email || user.full_name || "Signed in",
        accountId: user.id,
        profile,
        count: rows.length,
        checkedAt: new Date().toLocaleTimeString("en-GB"),
        recent: rows.slice(0, 3).map(row => ({
          id: row.id, title: row.title, updated: row.updated_date || row.created_date,
        })),
      });
      notifyContinueWatchingSaved();
    } catch (failure) {
      if (request !== version.current) return;
      const status = Number(failure?.status || failure?.response?.status);
      setError(status === 401 || status === 403
        ? "Your account could not be verified. Sign in again, then retry."
        : "Could not read your account history. Check your connection and retry.");
    } finally {
      if (request === version.current) setBusy(false);
    }
  };
  useEffect(() => {
    void check();
    return () => { version.current += 1; };
  }, []);
  return (
    <section aria-label="Continue Watching sync" className="mt-6 rounded-xl border border-white/10 bg-mg-card p-4">
      <h2 className="text-base font-bold text-white">Continue Watching sync</h2>
      <p className="mt-2 text-xs text-white/55">Compare this account and profile on your devices if your lists differ.</p>
      {snapshot && <div className="mt-3 space-y-1 break-words text-xs text-white/75">
        <p>Account: {snapshot.account}</p>
        <p>Profile: {snapshot.profile.name}</p>
        <p>History records loaded: {snapshot.count}{snapshot.count === 250 ? " (latest 250)" : ""}</p>
        <p>Last successful check: {snapshot.checkedAt}</p>
        <p className="pt-2 font-semibold">Latest saved titles</p>
        {snapshot.recent.length ? snapshot.recent.map(row =>
          <p key={row.id}>{row.title} · {row.updated ? new Date(row.updated).toLocaleString("en-GB") : "Date unavailable"}</p>
        ) : <p>No history was returned for this profile.</p>}
        <details className="pt-2">
          <summary className="cursor-pointer text-mg-green">Support details</summary>
          <p>Sync version: CW-20261029-2</p>
          <p>Account reference: {snapshot.accountId}</p>
          <p>Profile reference: {snapshot.profile.id}</p>
          <p>App reference: {appParams.appId}</p>
          <p>Site: {window.location.host}</p>
        </details>
      </div>}
      {error && <p role="alert" className="mt-3 text-xs text-amber-200">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void check()}
        className="mt-3 min-h-11 rounded-lg border border-mg-green/40 bg-mg-green/10 px-4 text-sm text-mg-green disabled:opacity-50">
        {busy ? "Checking account history…" : "Refresh account history"}
      </button>
    </section>
  );
}
