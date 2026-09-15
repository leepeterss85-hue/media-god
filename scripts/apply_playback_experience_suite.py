from pathlib import Path
import json
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text()


def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'Missing anchor: {label}')
    return text.replace(old, new, 1)


PLAYBACK_PREFS = r'''export const PLAYBACK_PREFERENCES_KEY = "mg:playback-preferences-v1";

export const DEFAULT_PLAYBACK_PREFERENCES = {
  autoNext: true,
  quality: "Auto",
  autoRecovery: true,
  audioOutputMode: "auto",
  lipSyncMs: 0,
  dialogueBoost: "off",
  volumeNormalization: false,
  automaticNoSoundRecovery: true,
  networkAware4K: true,
  thermalProtection: true,
};

const QUALITY_VALUES = ["Auto", "4K", "1080p", "720p", "480p"];
const AUDIO_OUTPUT_VALUES = ["auto", "stereo", "surround", "passthrough"];
const DIALOGUE_BOOST_VALUES = ["off", "low", "medium", "high"];

const clampLipSync = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-500, Math.min(500, Math.round(number / 10) * 10));
};

export const normalisePlaybackPreferences = (value) => {
  const raw = value && typeof value === "object" ? value : {};

  return {
    autoNext:
      typeof raw.autoNext === "boolean"
        ? raw.autoNext
        : DEFAULT_PLAYBACK_PREFERENCES.autoNext,
    quality: QUALITY_VALUES.includes(raw.quality)
      ? raw.quality
      : DEFAULT_PLAYBACK_PREFERENCES.quality,
    autoRecovery:
      typeof raw.autoRecovery === "boolean"
        ? raw.autoRecovery
        : DEFAULT_PLAYBACK_PREFERENCES.autoRecovery,
    audioOutputMode: AUDIO_OUTPUT_VALUES.includes(raw.audioOutputMode)
      ? raw.audioOutputMode
      : DEFAULT_PLAYBACK_PREFERENCES.audioOutputMode,
    lipSyncMs: clampLipSync(raw.lipSyncMs),
    dialogueBoost: DIALOGUE_BOOST_VALUES.includes(raw.dialogueBoost)
      ? raw.dialogueBoost
      : DEFAULT_PLAYBACK_PREFERENCES.dialogueBoost,
    volumeNormalization:
      typeof raw.volumeNormalization === "boolean"
        ? raw.volumeNormalization
        : DEFAULT_PLAYBACK_PREFERENCES.volumeNormalization,
    automaticNoSoundRecovery:
      typeof raw.automaticNoSoundRecovery === "boolean"
        ? raw.automaticNoSoundRecovery
        : DEFAULT_PLAYBACK_PREFERENCES.automaticNoSoundRecovery,
    networkAware4K:
      typeof raw.networkAware4K === "boolean"
        ? raw.networkAware4K
        : DEFAULT_PLAYBACK_PREFERENCES.networkAware4K,
    thermalProtection:
      typeof raw.thermalProtection === "boolean"
        ? raw.thermalProtection
        : DEFAULT_PLAYBACK_PREFERENCES.thermalProtection,
  };
};

const storedPreferences = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLAYBACK_PREFERENCES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const readPlaybackPreferences = () => {
  if (typeof window === "undefined") {
    return DEFAULT_PLAYBACK_PREFERENCES;
  }

  try {
    const parsed = storedPreferences();
    const legacyAutoNext = window.localStorage.getItem("mg_auto_next");

    return normalisePlaybackPreferences({
      ...parsed,
      ...(legacyAutoNext === "0"
        ? { autoNext: false }
        : legacyAutoNext === "1"
          ? { autoNext: true }
          : {}),
    });
  } catch {
    return DEFAULT_PLAYBACK_PREFERENCES;
  }
};

export const writePlaybackPreferences = (value) => {
  const next = normalisePlaybackPreferences({
    ...storedPreferences(),
    ...(value && typeof value === "object" ? value : {}),
  });

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        PLAYBACK_PREFERENCES_KEY,
        JSON.stringify(next)
      );
      window.localStorage.setItem("mg_auto_next", next.autoNext ? "1" : "0");
    } catch {
      // Device-local playback preferences are best effort.
    }

    window.dispatchEvent(
      new CustomEvent("mg:playback-preferences-changed", {
        detail: next,
      })
    );
  }

  return next;
};
'''

ADVANCED_SETTINGS = r'''import React, { useEffect, useMemo, useState } from "react";
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
'''

DEVICE_GUARD_TEMPLATE = r'''package __PACKAGE__

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import org.json.JSONObject

/** Device-side safety guard for expensive software-decoded UHD playback. */
object DevicePerformanceGuard {
    fun snapshot(context: Context): JSONObject {
        val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val memory = ActivityManager.MemoryInfo()
        try {
            activity?.getMemoryInfo(memory)
        } catch (_: Throwable) {
        }

        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val thermalStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try { power?.currentThermalStatus ?: PowerManager.THERMAL_STATUS_NONE }
            catch (_: Throwable) { PowerManager.THERMAL_STATUS_NONE }
        } else {
            PowerManager.THERMAL_STATUS_NONE
        }

        val total = memory.totalMem.coerceAtLeast(0L)
        val available = memory.availMem.coerceAtLeast(0L)
        val lowRatio = total > 0L && available.toDouble() / total.toDouble() < 0.08
        val lowMemory = memory.lowMemory || lowRatio

        return JSONObject().apply {
            put("thermalStatus", thermalStatus)
            put("thermalStatusName", thermalName(thermalStatus))
            put("lowMemory", lowMemory)
            put("availableMemoryBytes", available)
            put("totalMemoryBytes", total)
            put("powerSaveMode", try { power?.isPowerSaveMode == true } catch (_: Throwable) { false })
        }
    }

    fun shouldProtect4k(context: Context, payload: JSONObject, url: String): Boolean {
        if (!payload.optBoolean("thermalProtection", true) || !looksUhd(payload, url)) return false
        val state = snapshot(context)
        val thermal = state.optInt("thermalStatus", PowerManager.THERMAL_STATUS_NONE)
        return state.optBoolean("lowMemory", false) ||
            thermal >= PowerManager.THERMAL_STATUS_SEVERE
    }

    private fun looksUhd(payload: JSONObject, url: String): Boolean {
        val width = payload.optInt("width", 0)
        val height = payload.optInt("height", 0)
        if (width >= 3000 || height >= 1700) return true
        val text = listOf(
            payload.optString("quality"),
            payload.optString("hintText"),
            payload.optString("title"),
            url
        ).joinToString(" ")
        return Regex("""(?:^|[^a-z0-9])(?:4k|2160p|uhd)(?:[^a-z0-9]|$)""", RegexOption.IGNORE_CASE)
            .containsMatchIn(text)
    }

    private fun thermalName(status: Int): String = when (status) {
        PowerManager.THERMAL_STATUS_NONE -> "normal"
        PowerManager.THERMAL_STATUS_LIGHT -> "light"
        PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
        PowerManager.THERMAL_STATUS_SEVERE -> "severe"
        PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
        PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
        PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
        else -> "unknown"
    }
}
'''

