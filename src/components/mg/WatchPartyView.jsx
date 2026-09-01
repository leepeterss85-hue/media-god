import React, { useEffect, useState } from "react";
import { Users, Copy, Check, LogOut, Send, Plus, ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PartyPlayer from "@/components/mg/PartyPlayer";

const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export default function WatchPartyView() {
  const [mode, setMode] = useState("lobby");
  const [user, setUser] = useState(null);
  const [party, setParty] = useState(null);
  const [code, setCode] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [cTitle, setCTitle] = useState("");
  const [cUrl, setCUrl] = useState("");
  const [cPoster, setCPoster] = useState("");

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const isHost = !!(party && user && party.created_by_id === user.id);

  // Live-sync the room state.
  useEffect(() => {
    if (!party) return;
    const unsub = base44.entities.WatchParty.subscribe((event) => {
      if (event.type === "delete") { setParty(null); setMode("lobby"); return; }
      if (event.data?.id === party.id) setParty((p) => ({ ...p, ...event.data }));
    });
    return unsub;
  }, [party?.id]);

  // Load + live-sync chat.
  useEffect(() => {
    if (!party) return;
    base44.entities.WatchPartyMessage.filter({ room_code: party.room_code })
      .then(setMessages).catch(() => {});
    const unsub = base44.entities.WatchPartyMessage.subscribe((event) => {
      if (event.type === "create" && event.data?.room_code === party.room_code) {
        setMessages((m) => [...m, event.data]);
      }
    });
    return unsub;
  }, [party?.id]);

  const onHostState = async (patch) => {
    if (!party) return;
    try {
      await base44.entities.WatchParty.update(party.id, { ...patch, last_action_at: new Date().toISOString() });
    } catch {}
  };

  const createRoom = async () => {
    if (!cUrl.trim() || !cTitle.trim()) { setError("Title and video URL are required"); return; }
    setBusy(true); setError("");
    try {
      const room_code = genCode();
      const rec = await base44.entities.WatchParty.create({
        room_code,
        title: cTitle.trim(),
        video_url: cUrl.trim(),
        poster_url: cPoster.trim(),
        is_playing: false,
        current_time: 0,
        participants: user ? [user.id] : [],
        last_action_at: new Date().toISOString(),
      });
      setParty(rec);
      setMode("room");
    } catch (e) { setError(e.message || "Could not create room"); }
    finally { setBusy(false); }
  };

  const joinRoom = async () => {
    if (!code.trim()) { setError("Enter a room code"); return; }
    setBusy(true); setError("");
    try {
      const found = await base44.entities.WatchParty.filter({ room_code: code.trim().toUpperCase() });
      if (found.length === 0) { setError("No room with that code"); return; }
      setParty(found[0]);
      setMode("room");
    } catch (e) { setError(e.message || "Could not join room"); }
    finally { setBusy(false); }
  };

  const leave = () => { setParty(null); setMessages([]); setMode("lobby"); };

  const send = async () => {
    if (!text.trim() || !party) return;
    const t = text.trim();
    setText("");
    try {
      await base44.entities.WatchPartyMessage.create({
        room_code: party.room_code,
        user_name: user?.full_name || user?.email || "Guest",
        text: t,
      });
    } catch {}
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(party.room_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (mode === "lobby") {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-6 h-6 text-mg-green" />
          <h2 className="text-xl font-bold text-white">Watch Party</h2>
        </div>
        <p className="text-white/50 text-sm mb-6">
          Watch a stream in sync with friends. Create a room, share the code, and everyone's player stays locked together.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-mg-card border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="w-4 h-4 text-mg-green" />
              <h3 className="text-white font-semibold text-sm">Create a room</h3>
            </div>
            <input value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="Title (e.g. Movie Night)" className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 mb-2 outline-none focus:border-mg-green/60" />
            <input value={cUrl} onChange={(e) => setCUrl(e.target.value)} placeholder="Video URL (mp4 or .m3u8)" className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 mb-2 outline-none focus:border-mg-green/60" />
            <input value={cPoster} onChange={(e) => setCPoster(e.target.value)} placeholder="Poster URL (optional)" className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 mb-3 outline-none focus:border-mg-green/60" />
            <button onClick={createRoom} disabled={busy} className="w-full flex items-center justify-center gap-1.5 bg-mg-green text-black font-semibold text-sm px-3 py-2 rounded-md hover:bg-mg-green-dim disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create room
            </button>
          </div>
          <div className="bg-mg-card border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRight className="w-4 h-4 text-mg-green" />
              <h3 className="text-white font-semibold text-sm">Join a room</h3>
            </div>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Room code" className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 mb-3 uppercase outline-none focus:border-mg-green/60" />
            <button onClick={joinRoom} disabled={busy} className="w-full flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-3 py-2 rounded-md disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Join
            </button>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-white font-bold text-base truncate">{party.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-white/40">Room code</span>
            <button onClick={copyCode} className="flex items-center gap-1 bg-mg-card border border-white/10 rounded px-2 py-0.5 text-mg-green font-mono text-xs font-bold">
              {party.room_code}
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
            <span className="text-[10px] text-white/30">{isHost ? "HOST" : "GUEST"}</span>
          </div>
        </div>
        <button onClick={leave} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-md">
          <LogOut className="w-4 h-4" /> Leave
        </button>
      </div>

      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 mb-4">
        <PartyPlayer
          src={party.video_url}
          isHost={isHost}
          isPlaying={party.is_playing}
          currentTime={party.current_time}
          onHostState={onHostState}
        />
        {!isHost && (
          <div className="absolute top-2 left-2 text-[10px] bg-black/60 text-white/70 px-2 py-0.5 rounded">
            Synced to host
          </div>
        )}
      </div>

      <div className="bg-mg-card border border-white/10 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Send className="w-4 h-4 text-mg-green" />
          <h3 className="text-white font-semibold text-sm">Chat</h3>
        </div>
        <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 mb-3">
          {messages.length === 0 && <p className="text-white/30 text-xs">No messages yet. Say hi!</p>}
          {messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="text-mg-green font-semibold text-xs">{m.user_name}: </span>
              <span className="text-white/80">{m.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Type a message…"
            className="flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-mg-green/60"
          />
          <button onClick={send} className="flex items-center gap-1 bg-mg-green text-black font-semibold text-sm px-3 py-2 rounded-md hover:bg-mg-green-dim">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}