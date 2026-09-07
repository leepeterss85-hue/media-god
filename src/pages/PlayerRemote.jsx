import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  FastForward,
  Pause,
  Play,
  Rewind,
  Smartphone,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Search,
  Film,
  Tv,
  Captions,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";

const parseJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);

  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

export default function PlayerRemote() {
  const { sessionCode = "" } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(0);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseResults, setBrowseResults] = useState([]);
  const [browseSearching, setBrowseSearching] = useState(false);
  const [browseTarget, setBrowseTarget] = useState(null);
  const [browseSeasons, setBrowseSeasons] = useState([]);
  const [browseSeason, setBrowseSeason] = useState(0);
  const [browseEpisodes, setBrowseEpisodes] = useState([]);
  const [browseEpisode, setBrowseEpisode] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [liveQuery, setLiveQuery] = useState("");
  const [liveResults, setLiveResults] = useState([]);
  const [liveSearching, setLiveSearching] = useState(false);
  const seqRef = useRef(0);

  const sourceLabels = useMemo(
    () => parseJson(session?.source_labels, []),
    [session?.source_labels]
  );

  const fileLabels = useMemo(
    () => parseJson(session?.file_labels, []),
    [session?.file_labels]
  );

  const audioLabels = useMemo(
    () => parseJson(session?.audio_labels, []),
    [session?.audio_labels]
  );

  const subtitleLabels = useMemo(
    () => parseJson(session?.subtitle_labels, []),
    [session?.subtitle_labels]
  );

  useEffect(() => {
    if (
      session?.media_type !== "tv" ||
      !session?.tmdb_id
    ) {
      setSeasons([]);
      setEpisodes([]);
      setSelectedSeason(0);
      return;
    }

    let cancelled = false;

    const loadSeasons = async () => {
      try {
        const response = await base44.functions.invoke(
          "getTmdbMovies",
          {
            media_type: "tv",
            movie_id: session.tmdb_id,
          }
        );

        if (cancelled) return;

        const data = response?.data ?? response ?? {};
        const nextSeasons = Array.isArray(data?.details?.seasons)
          ? data.details.seasons
              .filter((item) => Number(item?.season_number || 0) > 0)
              .sort(
                (a, b) =>
                  Number(a?.season_number || 0) -
                  Number(b?.season_number || 0)
              )
          : [];

        setSeasons(nextSeasons);
        setSelectedSeason(
          Number(session?.season_number || nextSeasons[0]?.season_number || 1)
        );
      } catch {
        if (!cancelled) {
          setSeasons([]);
        }
      }
    };

    loadSeasons();

    return () => {
      cancelled = true;
    };
  }, [session?.media_type, session?.tmdb_id]);

  useEffect(() => {
    if (
      session?.media_type !== "tv" ||
      !session?.tmdb_id ||
      !selectedSeason
    ) {
      setEpisodes([]);
      return;
    }

    let cancelled = false;
    setEpisodesLoading(true);

    base44.functions
      .invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: session.tmdb_id,
        season_number: selectedSeason,
      })
      .then((response) => {
        if (cancelled) return;
        const data = response?.data ?? response ?? {};
        const nextEpisodes = Array.isArray(data?.episodes)
          ? data.episodes
              .filter(
                (item) =>
                  Number(
                    item?.episode_number ??
                      item?.episodeNumber ??
                      item?.episode ??
                      0
                  ) > 0
              )
              .sort(
                (a, b) =>
                  Number(a?.episode_number ?? a?.episodeNumber ?? a?.episode ?? 0) -
                  Number(b?.episode_number ?? b?.episodeNumber ?? b?.episode ?? 0)
              )
          : [];
        setEpisodes(nextEpisodes);
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      })
      .finally(() => {
        if (!cancelled) setEpisodesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.media_type, session?.tmdb_id, selectedSeason]);

  useEffect(() => {
    if (
      session?.media_type === "tv" &&
      Number(session?.season_number || 0) > 0
    ) {
      setSelectedSeason(Number(session.season_number));
    }
  }, [session?.media_type, session?.season_number]);

  useEffect(() => {
    const query = browseQuery.trim();

    if (query.length < 2) {
      setBrowseResults([]);
      setBrowseSearching(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setBrowseSearching(true);

      try {
        const response = await base44.functions.invoke(
          "getTmdbMovies",
          { multi_search: query }
        );
        const raw = response?.data?.movies || [];

        if (!cancelled) {
          setBrowseResults(
            raw
              .filter((item) => item?.id || item?.tmdb_id)
              .slice(0, 12)
              .map((item) => {
                const mediaType =
                  item?.media_type === "tv" ||
                  (item?.name && !item?.title)
                    ? "tv"
                    : "movie";

                return {
                  ...item,
                  id: item?.id || item?.tmdb_id,
                  mediaType,
                  title: item?.title || item?.name || "Untitled",
                  year:
                    item?.year ||
                    String(
                      item?.release_date || item?.first_air_date || ""
                    ).slice(0, 4),
                  poster:
                    item?.poster_url || item?.poster || item?.poster_path || "",
                };
              })
          );
        }
      } catch {
        if (!cancelled) setBrowseResults([]);
      } finally {
        if (!cancelled) setBrowseSearching(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [browseQuery]);

  useEffect(() => {
    const query = liveQuery.trim();

    if (query.length < 3) {
      setLiveResults([]);
      setLiveSearching(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLiveSearching(true);

      try {
        const matches = await findChannelsByTitle(query);

        if (!cancelled) {
          setLiveResults(
            (Array.isArray(matches) ? matches : [])
              .filter((item) => item?.name && item?.url)
              .slice(0, 12)
          );
        }
      } catch {
        if (!cancelled) setLiveResults([]);
      } finally {
        if (!cancelled) setLiveSearching(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [liveQuery]);

  useEffect(() => {
    if (browseTarget?.mediaType !== "tv" || !browseTarget?.id) {
      setBrowseSeasons([]);
      setBrowseSeason(0);
      setBrowseEpisodes([]);
      setBrowseEpisode(0);
      return;
    }

    let cancelled = false;
    setBrowseLoading(true);

    base44.functions
      .invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: browseTarget.id,
      })
      .then((response) => {
        if (cancelled) return;
        const data = response?.data ?? response ?? {};
        const next = Array.isArray(data?.details?.seasons)
          ? data.details.seasons
              .filter(
                (item) =>
                  Number(item?.season_number || 0) > 0 &&
                  Number(item?.episode_count || 0) > 0
              )
              .sort(
                (a, b) =>
                  Number(a?.season_number || 0) -
                  Number(b?.season_number || 0)
              )
          : [];

        setBrowseSeasons(next);
        setBrowseSeason(Number(next[0]?.season_number || 1));
      })
      .catch(() => {
        if (!cancelled) setBrowseSeasons([]);
      })
      .finally(() => {
        if (!cancelled) setBrowseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [browseTarget]);

  useEffect(() => {
    if (
      browseTarget?.mediaType !== "tv" ||
      !browseTarget?.id ||
      !browseSeason
    ) {
      setBrowseEpisodes([]);
      setBrowseEpisode(0);
      return;
    }

    let cancelled = false;
    setBrowseLoading(true);

    base44.functions
      .invoke("getTmdbMovies", {
        media_type: "tv",
        movie_id: browseTarget.id,
        season_number: browseSeason,
      })
      .then((response) => {
        if (cancelled) return;
        const data = response?.data ?? response ?? {};
        const next = Array.isArray(data?.episodes)
          ? data.episodes
              .filter(
                (item) =>
                  Number(
                    item?.episode_number ?? item?.episodeNumber ?? item?.episode ?? 0
                  ) > 0
              )
              .sort(
                (a, b) =>
                  Number(a?.episode_number ?? a?.episodeNumber ?? a?.episode ?? 0) -
                  Number(b?.episode_number ?? b?.episodeNumber ?? b?.episode ?? 0)
              )
          : [];
        setBrowseEpisodes(next);
        setBrowseEpisode(
          Number(
            next[0]?.episode_number ??
              next[0]?.episodeNumber ??
              next[0]?.episode ??
              0
          )
        );
      })
      .catch(() => {
        if (!cancelled) setBrowseEpisodes([]);
      })
      .finally(() => {
        if (!cancelled) setBrowseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [browseTarget, browseSeason]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;

    const load = async () => {
      try {
        const rows = await base44.entities.PlayerRemoteSession.filter({
          session_code: sessionCode,
        });

        if (cancelled) return;

        const record = Array.isArray(rows) ? rows[0] : null;

        if (!record) {
          setError("This remote session was not found.");
          setLoading(false);
          return;
        }

        if (record.expires_at && new Date(record.expires_at).getTime() < Date.now()) {
          setError("This remote session has expired. Scan a new QR code on the TV.");
          setLoading(false);
          return;
        }

        seqRef.current = Number(record.command_seq || 0);
        setSession(record);
        setLoading(false);

        unsubscribe = base44.entities.PlayerRemoteSession.subscribe((event) => {
          if (event.data?.id !== record.id) return;

          if (event.type === "delete") {
            setSession(null);
            setError("The player session has ended.");
            return;
          }

          setSession((current) => ({ ...current, ...event.data }));
          seqRef.current = Math.max(seqRef.current, Number(event.data?.command_seq || 0));
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || "Could not connect to the TV player.");
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [sessionCode]);

  const send = async (command, value = "") => {
    if (!session?.id || busy) return;

    const nextSeq = Math.max(seqRef.current, Number(session.command_seq || 0)) + 1;
    seqRef.current = nextSeq;
    setBusy(true);

    try {
      await base44.entities.PlayerRemoteSession.update(session.id, {
        command,
        command_value: String(value ?? ""),
        command_seq: nextSeq,
        last_seen_at: new Date().toISOString(),
      });
    } catch (sendError) {
      setError(sendError?.message || "The command could not be sent.");
    } finally {
      window.setTimeout(() => setBusy(false), 90);
    }
  };

  const playPreviousEpisode = async () => {
    const currentSeason = Number(session?.season_number || 0);
    const currentEpisode = Number(session?.episode_number || 0);

    if (!currentSeason || !currentEpisode || !session?.tmdb_id) {
      return;
    }

    if (currentEpisode > 1) {
      await send(
        "episode",
        JSON.stringify({
          tmdbId: session.tmdb_id,
          season: currentSeason,
          episode: currentEpisode - 1,
        })
      );
      return;
    }

    const previousSeason = [...seasons]
      .filter(
        (item) =>
          Number(item?.season_number || 0) < currentSeason &&
          Number(item?.episode_count || 0) > 0
      )
      .sort(
        (a, b) =>
          Number(b?.season_number || 0) -
          Number(a?.season_number || 0)
      )[0];

    const previousSeasonNumber = Number(previousSeason?.season_number || 0);

    if (!previousSeasonNumber) {
      return;
    }

    try {
      const response = await base44.functions.invoke(
        "getTmdbMovies",
        {
          media_type: "tv",
          movie_id: session.tmdb_id,
          season_number: previousSeasonNumber,
        }
      );

      const data = response?.data ?? response ?? {};
      const previousEpisodes = Array.isArray(data?.episodes)
        ? data.episodes
            .map((item) =>
              Number(
                item?.episode_number ??
                  item?.episodeNumber ??
                  item?.episode ??
                  0
              )
            )
            .filter((value) => value > 0)
        : [];

      const lastEpisode = previousEpisodes.length
        ? Math.max(...previousEpisodes)
        : Number(previousSeason?.episode_count || 0);

      if (lastEpisode > 0) {
        await send(
          "episode",
          JSON.stringify({
            tmdbId: session.tmdb_id,
            season: previousSeasonNumber,
            episode: lastEpisode,
          })
        );
      }
    } catch {
      // If previous-season metadata is unavailable, leave playback unchanged.
    }
  };

  const sendBrowseSelection = async (item = browseTarget) => {
    if (!item?.id) return;

    if (item.mediaType === "tv") {
      if (!browseSeason || !browseEpisode) {
        setError("Choose a season and episode first.");
        return;
      }

      const episodeItem = browseEpisodes.find(
        (episode) =>
          Number(
            episode?.episode_number ??
              episode?.episodeNumber ??
              episode?.episode ??
              0
          ) === Number(browseEpisode)
      );

      await send(
        "play_media",
        JSON.stringify({
          id: item.id,
          tmdbId: item.id,
          title: item.title,
          year: item.year || "",
          poster: item.poster || "",
          mediaType: "tv",
          season: browseSeason,
          episode: browseEpisode,
          episodeItem: episodeItem || null,
        })
      );
    } else {
      await send(
        "play_media",
        JSON.stringify({
          id: item.id,
          tmdbId: item.id,
          title: item.title,
          year: item.year || "",
          poster: item.poster || "",
          mediaType: "movie",
        })
      );
    }

    setBrowseQuery("");
    setBrowseResults([]);
    setBrowseTarget(null);
  };

  const sendLiveChannel = async (channel) => {
    if (!channel?.name) return;

    await send(
      "play_live",
      JSON.stringify({
        id: channel?.tvgId || channel?.id || "",
        name: channel.name,
      })
    );

    setLiveQuery("");
    setLiveResults([]);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <Smartphone className="mx-auto h-10 w-10 text-mg-green" />
          <p className="mt-3 text-sm text-white/60">Connecting to Media God…</p>
        </div>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Smartphone className="mx-auto h-10 w-10 text-mg-green" />
          <h1 className="mt-3 text-xl font-bold">Media God Remote</h1>
          <p className="mt-2 text-sm text-white/60">{error}</p>
        </div>
      </main>
    );
  }

  const closed = session?.status === "closed";
  const idle = session?.status === "idle" || !session?.media_type;
  const current = Number(session?.current_time || 0);
  const duration = Number(session?.duration || 0);
  const progress = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mg-green/15 text-mg-green">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mg-green">Media God Remote</p>
            <h1 className="truncate text-lg font-bold">{session?.title || "Now playing"}</h1>
          </div>
        </div>

        {closed ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-white/60">
            The TV companion is offline. Open Media God on the TV again to reconnect this pairing.
          </div>
        ) : (
          <>
            {idle && (
              <div className="mt-6 rounded-2xl border border-mg-green/25 bg-mg-green/10 p-4 text-center">
                <p className="text-sm font-bold text-mg-green">TV ready</p>
                <p className="mt-1 text-xs text-white/55">
                  Browse below and send a film, episode or Live TV channel straight to the Firestick.
                </p>
              </div>
            )}

            <section className={idle ? "hidden" : "mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl"}>
              <div className="flex items-center justify-between text-xs text-white/55">
                <span>{formatTime(current)}</span>
                <span>{duration > 0 ? formatTime(duration) : "Live / loading"}</span>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={0.2}
                value={progress}
                disabled={duration <= 0}
                onChange={(event) => {
                  if (duration <= 0) return;
                  send("seek_to", (Number(event.target.value) / 100) * duration);
                }}
                className="mt-2 h-2 w-full accent-mg-green disabled:opacity-40"
                aria-label="Seek"
              />

              <div className="mt-5 grid grid-cols-5 gap-2">
                <button onClick={() => send("seek_delta", -10)} className="remote-btn" aria-label="Back 10 seconds">
                  <Rewind className="h-5 w-5" />
                </button>

                <button onClick={() => send("pause")} className="remote-btn" aria-label="Pause">
                  <Pause className="h-5 w-5" />
                </button>

                <button onClick={() => send("play_pause")} className="remote-btn remote-btn-primary" aria-label={session?.paused ? "Play" : "Pause or play"}>
                  {session?.paused ? <Play className="h-6 w-6 fill-current" /> : <Pause className="h-6 w-6 fill-current" />}
                </button>

                <button onClick={() => send("play")} className="remote-btn" aria-label="Play">
                  <Play className="h-5 w-5 fill-current" />
                </button>

                <button onClick={() => send("seek_delta", 10)} className="remote-btn" aria-label="Forward 10 seconds">
                  <FastForward className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button onClick={() => send("mute_toggle")} className="remote-btn h-11 w-11 shrink-0" aria-label="Mute or unmute">
                  {Number(session?.volume || 0) <= 0 ? (
                    <VolumeX className="h-5 w-5" />
                  ) : (
                    <Volume2 className="h-5 w-5" />
                  )}
                </button>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={Number(session?.volume || 0)}
                  onChange={(event) => send("volume", event.target.value)}
                  className="h-2 min-w-0 flex-1 accent-mg-green"
                  aria-label="Volume"
                />
              </div>
            </section>

            <section className={idle ? "hidden" : "mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"}>
              <button
                onClick={() => send("next_source")}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-mg-green px-4 text-sm font-bold text-black active:scale-[0.99]"
              >
                <SkipForward className="h-5 w-5" />
                Try next source / fix audio
              </button>

              {sourceLabels.length > 1 && (
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-white/60">Playback source</span>
                  <select
                    value={Number(session?.active_source_index || 0)}
                    onChange={(event) => send("source", event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green"
                  >
                    {sourceLabels.map((label, index) => (
                      <option key={`${index}-${label}`} value={index}>
                        {label || `Source ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {fileLabels.length > 1 && (
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-white/60">Torrent file</span>
                  <select
                    value={String(session?.active_file_id || "")}
                    onChange={(event) => send("file", event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green"
                  >
                    {fileLabels.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {audioLabels.length > 0 && (
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-white/60">Audio track</span>
                  <select
                    value={Number(session?.active_audio_index ?? -1)}
                    onChange={(event) => send("audio", event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green"
                  >
                    {audioLabels.map((label, index) => (
                      <option key={`${index}-${label}`} value={index}>
                        {label || `Audio ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {subtitleLabels.length > 0 && (
                <div className="grid gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-mg-green">
                    <Captions className="h-4 w-4" />
                    Subtitles
                  </div>

                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-white/60">Subtitle track</span>
                    <select
                      value={Number(session?.active_subtitle_index ?? -1)}
                      onChange={(event) => send("subtitle", event.target.value)}
                      className="min-h-12 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green"
                    >
                      <option value={-1}>Off</option>
                      {subtitleLabels.map((label, index) => (
                        <option key={`${index}-${label}`} value={index}>
                          {label || `Subtitle ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-white/60">Size</span>
                      <select
                        value={session?.subtitle_size || "medium"}
                        onChange={(event) =>
                          send(
                            "subtitle_style",
                            JSON.stringify({ size: event.target.value })
                          )
                        }
                        className="min-h-11 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green"
                      >
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                        <option value="extra-large">Extra large</option>
                      </select>
                    </label>

                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-white/60">Background</span>
                      <select
                        value={session?.subtitle_background || "medium"}
                        onChange={(event) =>
                          send(
                            "subtitle_style",
                            JSON.stringify({ background: event.target.value })
                          )
                        }
                        className="min-h-11 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green"
                      >
                        <option value="none">None</option>
                        <option value="light">Light</option>
                        <option value="medium">Medium</option>
                        <option value="dark">Dark</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {session?.media_type === "tv" && (
                <div className="mt-1 grid gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-mg-green">
                        Episode controls
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        S{Number(session?.season_number || 0)} · E{Number(session?.episode_number || 0)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        send(
                          "auto_next",
                          session?.auto_next === false ? "1" : "0"
                        )
                      }
                      className={
                        "min-h-10 rounded-lg border px-3 text-xs font-semibold " +
                        (session?.auto_next === false
                          ? "border-white/15 bg-white/5 text-white/65"
                          : "border-mg-green/40 bg-mg-green/15 text-mg-green")
                      }
                    >
                      Auto next {session?.auto_next === false ? "Off" : "On"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={
                        Number(session?.episode_number || 0) <= 1 &&
                        !seasons.some(
                          (item) =>
                            Number(item?.season_number || 0) <
                              Number(session?.season_number || 0) &&
                            Number(item?.episode_count || 0) > 0
                        )
                      }
                      onClick={playPreviousEpisode}
                      className="remote-btn gap-2 disabled:opacity-35"
                    >
                      <SkipBack className="h-4 w-4" />
                      Previous episode
                    </button>

                    <button
                      type="button"
                      onClick={() => send("next_episode")}
                      className="remote-btn gap-2"
                    >
                      Next episode
                      <SkipForward className="h-4 w-4" />
                    </button>
                  </div>

                  {seasons.length > 0 && (
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-white/60">
                        Season
                      </span>
                      <select
                        value={selectedSeason}
                        onChange={(event) =>
                          setSelectedSeason(Number(event.target.value || 1))
                        }
                        className="min-h-12 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green"
                      >
                        {seasons.map((item) => (
                          <option
                            key={item.season_number}
                            value={item.season_number}
                          >
                            {item.name || `Season ${item.season_number}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-white/60">
                      Episode
                    </span>
                    <select
                      value={
                        selectedSeason === Number(session?.season_number || 0)
                          ? Number(session?.episode_number || 0)
                          : ""
                      }
                      disabled={episodesLoading || episodes.length === 0}
                      onChange={(event) => {
                        const episode = Number(event.target.value || 0);
                        if (!episode) return;
                        send(
                          "episode",
                          JSON.stringify({
                            tmdbId: session?.tmdb_id,
                            season: selectedSeason,
                            episode,
                          })
                        );
                      }}
                      className="min-h-12 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green disabled:opacity-50"
                    >
                      <option value="">
                        {episodesLoading ? "Loading episodes…" : "Choose episode"}
                      </option>
                      {episodes.map((item) => {
                        const episodeNumber = Number(
                          item?.episode_number ??
                            item?.episodeNumber ??
                            item?.episode ??
                            0
                        );

                        return (
                          <option
                            key={episodeNumber}
                            value={episodeNumber}
                          >
                            E{episodeNumber} · {item?.name || item?.title || `Episode ${episodeNumber}`}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-mg-green" />
                <div>
                  <p className="text-sm font-bold text-white">Browse & send to TV</p>
                  <p className="text-xs text-white/45">Search on your phone and start it on the Firestick.</p>
                </div>
              </div>

              <label className="relative mt-3 block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  value={browseQuery}
                  onChange={(event) => {
                    setBrowseQuery(event.target.value);
                    setBrowseTarget(null);
                  }}
                  placeholder="Search films or TV shows…"
                  className="min-h-12 w-full rounded-xl border border-white/15 bg-[#161616] pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green"
                />
              </label>

              {browseSearching && (
                <p className="mt-3 text-xs text-white/45">Searching…</p>
              )}

              {browseResults.length > 0 && !browseTarget && (
                <div className="mt-3 grid gap-2">
                  {browseResults.map((item) => {
                    const MediaIcon = item.mediaType === "tv" ? Tv : Film;

                    return (
                      <button
                        key={`${item.mediaType}-${item.id}`}
                        type="button"
                        onClick={() => {
                          if (item.mediaType === "movie") {
                            sendBrowseSelection(item);
                          } else {
                            setBrowseTarget(item);
                          }
                        }}
                        className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 text-left active:bg-white/10"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mg-green/10 text-mg-green">
                          <MediaIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                          <p className="text-xs text-white/45">
                            {item.mediaType === "tv" ? "TV Show" : "Film"}
                            {item.year ? ` · ${item.year}` : ""}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-mg-green">
                          {item.mediaType === "tv" ? "Choose episode" : "Play on TV"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {browseTarget?.mediaType === "tv" && (
                <div className="mt-3 grid gap-3 rounded-xl border border-mg-green/20 bg-mg-green/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{browseTarget.title}</p>
                      <p className="text-xs text-white/45">Choose the episode to start on the TV.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBrowseTarget(null)}
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60"
                    >
                      Back
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-xs text-white/50">Season</span>
                      <select
                        value={browseSeason}
                        disabled={browseLoading || browseSeasons.length === 0}
                        onChange={(event) => setBrowseSeason(Number(event.target.value || 0))}
                        className="min-h-11 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green disabled:opacity-50"
                      >
                        {browseSeasons.map((item) => (
                          <option key={item.season_number} value={item.season_number}>
                            {item.name || `Season ${item.season_number}`}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span className="mb-1 block text-xs text-white/50">Episode</span>
                      <select
                        value={browseEpisode}
                        disabled={browseLoading || browseEpisodes.length === 0}
                        onChange={(event) => setBrowseEpisode(Number(event.target.value || 0))}
                        className="min-h-11 w-full rounded-xl border border-white/15 bg-[#161616] px-3 text-sm text-white outline-none focus:border-mg-green disabled:opacity-50"
                      >
                        {browseEpisodes.map((item) => {
                          const number = Number(
                            item?.episode_number ?? item?.episodeNumber ?? item?.episode ?? 0
                          );
                          return (
                            <option key={number} value={number}>
                              E{number} · {item?.name || item?.title || `Episode ${number}`}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={!browseSeason || !browseEpisode || browseLoading}
                    onClick={() => sendBrowseSelection(browseTarget)}
                    className="min-h-12 rounded-xl bg-mg-green px-4 text-sm font-bold text-black disabled:opacity-40"
                  >
                    Play this episode on TV
                  </button>
                </div>
              )}

              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="flex items-center gap-2">
                  <Tv className="h-4 w-4 text-mg-green" />
                  <div>
                    <p className="text-sm font-bold text-white">Live TV</p>
                    <p className="text-xs text-white/45">Find a channel on your phone and switch the Firestick straight to it.</p>
                  </div>
                </div>

                <label className="relative mt-3 block">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <input
                    value={liveQuery}
                    onChange={(event) => setLiveQuery(event.target.value)}
                    placeholder="Search Live TV channels…"
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-[#161616] pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-mg-green"
                  />
                </label>

                {liveSearching && (
                  <p className="mt-3 text-xs text-white/45">Searching channels…</p>
                )}

                {liveResults.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {liveResults.map((channel, index) => (
                      <button
                        key={`${channel?.tvgId || channel?.id || channel?.name}-${index}`}
                        type="button"
                        onClick={() => sendLiveChannel(channel)}
                        className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 text-left active:bg-white/10"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-mg-green/10 text-mg-green">
                          {channel?.logo ? (
                            <img src={channel.logo} alt="" className="h-full w-full object-contain p-1" />
                          ) : (
                            <Tv className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{channel.name}</p>
                          <p className="truncate text-xs text-white/45">
                            {channel.group || channel.country || "Live TV"}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-mg-green">Watch on TV</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <button
              onClick={() => send("exit")}
              className={idle ? "hidden" : "mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm font-semibold text-red-200"}
            >
              <ArrowLeft className="h-4 w-4" />
              Exit player on TV
            </button>
          </>
        )}

        {error && session && <p className="mt-4 text-center text-xs text-red-300">{error}</p>}
      </div>

      <style>{`
        .remote-btn {
          display:flex;
          align-items:center;
          justify-content:center;
          min-height:48px;
          border-radius:12px;
          border:1px solid rgba(255,255,255,.13);
          background:rgba(255,255,255,.07);
          color:white;
          touch-action:manipulation;
        }
        .remote-btn:active { transform:scale(.97); background:rgba(255,255,255,.13); }
        .remote-btn-primary { background:#7ee787; color:#050505; border-color:transparent; }
      `}</style>
    </main>
  );
}