PREFLIGHT_TEMPLATE = r'''package __PACKAGE__

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.max

/** Reachability plus a conservative UHD throughput sample before native playback. */
object NativeStreamPreflight {
    data class Result(
        val ok: Boolean,
        val shouldSkip: Boolean,
        val statusCode: Int = 0,
        val contentType: String = "",
        val elapsedMs: Long = 0L,
        val reason: String = "",
        val sampleBytes: Long = 0L,
        val estimatedMbps: Double = 0.0,
        val requiredMbps: Double = 0.0,
        val networkRisk: Boolean = false
    ) {
        fun toJson(): JSONObject = JSONObject().apply {
            put("ok", ok)
            put("shouldSkip", shouldSkip)
            put("statusCode", statusCode)
            put("contentType", contentType)
            put("elapsedMs", elapsedMs)
            put("reason", reason)
            put("sampleBytes", sampleBytes)
            put("estimatedMbps", estimatedMbps)
            put("requiredMbps", requiredMbps)
            put("networkRisk", networkRisk)
        }
    }

    private const val TIMEOUT_MS = 2600
    private const val UHD_SAMPLE_BYTES = 256 * 1024

    fun checkPayload(payload: JSONObject): Result {
        val url = payload.optString("url").trim()
        val bitrate = firstNumber(payload, "bitrate")
        val probeUhd = payload.optBoolean("networkAware4K", true) && looksUhd(payload, url) && bitrate > 0.0
        return check(
            url,
            headersFor(payload, url),
            probeBytes = if (probeUhd) UHD_SAMPLE_BYTES else 2,
            bitrateBps = bitrate
        )
    }

    fun headersFor(payload: JSONObject, url: String): Map<String, String> {
        val result = linkedMapOf<String, String>()
        fun collect(json: JSONObject?) {
            if (json == null) return
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = json.optString(key).trim()
                if (key.isNotBlank() && value.isNotBlank()) result[key] = value
            }
        }
        collect(payload.optJSONObject("headers"))
        val sources = payload.optJSONArray("sources")
        if (sources != null) {
            for (index in 0 until sources.length()) {
                val item = sources.optJSONObject(index) ?: continue
                if (item.optString("url").trim() == url) {
                    collect(item.optJSONObject("headers"))
                    break
                }
            }
        }
        return result
    }

    fun check(url: String, headers: Map<String, String>): Result =
        check(url, headers, probeBytes = 2, bitrateBps = 0.0)

    fun check(
        url: String,
        headers: Map<String, String>,
        probeBytes: Int,
        bitrateBps: Double
    ): Result {
        val target = url.trim()
        if (!(target.startsWith("https://") || target.startsWith("http://"))) {
            return Result(ok = false, shouldSkip = true, reason = "invalid_url")
        }

        val startedAt = System.currentTimeMillis()
        var connection: HttpURLConnection? = null

        return try {
            val wanted = probeBytes.coerceIn(2, UHD_SAMPLE_BYTES)
            connection = (URL(target).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                requestMethod = "GET"
                setRequestProperty("Range", "bytes=0-${wanted - 1}")
                setRequestProperty("Accept", "*/*")
                var hasUserAgent = false
                headers.forEach { (key, value) ->
                    if (key.equals("User-Agent", ignoreCase = true)) hasUserAgent = true
                    setRequestProperty(key, value)
                }
                if (!hasUserAgent) setRequestProperty("User-Agent", "MediaGod/NativePreflight")
            }

            val status = connection.responseCode
            val contentType = connection.contentType.orEmpty()
            val reachable = status in 200..399 || status == 416
            val permanent = status in setOf(400, 401, 403, 404, 410, 451)
            var bytesRead = 0L

            if (reachable && status != 416 && wanted > 2) {
                try {
                    connection.inputStream.use { input ->
                        val buffer = ByteArray(16 * 1024)
                        while (bytesRead < wanted) {
                            val remaining = (wanted - bytesRead).coerceAtMost(buffer.size.toLong()).toInt()
                            val read = input.read(buffer, 0, remaining)
                            if (read <= 0) break
                            bytesRead += read
                        }
                    }
                } catch (_: Throwable) {
                    // A range body is optional; reachability still counts.
                }
            }

            val elapsed = max(1L, System.currentTimeMillis() - startedAt)
            val estimatedMbps = if (bytesRead >= 64 * 1024) {
                (bytesRead.toDouble() * 8.0) / (elapsed.toDouble() / 1000.0) / 1_000_000.0
            } else 0.0
            val requiredMbps = if (bitrateBps > 0.0) bitrateBps / 1_000_000.0 * 1.15 else 0.0
            val networkRisk =
                estimatedMbps > 0.0 && requiredMbps > 0.0 && estimatedMbps < requiredMbps * 0.72

            Result(
                ok = reachable,
                shouldSkip = permanent,
                statusCode = status,
                contentType = contentType,
                elapsedMs = elapsed,
                reason = when {
                    reachable && networkRisk -> "reachable_network_constrained"
                    reachable -> "reachable"
                    permanent -> "http_$status"
                    else -> "transient_http_$status"
                },
                sampleBytes = bytesRead,
                estimatedMbps = estimatedMbps,
                requiredMbps = requiredMbps,
                networkRisk = networkRisk
            )
        } catch (_: Throwable) {
            Result(
                ok = false,
                shouldSkip = false,
                elapsedMs = System.currentTimeMillis() - startedAt,
                reason = "network_check_inconclusive"
            )
        } finally {
            try { connection?.disconnect() } catch (_: Throwable) {}
        }
    }

    private fun firstNumber(payload: JSONObject, key: String): Double {
        val raw = payload.opt(key) ?: return 0.0
        return when (raw) {
            is Number -> raw.toDouble()
            else -> Regex("""\d+(?:\.\d+)?""").find(raw.toString())?.value?.toDoubleOrNull() ?: 0.0
        }
    }

    private fun looksUhd(payload: JSONObject, url: String): Boolean {
        if (payload.optInt("width", 0) >= 3000 || payload.optInt("height", 0) >= 1700) return true
        val text = "${payload.optString("quality")} ${payload.optString("hintText")} ${payload.optString("title")} $url"
        return Regex("""(?:^|[^a-z0-9])(?:4k|2160p|uhd)(?:[^a-z0-9]|$)""", RegexOption.IGNORE_CASE)
            .containsMatchIn(text)
    }
}
'''

DIAGNOSTICS_TEMPLATE = r'''package __PACKAGE__

import android.content.Context
import android.net.Uri
import org.json.JSONObject

/** Safe compact playback snapshot; signed media URLs are never persisted. */
object NativePlaybackDiagnostics {
    fun snapshot(
        payload: JSONObject,
        url: String,
        engine: String,
        event: String,
        message: String = "",
        extra: JSONObject? = null,
        context: Context? = null
    ): JSONObject {
        val source = selectedSource(payload, url)
        val result = JSONObject().apply {
            put("at", System.currentTimeMillis())
            put("engine", engine)
            put("event", event)
            put("message", message.take(240))
            put("host", safeHost(url))
            put("sourceName", first(source, payload, "sourceName"))
            put("label", first(source, payload, "label"))
            put("quality", first(source, payload, "quality"))
            put("mimeType", first(source, payload, "mimeType"))
            put("container", first(source, payload, "container"))
            put("videoCodec", first(source, payload, "videoCodec"))
            put("audioCodec", first(source, payload, "audioCodec"))
            put("videoProfile", first(source, payload, "videoProfile"))
            put("hdrFormat", first(source, payload, "hdrFormat"))
            put("bitDepth", firstNumber(source, payload, "bitDepth"))
            put("width", firstNumber(source, payload, "width"))
            put("height", firstNumber(source, payload, "height"))
            put("fps", firstNumber(source, payload, "fps"))
            put("bitrate", firstNumber(source, payload, "bitrate"))
            put("compatibilityReason", payload.optString("compatibilityReason"))
            put("compatibilityErrorCode", payload.optInt("compatibilityErrorCode", 0))
            put("compatibilityError", payload.optString("compatibilityError").take(240))
            put("forceCompatibilityReason", payload.optString("forceCompatibilityReason"))
            put("audioOutputMode", payload.optString("audioOutputMode", "auto"))
            put("lipSyncMs", payload.optInt("lipSyncMs", 0))
            put("dialogueBoost", payload.optString("dialogueBoost", "off"))
            put("volumeNormalization", payload.optBoolean("volumeNormalization", false))
            put("networkDownlinkMbps", payload.optDouble("networkDownlinkMbps", 0.0))
            put("preflight", payload.optJSONObject("streamPreflight"))
            if (context != null) put("devicePerformance", DevicePerformanceGuard.snapshot(context))
        }

        if (extra != null) {
            val keys = extra.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                result.put(key, extra.opt(key))
            }
        }
        return result
    }

    private fun selectedSource(payload: JSONObject, url: String): JSONObject? {
        val sources = payload.optJSONArray("sources") ?: return null
        val wantedWebIndex = payload.optInt("activeSourceIndex", -1)
        var urlMatch: JSONObject? = null
        for (index in 0 until sources.length()) {
            val item = sources.optJSONObject(index) ?: continue
            if (item.optInt("webIndex", index) == wantedWebIndex) return item
            if (urlMatch == null && item.optString("url").trim() == url.trim()) urlMatch = item
        }
        return urlMatch
    }

    private fun first(source: JSONObject?, payload: JSONObject, key: String): String =
        source?.optString(key)?.trim().orEmpty().ifBlank { payload.optString(key).trim() }

    private fun firstNumber(source: JSONObject?, payload: JSONObject, key: String): Double {
        fun number(json: JSONObject?): Double {
            if (json == null || !json.has(key)) return 0.0
            val raw = json.opt(key) ?: return 0.0
            return when (raw) {
                is Number -> raw.toDouble()
                else -> Regex("""\d+(?:\.\d+)?""").find(raw.toString())?.value?.toDoubleOrNull() ?: 0.0
            }
        }
        return number(source).takeIf { it > 0.0 } ?: number(payload)
    }

    private fun safeHost(url: String): String =
        try { Uri.parse(url).host.orEmpty() } catch (_: Throwable) { "" }
}
'''

