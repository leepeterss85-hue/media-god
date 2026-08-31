import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function SettingsView() {
  const [me, setMe] = useState(null);
  const [autoplay, setAutoplay] = useState(true);
  const [subs, setSubs] = useState(true);
  const [quality, setQuality] = useState("Auto");
  const { toast } = useToast();

  useEffect(() => {
    base44.auth.me().then(setMe).catch(() => {});
  }, []);

  const save = async () => {
    await base44.auth.updateMe({
      preferences: { autoplay, subs, quality },
    });
    toast({ title: "Settings saved" });
  };

  const Toggle = ({ on, onClick }) => (
    <button
      onClick={onClick}
      className={cn(
        "w-11 h-6 rounded-full transition-colors relative",
        on ? "bg-mg-green" : "bg-white/20"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-5 h-5 rounded-full bg-black transition-transform",
          on ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-white mb-6">Settings</h1>

      {me && (
        <div className="bg-mg-card border border-white/10 rounded-lg p-4 mb-6">
          <p className="text-sm text-white/50">Signed in as</p>
          <p className="text-white font-semibold">{me.email}</p>
        </div>
      )}

      <div className="bg-mg-card border border-white/10 rounded-lg divide-y divide-white/5">
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm text-white font-medium">Autoplay</p>
            <p className="text-xs text-white/40">Start next episode automatically</p>
          </div>
          <Toggle on={autoplay} onClick={() => setAutoplay(!autoplay)} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm text-white font-medium">Subtitles</p>
            <p className="text-xs text-white/40">Auto-fetch subtitles via OpenSubtitles</p>
          </div>
          <Toggle on={subs} onClick={() => setSubs(!subs)} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm text-white font-medium">Stream quality</p>
            <p className="text-xs text-white/40">Default playback quality</p>
          </div>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="bg-mg-surface border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-mg-green"
          >
            {["Auto", "4K", "1080p", "720p", "480p"].map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={save}
        className="mt-6 bg-mg-green text-black font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-mg-green-dim"
      >
        Save settings
      </button>
    </div>
  );
}