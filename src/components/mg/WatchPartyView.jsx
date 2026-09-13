import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Link2,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Trash2,
  Users,
} from "lucide-react";

import { base44 } from "@/api/base44Client";
import PartyPlayer from "@/components/mg/PartyPlayer";

const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const clean = (value) => String(value ?? "").trim();

const validWatchUrl = (value) => {
  const url = clean(value);
  if (!/^https?:\/\//i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const removePartyQuery = () => {
  if (typeof window === "undefined") return;

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("party");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL cleanup is convenience only.
  }
};

export default function WatchPartyView() {
  const [mode, setMode] = useState("lobby");
  const [user, setUser] = useState(null);
  const [party, setParty] = useState(null);
  const [code, setCode] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [cTitle, setCTitle] = useState("");
  const [cUrl, setCUrl] = useState("");
  const [cPoster, setCPoster] = useState("");
  const [presences, setPresences] = useState([]);
  const presenceIdRef = useRef("");
  const messageEndRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const isHost = Boolean(party && user && party.created_by_id === user.id);
  const roomCode = clean(party?.room_code).toUpperCase();

  const activeParticipants = useMemo(() => {
    const cutoff = Date.now() - 30000;
    const byUser = new Map();

    presences.forEach((presence) => {
      const seen = new Date(presence?.last_seen_at || 0).getTime();
      if (!Number.isFinite(seen) || seen < cutoff) return;

      const key = clean(presence?.user_id || presence?.id);
      if (!key) return;

      const previous = byUser.get(key);
      if (!previous || seen > previous.seen) {
        byUser.set(key, {
          seen,
          name: clean(presence?.user_name) || "Guest",
        });
      }
    });

    return Array.from(byUser.values()).sort((a, b) => b.seen - a.seen);
  }, [presences]);

  const shareUrl = useMemo(() => {
    if (!roomCode || typeof window === "undefined") return "";
    const url = new URL(window.location.origin);
    url.searchParams.set("party", roomCode);
    return url.toString();
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !user?.id) {
      setPresences([]);
      presenceIdRef.current = "";
      return undefined;
    }

    let cancelled = false;
    let heartbeatTimer = null;

    const userName = user?.full_name || user?.email || "Guest";

    const loadRoomPresences = async () => {
      try {
        const rows = await base44.entities.WatchPartyPresence.filter({
          room_code: roomCode,
        });
        if (!cancelled) setPresences(Array.isArray(rows) ? rows : []);
      } catch {
        // Presence is helpful but must never interrupt the room itself.
      }
    };

    const heartbeat = async () => {
      const now = new Date().toISOString();

      try {
        if (!presenceIdRef.current) {
          const ownRows = await base44.entities.WatchPartyPresence.filter({
            room_code: roomCode,
            user_id: user.id,
          });
          const existing = Array.isArray(ownRows) ? ownRows[0] : null;

          if (existing?.id) {
            presenceIdRef.current = existing.id;
          } else {
            const created = await base44.entities.WatchPartyPresence.create({
              room_code: roomCode,
              user_id: user.id,
              user_name: userName,
              last_seen_at: now,
            });
            presenceIdRef.current = created?.id || "";
          }
        }

        if (presenceIdRef.current) {
          await base44.entities.WatchPartyPresence.update(presenceIdRef.current, {
            user_name: userName,
            last_seen_at: now,
          });
        }
      } catch {
        // Retry on the next heartbeat.
      }

      await loadRoomPresences();
    };

    heartbeat();
    heartbeatTimer = window.setInterval(heartbeat, 10000);

    return () => {
      cancelled = true;
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);

      const presenceId = presenceIdRef.current;
      presenceIdRef.current = "";
      if (presenceId) {
        base44.entities.WatchPartyPresence.delete(presenceId).catch(() => {});
      }
    };
  }, [roomCode, user?.id, user?.full_name, user?.email]);

  useEffect(() => {
    if (!party?.id) return undefined;

    const unsubscribe = base44.entities.WatchParty.subscribe((event) => {
      if (event.type === "delete" && event.data?.id === party.id) {
        setParty(null);
        setMessages([]);
        setMode("lobby");
        setError("That watch party has ended.");
        removePartyQuery();
        return;
      }

      if (event.data?.id === party.id) {
        setParty((current) => ({ ...current, ...event.data }));
      }
    });

    return unsubscribe;
  }, [party?.id]);

  useEffect(() => {
    if (!roomCode) return undefined;

    let cancelled = false;

    base44.entities.WatchPartyMessage.filter({ room_code: roomCode })
      .then((rows) => {
        if (cancelled) return;

        const ordered = (Array.isArray(rows) ? rows : [])
          .slice()
          .sort(
            (a, b) =>
              new Date(a?.created_date || 0).getTime() -
              new Date(b?.created_date || 0).getTime()
          )
          .slice(-200);

        setMessages(ordered);
      })
      .catch(() => {});

    const unsubscribe = base44.entities.WatchPartyMessage.subscribe((event) => {
      if (
        event.type === "create" &&
        clean(event.data?.room_code).toUpperCase() === roomCode
      ) {
        setMessages((current) => {
          if (current.some((message) => message?.id === event.data?.id)) return current;
          return [...current, event.data]
            .sort(
              (a, b) =>
                new Date(a?.created_date || 0).getTime() -
                new Date(b?.created_date || 0).getTime()
            )
            .slice(-200);
        });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [roomCode]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: "smooth",
    });
  }, [messages.length]);

  const onHostState = async (patch) => {
    if (!party || !isHost) return;

    try {
      await base44.entities.WatchParty.update(party.id, {
        ...patch,
        last_action_at: new Date().toISOString(),
      });
    } catch {
      setError("The room could not sync that playback change. Try Refresh room.");
    }
  };

  const createRoom = async () => {
    const title = clean(cTitle);
    const videoUrl = clean(cUrl);
    const posterUrl = clean(cPoster);

    if (!title) {
      setError("Enter a title for the watch party.");
      return;
    }

    if (!validWatchUrl(videoUrl)) {
      setError("Enter a valid http/https video or HLS URL.");
      return;
    }

    if (posterUrl && !validWatchUrl(posterUrl)) {
      setError("The optional poster must be a valid http/https URL.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      let room_code = genCode();

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const existing = await base44.entities.WatchParty.filter({ room_code });
        if (!Array.isArray(existing) || existing.length === 0) break;
        room_code = genCode();
      }

      const record = await base44.entities.WatchParty.create({
        room_code,
        title,
        video_url: videoUrl,
        poster_url: posterUrl,
        is_playing: false,
        current_time: 0,
        participants: user?.id ? [user.id] : [],
        last_action_at: new Date().toISOString(),
      });

      setParty(record);
      setCode(room_code);
      setMessages([]);
      setMode("room");

      const url = new URL(window.location.href);
      url.searchParams.set("party", room_code);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (createError) {
      setError(createError?.message || "Could not create the watch party.");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async (overrideCode) => {
    const wanted = clean(overrideCode || code).toUpperCase();

    if (!wanted) {
      setError("Enter a room code.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const found = await base44.entities.WatchParty.filter({ room_code: wanted });
      const record = Array.isArray(found) ? found[0] : null;

      if (!record) {
        setError("No active room was found with that code.");
        return;
      }

      setParty(record);
      setCode(wanted);
      setMode("room");

      const url = new URL(window.location.href);
      url.searchParams.set("party", wanted);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (joinError) {
      setError(joinError?.message || "Could not join the watch party.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedCode = clean(params.get("party")).toUpperCase();
    if (!sharedCode) return;

    setCode(sharedCode);
    joinRoom(sharedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshRoom = async () => {
    if (!roomCode) return;
    setRefreshing(true);
    setError("");

    try {
      const rows = await base44.entities.WatchParty.filter({ room_code: roomCode });
      const record = Array.isArray(rows) ? rows[0] : null;

      if (!record) {
        setParty(null);
        setMessages([]);
        setMode("lobby");
        setError("This watch party has ended.");
        removePartyQuery();
        return;
      }

      setParty(record);
    } catch (refreshError) {
      setError(refreshError?.message || "Could not refresh the watch party.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!roomCode) return undefined;

    const recoverRoom = () => {
      if (document.visibilityState === "visible") {
        refreshRoom();
      }
    };

    window.addEventListener("online", recoverRoom);
    document.addEventListener("visibilitychange", recoverRoom);

    return () => {
      window.removeEventListener("online", recoverRoom);
      document.removeEventListener("visibilitychange", recoverRoom);
    };
    // refreshRoom intentionally reads the latest room code from state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const leave = () => {
    const presenceId = presenceIdRef.current;
    presenceIdRef.current = "";
    if (presenceId) {
      base44.entities.WatchPartyPresence.delete(presenceId).catch(() => {});
    }

    setParty(null);
    setMessages([]);
    setPresences([]);
    setMode("lobby");
    setError("");
    removePartyQuery();
  };

  const endRoom = async () => {
    if (!party?.id || !isHost || busy) return;
    setBusy(true);
    setError("");

    try {
      await base44.entities.WatchParty.delete(party.id);
      const presenceId = presenceIdRef.current;
      presenceIdRef.current = "";
      if (presenceId) {
        base44.entities.WatchPartyPresence.delete(presenceId).catch(() => {});
      }
      setParty(null);
      setMessages([]);
      setPresences([]);
      setMode("lobby");
      removePartyQuery();
    } catch (endError) {
      setError(endError?.message || "Could not end the room.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const message = clean(text);
    if (!message || !party || busy) return;

    setText("");
    setError("");

    try {
      await base44.entities.WatchPartyMessage.create({
        room_code: roomCode,
        user_name: user?.full_name || user?.email || "Guest",
        text: message.slice(0, 500),
      });
    } catch (sendError) {
      setText(message);
      setError(sendError?.message || "Your message could not be sent.");
    }
  };

  const copyCode = async () => {
    if (!roomCode) return;

    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("The room code could not be copied on this device.");
    }
  };

  const shareLink = async () => {
    if (!shareUrl) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: party?.title || "Media God Watch Party",
          text: `Join my Media God watch party. Room ${roomCode}`,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1500);
    } catch (shareError) {
      if (shareError?.name !== "AbortError") {
        setError("The watch-party link could not be shared on this device.");
      }
    }
  };

  if (mode === "lobby") {
    return (
      <div data-mg-watch-party-view="true" className="p-4 sm:p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-6 h-6 text-mg-green" />
          <h1 className="text-xl font-bold text-white">Watch Party</h1>
        </div>

        <p className="text-white/50 text-sm mb-6">
          Watch the same stream in sync, share a room code and chat while it plays.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-mg-card border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="w-4 h-4 text-mg-green" />
              <h2 className="text-white font-semibold text-sm">Create a room</h2>
            </div>

            <input
              value={cTitle}
              onChange={(event) => setCTitle(event.target.value)}
              placeholder="Title (e.g. Movie Night)"
              maxLength={120}
              className="w-full min-h-11 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 mb-2 outline-none focus:border-mg-green/60"
            />
            <input
              value={cUrl}
              onChange={(event) => setCUrl(event.target.value)}
              placeholder="Video URL (mp4 or .m3u8)"
              inputMode="url"
              className="w-full min-h-11 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 mb-2 outline-none focus:border-mg-green/60"
            />
            <input
              value={cPoster}
              onChange={(event) => setCPoster(event.target.value)}
              placeholder="Poster URL (optional)"
              inputMode="url"
              className="w-full min-h-11 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 mb-3 outline-none focus:border-mg-green/60"
            />

            <p className="mb-3 flex items-start gap-2 text-[11px] leading-relaxed text-white/35">
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Use a stream URL you are authorised to share. Protected subscription links may only work for the account that created them.
            </p>

            <button
              type="button"
              onClick={createRoom}
              disabled={busy}
              className="w-full min-h-11 flex items-center justify-center gap-1.5 bg-mg-green text-black font-semibold text-sm px-3 py-2 rounded-md hover:bg-mg-green-dim disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create room
            </button>
          </div>

          <div className="bg-mg-card border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRight className="w-4 h-4 text-mg-green" />
              <h2 className="text-white font-semibold text-sm">Join a room</h2>
            </div>

            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") joinRoom();
              }}
              placeholder="Room code"
              maxLength={12}
              autoCapitalize="characters"
              className="w-full min-h-11 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 mb-3 uppercase outline-none focus:border-mg-green/60"
            />

            <button
              type="button"
              onClick={() => joinRoom()}
              disabled={busy}
              className="w-full min-h-11 flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-3 py-2 rounded-md disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Join
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-red-300 text-sm mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-mg-watch-party-room="true" className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-white font-bold text-base truncate">{party.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-white/40">Room code</span>
            <button
              type="button"
              onClick={copyCode}
              className="min-h-9 flex items-center gap-1 bg-mg-card border border-white/10 rounded px-2 py-1 text-mg-green font-mono text-xs font-bold"
            >
              {roomCode}
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={shareLink}
              className="min-h-9 flex items-center gap-1 bg-mg-card border border-white/10 rounded px-2 py-1 text-white/80 text-xs font-semibold hover:text-white"
            >
              <Share2 className="w-3 h-3" />
              {linkCopied ? <Check className="w-3 h-3 text-mg-green" /> : "Share"}
            </button>
            <span className="text-[10px] text-white/30">{isHost ? "HOST" : "GUEST"}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/55">
              <Users className="h-3 w-3 text-mg-green" />
              {Math.max(1, activeParticipants.length)} online
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={refreshRoom}
            disabled={refreshing}
            className="min-h-10 flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold px-3 py-2 rounded-md disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Sync
          </button>

          {isHost ? (
            <button
              type="button"
              onClick={endRoom}
              disabled={busy}
              className="min-h-10 flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold px-3 py-2 rounded-md disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              End room
            </button>
          ) : (
            <button
              type="button"
              onClick={leave}
              className="min-h-10 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-md"
            >
              <LogOut className="w-4 h-4" />
              Leave
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 mb-4">
        <PartyPlayer
          src={party.video_url}
          poster={party.poster_url || ""}
          isHost={isHost}
          isPlaying={party.is_playing}
          currentTime={party.current_time}
          onHostState={onHostState}
        />
        {!isHost && (
          <div className="absolute top-2 left-2 text-[10px] bg-black/70 text-white/75 px-2 py-1 rounded">
            Synced to host
          </div>
        )}
      </div>

      {activeParticipants.length > 0 && (
        <div className="mb-4 rounded-xl border border-white/10 bg-mg-card/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Users className="h-4 w-4 text-mg-green" />
              In this room
            </div>
            <span className="text-[10px] uppercase tracking-wide text-white/35">
              Live presence
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {activeParticipants.slice(0, 12).map((participant, index) => (
              <span
                key={`${participant.name}-${participant.seen}-${index}`}
                className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-xs text-white/60"
              >
                {participant.name}
              </span>
            ))}
            {activeParticipants.length > 12 && (
              <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-xs text-white/45">
                +{activeParticipants.length - 12} more
              </span>
            )}
          </div>
        </div>
      )}

      <div className="bg-mg-card border border-white/10 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Send className="w-4 h-4 text-mg-green" />
          <h2 className="text-white font-semibold text-sm">Chat</h2>
        </div>

        <div className="max-h-56 overflow-y-auto flex flex-col gap-1.5 mb-3" aria-live="polite">
          {messages.length === 0 && (
            <p className="text-white/30 text-xs">No messages yet. Say hi!</p>
          )}
          {messages.map((message) => (
            <div key={message.id} className="text-sm break-words">
              <span className="text-mg-green font-semibold text-xs">
                {message.user_name || "Guest"}:{" "}
              </span>
              <span className="text-white/80">{message.text}</span>
            </div>
          ))}
          <div ref={messageEndRef} aria-hidden="true" />
        </div>

        <div className="flex gap-2">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            maxLength={500}
            placeholder="Type a message…"
            className="min-h-11 flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-mg-green/60"
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim()}
            aria-label="Send watch party message"
            className="min-h-11 min-w-11 flex items-center justify-center gap-1 bg-mg-green text-black font-semibold text-sm px-3 py-2 rounded-md hover:bg-mg-green-dim disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