COMPAT_TEMPLATE = r'''package __PACKAGE__

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.interfaces.IMedia
import org.videolan.libvlc.util.VLCVideoLayout
import kotlin.math.max

/** Broad-format fallback plus audio/subtitle/HDR recovery controls. */
class CompatibilityPlayerActivity : Activity() {
    companion object { private const val CONTROLS_HIDE_DELAY_MS = 3200L }

    private lateinit var root: FrameLayout
    private lateinit var videoLayout: VLCVideoLayout
    private lateinit var controls: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var playPauseButton: Button
    private lateinit var audioButton: Button
    private lateinit var subtitleButton: Button
    private lateinit var outputButton: Button
    private lateinit var syncButton: Button
    private lateinit var dialogueButton: Button

    private var libVLC: LibVLC? = null
    private var vlcPlayer: MediaPlayer? = null
    private var payload = JSONObject()
    private var requestId = ""
    private var streamUrl = ""
    private var startPositionMs = 0L
    private var pendingStartPositionMs = 0L
    private var resultSent = false
    private var resumeAfterPause = false
    __FIRE_FIELD__

    private var audioOutputMode = "auto"
    private var lipSyncMs = 0
    private var dialogueBoost = "off"
    private var volumeNormalization = false
    private var automaticNoSoundRecovery = true
    private var thermalProtection = true
    private var audioRecoveryPasses = 0

    private val hideControlsRunnable = Runnable {
        if (!resultSent && ::controls.isInitialized) {
            if (controls.hasFocus() && ::videoLayout.isInitialized) videoLayout.requestFocus()
            controls.visibility = View.GONE
            statusText.visibility = View.GONE
        }
    }

    private val audioRecoveryRunnable = object : Runnable {
        override fun run() {
            if (resultSent || !automaticNoSoundRecovery) return
            recoverAudioTrack()
            audioRecoveryPasses += 1
            if (audioRecoveryPasses < 2 && ::root.isInitialized) root.postDelayed(this, 2400L)
        }
    }

    private val thermalRunnable = object : Runnable {
        override fun run() {
            if (resultSent) return
            if (thermalProtection && DevicePerformanceGuard.shouldProtect4k(this@CompatibilityPlayerActivity, payload, streamUrl)) {
                finishWithResult(
                    "error",
                    "This device is under severe heat or memory pressure while decoding 4K. Trying a cooler backup source."
                )
                return
            }
            if (::root.isInitialized) root.postDelayed(this, 12000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        payload = try { JSONObject(intent.getStringExtra(PlayerActivity.EXTRA_PAYLOAD).orEmpty()) } catch (_: Throwable) { JSONObject() }
        requestId = payload.optString("requestId")
        streamUrl = payload.optString("url").trim()
        startPositionMs = max(0L, payload.optLong("startPositionMs", 0L))
        pendingStartPositionMs = startPositionMs
        __FIRE_INIT__
        audioOutputMode = payload.optString("audioOutputMode", "auto").lowercase().let {
            if (it in setOf("auto", "stereo", "surround", "passthrough")) it else "auto"
        }
        lipSyncMs = payload.optInt("lipSyncMs", 0).coerceIn(-500, 500)
        dialogueBoost = payload.optString("dialogueBoost", "off").lowercase().let {
            if (it in setOf("off", "low", "medium", "high")) it else "off"
        }
        volumeNormalization = payload.optBoolean("volumeNormalization", false)
        automaticNoSoundRecovery = payload.optBoolean("automaticNoSoundRecovery", true)
        thermalProtection = payload.optBoolean("thermalProtection", true)

        if (!isPlayableUrl(streamUrl)) {
            finishWithResult("error", "Compatibility player received an invalid stream URL.")
            return
        }

        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN)
        enterImmersiveMode()
        DisplayRateMatcher.apply(this, payload, streamUrl, forceDisplayMode = __FORCE_DISPLAY__)
        buildUi()
        startCompatibilityPlayback()
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()
        if (resumeAfterPause && !resultSent) {
            resumeAfterPause = false
            vlcPlayer?.play()
        }
    }

    override fun onPause() {
        val activePlayer = vlcPlayer
        resumeAfterPause = activePlayer?.isPlaying == true
        if (resumeAfterPause) activePlayer?.pause()
        startPositionMs = max(0L, activePlayer?.time ?: startPositionMs)
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) showControlsTemporarily()
        return super.dispatchTouchEvent(event)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && !event.isLongPress) {
            if (::controls.isInitialized && controls.hasFocus() && event.keyCode in setOf(
                    KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
                    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER
                )) {
                showControlsTemporarily()
                return super.dispatchKeyEvent(event)
            }
            if (event.keyCode == KeyEvent.KEYCODE_DPAD_UP || event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                showControlsTemporarily()
                if (::audioButton.isInitialized) audioButton.requestFocus()
                return true
            }
            when (event.keyCode) {
                KeyEvent.KEYCODE_BACK -> { finishWithResult("back"); return true }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> { togglePlayback(); return true }
                KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> { seekBy(-10_000L); return true }
                KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> { seekBy(10_000L); return true }
                KeyEvent.KEYCODE_MEDIA_PLAY -> { vlcPlayer?.play(); updatePlayPauseLabel(); showControlsTemporarily(); return true }
                KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> { vlcPlayer?.pause(); updatePlayPauseLabel(); showControlsTemporarily(); return true }
                KeyEvent.KEYCODE_MENU -> { showPlaybackInfo(); return true }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        if (::root.isInitialized) {
            root.removeCallbacks(hideControlsRunnable)
            root.removeCallbacks(audioRecoveryRunnable)
            root.removeCallbacks(thermalRunnable)
        }
        DisplayRateMatcher.clear(this)
        releaseCompatibilityPlayer()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun buildUi() {
        videoLayout = VLCVideoLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
        }
        statusText = TextView(this).apply {
            text = "Compatibility decoder"
            setTextColor(Color.WHITE)
            textSize = 13f
            setBackgroundColor(Color.argb(190, 0, 0, 0))
            setPadding(dp(12), dp(7), dp(12), dp(7))
            maxWidth = dp(760)
        }

        val backButton = controlButton("Back") { finishWithResult("back") }
        val rewindButton = controlButton("−10s") { seekBy(-10_000L) }
        playPauseButton = controlButton("Pause") { togglePlayback() }
        val forwardButton = controlButton("+10s") { seekBy(10_000L) }
        audioButton = controlButton("Audio") { cycleAudioTrack() }
        subtitleButton = controlButton("Subs") { cycleSubtitleTrack() }
        outputButton = controlButton("Output") { cycleAudioOutputMode() }
        syncButton = controlButton("Sync") { cycleLipSync() }
        dialogueButton = controlButton("Dialogue") { cycleDialogueBoost() }
        val infoButton = controlButton("Info") { showPlaybackInfo() }

        val firstRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(backButton); addView(rewindButton); addView(playPauseButton); addView(forwardButton)
        }
        val secondRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(audioButton); addView(subtitleButton); addView(outputButton); addView(syncButton); addView(dialogueButton); addView(infoButton)
        }
        controls = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(7), dp(8), dp(7))
            setBackgroundColor(Color.argb(210, 8, 8, 8))
            addView(firstRow); addView(secondRow)
        }

        root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(videoLayout, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            addView(statusText, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.TOP or Gravity.START; topMargin = dp(18); marginStart = dp(18)
            })
            addView(controls, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL; bottomMargin = dp(18)
            })
        }
        setContentView(root)
        videoLayout.requestFocus()
        updateControlLabels()
        showControlsTemporarily()
    }

    private fun controlButton(label: String, action: () -> Unit): Button = Button(this).apply {
        text = label
        setTextColor(Color.WHITE)
        setBackgroundColor(Color.argb(215, 35, 35, 35))
        isFocusable = true
        minWidth = dp(76)
        minHeight = dp(44)
        setPadding(dp(10), dp(6), dp(10), dp(6))
        setOnClickListener { action(); showControlsTemporarily() }
    }

    private fun startCompatibilityPlayback() {
        try {
            val options = arrayListOf(
                "--network-caching=1800", "--file-caching=1200", "--live-caching=1800", "--clock-jitter=0"
            )
            if (volumeNormalization) {
                options.add("--audio-replay-gain-mode=track")
                options.add("--audio-replay-gain-preamp=0.0")
            }
            val engine = LibVLC(this, options)
            libVLC = engine
            val player = MediaPlayer(engine)
            vlcPlayer = player
            configureAudioOutput(player)
            player.attachViews(videoLayout, null, true, false)

            player.setEventListener { event ->
                root.post {
                    if (resultSent) return@post
                    when (event.type) {
                        MediaPlayer.Event.Opening -> showStatus("Compatibility decoder · opening")
                        MediaPlayer.Event.Buffering -> showStatus("Compatibility decoder · buffering")
                        MediaPlayer.Event.Playing -> {
                            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            showStatus("Compatibility decoder")
                            try { player.setVolume(100); player.setAudioDelay(lipSyncMs.toLong() * 1000L) } catch (_: Throwable) {}
                            applyPreferredSubtitle()
                            recoverAudioTrack()
                            if (pendingStartPositionMs > 0L) {
                                val target = pendingStartPositionMs; pendingStartPositionMs = 0L; player.time = target
                            }
                            audioRecoveryPasses = 0
                            root.removeCallbacks(audioRecoveryRunnable)
                            if (automaticNoSoundRecovery) root.postDelayed(audioRecoveryRunnable, 1000L)
                            root.removeCallbacks(thermalRunnable)
                            if (thermalProtection) root.postDelayed(thermalRunnable, 9000L)
                            updateControlLabels(); updatePlayPauseLabel(); showControlsTemporarily()
                        }
                        MediaPlayer.Event.Paused -> { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); updatePlayPauseLabel(); showControlsTemporarily() }
                        MediaPlayer.Event.EndReached -> finishWithResult("ended")
                        MediaPlayer.Event.EncounteredError -> finishWithResult("error", "The compatibility decoder could not play this source.")
                    }
                }
            }

            val media = Media(engine, Uri.parse(streamUrl)).apply {
                setHWDecoderEnabled(true, false)
                addOption(":network-caching=1800")
                addOption(":file-caching=1200")
                addOption(":live-caching=1800")
                if (dialogueBoost != "off") {
                    addOption(":audio-filter=equalizer")
                    val bands = when (dialogueBoost) {
                        "high" -> "-1 -1 0 2 5 6 5 2 0 -1"
                        "medium" -> "-1 -1 0 1.5 3.5 4.5 3.5 1.5 0 -1"
                        else -> "0 0 0 1 2 2.5 2 1 0 0"
                    }
                    addOption(":equalizer-bands=$bands")
                    addOption(":equalizer-preamp=-2.0")
                }
                val headers = currentHeaders()
                headerValue(headers, "User-Agent")?.let { addOption(":http-user-agent=$it") }
                headerValue(headers, "Referer")?.let { addOption(":http-referrer=$it") }
                addExternalSubtitles(this, payload.optJSONArray("subtitles") ?: JSONArray())
            }
            player.media = media
            media.release()
            player.play()
        } catch (error: Throwable) {
            finishWithResult("error", error.message ?: "Could not start the compatibility decoder.")
        }
    }

    private fun riskyAudio(): Boolean = Regex(
        """(?:true[ ._-]?hd|mlp|dts(?:[ ._-]?hd)?|dts:x|dca)""", RegexOption.IGNORE_CASE
    ).containsMatchIn("${payload.optString("audioCodec")} ${payload.optString("hintText")}")

    private fun configureAudioOutput(player: MediaPlayer) {
        try {
            player.setAudioOutput("android_audiotrack")
            when (audioOutputMode) {
                "passthrough" -> player.setAudioDigitalOutputEnabled(true)
                "stereo" -> { player.setAudioDigitalOutputEnabled(false); player.setAudioOutputDevice("stereo") }
                "surround" -> player.setAudioDigitalOutputEnabled(false)
                else -> {
                    player.setAudioDigitalOutputEnabled(false)
                    if (riskyAudio()) player.setAudioOutputDevice("stereo")
                }
            }
            player.setVolume(100)
        } catch (_: Throwable) {}
    }

    private fun recoverAudioTrack() {
        val player = vlcPlayer ?: return
        try {
            player.setVolume(100)
            configureAudioOutput(player)
            val tracks = player.audioTracks?.filter { it.id >= 0 }.orEmpty()
            if (tracks.isEmpty()) return
            val preferred = payload.optString("audioLanguage", "en").lowercase()
            fun score(name: String): Int {
                val text = name.lowercase(); var value = 0
                if (preferred == "en" && Regex("""\b(?:eng|english)\b""").containsMatchIn(text)) value += 100
                else if (preferred.isNotBlank() && text.contains(preferred)) value += 80
                if (Regex("""commentary|audio description|descriptive""").containsMatchIn(text)) value -= 100
                if (Regex("""aac|ac-?3|e-?ac-?3|opus|flac""").containsMatchIn(text)) value += 12
                if (Regex("""truehd|dts|mlp""").containsMatchIn(text) && audioOutputMode == "auto") value -= 8
                return value
            }
            val best = tracks.maxByOrNull { score(it.name.orEmpty()) } ?: tracks.first()
            val current = tracks.firstOrNull { it.id == player.audioTrack }
            if (current == null || score(best.name.orEmpty()) > score(current.name.orEmpty()) + 5) player.setAudioTrack(best.id)
            if (player.audioTrack < 0) player.setAudioTrack(best.id)
        } catch (_: Throwable) {}
        updateAudioButtonLabel()
    }

    private fun currentHeaders(): Map<String, String> {
        val result = linkedMapOf<String, String>()
        fun collect(json: JSONObject?) {
            if (json == null) return
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next(); val value = json.optString(key).trim()
                if (key.isNotBlank() && value.isNotBlank()) result[key] = value
            }
        }
        collect(payload.optJSONObject("headers"))
        val sources = payload.optJSONArray("sources") ?: JSONArray()
        for (index in 0 until sources.length()) {
            val item = sources.optJSONObject(index) ?: continue
            if (item.optString("url").trim() == streamUrl) {
                collect(item.optJSONObject("headers")); __FIRE_SOURCE_INDEX__
                break
            }
        }
        return result
    }

    private fun headerValue(headers: Map<String, String>, name: String): String? =
        headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value?.takeIf { it.isNotBlank() }

    private fun addExternalSubtitles(media: Media, subtitles: JSONArray) {
        for (index in 0 until minOf(subtitles.length(), 20)) {
            val item = subtitles.optJSONObject(index) ?: continue
            val url = item.optString("url").trim()
            if (!isPlayableUrl(url)) continue
            try { media.addSlave(IMedia.Slave(IMedia.Slave.Type.Subtitle, 4, Uri.parse(url).toString())) } catch (_: Throwable) {}
        }
    }

    private fun cycleAudioTrack() {
        val player = vlcPlayer ?: return
        val tracks = try { player.audioTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        if (tracks.isEmpty()) { showStatus("Audio · no selectable track"); return }
        val currentIndex = tracks.indexOfFirst { it.id == player.audioTrack }
        val next = tracks[(currentIndex + 1).mod(tracks.size)]
        try { player.setAudioTrack(next.id); player.setVolume(100); showStatus("Audio · ${next.name?.trim().orEmpty().ifBlank { "Track ${next.id}" }}") }
        catch (_: Throwable) { showStatus("Audio · could not switch track") }
        updateAudioButtonLabel()
    }

    private fun cycleSubtitleTrack() {
        val player = vlcPlayer ?: return
        val tracks = try { player.spuTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        if (tracks.isEmpty()) { showStatus("Subtitles · no selectable track"); return }
        val current = player.spuTrack
        if (current < 0) {
            val preferred = preferredSubtitle(tracks) ?: tracks.first()
            try { player.setSpuTrack(preferred.id); showStatus("Subtitles · ${preferred.name?.trim().orEmpty().ifBlank { "Track ${preferred.id}" }}") } catch (_: Throwable) {}
        } else {
            val index = tracks.indexOfFirst { it.id == current }
            if (index < 0 || index == tracks.lastIndex) {
                try { player.setSpuTrack(-1); showStatus("Subtitles · Off") } catch (_: Throwable) {}
            } else {
                val next = tracks[index + 1]
                try { player.setSpuTrack(next.id); showStatus("Subtitles · ${next.name?.trim().orEmpty().ifBlank { "Track ${next.id}" }}") } catch (_: Throwable) {}
            }
        }
        updateSubtitleButtonLabel()
    }

    private fun preferredSubtitle(tracks: List<MediaPlayer.TrackDescription>): MediaPlayer.TrackDescription? {
        val wanted = payload.optString("subtitleLanguage", "en").lowercase()
        return tracks.firstOrNull { track ->
            val text = track.name.orEmpty().lowercase()
            (wanted == "en" && Regex("""\b(?:eng|english)\b""").containsMatchIn(text)) ||
                (wanted.isNotBlank() && text.contains(wanted))
        }
    }

    private fun applyPreferredSubtitle() {
        val player = vlcPlayer ?: return
        if (!payload.optBoolean("subtitlesEnabled", true)) {
            try { player.setSpuTrack(-1) } catch (_: Throwable) {}
            updateSubtitleButtonLabel(); return
        }
        val tracks = try { player.spuTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        val preferred = preferredSubtitle(tracks) ?: return
        try { if (player.spuTrack < 0) player.setSpuTrack(preferred.id) } catch (_: Throwable) {}
        updateSubtitleButtonLabel()
    }

    private fun cycleAudioOutputMode() {
        val modes = listOf("auto", "stereo", "surround", "passthrough")
        val next = modes[(modes.indexOf(audioOutputMode).coerceAtLeast(0) + 1) % modes.size]
        audioOutputMode = next
        payload.put("audioOutputMode", next)
        restartAtCurrentPosition("Audio output · ${outputLabel()}")
    }

    private fun cycleLipSync() {
        val values = listOf(0, 50, 100, 150, 200, 300, 500, -500, -300, -200, -150, -100, -50)
        lipSyncMs = values[(values.indexOf(lipSyncMs).coerceAtLeast(0) + 1) % values.size]
        payload.put("lipSyncMs", lipSyncMs)
        try { vlcPlayer?.setAudioDelay(lipSyncMs.toLong() * 1000L) } catch (_: Throwable) {}
        showStatus("Lip sync · ${if (lipSyncMs > 0) "+" else ""}${lipSyncMs} ms")
        updateControlLabels()
    }

    private fun cycleDialogueBoost() {
        val modes = listOf("off", "low", "medium", "high")
        dialogueBoost = modes[(modes.indexOf(dialogueBoost).coerceAtLeast(0) + 1) % modes.size]
        payload.put("dialogueBoost", dialogueBoost)
        restartAtCurrentPosition("Dialogue boost · ${dialogueBoost.replaceFirstChar { it.uppercase() }}")
    }

    private fun restartAtCurrentPosition(message: String) {
        val position = max(0L, vlcPlayer?.time ?: startPositionMs)
        pendingStartPositionMs = position
        startPositionMs = position
        root.removeCallbacks(audioRecoveryRunnable)
        root.removeCallbacks(thermalRunnable)
        releaseCompatibilityPlayer()
        showStatus(message)
        updateControlLabels()
        startCompatibilityPlayback()
    }

    private fun outputLabel(): String = when (audioOutputMode) {
        "stereo" -> "Stereo PCM"; "surround" -> "Surround PCM"; "passthrough" -> "Passthrough"; else -> "Auto"
    }

    private fun updateControlLabels() {
        if (::outputButton.isInitialized) outputButton.text = "Output · ${outputLabel()}"
        if (::syncButton.isInitialized) syncButton.text = "Sync · ${if (lipSyncMs > 0) "+" else ""}${lipSyncMs}ms"
        if (::dialogueButton.isInitialized) dialogueButton.text = "Dialogue · ${dialogueBoost.replaceFirstChar { it.uppercase() }}"
        updateAudioButtonLabel(); updateSubtitleButtonLabel()
    }

    private fun updateAudioButtonLabel() {
        if (!::audioButton.isInitialized) return
        val player = vlcPlayer
        val tracks = try { player?.audioTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        if (tracks.isEmpty()) { audioButton.text = "Audio"; return }
        val current = tracks.firstOrNull { it.id == player?.audioTrack } ?: tracks.first()
        val name = current.name?.trim().orEmpty()
        audioButton.text = if (tracks.size > 1 && name.isNotBlank()) "Audio · $name" else if (tracks.size > 1) "Audio · ${tracks.indexOf(current)+1}/${tracks.size}" else "Audio"
    }

    private fun updateSubtitleButtonLabel() {
        if (!::subtitleButton.isInitialized) return
        val player = vlcPlayer
        val tracks = try { player?.spuTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        val current = tracks.firstOrNull { it.id == player?.spuTrack }
        subtitleButton.text = if (current != null) "Subs · ${current.name?.trim().orEmpty().ifBlank { "On" }}" else "Subs · Off"
    }

    private fun showPlaybackInfo() {
        val player = vlcPlayer
        val source = NativePlaybackDiagnostics.snapshot(
            payload, streamUrl, "libvlc", "info", extra = JSONObject().apply {
                put("selectedAudioTrack", player?.audioTrack ?: -1)
                put("selectedSubtitleTrack", player?.spuTrack ?: -1)
                put("audioOutputMode", audioOutputMode)
                put("lipSyncMs", lipSyncMs)
                put("dialogueBoost", dialogueBoost)
            }, context = this
        )
        val resolution = if (source.optInt("width") > 0 && source.optInt("height") > 0) "${source.optInt("width")}×${source.optInt("height")}" else "unknown resolution"
        showStatus(
            "Playback info\n${source.optString("engine")} · $resolution · ${source.optString("fps")}fps\n" +
                "Video: ${source.optString("videoCodec").ifBlank { "unknown" }} ${source.optString("hdrFormat")}\n" +
                "Audio: ${source.optString("audioCodec").ifBlank { "unknown" }} · ${outputLabel()} · sync ${lipSyncMs}ms\n" +
                "Container: ${source.optString("container").ifBlank { source.optString("mimeType") }} · ${source.optJSONObject("devicePerformance")?.optString("thermalStatusName") ?: "normal"}"
        )
    }

    private fun showStatus(message: String) {
        if (!::statusText.isInitialized) return
        statusText.text = message
        statusText.visibility = View.VISIBLE
    }

    private fun togglePlayback() {
        val player = vlcPlayer ?: return
        if (player.isPlaying) player.pause() else player.play()
        updatePlayPauseLabel(); showControlsTemporarily()
    }

    private fun updatePlayPauseLabel() {
        if (::playPauseButton.isInitialized) playPauseButton.text = if (vlcPlayer?.isPlaying == true) "Pause" else "Play"
    }

    private fun seekBy(deltaMs: Long) {
        val player = vlcPlayer ?: return
        val length = player.length.takeIf { it > 0L } ?: Long.MAX_VALUE
        player.time = (player.time + deltaMs).coerceAtLeast(0L).coerceAtMost(length)
        showControlsTemporarily()
    }

    private fun showControlsTemporarily() {
        if (!::controls.isInitialized || !::root.isInitialized || resultSent) return
        root.removeCallbacks(hideControlsRunnable)
        controls.visibility = View.VISIBLE
        statusText.visibility = View.VISIBLE
        root.postDelayed(hideControlsRunnable, CONTROLS_HIDE_DELAY_MS)
    }

    private fun releaseCompatibilityPlayer() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        vlcPlayer?.let { player ->
            try { player.stop() } catch (_: Throwable) {}
            try { player.detachViews() } catch (_: Throwable) {}
            try { player.release() } catch (_: Throwable) {}
        }
        vlcPlayer = null
        try { libVLC?.release() } catch (_: Throwable) {}
        libVLC = null
    }

    private fun finishWithResult(reason: String, message: String = "") {
        if (resultSent) return
        resultSent = true
        if (::root.isInitialized) {
            root.removeCallbacks(audioRecoveryRunnable); root.removeCallbacks(thermalRunnable)
        }
        val player = vlcPlayer
        val positionMs = max(0L, player?.time ?: startPositionMs)
        val durationMs = max(0L, player?.length?.takeIf { it > 0L } ?: 0L)
        val extra = JSONObject().apply {
            try {
                val audioId = player?.audioTrack ?: -1
                put("selectedAudioTrack", audioId)
                put("selectedAudioName", player?.audioTracks?.firstOrNull { it.id == audioId }?.name?.trim().orEmpty())
                put("selectedSubtitleTrack", player?.spuTrack ?: -1)
                put("selectedSubtitleName", player?.spuTracks?.firstOrNull { it.id == (player?.spuTrack ?: -1) }?.name?.trim().orEmpty())
            } catch (_: Throwable) {}
            put("audioOutputMode", audioOutputMode); put("lipSyncMs", lipSyncMs); put("dialogueBoost", dialogueBoost)
        }
        val diagnostics = NativePlaybackDiagnostics.snapshot(payload, streamUrl, "libvlc", reason, message, extra, this).toString()
        val result = Intent().apply {
            putExtra(PlayerActivity.EXTRA_REQUEST_ID, requestId)
            putExtra(PlayerActivity.EXTRA_REASON, reason)
            putExtra(PlayerActivity.EXTRA_POSITION_MS, positionMs)
            putExtra(PlayerActivity.EXTRA_DURATION_MS, durationMs)
            putExtra(PlayerActivity.EXTRA_MESSAGE, message)
            putExtra(PlayerActivity.EXTRA_DIAGNOSTICS, diagnostics)
            __FIRE_RESULT__
        }
        setResult(RESULT_OK, result)
        releaseCompatibilityPlayer()
        finish()
    }

    private fun isPlayableUrl(url: String): Boolean {
        val lower = url.lowercase()
        return lower.startsWith("https://") || lower.startsWith("http://") || lower.startsWith("rtsp://") || lower.startsWith("rtmp://")
    }

    private fun enterImmersiveMode() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
}
'''


