import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { KeyRound, Check, Loader2, ExternalLink, Zap } from "lucide-react";
import SocialLoginSection from "@/components/mg/SocialLoginSection";
import DebridServiceCard from "@/components/mg/DebridServiceCard";

export default function SettingsView() {
  const [me, setMe] = useState(null);
  const [autoplay, setAutoplay] = useState(true);
  const [subs, setSubs] = useState(true);
  const [quality, setQuality] = useState("Auto");
  const [rdToken, setRdToken] = useState("");
  const [rdStatus, setRdStatus] = useState(null);
  const [rdSaving, setRdSaving] = useState(false);
  const [rdChecking, setRdChecking] = useState(false);
  const [extraStatus, setExtraStatus] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    base44.auth
      .me()
      .then((u) => {
        setMe(u);
        if (u?.rd_token) setRdToken(u.rd_token);
        // Pre-verify any already-connected additional services.
        for (const s of ["alldebrid", "premiumize", "debridlink"]) {
          if (u?.[`${s}_token`]) {
            base44.functions
              .invoke("debridServices", { service: s, action: "status" })
              .then((res) => setExtraStatus((p) => ({ ...p, [s]: res.data })))
              .catch((e) => setExtraStatus((p) => ({ ...p, [s]: { error: e.message } })));
          }
        }
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    await base44.auth.updateMe({
      preferences: { autoplay, subs, quality },
    });
    toast({ title: "Settings saved" });
  };

  const saveRdToken = async () => {
    setRdSaving(true);
    try {
      await base44.auth.updateMe({ rd_token: rdToken.trim() });
      toast({ title: "Real-Debrid token saved" });
      if (rdToken.trim()) {
        await checkRd();
      } else {
        setRdStatus(null);
      }
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setRdSaving(false);
    }
  };

  const checkRd = async () => {
    setRdChecking(true);
    try {
      const res = await base44.functions.invoke("realDebrid", { action: "status" });
      setRdStatus(res.data);
    } catch (e) {
      setRdStatus({ error: e.message || "Invalid token" });
    } finally {
      setRdChecking(false);
    }
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

      <SocialLoginSection />

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

      {/* Real-Debrid */}
      <div className="mt-6 bg-mg-card border border-white/10 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-mg-green" />
          <h2 className="text-sm font-bold text-white">Real-Debrid</h2>
        </div>
        <p className="text-xs text-white/40 mb-3">
          Link your Real-Debrid account to stream cached torrents instantly instead of
          downloading. Get your private API token from{" "}
          <a
            href="https://real-debrid.com/apitoken"
            target="_blank"
            rel="noopener noreferrer"
            className="text-mg-green underline inline-flex items-center gap-0.5"
          >
            real-debrid.com/apitoken <ExternalLink className="w-3 h-3" />
          </a>
          .
        </p>

        <label className="text-xs text-white/60 font-medium">API Token</label>
        <input
          type="password"
          value={rdToken}
          onChange={(e) => setRdToken(e.target.value)}
          placeholder="Paste your Real-Debrid API token"
          className="w-full mt-1 bg-mg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-mg-green"
        />

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={saveRdToken}
            disabled={rdSaving || rdChecking}
            className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-sm px-4 py-2 rounded-lg hover:bg-mg-green-dim disabled:opacity-60"
          >
            {rdSaving || rdChecking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : rdStatus?.valid ? (
              <Check className="w-4 h-4" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {rdSaving ? "Saving…" : "Save & verify"}
          </button>
          {rdToken && !rdSaving && (
            <button
              onClick={checkRd}
              disabled={rdChecking}
              className="text-xs text-white/60 hover:text-white px-3 py-2 disabled:opacity-60"
            >
              {rdChecking ? "Checking…" : "Re-check"}
            </button>
          )}
        </div>

        {rdStatus?.valid && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-mg-green font-semibold">
              <Check className="w-3.5 h-3.5" /> Connected
            </span>
            <span className="text-white/50">
              {rdStatus.premium ? "Premium" : "Free"}
              {rdStatus.expires ? ` · expires ${String(rdStatus.expires).slice(0, 10)}` : ""}
            </span>
          </div>
        )}
        {rdStatus?.error && (
          <p className="mt-3 text-xs text-red-400">{rdStatus.error}</p>
        )}
      </div>

      <DebridServiceCard service="alldebrid" initialToken={me?.alldebrid_token} initialStatus={extraStatus.alldebrid} />
      <DebridServiceCard service="premiumize" initialToken={me?.premiumize_token} initialStatus={extraStatus.premiumize} />
      <DebridServiceCard service="debridlink" initialToken={me?.debridlink_token} initialStatus={extraStatus.debridlink} />

      <button
        onClick={save}
        className="mt-6 bg-mg-green text-black font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-mg-green-dim"
      >
        Save settings
      </button>
    </div>
  );
}