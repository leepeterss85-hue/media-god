import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { KeyRound, Check, Loader2, Zap, ExternalLink } from "lucide-react";

// A reusable token card for one of the additional debrid services (AllDebrid,
// Premiumize, DebridLink). Mirrors the Real-Debrid card's save-and-verify flow
// but talks to the shared debridServices backend function.
const SERVICES = {
  alldebrid: {
    label: "AllDebrid",
    tokenField: "alldebrid_token",
    tokenUrl: "https://alldebrid.com/apikeys/",
    placeholder: "Paste your AllDebrid apikey",
    hint: "Find your API key under My Account → API keys.",
  },
  premiumize: {
    label: "Premiumize",
    tokenField: "premiumize_token",
    tokenUrl: "https://premiumize.me/account",
    placeholder: "Paste your Premiumize apikey",
    hint: "Find your API key in Account → API.",
  },
  debridlink: {
    label: "DebridLink",
    tokenField: "debridlink_token",
    tokenUrl: "https://debrid-link.com/keys",
    placeholder: "Paste your DebridLink API token",
    hint: "Generate a token under your account API keys.",
  },
};

export default function DebridServiceCard({ service, initialToken, initialStatus }) {
  const cfg = SERVICES[service];
  const [token, setToken] = useState(initialToken || "");
  const [status, setStatus] = useState(initialStatus || null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ [cfg.tokenField]: token.trim() });
      toast({ title: `${cfg.label} token saved` });
      if (token.trim()) await verify();
      else setStatus(null);
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setChecking(true);
    try {
      const res = await base44.functions.invoke("debridServices", { service, action: "status" });
      setStatus(res.data);
    } catch (e) {
      setStatus({ error: e.message || "Invalid token" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mt-4 bg-mg-card border border-white/10 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-mg-green" />
        <h2 className="text-sm font-bold text-white">{cfg.label}</h2>
      </div>
      <p className="text-xs text-white/40 mb-3">
        Link your {cfg.label} account to stream cached torrents. {cfg.hint}{" "}
        <a
          href={cfg.tokenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-mg-green underline inline-flex items-center gap-0.5"
        >
          Open {cfg.label} <ExternalLink className="w-3 h-3" />
        </a>
      </p>

      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={cfg.placeholder}
        className="w-full bg-mg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-mg-green"
      />

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={save}
          disabled={saving || checking}
          className="flex items-center gap-1.5 bg-mg-green text-black font-semibold text-sm px-4 py-2 rounded-lg hover:bg-mg-green-dim disabled:opacity-60"
        >
          {saving || checking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status?.valid ? (
            <Check className="w-4 h-4" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          {saving ? "Saving…" : "Save & verify"}
        </button>
        {token && !saving && (
          <button
            onClick={verify}
            disabled={checking}
            className="text-xs text-white/60 hover:text-white px-3 py-2 disabled:opacity-60"
          >
            {checking ? "Checking…" : "Re-check"}
          </button>
        )}
      </div>

      {status?.valid && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-mg-green font-semibold">
            <Check className="w-3.5 h-3.5" /> Connected
          </span>
          <span className="text-white/50">
            {status.premium ? "Premium" : "Free"}
            {status.expires ? ` · expires ${String(status.expires).slice(0, 10)}` : ""}
          </span>
        </div>
      )}
      {status?.error && <p className="mt-3 text-xs text-red-400">{status.error}</p>}
    </div>
  );
}