def compat_text(package, fire):
    text = COMPAT_TEMPLATE.replace('__PACKAGE__', package)
    text = text.replace('__FORCE_DISPLAY__', 'true' if fire else 'false')
    text = text.replace('__FIRE_FIELD__', 'private var selectedSourceIndex = -1' if fire else '')
    text = text.replace('__FIRE_INIT__', 'selectedSourceIndex = payload.optInt("activeSourceIndex", -1)' if fire else '')
    text = text.replace('__FIRE_SOURCE_INDEX__', 'selectedSourceIndex = item.optInt("webIndex", selectedSourceIndex)' if fire else '')
    text = text.replace('__FIRE_RESULT__', 'putExtra(PlayerActivity.EXTRA_SELECTED_SOURCE_INDEX, selectedSourceIndex)' if fire else '')
    return text


def patch_settings():
    path = 'src/components/mg/SettingsView.jsx'
    text = read(path)
    if 'PlaybackAdvancedSettings' not in text:
        anchor = 'import MultiDebridSettings from "@/components/mg/MultiDebridSettings";\n'
        text = replace_once(
            text,
            anchor,
            anchor + 'import PlaybackAdvancedSettings from "@/components/mg/PlaybackAdvancedSettings";\n',
            'Settings advanced import'
        )
        render = '      <SocialLoginSection />\n'
        text = replace_once(text, render, render + '\n      <PlaybackAdvancedSettings />\n', 'Settings advanced card')
    write(path, text)


