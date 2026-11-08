import { Search } from "lucide-react";

import VoiceSearchButton from "@/components/mg/VoiceSearchButton";

/**
 * Live TV channel search with the shared voice engine, kept out of the large
 * LiveTVView file. Typing and speaking both just hand the query back.
 */
export default function LiveTvSearchField({ value, onChange }) {
  return (
    <label data-mg-live-tv-search="true" className="relative block">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search channel, country, source or category…"
        aria-label="Search Live TV channels"
        className="h-11 w-full rounded-lg border border-white/10 bg-mg-card pl-10 pr-12 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green focus:ring-2 focus:ring-mg-green/30"
      />

      <VoiceSearchButton
        className="absolute right-1 top-1/2 -translate-y-1/2"
        label="Search Live TV by voice"
        onResult={onChange}
      />
    </label>
  );
}