import React, { useEffect, useState } from "react";
import { Trash2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const TYPE_COLORS = {
  Torrent: "bg-green-900/40 text-mg-green border-mg-green/40",
  Metadata: "bg-blue-900/40 text-blue-400 border-blue-500/40",
  Subtitles: "bg-yellow-900/30 text-yellow-500 border-yellow-600/40",
  Debrid: "bg-purple-900/40 text-purple-400 border-purple-500/40",
  Provider: "bg-cyan-900/30 text-cyan-400 border-cyan-500/40",
};

const DEFAULT_ADDONS = [
  {
    id: "torrentio-default",
    name: "Torrentio",
    type: "Torrent",
    description: "High-performance torrent scraper with Real-Debrid support.",
    url: "https://torrentio.strem.fun/manifest.json",
    installed: true,
    active: true,
  },
  {
    id: "comet-default",
    name: "Comet",
    type: "Torrent",
    description: "Lightning-fast alternative indexer and debrid scraper.",
    url: "https://comet.elfhosted.com/manifest.json",
    installed: true,
    active: true,
  },
  {
    id: "annatar-default",
    name: "Annatar",
    type: "Torrent",
    description: "Direct metadata and torrent-scraping companion for debrid lookups.",
    url: "https://annatar.strem.fun/manifest.json",
    installed: true,
    active: true,
  },
  {
    id: "mediafusion-default",
    name: "MediaFusion",
    type: "Provider",
    description: "Handles live television feeds, sports streaming, and free catalog sources.",
    url: "https://mediafusion.elfhosted.com/manifest.json",
    installed: true,
    active: true,
  },
  {
    id: "cyberflix-default",
    name: "CyberFlix Catalog",
    type: "Metadata",
    description: "Alternative metadata provider for clean movie and TV posters.",
    url: "https://cyberflix.elfhosted.com/manifest.json",
    installed: true,
    active: true,
  },
  {
    id: "cinemeta-default",
    name: "Cinemeta",
    type: "Metadata",
    description: "Official metadata provider for movies, series descriptions, and artwork.",
    url: "https://v3-cinemeta.strem.io/manifest.json",
    installed: true,
    active: true,
  },
  {
    id: "opensubtitles-default",
    name: "OpenSubtitles v3",
    type: "Subtitles",
    description: "Automatically pulls multi-language subtitle files on demand.",
    url: "https://opensubtitles.strem.fun/manifest.json",
    installed: true,
    active: true,
  }
];

export default function AddonsView() {
  const [addons, setAddons] = useState(DEFAULT_ADDONS);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    base44.entities.Addon.list("-created_date", 100).then((a) => {
      if (a && a.length > 0) {
        setAddons([...DEFAULT_ADDONS, ...a]);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const installed = addons.filter((a) => a.installed);
  const catalog = addons.filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase())
  );

  const remove = async (a) => {
    if (a.id.includes("default")) {
      setAddons(addons.filter((item) => item.id !== a.id));
    } else {
      await base44.entities.Addon.delete(a.id);
      load();
    }
    toast({ title: "Addon removed", description: a.name });
  };

  const toggleActive = async (a) => {
    if (a.id.includes("default")) {
      setAddons(addons.map(item => item.id === a.id ? { ...item, active: !item.active } : item));
    } else {
      await base44.entities.Addon.update(a.id, { active: !a.active });
      load();
    }
  };

  const addCustom = async () => {
    if (!url) {
      toast({ title: "URL is required", variant: "destructive" });
      return;
    }
    await base44.entities.Addon.create({
      name: name || "Custom Addon",
      type: "Torrent",
      description: "User-added addon",
      url,
      installed: true,
      active: true,
    });
    setName("");
    setUrl("");
    toast({ title: "Addon added" });
    load();
  };

  const Card = ({ a, showActive }) => (
    <div className="bg-mg-card border border-white/10 rounded-lg p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-white text-sm">{a.name}</span>
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded border",
              TYPE_COLORS[a.type] || TYPE_COLORS.Torrent
            )}
          >
            {a.type}
          </span>
          {showActive && a.active && (
            <span className="text-[10px] font-bold text-mg-green flex items-center gap-1">
              ✓ Active
            </span>
          )}
        </div>
        <p className="text-xs text-white/50 line-clamp-2">{a.description}</p>
      </div>
      <div className="flex items-center gap-2">
        {showActive && (
          <button
            onClick={() => toggleActive(a)}
            className={cn(
              "w-5 h-5 rounded border flex items-center justify-center",
              a.active ? "bg-mg-green border-mg-green" : "border-white/30"
            )}
          >
            {a.active && <span className="text-black text-xs">✓</span>}
          </button>
        )}
        <button onClick={() => remove(a)} className="text-red-500 hover:text-red-400">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-white">Streaming Addons</h1>
      <p className="text-sm text-white/50 mb-6">
        Legitimate metadata, subtitle, debrid, and streaming-provider add-ons
      </p>

      <h3 className="text-sm font-bold text-mg-green mb-3">
        INSTALLED ({installed.length})
      </h3>
      <div className="flex flex-col gap-2 mb-8">
        {loading ? (
          <p className="text-white/40 text-sm">Loading...</p>
        ) : (
          installed.map((a) => <Card key={a.id} a={a} />)
        )}
      </div>

      <h3 className="text-sm font-bold text-mg-green mb-3">ADD CUSTOM ADDON</h3>
      <div className="flex flex-col gap-2 mb-8">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Addon name (optional)"
          className="bg-mg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://addon.example.com/manifest.json"
          className="bg-mg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
        />
        <button
          onClick={addCustom}
          className="self-start bg-mg-green text-black font-semibold text-sm px-4 py-2 rounded-lg hover:bg-mg-green-dim"
        >
          Add
        </button>
      </div>

      <h3 className="text-sm font-bold text-mg-green mb-3">ADDON CATALOG</h3>
      <div className="relative mb-3 max-w-xs">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search addons"
          className="w-full bg-mg-card border border-white/10 rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-mg-green"
        />
      </div>
      <div className="flex flex-col gap-2">
        {catalog.map((a) => (
          <Card key={a.id} a={a} showActive />
        ))}
      </div>
    </div>
  );
}