def patch_native_bridge():
    path = 'src/components/mg/nativeFireTvBridge.js'
    text = read(path)
    if 'readPlaybackPreferences' not in text.splitlines()[0:8].__str__():
        text = 'import { readPlaybackPreferences } from "@/components/mg/playbackPreferences";\n\n' + text

    if 'learnedCompatibilityReason' not in text:
        anchor = 'const positiveWholeNumber = (value) => {'
        helper = r'''const NATIVE_DIAGNOSTICS_KEY = "mg:native-playback-diagnostics:v1";

const connectionDownlinkMbps = () => {
  if (typeof navigator === "undefined") return 0;
  const value = Number(navigator.connection?.downlink || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const diagnosticFingerprint = (value = {}) => {
  const height = Number(value?.height || 0);
  const resolution = height >= 1700 ? "4k" : height >= 900 ? "1080p" : height > 0 ? "sd" : "unknown";
  return [
    String(value?.videoCodec || "").toLowerCase(),
    String(value?.audioCodec || "").toLowerCase(),
    String(value?.container || value?.mimeType || "").toLowerCase(),
    String(value?.hdrFormat || "").toLowerCase(),
    Number(value?.bitDepth || 0) >= 10 ? "10bit" : "normalbit",
    resolution,
  ].join("|");
};

const learnedCompatibilityReason = (hints = {}) => {
  if (typeof window === "undefined") return "";
  let history = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(NATIVE_DIAGNOSTICS_KEY) || "[]");
    history = Array.isArray(parsed) ? parsed : [];
  } catch {
    return "";
  }

  const wanted = diagnosticFingerprint(hints);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const failures = history.filter((entry) => {
    if (Number(entry?.at || 0) < cutoff || diagnosticFingerprint(entry) !== wanted) return false;
    const code = Number(entry?.compatibilityErrorCode || 0);
    const text = [
      entry?.compatibilityError,
      entry?.compatibilityReason,
      entry?.message,
    ].filter(Boolean).join(" ");
    return code === 3003 || (code >= 4001 && code <= 5004) ||
      /decoder|codec|format|profile|unsupported|initialization/i.test(text);
  });

  return failures.length >= 2 ? "learned-device-decoder-failure" : "";
};

'''
        text = replace_once(text, anchor, helper + anchor, 'native bridge learning helpers')

    signature = '  activeSourceIndex = 0,\n}) => {'
    if 'preferForcedSubtitles = false' not in text:
        text = replace_once(
            text,
            signature,
            '  activeSourceIndex = 0,\n  preferForcedSubtitles = false,\n}) => {',
            'native bridge forced subtitle signature'
        )

    marker = '''  const resolvedHints = {
    videoCodec: selectedHints?.videoCodec || contextHints.videoCodec || "",
    audioCodec: selectedHints?.audioCodec || contextHints.audioCodec || "",
    container: selectedHints?.container || contextHints.container || "",
    videoProfile: selectedHints?.videoProfile || contextHints.videoProfile || "",
    width: selectedHints?.width || contextHints.width || 0,
    height: selectedHints?.height || contextHints.height || 0,
    fps: selectedHints?.fps || contextHints.fps || 0,
    bitDepth: selectedHints?.bitDepth || contextHints.bitDepth || 0,
    bitrate: selectedHints?.bitrate || contextHints.bitrate || 0,
    hdrFormat: selectedHints?.hdrFormat || contextHints.hdrFormat || "",
  };

  const payload = {'''
    if 'const advancedPlayback = readPlaybackPreferences();' not in text:
        insert = marker.replace(
            '\n\n  const payload = {',
            '''\n\n  const advancedPlayback = readPlaybackPreferences();
  const learnedReason = learnedCompatibilityReason(resolvedHints);
  const userForcesCompatibility =
    advancedPlayback.audioOutputMode !== "auto" ||
    Number(advancedPlayback.lipSyncMs || 0) !== 0 ||
    advancedPlayback.dialogueBoost !== "off" ||
    advancedPlayback.volumeNormalization === true;
  const forceCompatibilityReason = learnedReason ||
    (userForcesCompatibility ? "advanced-audio-processing" : "");

  const payload = {'''
        )
        text = replace_once(text, marker, insert, 'native bridge advanced preferences')

    payload_anchor = '    canChooseEpisode,\n    headers:'
    if 'audioOutputMode: advancedPlayback.audioOutputMode' not in text:
        advanced_fields = '''    canChooseEpisode,
    audioOutputMode: advancedPlayback.audioOutputMode,
    lipSyncMs: advancedPlayback.lipSyncMs,
    dialogueBoost: advancedPlayback.dialogueBoost,
    volumeNormalization: advancedPlayback.volumeNormalization,
    automaticNoSoundRecovery: advancedPlayback.automaticNoSoundRecovery,
    networkAware4K: advancedPlayback.networkAware4K,
    thermalProtection: advancedPlayback.thermalProtection,
    networkDownlinkMbps: connectionDownlinkMbps(),
    connectionEffectiveType: String(navigator?.connection?.effectiveType || ""),
    forceCompatibility: Boolean(forceCompatibilityReason),
    forceCompatibilityReason,
    preferForcedSubtitles: Boolean(preferForcedSubtitles),
    headers:'''
        text = replace_once(text, payload_anchor, advanced_fields, 'native payload advanced fields')

    write(path, text)


