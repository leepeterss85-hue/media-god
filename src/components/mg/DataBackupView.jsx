import React, { useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileJson,
  Loader2,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import {
  normaliseUxPreferences,
  readUxPreferences,
  writeUxPreferences,
} from "@/components/mg/uxPreferences";

const BACKUP_VERSION = 1;
const MAX_LIBRARY_ITEMS = 500;

const cleanText = (value, max = 2000) =>
  String(value || "").trim().slice(0, max);

const safeMediaType = (value) =>
  String(value || "").toLowerCase() === "tv" ? "tv" : "movie";

const cleanLibraryItem = (item) => ({
  title: cleanText(item?.title, 300),
  year: cleanText(item?.year, 4),
  poster_url: cleanText(item?.poster_url, 1000),
  description: cleanText(item?.description, 4000),
  tmdb_id: cleanText(item?.tmdb_id, 40),
  media_type: safeMediaType(item?.media_type),
});

const itemKey = (item) =>
  [
    safeMediaType(item?.media_type),
    cleanText(item?.tmdb_id, 40) || cleanText(item?.title, 300).toLowerCase(),
    cleanText(item?.year, 4),
  ].join(":");

const safeArray = (value) =>
  Array.isArray(value) ? value.slice(0, MAX_LIBRARY_ITEMS) : [];

const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function DataBackupView() {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const createBackup = async () => {
    setBusy("export");
    setMessage("");
    setError("");

    try {
      const [watchlist, favorites] = await Promise.all([
        base44.entities.WatchlistItem.list("-created_date", MAX_LIBRARY_ITEMS),
        base44.entities.Favorite.list("-created_date", MAX_LIBRARY_ITEMS),
      ]);

      const payload = {
        format: "media-god-backup",
        version: BACKUP_VERSION,
        exported_at: new Date().toISOString(),
        data: {
          watchlist: safeArray(watchlist).map(cleanLibraryItem),
          favorites: safeArray(favorites).map(cleanLibraryItem),
          display_preferences: normaliseUxPreferences(readUxPreferences()),
        },
      };

      const date = new Date().toISOString().slice(0, 10);
      downloadJson(`media-god-backup-${date}.json`, payload);
      setMessage(
        `Backup created with ${payload.data.watchlist.length} Watchlist and ${payload.data.favorites.length} Favorite item${payload.data.favorites.length === 1 ? "" : "s"}.`
      );
    } catch (backupError) {
      setError(
        backupError?.message || "Could not create the Media God backup."
      );
    } finally {
      setBusy("");
    }
  };

  const importFile = async (file) => {
    if (!file) return;

    setBusy("import");
    setMessage("");
    setError("");

    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("That backup file is too large.");
      }

      const parsed = JSON.parse(await file.text());

      if (
        parsed?.format !== "media-god-backup" ||
        Number(parsed?.version || 0) !== BACKUP_VERSION ||
        !parsed?.data ||
        typeof parsed.data !== "object"
      ) {
        throw new Error("That is not a supported Media God backup file.");
      }

      const incomingWatchlist = safeArray(parsed.data.watchlist)
        .map(cleanLibraryItem)
        .filter((item) => item.title);
      const incomingFavorites = safeArray(parsed.data.favorites)
        .map(cleanLibraryItem)
        .filter((item) => item.title);

      const [currentWatchlist, currentFavorites] = await Promise.all([
        base44.entities.WatchlistItem.list("-created_date", MAX_LIBRARY_ITEMS),
        base44.entities.Favorite.list("-created_date", MAX_LIBRARY_ITEMS),
      ]);

      const existingWatchlist = new Set(
        safeArray(currentWatchlist).map(itemKey)
      );
      const existingFavorites = new Set(
        safeArray(currentFavorites).map(itemKey)
      );

      let watchlistAdded = 0;
      let favoritesAdded = 0;

      for (const item of incomingWatchlist) {
        const key = itemKey(item);
        if (existingWatchlist.has(key)) continue;
        await base44.entities.WatchlistItem.create(item);
        existingWatchlist.add(key);
        watchlistAdded += 1;
      }

      for (const item of incomingFavorites) {
        const key = itemKey(item);
        if (existingFavorites.has(key)) continue;
        await base44.entities.Favorite.create(item);
        existingFavorites.add(key);
        favoritesAdded += 1;
      }

      if (parsed.data.display_preferences) {
        writeUxPreferences(
          normaliseUxPreferences(parsed.data.display_preferences)
        );
      }

      setMessage(
        `Restore complete: ${watchlistAdded} Watchlist and ${favoritesAdded} Favorite item${favoritesAdded === 1 ? "" : "s"} added. Existing titles were left unchanged.`
      );
    } catch (restoreError) {
      setError(
        restoreError?.message || "Could not restore that Media God backup."
      );
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setBusy("");
    }
  };

  return (
    <section
      data-mg-backup-view="true"
      className="w-full max-w-4xl p-4 md:p-6 3xl:p-8"
    >
      <div className="flex items-center gap-2">
        <FileJson className="h-6 w-6 text-mg-green" />
        <h1 className="text-2xl font-black text-white">Backup & Restore</h1>
      </div>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
        Back up your Watchlist, Favorites and display preferences. Playback
        credentials, Real-Debrid tokens, addon URLs, passwords and account
        secrets are deliberately excluded.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-mg-card p-5">
          <Download className="h-6 w-6 text-mg-green" />
          <h2 className="mt-3 text-lg font-bold text-white">Create backup</h2>
          <p className="mt-2 text-sm leading-6 text-white/45">
            Downloads a small JSON file containing only your saved catalogue
            items and non-sensitive display preferences.
          </p>
          <button
            type="button"
            onClick={createBackup}
            disabled={Boolean(busy)}
            className="mt-4 min-h-11 inline-flex items-center gap-2 rounded-lg bg-mg-green px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            {busy === "export" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy === "export" ? "Creating…" : "Download backup"}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-mg-card p-5">
          <Upload className="h-6 w-6 text-mg-green" />
          <h2 className="mt-3 text-lg font-bold text-white">Restore backup</h2>
          <p className="mt-2 text-sm leading-6 text-white/45">
            Imports missing Watchlist and Favorite titles without deleting or
            replacing anything already saved.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => importFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(busy)}
            className="mt-4 min-h-11 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/75 hover:bg-white/10 disabled:opacity-50"
          >
            {busy === "import" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {busy === "import" ? "Restoring…" : "Choose backup file"}
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-mg-green/20 bg-mg-green/5 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-mg-green" />
        <div>
          <p className="text-sm font-bold text-white">Privacy-safe by design</p>
          <p className="mt-1 text-xs leading-5 text-white/45">
            Backup files never contain authentication credentials, debrid API
            keys, private addon configuration, playback URLs or viewing history.
          </p>
        </div>
      </div>

      {message && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl border border-mg-green/20 bg-mg-green/10 p-4 text-sm text-mg-green"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}
    </section>
  );
}
