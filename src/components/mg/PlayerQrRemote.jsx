import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Smartphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";
import {
  friendlyTrackLabel,
  readTrackPreferences,
  writeTrackPreferences,
} from "@/components/mg/mediaTrackPreferences";

const SESSION_STORAGE_KEY = "mg:companion-session-v1";
const SESSION_LIFETIME_MS = 4 * 60 * 60 * 1000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const createSessionCode = () => {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) =>
      value.toString(16).padStart(2, "0")
    ).join("");
  }

  return `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2)}${Math.random().toString(36).slice(2)}`;
};

const parseNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const getPlayerVideo = () => {
  if (typeof document === "undefined") return null;

  const videos = Array.from(
    document.querySelectorAll('[data-mg-player-root="true"] video')
  );

  return videos[videos.length - 1] || null;
};

const getSelect = (label) => {
  if (typeof document === "undefined") return null;

  const matches = Array.from(
    document.querySelectorAll(`select[aria-label="${label}"]`)
  );

  return matches[matches.length - 1] || null;
};

const setSelectValue = (label, value) => {
  const select = getSelect(label);
  if (!select) return false;

  select.value = String(value ?? "");
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

const selectLabels = (label) => {
  const select = getSelect(label);
  if (!select) return [];

  return Array.from(select.options || []).map((option) =>
    String(option?.textContent || "").replace(/^Failed\s*[—-]\s*/i, "").trim()
  );
};

const fileLabels = () => {
  const select = getSelect("Choose file");
  if (!select) return [];

  return Array.from(select.options || []).map((option) => ({
    id: String(option.value ?? ""),
    label: String(option?.textContent || option.value || "File").trim(),
  }));
};

const readStoredSession = () => {
  if (typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SESSION_STORAGE_KEY) || "null"
    );

    if (
      !parsed?.sessionCode ||
      !parsed?.expiresAt ||
      new Date(parsed.expiresAt).getTime() <= Date.now()
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const rememberSession = (record) => {
  if (typeof window === "undefined" || !record?.session_code) return;

  try {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        id: record.id,
        sessionCode: record.session_code,
        expiresAt: record.expires_at,
      })
    );
  } catch {
    // Pairing persistence is best effort only.
  }
};

const directLiveSources = (channel) =>
  [channel, ...(channel?.alternatives || [])]
    .filter(
      (candidate) =>
        candidate?.kind === "direct" &&
        candidate?.url &&
        candidate?.browserPlayable !== false
    )
    .map((candidate, index) => ({
      label: index === 0 ? "LIVE • Best" : `Backup ${index}`,
      type: "live",
      src: candidate.url,
      url: candidate.url,
      live: true,
      sourceName: candidate.sourceName,
    }));