def patch_router(path):
    text = read(path)
    anchor = '''        if (payload.optJSONObject("drm") != null) {
            return Decision(false)
        }
'''
    addition = anchor + '''
        if (payload.optBoolean("forceCompatibility", false)) {
            return Decision(
                true,
                payload.optString("forceCompatibilityReason").trim().ifBlank {
                    "advanced-playback"
                }
            )
        }
'''
    text = replace_once(text, anchor, addition, f'{path} forced compatibility')
    write(path, text)


def patch_player_activity(path):
    text = read(path)
    if 'setShowSubtitleButton(true)' not in text:
        text = replace_once(
            text,
            '            useController = true\n',
            '            useController = true\n            setShowSubtitleButton(true)\n',
            f'{path} subtitle button'
        )
    # Native diagnostics now accept a Context to include thermal/memory state.
    finish = text.find('    private fun finishWithResult(')
    if finish >= 0:
        segment = text[finish:]
        old = '''            event = reason,
            message = message
        ).toString()'''
        new = '''            event = reason,
            message = message,
            context = this
        ).toString()'''
        if old in segment:
            segment = segment.replace(old, new, 1)
            text = text[:finish] + segment
    write(path, text)


def patch_main_activity(path):
    text = read(path)
    old = '''                if (preflight.shouldSkip) {
                    synchronized(nativePlayerLock) {'''
    new = '''                val networkRisk =
                    payload.optBoolean("networkAware4K", true) &&
                        preflight.networkRisk

                if (preflight.shouldSkip || networkRisk) {
                    synchronized(nativePlayerLock) {'''
    text = replace_once(text, old, new, f'{path} network risk condition')

    old_message = '''                    val message =
                        if (preflight.statusCode > 0) {
                            "Stream pre-check rejected this source (HTTP ${preflight.statusCode}). Trying another source."
                        } else {
                            "Stream pre-check rejected this source. Trying another source."
                        }
'''
    new_message = '''                    val message =
                        when {
                            networkRisk ->
                                "This 4K source needs about ${String.format("%.1f", preflight.requiredMbps)} Mbps but the pre-check measured ${String.format("%.1f", preflight.estimatedMbps)} Mbps. Trying another 4K/backup source."
                            preflight.statusCode > 0 ->
                                "Stream pre-check rejected this source (HTTP ${preflight.statusCode}). Trying another source."
                            else ->
                                "Stream pre-check rejected this source. Trying another source."
                        }
'''
    text = replace_once(text, old_message, new_message, f'{path} network risk message')

    # Include Context in preflight diagnostics.
    old_diag = '''                        event = "rejected",
                        message = message,
                        extra = preflight.toJson()
                    )'''
    new_diag = '''                        event = "rejected",
                        message = message,
                        extra = preflight.toJson(),
                        context = this@MainActivity
                    )'''
    text = replace_once(text, old_diag, new_diag, f'{path} preflight diagnostics context')
    write(path, text)


