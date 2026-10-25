import React from "react";
import { selectVisibleLibraryIds } from "@/components/mg/savedLibraryTools";

export default function SavedLibraryResults({ total, visible, filtered, onReset, editing, selectedIds, setSelectedIds, busy }) {
  const allVisibleSelected = visible.length > 0 && visible.every(item => selectedIds.includes(item.id));
  const buttonClass = "min-h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-mg-green disabled:opacity-50";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <p role="status" aria-live="polite" className="mr-auto text-xs text-white/60">
        Showing {visible.length} of {total} saved titles
        {editing && selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ""}
      </p>
      {filtered && <button type="button" onClick={onReset} className={buttonClass}>Reset filters</button>}
      {editing && visible.length > 0 && (
        <button type="button" disabled={busy} className={buttonClass}
          onClick={() => setSelectedIds(current => selectVisibleLibraryIds(current, visible, !allVisibleSelected))}>
          {allVisibleSelected ? "Deselect visible" : "Select visible"} ({visible.length})
        </button>
      )}
      {editing && selectedIds.length > 0 && (
        <button type="button" disabled={busy} className={buttonClass} onClick={() => setSelectedIds([])}>Clear selection</button>
      )}
    </div>
  );
}