export default function PlayerQrRemote({ showIdle = false }) {
  const player = usePlayer();
  const playerRef = useRef(player);
  const [session, setSession] = useState(null);
  const [qrUrl, setQrUrl] = useState("");
  const [error, setError] = useState("");
  const sessionRef = useRef(null);
  const lastCommandSeqRef = useRef(0);

  playerRef.current = player;

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;
    let statusTimer = null;

    const ensureSession = async () => {
      const stored = readStoredSession();

      if (stored?.sessionCode) {
        try {
          const rows = await base44.entities.PlayerRemoteSession.filter({
            session_code: stored.sessionCode,
          });

          const existing = Array.isArray(rows) ? rows[0] : null;

          if (
            existing &&
            (!existing.expires_at ||
              new Date(existing.expires_at).getTime() > Date.now())
          ) {
            return existing;
          }
        } catch {
          // Create a fresh companion session below.
        }
      }

      const sessionCode = createSessionCode();
      const expiresAt = new Date(
        Date.now() + SESSION_LIFETIME_MS
      ).toISOString();

      return base44.entities.PlayerRemoteSession.create({
        session_code: sessionCode,
        title: "TV ready",
        command: "",
        command_seq: 0,
        command_value: "",
        active_source_index: 0,
        source_count: 0,
        source_labels: "[]",
        file_labels: "[]",
        active_file_id: "",
        audio_labels: "[]",
        active_audio_index: -1,
        subtitle_labels: "[]",
        active_subtitle_index: -1,
        subtitle_size: readTrackPreferences().subtitleSize,
        subtitle_background: readTrackPreferences().subtitleBackground,
        media_type: "",
        tmdb_id: "",
        season_number: 0,
        episode_number: 0,
        auto_next: true,
        current_time: 0,
        duration: 0,
        paused: true,
        volume: 1,
        status: "idle",
        expires_at: expiresAt,
        last_seen_at: new Date().toISOString(),
      });
    };

    const start = async () => {
      try {
        const created = await ensureSession();
        if (cancelled || !created?.id) return;

        sessionRef.current = created;
        lastCommandSeqRef.current = Number(created.command_seq || 0);
        rememberSession(created);
        setSession(created);

        const remoteUrl = `${window.location.origin}/remote/${created.session_code}`;
        const image = await QRCode.toDataURL(remoteUrl, {
          width: 240,
          margin: 1,
          errorCorrectionLevel: "M",
        });

        if (!cancelled) setQrUrl(image);

        const handleCommand = async (record) => {
          const seq = Number(record?.command_seq || 0);

          if (
            !record ||
            record.id !== created.id ||
            seq <= lastCommandSeqRef.current
          ) {
            return;
          }

          lastCommandSeqRef.current = seq;

          const command = String(record.command || "");
          const value = record.command_value;
          const video = getPlayerVideo();

          try {
            if (command === "play_pause" && video) {
              if (video.paused) await video.play().catch(() => {});
              else video.pause();
            } else if (command === "play" && video) {
              await video.play().catch(() => {});
            } else if (command === "pause" && video) {
              video.pause();
            } else if (command === "seek_delta" && video) {
              const duration = Number.isFinite(video.duration)
                ? video.duration
                : Infinity;
              video.currentTime = clamp(
                video.currentTime + parseNumber(value, 0),
                0,
                duration
              );
            } else if (command === "seek_to" && video) {
              const duration = Number.isFinite(video.duration)
                ? video.duration
                : Infinity;
              video.currentTime = clamp(
                parseNumber(value, video.currentTime),
                0,
                duration
              );
            } else if (command === "volume" && video) {
              const volume = clamp(parseNumber(value, video.volume), 0, 1);
              video.volume = volume;
              video.muted = volume === 0;
            } else if (command === "mute_toggle" && video) {
              video.muted = !video.muted;
            } else if (command === "next_source") {
              document.querySelector('[data-mg-no-sound="true"]')?.click?.();
            } else if (command === "source") {
              setSelectValue("Choose playback source", value);
            } else if (command === "file") {
              setSelectValue("Choose file", value);
            } else if (command === "audio" && video?.audioTracks) {
              const wanted = parseNumber(value, -1);

              for (let index = 0; index < video.audioTracks.length; index += 1) {
                try {
                  video.audioTracks[index].enabled = index === wanted;
                } catch {
                  // Some Android WebViews expose read-only audio state.
                }
              }

              const chosen = wanted >= 0 ? video.audioTracks[wanted] : null;
              if (chosen) {
                writeTrackPreferences({
                  ...readTrackPreferences(),
                  audioLanguage:
                    chosen?.language || chosen?.label || "en",
                });
              }
            } else if (command === "subtitle" && video?.textTracks) {
              const wanted = parseNumber(value, -1);

              for (let index = 0; index < video.textTracks.length; index += 1) {
                try {
                  video.textTracks[index].mode =
                    index === wanted ? "showing" : "disabled";
                } catch {
                  // Some WebViews expose read-only subtitle state.
                }
              }

              const chosen = wanted >= 0 ? video.textTracks[wanted] : null;
              writeTrackPreferences({
                ...readTrackPreferences(),
                subtitlesEnabled: wanted >= 0,
                ...(chosen
                  ? {
                      subtitleLanguage:
                        chosen?.language || chosen?.label || "en",
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
            } else if (command === "play_live") {
              let detail = {};
              try {
                detail = JSON.parse(String(value || "{}"));
              } catch {
                detail = {};
              }

              const matches = await findChannelsByTitle(detail?.name || "");
              const channel =
                matches.find(
                  (item) =>
                    String(item?.tvgId || item?.id || "") ===
                    String(detail?.id || "")
                ) || matches[0];

              if (channel?.url) {
                const sources = directLiveSources(channel);

                await playerRef.current.play({
                  id: channel.tvgId || channel.id,
                  tmdbId: "",
                  title: channel.name,
                  poster: channel.logo || "",
                  type: "live",
                  mediaType: "live",
                  noRd: true,
                  sources:
                    sources.length > 0
                      ? sources
                      : [
                          {
                            label: "LIVE",
                            type: "live",
                            src: channel.url,
                            url: channel.url,
                            live: true,
                          },
                        ],
                });
              }
            } else if (command === "next_episode") {
              window.dispatchEvent(new CustomEvent("mg:play-next-episode"));
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
                      window.__MG_PLAYER_CONTEXT__?.title || "TV Show",
                  },
                })
              );
            } else if (command === "auto_next") {
              const enabled =
                String(value) !== "0" && String(value) !== "false";
              window.dispatchEvent(
                new CustomEvent("mg:set-auto-next", {
                  detail: { enabled },
                })
              );
            } else if (command === "exit") {
              playerRef.current.close?.();
            }
          } catch (commandError) {
            console.warn(
              "[Media God] Companion remote command failed",
              commandError
            );
          }
        };

        unsubscribe = base44.entities.PlayerRemoteSession.subscribe((event) => {
          if (event.type === "delete") return;

          if (event.data?.id === created.id) {
            setSession((current) => ({ ...current, ...event.data }));
            handleCommand(event.data);
          }
        });

        const publishStatus = async () => {
          const currentSession = sessionRef.current;
          if (!currentSession || cancelled) return;

          const video = getPlayerVideo();
          const context = window.__MG_PLAYER_CONTEXT__ || {};
          const trackPreferences = readTrackPreferences();
          const sourceSelect = getSelect("Choose playback source");
          const fileSelect = getSelect("Choose file");
          const audioTracks = [];
          const subtitleTracks = [];
          let activeAudioIndex = -1;
          let activeSubtitleIndex = -1;

          if (video?.audioTracks && typeof video.audioTracks.length === "number") {
            for (let index = 0; index < video.audioTracks.length; index += 1) {
              const track = video.audioTracks[index];
              audioTracks.push(friendlyTrackLabel(track, "Audio", index));
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

          const playing = Boolean(playerRef.current?.isOpen);

          try {
            await base44.entities.PlayerRemoteSession.update(currentSession.id, {
              title: playing
                ? String(context?.title || "Now playing")
                : "TV ready",
              active_source_index: sourceSelect
                ? Number(sourceSelect.selectedIndex || 0)
                : 0,
              source_count: sourceSelect?.options?.length || 0,
              source_labels: JSON.stringify(
                selectLabels("Choose playback source")
              ),
              file_labels: JSON.stringify(fileLabels()),
              active_file_id: String(fileSelect?.value || ""),
              audio_labels: JSON.stringify(audioTracks),
              active_audio_index: activeAudioIndex,
              subtitle_labels: JSON.stringify(subtitleTracks),
              active_subtitle_index: activeSubtitleIndex,
              subtitle_size: trackPreferences.subtitleSize,
              subtitle_background: trackPreferences.subtitleBackground,
              media_type: playing ? String(context?.mediaType || "movie") : "",
              tmdb_id: playing ? String(context?.tmdbId || "") : "",
              season_number: playing ? Number(context?.season || 0) : 0,
              episode_number: playing ? Number(context?.episode || 0) : 0,
              auto_next: context?.autoNext !== false,
              current_time: video ? Number(video.currentTime || 0) : 0,
              duration:
                video && Number.isFinite(video.duration)
                  ? Number(video.duration || 0)
                  : 0,
              paused: video ? Boolean(video.paused) : true,
              volume: video
                ? Number(video.muted ? 0 : video.volume || 0)
                : 1,
              status: playing ? "playing" : "idle",
              last_seen_at: new Date().toISOString(),
            });
          } catch {
            // A temporary status miss must not interrupt the TV.
          }
        };

        publishStatus();
        statusTimer = window.setInterval(publishStatus, 1500);
      } catch (startError) {
        if (!cancelled) {
          setError(startError?.message || "Phone companion unavailable");
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (statusTimer) window.clearInterval(statusTimer);
      sessionRef.current = null;
    };
  }, []);

  const playerOpen = Boolean(player?.isOpen);
  const shouldShow = playerOpen || showIdle;

  if (!shouldShow) return null;

  if (!session || !qrUrl) {
    if (!error) return null;

    return (
      <div
        data-mg-companion-qr="true"
        className="fixed bottom-4 right-4 z-[80] rounded-xl border border-white/10 bg-black/85 px-3 py-2 text-xs text-white/55"
      >
        Phone companion unavailable
      </div>
    );
  }

  return (
    <div
      {...(playerOpen
        ? { "data-mg-player-qr": "true" }
        : { "data-mg-companion-qr": "true" })}
      className={
        playerOpen
          ? "fixed right-4 top-16 z-[2147483647] flex items-center gap-2 rounded-xl border border-white/15 bg-black/80 p-2 text-white shadow-xl"
          : "fixed bottom-4 right-4 z-[80] flex items-center gap-3 rounded-2xl border border-mg-green/25 bg-black/90 p-3 text-white shadow-2xl backdrop-blur"
      }
      title="Scan once to browse and control Media God from your phone"
    >
      <img
        src={qrUrl}
        alt="QR code for Media God phone companion"
        className={
          playerOpen
            ? "h-20 w-20 rounded-md bg-white p-1"
            : "h-24 w-24 rounded-lg bg-white p-1"
        }
      />

      <div className={playerOpen ? "hidden xl:block" : "min-w-0 max-w-36"}>
        <div className="flex items-center gap-1.5 text-xs font-bold text-mg-green">
          <Smartphone className="h-4 w-4" />
          Phone companion
        </div>
        <p className="mt-1 text-[10px] leading-snug text-white/55">
          Scan once. Browse on your phone, send titles to the TV and keep control after Exit.
        </p>
      </div>
    </div>
  );
}