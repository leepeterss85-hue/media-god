import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Smartphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  friendlyTrackLabel,
  readTrackPreferences,
  writeTrackPreferences,
} from "@/components/mg/mediaTrackPreferences";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const createSessionCode = () => {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random()
    .toString(36)
    .slice(2)}`;
};

const parseNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export default function PlayerQrRemote({
  title = "",
  videoRef,
  liveVideoRef,
  sourceLabels = [],
  activeSourceIndex = 0,
  onSelectSource,
  onTryNextSource,
  fileOptions = [],
  activeFileId = "",
  onSelectFile,
  onExit,
}) {
  const [session, setSession] = useState(null);
  const [qrUrl, setQrUrl] = useState("");
  const [error, setError] = useState("");
  const lastCommandSeqRef = useRef(0);
  const sessionRef = useRef(null);
  const sourceIndexRef = useRef(activeSourceIndex);
  const activeFileRef = useRef(activeFileId);
  const titleRef = useRef(title);
  const sourceLabelsRef = useRef(sourceLabels);
  const fileOptionsRef = useRef(fileOptions);
  const callbacksRef = useRef({
    onSelectSource,
    onTryNextSource,
    onSelectFile,
    onExit,
  });

  sourceIndexRef.current = activeSourceIndex;
  activeFileRef.current = activeFileId;
  titleRef.current = title;
  sourceLabelsRef.current = sourceLabels;
  fileOptionsRef.current = fileOptions;
  callbacksRef.current = {
    onSelectSource,
    onTryNextSource,
    onSelectFile,
    onExit,
  };

  const getVideo = () =>
    liveVideoRef?.current ||
    videoRef?.current ||
    null;

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;
    let statusTimer = null;

    const start = async () => {
      try {
        const sessionCode = createSessionCode();
        const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
        const remoteUrl = `${window.location.origin}/remote/${sessionCode}`;

        const playerContext =
          window.__MG_PLAYER_CONTEXT__ || {};

        const created = await base44.entities.PlayerRemoteSession.create({
          session_code: sessionCode,
          title: titleRef.current || "Now playing",
          command: "",
          command_seq: 0,
          command_value: "",
          active_source_index: sourceIndexRef.current,
          source_count: sourceLabelsRef.current.length,
          source_labels: JSON.stringify(
            sourceLabelsRef.current.map((label) => String(label || ""))
          ),
          file_labels: JSON.stringify(
            fileOptionsRef.current.map((file) => ({
              id: String(file?.id ?? ""),
              label: String(file?.label || file?.path || file?.id || "File"),
            }))
          ),
          active_file_id: String(activeFileRef.current || ""),
          audio_labels: "[]",
          active_audio_index: -1,
          subtitle_labels: "[]",
          active_subtitle_index: -1,
          subtitle_size: readTrackPreferences().subtitleSize,
          subtitle_background: readTrackPreferences().subtitleBackground,
          media_type: playerContext?.mediaType === "tv" ? "tv" : "movie",
          tmdb_id: String(playerContext?.tmdbId || ""),
          season_number: Number(playerContext?.season || 0),
          episode_number: Number(playerContext?.episode || 0),
          auto_next: playerContext?.autoNext !== false,
          current_time: 0,
          duration: 0,
          paused: true,
          volume: 1,
          status: "active",
          expires_at: expiresAt,
          last_seen_at: new Date().toISOString(),
        });

        if (cancelled) {
          return;
        }

        sessionRef.current = created;
        setSession(created);

        const image = await QRCode.toDataURL(remoteUrl, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: "M",
        });

        if (!cancelled) {
          setQrUrl(image);
        }

        const handleCommand = async (record) => {
          const seq = Number(record?.command_seq || 0);

          if (!record || record.id !== created.id || seq <= lastCommandSeqRef.current) {
            return;
          }

          lastCommandSeqRef.current = seq;

          const command = String(record.command || "");
          const value = record.command_value;
          const video = getVideo();

          try {
            if (command === "play_pause" && video) {
              if (video.paused) {
                await video.play().catch(() => {});
              } else {
                video.pause();
              }
            } else if (command === "play" && video) {
              await video.play().catch(() => {});
            } else if (command === "pause" && video) {
              video.pause();
            } else if (command === "seek_delta" && video) {
              const delta = parseNumber(value, 0);
              const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
              video.currentTime = clamp(video.currentTime + delta, 0, duration);
            } else if (command === "seek_to" && video) {
              const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
              video.currentTime = clamp(parseNumber(value, video.currentTime), 0, duration);
            } else if (command === "volume" && video) {
              const volume = clamp(parseNumber(value, video.volume), 0, 1);
              video.volume = volume;
              video.muted = volume === 0;
            } else if (command === "mute_toggle" && video) {
              video.muted = !video.muted;
            } else if (command === "next_source") {
              callbacksRef.current.onTryNextSource?.();
            } else if (command === "source") {
              callbacksRef.current.onSelectSource?.(
                parseNumber(value, sourceIndexRef.current)
              );
            } else if (command === "file") {
              callbacksRef.current.onSelectFile?.(String(value || ""));
            } else if (command === "audio" && video?.audioTracks) {
              const wanted = parseNumber(value, -1);
              const tracks = video.audioTracks;

              for (let index = 0; index < tracks.length; index += 1) {
                try {
                  tracks[index].enabled = index === wanted;
                } catch {
                  // Some Android WebViews expose read-only audio track state.
                }
              }

              const chosen = wanted >= 0 ? tracks[wanted] : null;
              if (chosen) {
                writeTrackPreferences({
                  ...readTrackPreferences(),
                  audioLanguage:
                    chosen?.language ||
                    chosen?.label ||
                    "en",
                });
              }
            } else if (command === "subtitle" && video?.textTracks) {
              const wanted = parseNumber(value, -1);
              const tracks = video.textTracks;

              for (let index = 0; index < tracks.length; index += 1) {
                try {
                  tracks[index].mode = index === wanted ? "showing" : "disabled";
                } catch {
                  // Some WebViews expose read-only text tracks.
                }
              }

              const chosen = wanted >= 0 ? tracks[wanted] : null;
              writeTrackPreferences({
                ...readTrackPreferences(),
                subtitlesEnabled: wanted >= 0,
                ...(chosen
                  ? {
                      subtitleLanguage:
                        chosen?.language ||
                        chosen?.label ||
                        "en",
                    }
                  : {}),
              });
            } else if (command === "subtitle_style") {
              let style = {};
              try {
                style = JSON.parse(String(value || "{}"));
              } catch {
                style = {};
              }

              writeTrackPreferences({
                ...readTrackPreferences(),
                ...(style?.size ? { subtitleSize: style.size } : {}),
                ...(style?.background
                  ? { subtitleBackground: style.background }
                  : {}),
              });
            } else if (command === "play_media") {
              let media = {};
              try {
                media = JSON.parse(String(value || "{}"));
              } catch {
                media = {};
              }

              window.dispatchEvent(
                new CustomEvent("mg:remote-play-media", {
                  detail: media,
                })
              );
            } else if (command === "next_episode") {
              window.dispatchEvent(
                new CustomEvent("mg:play-next-episode")
              );
            } else if (command === "episode") {
              let detail = {};

              try {
                detail = JSON.parse(String(value || "{}"));
              } catch {
                detail = {};
              }

              window.dispatchEvent(
                new CustomEvent("mg:play-specific-episode", {
                  detail: {
                    tmdbId:
                      detail?.tmdbId ||
                      window.__MG_PLAYER_CONTEXT__?.tmdbId ||
                      null,
                    seasonNumber: parseNumber(detail?.season, 0),
                    episodeNumber: parseNumber(detail?.episode, 0),
                    seriesTitle:
                      window.__MG_PLAYER_CONTEXT__?.title ||
                      titleRef.current ||
                      "TV Show",
                  },
                })
              );
            } else if (command === "auto_next") {
              const enabled = String(value) !== "0" && String(value) !== "false";

              window.dispatchEvent(
                new CustomEvent("mg:set-auto-next", {
                  detail: { enabled },
                })
              );
            } else if (command === "exit") {
              callbacksRef.current.onExit?.();
            }
          } catch (commandError) {
            console.warn("[Media God] QR remote command failed", commandError);
          }
        };

        unsubscribe = base44.entities.PlayerRemoteSession.subscribe((event) => {
          if (event.type === "delete") {
            return;
          }

          if (event.data?.id === created.id) {
            handleCommand(event.data);
          }
        });

        const publishStatus = async () => {
          const currentSession = sessionRef.current;
          if (!currentSession || cancelled) return;

          const video = getVideo();

          try {
            const audioTracks = [];
            let activeAudioIndex = -1;
            const subtitleTracks = [];
            let activeSubtitleIndex = -1;
            const playerContext =
              window.__MG_PLAYER_CONTEXT__ || {};
            const trackPreferences = readTrackPreferences();

            if (video?.audioTracks && typeof video.audioTracks.length === "number") {
              for (let index = 0; index < video.audioTracks.length; index += 1) {
                const track = video.audioTracks[index];
                audioTracks.push(
                  friendlyTrackLabel(track, "Audio", index)
                );
                if (track?.enabled) activeAudioIndex = index;
              }
            }

            if (video?.textTracks && typeof video.textTracks.length === "number") {
              for (let index = 0; index < video.textTracks.length; index += 1) {
                const track = video.textTracks[index];
                subtitleTracks.push(
                  friendlyTrackLabel(track, "Subtitle", index)
                );
                if (track?.mode === "showing") activeSubtitleIndex = index;
              }
            }

            await base44.entities.PlayerRemoteSession.update(currentSession.id, {
              title: titleRef.current || "Now playing",
              active_source_index: sourceIndexRef.current,
              source_count: sourceLabelsRef.current.length,
              source_labels: JSON.stringify(
                sourceLabelsRef.current.map((label) => String(label || ""))
              ),
              file_labels: JSON.stringify(
                fileOptionsRef.current.map((file) => ({
                  id: String(file?.id ?? ""),
                  label: String(file?.label || file?.path || file?.id || "File"),
                }))
              ),
              active_file_id: String(activeFileRef.current || ""),
              audio_labels: JSON.stringify(audioTracks),
              active_audio_index: activeAudioIndex,
              subtitle_labels: JSON.stringify(subtitleTracks),
              active_subtitle_index: activeSubtitleIndex,
              subtitle_size: trackPreferences.subtitleSize,
              subtitle_background: trackPreferences.subtitleBackground,
              media_type: playerContext?.mediaType === "tv" ? "tv" : "movie",
              tmdb_id: String(playerContext?.tmdbId || ""),
              season_number: Number(playerContext?.season || 0),
              episode_number: Number(playerContext?.episode || 0),
              auto_next: playerContext?.autoNext !== false,
              current_time: video ? Number(video.currentTime || 0) : 0,
              duration:
                video && Number.isFinite(video.duration)
                  ? Number(video.duration || 0)
                  : 0,
              paused: video ? Boolean(video.paused) : true,
              volume: video ? Number(video.muted ? 0 : video.volume || 0) : 0,
              status: "active",
              last_seen_at: new Date().toISOString(),
            });
          } catch {
            // A temporary network miss should not interrupt playback.
          }
        };

        publishStatus();
        statusTimer = window.setInterval(publishStatus, 2000);
      } catch (startError) {
        if (!cancelled) {
          setError(startError?.message || "Phone remote unavailable");
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (statusTimer) window.clearInterval(statusTimer);

      const currentSession = sessionRef.current;
      sessionRef.current = null;

      if (currentSession?.id) {
        base44.entities.PlayerRemoteSession.update(currentSession.id, {
          status: "closed",
          last_seen_at: new Date().toISOString(),
        }).catch(() => {});
      }
    };
  }, []);

  if (!session || !qrUrl) {
    if (!error) return null;

    return (
      <div data-mg-player-qr="true" className="text-xs text-white/45">
        Phone remote unavailable
      </div>
    );
  }

  return (
    <div
      data-mg-player-qr="true"
      className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-black/80 p-2 text-white shadow-xl"
      title="Scan with your phone to control playback"
    >
      <img
        src={qrUrl}
        alt="QR code for Media God phone remote"
        className="h-20 w-20 rounded-md bg-white p-1"
      />

      <div className="hidden min-w-0 xl:block">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Smartphone className="h-4 w-4 text-mg-green" />
          Phone remote
        </div>
        <p className="mt-1 max-w-28 text-[10px] leading-snug text-white/50">
          Scan to control play, seek, source, audio recovery and Exit.
        </p>
      </div>
    </div>
  );
}
