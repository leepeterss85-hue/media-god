import React, { useEffect, useMemo, useState } from "react";
import {
  readPlaybackPreferences,
  writePlaybackPreferences,
} from "@/components/mg/playbackPreferences";

const DIAGNOSTICS_KEY = "mg:native-playback-diagnostics:v1";

const readDiagnostics = () => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DIAGNOSTICS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(-50) : [];
  } catch {
    return [];
  }
};

const Toggle = ({ on, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={on}
    className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
      on ? "border-mg-green bg-mg-green" : "border-white/15 bg-white/10"
    }`}
  >
    <span
      className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-black transition-transform ${
        on ? "translate-x-5" : "translate-x-0"
      }`}
    />
  </button>
);

const nice = (value, fallback = "—") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

export default function PlaybackAdvancedSettings() {
  const [preferences, setPreferences] = useState(() => readPlaybackPreferences());
  const [diagnostics, setDiagnostics] = useState(readDiagnostics);

  useEffect(() => {
    const onPrefs = () => setPreferences(readPlaybackPreferences());
    const onDiagnostic = () => setDiagnostics(readDiagnostics());
    window.addEventListener("mg:playback-preferences-changed", onPrefs);
    window.addEventListener("mg:native-playback-diagnostic", onDiagnostic);
    window.addEventListener("storage", onPrefs);
    return () => {
      window.removeEventListener("mg:playback-preferences-changed", onPrefs);
      window.removeEventListener("mg:native-playback-diagnostic", onDiagnostic);
      window.removeEventListener("storage", onPrefs);
    };
  }, []);

  const update = (patch) => {
    const next = writePlaybackPreferences({ ...preferences, ...patch });
    setPreferences(next);
  };

  const latest = diagnostics[diagnostics.length - 1] || null;
  const summary = useMemo(() => {
    if (!latest) return [];
    const resolution =
      Number(latest.width || 0) > 0 && Number(latest.height || 0) > 0
        ? `${Math.round(Number(latest.width))}×${Math.round(Number(latest.height))}`
        : "";
    return [
      ["Engine", nice(latest.engine)],
      ["Result", nice(latest.event)],
      ["Source", nice(latest.label || latest.sourceName)],
      ["Video", [resolution, latest.videoCodec, latest.videoProfile].filter(Boolean).join(" · ") || "—"],
      ["HDR", nice(latest.hdrFormat)],
      ["Audio", nice(latest.audioCodec || latest.selectedAudioName)],
      ["Container", nice(latest.container || latest.mimeType)],
      ["Reason", nice(latest.compatibilityReason || latest.forceCompatibilityReason || latest.message)],
      ["Network", Number(latest?.preflight?.estimatedMbps || 0) > 0
        ? `${Number(latest.preflight.estimatedMbps).toFixed(1)} Mbps${latest?.preflight?.networkRisk ? " · constrained" : ""}`
        : "—"],
      ["Device", latest?.devicePerformance?.thermalStatusName
        ? `${latest.devicePerformance.thermalStatusName}${latest.devicePerformance.lowMemory ? " · low memory" : ""}`
        : "—"],
    ];
  }, [latest]);

  const clearLearning = () => {
    try {
      window.localStorage.removeItem(DIAGNOSTICS_KEY);
      window.localStorage.removeItem("mg:playback-reliability-v1");
      window.localStorage.removeItem("mg:playback-reliability-v2");
    } catch {
      // Storage is best effort.
    }
    setDiagnostics([]);
    window.dispatchEvent(new CustomEvent("mg:playback-learning-cleared"));
  };

  return (
    <div data-mg-advanced-playback="true" className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-mg-card">
      <div className="border-b border-white/5 p-4 3xl:p-5">
        <h2 className="text-sm font-bold text-white 3xl:text-lg">Advanced playback</h2>
        <p className="mt-1 text-xs text-white/40 3xl:text-sm">
          Device-local recovery controls for difficult 4K, HDR and multi-audio files.
        </p>
      </div>

      <div className="divide-y divide-white/5">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between 3xl:p-5">
          <div>
            <p className="text-sm font-medium text-white">Audio output</p>
            <p className="text-xs text-white/40">Auto is safest. Stereo PCM fixes silent remuxes; Surround decodes multichannel; Passthrough sends encoded audio to a capable TV/AVR.</p>
          </div>
          <select
            value={preferences.audioOutputMode}
            onChange={(event) => update({ audioOutputMode: event.target.value })}
            aria-label="Audio output mode"
            className="min-h-11 w-full rounded-md border border-white/10 bg-mg-surface px-3 py-2 text-sm text-white sm:w-48"
          >
            <option value="auto">Auto</option>
            <option value="stereo">Stereo PCM</option>
            <option value="surround">Surround PCM</option>
            <option value="passthrough">Passthrough</option>
          </select>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 3xl:p-5">
          <label>
            <span className="block text-sm font-medium text-white">Lip sync</span>
            <span className="text-xs text-white/40">Delay or advance audio from −500 ms to +500 ms.</span>
            <select
              value={preferences.lipSyncMs}
              onChange={(event) => update({ lipSyncMs: Number(event.target.value) })}
              aria-label="Lip sync adjustment"
              className="mt-2 min-h-11 w-full rounded-md border border-white/10 bg-mg-surface px-3 py-2 text-sm text-white"
            >
              {[-500,-300,-200,-150,-100,-50,0,50,100,150,200,300,500].map((value) => (
                <option key={value} value={value}>{value > 0 ? `+${value}` : value} ms</option>
              ))}
            </select>
          </label>

          <label>
            <span className="block text-sm font-medium text-white">Dialogue boost</span>
            <span className="text-xs text-white/40">Raises speech frequencies in the compatibility player.</span>
            <select
              value={preferences.dialogueBoost}
              onChange={(event) => update({ dialogueBoost: event.target.value })}
              aria-label="Dialogue boost"
              className="mt-2 min-h-11 w-full rounded-md border border-white/10 bg-mg-surface px-3 py-2 text-sm text-white"
            >
              <option value="off">Off</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        {[
          ["volumeNormalization", "Volume normalization", "Reduce large jumps between quiet dialogue and loud scenes."],
          ["automaticNoSoundRecovery", "Automatic no-sound recovery", "Re-select the best audio track and safe output automatically for risky remux audio."],
          ["networkAware4K", "Network-aware 4K", "Pre-check 4K throughput and prefer another 4K/backup source when the measured connection cannot sustain its bitrate."],
          ["thermalProtection", "Thermal / performance protection", "On phones, tablets and Fire TV, leave a software-decoded 4K source when heat or memory pressure becomes severe."],
        ].map(([key, title, description]) => (
          <div key={key} className="flex items-center justify-between gap-4 p-4 3xl:p-5">
            <div>
              <p className="text-sm font-medium text-white">{title}</p>
              <p className="text-xs text-white/40">{description}</p>
            </div>
            <Toggle
              on={Boolean(preferences[key])}
              onClick={() => update({ [key]: !preferences[key] })}
              label={`Toggle ${title}`}
            />
          </div>
        ))}

        <div className="p-4 3xl:p-5" data-mg-playback-diagnostics="true">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">Playback diagnostics</p>
              <p className="text-xs text-white/40">The last native playback decision, codec combination and device state. Signed stream URLs are never stored here.</p>
            </div>
            <button
              type="button"
              onClick={clearLearning}
              className="min-h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/80 hover:bg-white/10"
            >
              Clear playback learning
            </button>
          </div>

          {latest ? (
            <div className="mt-3 grid gap-x-5 gap-y-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs sm:grid-cols-2">
              {summary.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <span className="text-white/35">{label}: </span>
                  <span className="break-words text-white/75">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/45">
              No native playback diagnostic has been recorded on this device yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
