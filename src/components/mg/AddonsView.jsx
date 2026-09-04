import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Trash2, Plus, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

const DEFAULT_ADDONS = [
  { name: "Torrentio", url: "https://torrentio.strem.fun/manifest.json", active: true },
  { name: "Comet", url: "https://comet.elfhosted.com/manifest.json", active: true },
  { name: "Annatar", url: "https://annatar.elfhosted.com/manifest.json", active: true },
  { name: "MediaFusion", url: "https://mediafusion.elfhosted.com/manifest.json", active: true }
];

export default function AddonsManager() {
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState("");

  const loadAddons = async () => {
    setLoading(true);
    try {
      let list = await base44.entities.Addon.list("-created_date", 100);
      if (!list || list.length === 0) {
        for (const def of DEFAULT_ADDONS) {
          await base44.entities.Addon.create(def);
        }
        list = await base44.entities.Addon.list("-created_date", 100);
      }
      setAddons(list || []);
    } catch (err) {
      setError("Failed to load addons from database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddons();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    try {
      await base44.entities.Addon.create({
        name: newName.trim(),
        url: newUrl.trim(),
        active: true,
        installed: true
      });
      setNewName("");
      setNewUrl("");
      loadAddons();
    } catch (err) {
      setError("Failed to add new addon.");
    }
  };

  const toggleActive = async (addon) => {
    try {
      const nextActive = addon.active === false ? true : false;
      await base44.entities.Addon.update(addon.id, {
        active: nextActive,
        installed: nextActive
      });
      loadAddons();
    } catch (err) {
      setError("Failed to update addon status.");
    }
  };

  const deleteAddon = async (id) => {
    try {
      await base44.entities.Addon.delete(id);
      loadAddons();
    } catch (err) {
      setError("Failed to delete addon.");
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto text-white space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Streaming Addons</h1>
          <p className="text-sm text-gray-400">Manage Stremio-compatible manifests used for media discovery.</p>
        </div>
        <button 
          onClick={loadAddons}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm">{error}</div>}

      {/* Add Custom Addon Form */}
      <form onSubmit={handleAdd} className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-4">
        <h2 className="text-md font-semibold">Add Custom Addon</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Addon Name (e.g. Torrentio)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-green-500"
          />
          <input
            type="text"
            placeholder="Manifest URL (https://.../manifest.json)"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-green-500"
          />
        </div>
        <button
          type="submit"
          className="flex items-center justify-center gap-2 w-full py-2 bg-green-600 hover:bg-green-500 font-semibold rounded-lg text-sm transition"
        >
          <Plus className="w-4 h-4" /> Add Addon
        </button>
      </form>

      {/* Installed Addons List */}
      <div className="space-y-3">
        <h2 className="text-md font-semibold">Configured Addons ({addons.length})</h2>
        {loading ? (
          <div className="text-sm text-gray-500 py-4 text-center">Loading addons...</div>
        ) : addons.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center">No addons found.</div>
        ) : (
          addons.map((addon) => {
            const isActive = addon.active !== false && addon.installed !== false;
            return (
              <div 
                key={addon.id} 
                className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
              >
                <div className="space-y-1 overflow-hidden pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{addon.name}</span>
                    {isActive ? (
                      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-950/50 px-2 py-0.5 rounded-full border border-green-800">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400 bg-zinc-800 px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3" /> Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{addon.url}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActive(addon)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      isActive ? "bg-zinc-800 hover:bg-zinc-700 text-gray-300" : "bg-green-600 hover:bg-green-500 text-white"
                    }`}
                  >
                    {isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteAddon(addon.id)}
                    className="p-1.5 bg-red-950/40 hover:bg-red-900 border border-red-900/50 text-red-400 rounded-lg transition"
                    title="Delete Addon"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