def patch_video_player():
    path = 'src/components/mg/VideoPlayer.jsx'
    text = read(path)
    text = replace_once(
        text,
        '  detectLanguagePreference,\n  getPlaybackDeviceProfile,\n',
        '  detectLanguagePreference,\n  detectStreamTraits,\n  getPlaybackDeviceProfile,\n',
        'VideoPlayer detectStreamTraits import'
    )

    marker = '  const recoverySourceScore = (item, index) => {'
    if 'const automaticNetworkScore' not in text:
        helper = r'''  const automaticNetworkScore = (item, label) => {
    const preferences = readPlaybackPreferences();
    if (!preferences.networkAware4K || typeof navigator === "undefined") return 0;

    const traits = detectStreamTraits(item, label);
    if (Number(traits.resolution || 0) < 2160) return 0;

    const downlink = Number(navigator.connection?.downlink || 0);
    if (!Number.isFinite(downlink) || downlink <= 0) return 0;

    const rawBitrate = Number(
      item?.bitrate || item?.bit_rate || item?.videoBitrate || item?.video_bitrate || 0
    );
    const labelRate = Number(
      String(label || "").match(/(\d+(?:\.\d+)?)\s*(?:mbps|mb\/s)/i)?.[1] || 0
    );
    const bitrateMbps = rawBitrate > 100000 ? rawBitrate / 1_000_000 : rawBitrate > 0 ? rawBitrate : labelRate;
    const remux = /\b(?:remux|blu-?ray|bdmv)\b/i.test(String(label || ""));
    const required = bitrateMbps > 0 ? bitrateMbps * 1.2 : remux ? 55 : 24;

    if (downlink < required * 0.72) return -70000;
    if (downlink < required) return -22000;
    if (downlink >= required * 1.5) return 6000;
    return 0;
  };

  const hdrRecoveryScore = (item, label) => {
    const activeTraits = detectStreamTraits(
      active,
      sourceDisplayLabel(active, activeIdx)
    );
    if (!activeTraits.dolbyVision) return 0;
    const candidate = detectStreamTraits(item, label);
    if (candidate.dolbyVision) return -8000;
    const sameQuality = Number(candidate.resolution || 0) >= Number(activeTraits.resolution || 0);
    if (candidate.hdr && sameQuality) return 36000;
    if (sameQuality) return 26000;
    return candidate.hdr ? 16000 : 10000;
  };

'''
        text = replace_once(text, marker, helper + marker, 'VideoPlayer network/HDR recovery helpers')

    score_anchor = '''      liveGeoPenalty +
      liveRepositoryBonus
    );'''
    score_new = '''      liveGeoPenalty +
      liveRepositoryBonus +
      automaticNetworkScore(item, label) +
      hdrRecoveryScore(item, label)
    );'''
    text = replace_once(text, score_anchor, score_new, 'VideoPlayer recovery score extensions')

    # Preserve preferred forced-subtitle choice in native payload.
    native_call = '      subtitlesEnabled: trackPreferences.subtitlesEnabled,\n'
    if 'preferForcedSubtitles: trackPreferences.preferForcedSubtitles' not in text:
        text = replace_once(
            text,
            native_call,
            native_call + '      preferForcedSubtitles: trackPreferences.preferForcedSubtitles,\n',
            'VideoPlayer native forced subtitle preference'
        )

    no_sound_anchor = '  handleNoSoundRef.current = handleNoSound;\n'
    if 'automatic no-sound recovery' not in text.lower():
        effect = r'''

  /* Automatic no-sound recovery is proactive for codec combinations that are
   * commonly silent on Android/Fire TV/browser decoders, and immediate for a
   * source that this device has already remembered as silent. */
  useEffect(() => {
    if (
      isLive || isYoutube || isProvider || rdResolving || rdPolling ||
      rdTorrentId || rdPreparation || readPlaybackPreferences().automaticNoSoundRecovery === false
    ) {
      return undefined;
    }

    const candidate = rdOverride
      ? { ...active, src: rdOverride.src || activeUrl, label: rdOverride.label || active?.label }
      : active;
    const label = sourceDisplayLabel(candidate, activeIdx);
    const traits = detectStreamTraits(candidate, label);
    const rememberedSilent = hasRecentNoSoundHistory(label);
    if (!rememberedSilent && !traits.audioRisk) return undefined;

    const timer = window.setTimeout(() => {
      const video = stageRef.current?.querySelector("video");
      if (
        video instanceof HTMLVideoElement &&
        !video.paused && !video.ended && !video.error
      ) {
        handleNoSoundRef.current?.({ automatic: true });
      }
    }, rememberedSilent ? 2200 : 4200);

    return () => window.clearTimeout(timer);
  }, [
    active, activeIdx, activeUrl, isLive, isProvider, isYoutube,
    rdOverride, rdPolling, rdResolving, rdTorrentId, rdPreparation,
  ]);
'''
        text = replace_once(text, no_sound_anchor, no_sound_anchor + effect, 'VideoPlayer automatic no-sound effect')

    write(path, text)


