import React, { useState } from "react";
import { Share2, Copy, Check, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Encodes the current watchlist into a shareable link. Friends can open it
// without logging in — the titles/posters travel in the URL itself.
export default function WatchlistShareButton({ items }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const buildLink = () => {
    const payload = items.map((m) => ({
      title: m.title,
      year: m.year,
      poster_url: m.poster_url,
      description: m.description,
    }));
    const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
    const url = `${window.location.origin}/shared/watchlist?d=${encoded}`;
    setLink(url);
    setCopied(false);
    setOpen(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Link copied to clipboard" });
    } catch {
      toast({ title: "Copy failed — select the link manually" });
    }
  };

  return (
    <>
      <button
        onClick={buildLink}
        disabled={items.length === 0}
        className="flex items-center gap-1.5 bg-mg-green/15 text-mg-green border border-mg-green/40 text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-mg-green/25 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Share2 className="w-3.5 h-3.5" /> Share
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="bg-mg-card border border-white/10 rounded-lg p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-sm">Share your watchlist</h3>
              <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/50 mb-3">
              Anyone with this link can see your {items.length} {items.length === 1 ? "title" : "titles"} — no login needed.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                className="flex-1 bg-mg-surface border border-white/10 rounded-md px-3 py-2 text-xs text-white/80 truncate"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copy}
                className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-xs px-3 py-2 rounded-md hover:bg-mg-green-dim"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}