def patch_native_diagnostics_learning():
    # VideoPlayer already stores native diagnostic history before processing a result.
    # Add a reliability event so decoder failures strengthen the per-device model.
    path = 'src/components/mg/VideoPlayer.jsx'
    text = read(path)
    marker = '''          console.info("[Media God native playback]", entry);
        } catch {
          // Diagnostics must never interrupt playback.
        }
'''
    if 'compatibilityErrorCode' not in text[text.find(marker)-1000:text.find(marker)+1500]:
        replacement = '''          console.info("[Media God native playback]", entry);

          const diagnosticFailure =
            Number(entry.compatibilityErrorCode || 0) > 0 ||
            /decoder|codec|format|profile|unsupported/i.test(
              `${entry.compatibilityError || ""} ${entry.compatibilityReason || ""} ${entry.message || ""}`
            );
          if (diagnosticFailure) {
            recordPlaybackReliability(
              sourceDisplayLabel(active, activeIdx),
              "failure"
            );
          }
        } catch {
          // Diagnostics must never interrupt playback.
        }
'''
        text = replace_once(text, marker, replacement, 'VideoPlayer native decoder learning')
    write(path, text)


def bump_versions_and_manifests():
    targets = [
        ('firetv-android/app/build.gradle.kts', 29, '1.4.24'),
        ('android-mobile/app/build.gradle.kts', 14, '1.0.13'),
    ]
    for path, code, name in targets:
        text = read(path)
        text = re.sub(r'versionCode\s*=\s*\d+', f'versionCode = {code}', text, count=1)
        text = re.sub(r'versionName\s*=\s*"[^"]+"', f'versionName = "{name}"', text, count=1)
        write(path, text)

    updates = [
        ('public/firetv-update.json', 29, '1.4.24',
         'Fire TV 1.4.24 adds advanced playback controls: automatic no-sound recovery, Auto/Stereo/Surround/Passthrough audio modes, embedded/external subtitle selection, lip-sync adjustment, network-aware 4K preflight, learned decoder blacklisting, Dolby Vision/HDR rescue, thermal protection, dialogue boost, volume normalization, richer diagnostics and seamless position-preserving failover.'),
        ('public/android-mobile-update.json', 14, '1.0.13',
         'Media God Mobile 1.0.13 adds advanced playback controls for phones and tablets: automatic no-sound recovery, Auto/Stereo/Surround/Passthrough audio modes, subtitle selection, lip-sync adjustment, network-aware 4K preflight, learned decoder blacklisting, HDR rescue, thermal/memory protection, dialogue boost, volume normalization and richer diagnostics.'),
    ]
    for path, code, name, message in updates:
        data = json.loads(read(path))
        data['versionCode'] = code
        data['versionName'] = name
        data['message'] = message
        write(path, json.dumps(data, indent=2) + '\n')


def patch_checks():
    native_path = 'scripts/native-structure-check.mjs'
    text = read(native_path)
    text = text.replace('expectedVersion: "1.4.23"', 'expectedVersion: "1.4.24"')
    text = text.replace('expectedVersion: "1.0.12"', 'expectedVersion: "1.0.13"')

    guard_anchor = '''  const compatibilityRouter = requireFile(
    `${javaRoot}/PlaybackCompatibilityRouter.kt`,
    `${app.name} codec preflight router`
  );
'''
    if 'devicePerformanceGuard' not in text:
        text = replace_once(
            text,
            guard_anchor,
            guard_anchor + '''  const devicePerformanceGuard = requireFile(
    `${javaRoot}/DevicePerformanceGuard.kt`,
    `${app.name} thermal and memory guard`
  );
''',
            'native checks device guard'
        )

    check_anchor = '    [compatibilityRouter.includes(\'payload.optJSONObject("drm")\'), "DRM Media3 guard"],\n'
    if 'lip-sync adjustment' not in text:
        extras = '''    [compatibilityRouter.includes('payload.optBoolean("forceCompatibility"'), "learned/advanced compatibility routing"],
    [playerActivity.includes("setShowSubtitleButton(true)"), "Media3 subtitle-track selector"],
    [compatibilityActivity.includes("spuTracks") && compatibilityActivity.includes("setSpuTrack"), "LibVLC subtitle-track selector"],
    [compatibilityActivity.includes("setAudioDelay"), "lip-sync adjustment"],
    [compatibilityActivity.includes("audioOutputMode") && compatibilityActivity.includes("setAudioDigitalOutputEnabled"), "selectable audio output modes"],
    [compatibilityActivity.includes("automaticNoSoundRecovery") && compatibilityActivity.includes("recoverAudioTrack"), "automatic no-sound recovery"],
    [compatibilityActivity.includes("equalizer-bands") && compatibilityActivity.includes("dialogueBoost"), "dialogue boost"],
    [compatibilityActivity.includes("audio-replay-gain-mode") && compatibilityActivity.includes("volumeNormalization"), "volume normalization"],
    [compatibilityActivity.includes("showPlaybackInfo"), "native playback info screen"],
    [devicePerformanceGuard.includes("currentThermalStatus") && devicePerformanceGuard.includes("lowMemory"), "thermal/memory 4K protection"],
'''
        text = replace_once(text, check_anchor, check_anchor + extras, 'native advanced checks')
    write(native_path, text)

    ui_path = 'scripts/ui-regression-check.mjs'
    ui = read(ui_path)
    console_marker = 'console.log("ok UI/navigation/download/watch-party/locked-source/version-update structural checks complete");'
    if 'PlaybackAdvancedSettings.jsx' not in ui:
        block = r'''const playbackAdvancedSettings = await read("src/components/mg/PlaybackAdvancedSettings.jsx");
const playbackPreferences = await read("src/components/mg/playbackPreferences.js");
const playerAutomation = await read("src/components/mg/PlayerProvider.jsx");

for (const marker of [
  "Audio output",
  "Lip sync",
  "Dialogue boost",
  "Volume normalization",
  "Automatic no-sound recovery",
  "Network-aware 4K",
  "Thermal / performance protection",
  "Playback diagnostics",
  "Clear playback learning",
]) {
  expect(playbackAdvancedSettings.includes(marker), `Advanced playback setting missing: ${marker}`);
}
expect(
  playbackPreferences.includes('audioOutputMode: "auto"') &&
    playbackPreferences.includes("lipSyncMs: 0") &&
    playbackPreferences.includes("automaticNoSoundRecovery: true") &&
    playbackPreferences.includes("networkAware4K: true") &&
    playbackPreferences.includes("thermalProtection: true"),
  "Advanced playback preference defaults are incomplete"
);
expect(
  settings.includes("<PlaybackAdvancedSettings />"),
  "Advanced playback settings are not mounted in Settings"
);
expect(
  playerAutomation.includes("nextEpisodePreloadRef") &&
    playerAutomation.includes('typeof core.prepare === "function"') &&
    playerAutomation.includes("preparedFresh"),
  "Next-episode source pre-resolution is no longer active"
);
expect(
  videoPlayer.includes("preservePosition: true") &&
    videoPlayer.includes("trackPreferences.audioLanguage") &&
    videoPlayer.includes("automaticNetworkScore") &&
    videoPlayer.includes("hdrRecoveryScore"),
  "Seamless/network/HDR automatic recovery markers are incomplete"
);

'''
        ui = replace_once(ui, console_marker, block + console_marker, 'UI advanced checks')
    write(ui_path, ui)


def main():
    write('src/components/mg/playbackPreferences.js', PLAYBACK_PREFS)
    write('src/components/mg/PlaybackAdvancedSettings.jsx', ADVANCED_SETTINGS)
    patch_settings()
    patch_native_bridge()
    patch_video_player()
    patch_native_diagnostics_learning()

    for package, root, fire in [
        ('com.mediagod.firetv', 'firetv-android/app/src/main/java/com/mediagod/firetv', True),
        ('com.mediagod.mobile', 'android-mobile/app/src/main/java/com/mediagod/mobile', False),
    ]:
        write(f'{root}/DevicePerformanceGuard.kt', DEVICE_GUARD_TEMPLATE.replace('__PACKAGE__', package))
        write(f'{root}/NativeStreamPreflight.kt', PREFLIGHT_TEMPLATE.replace('__PACKAGE__', package))
        write(f'{root}/NativePlaybackDiagnostics.kt', DIAGNOSTICS_TEMPLATE.replace('__PACKAGE__', package))
        write(f'{root}/CompatibilityPlayerActivity.kt', compat_text(package, fire))
        patch_router(f'{root}/PlaybackCompatibilityRouter.kt')
        patch_player_activity(f'{root}/PlayerActivity.kt')
        patch_main_activity(f'{root}/MainActivity.kt')

    bump_versions_and_manifests()
    patch_checks()


if __name__ == '__main__':
    main()
