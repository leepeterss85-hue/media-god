import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, MonitorPlay, RefreshCw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  PAIRING_STORAGE_KEY,
  mediaGodHandoffCommand,
  pairingCodeFromInput,
  receiverOnline,
} from "@/components/mg/pairedMediaGodCast";

/**
 * Sends metadata to another running Media God instance using its existing QR
 * Phone Remote session. Works across networks, but the receiver must be
 * running Media God; no generic TV protocol or transcoding is implied.
 */
export default function MediaGodDeviceCast({ media, onClose }) {
  const [codeInput, setCodeInput] = useState(() => {
    try { return window.localStorage.getItem(PAIRING_STORAGE_KEY) || ""; }
    catch { return ""; }
  });
  const [receivers, setReceivers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const code = useMemo(
    () => pairingCodeFromInput(codeInput, window.location.origin),
    [codeInput]
  );

  useEffect(() => {
    let cancelled = false;
    const scan = async () => {
      setScanning(true);
      try {
        const user = await base44.auth.me();
        if (!user?.id) return;
        // Do not expose or display other accounts' receiver sessions.
        const rows = await base44.entities.PlayerRemoteSession.filter({
          created_by_id: user.id,
        });
        if (!cancelled) {
          setReceivers((Array.isArray(rows) ? rows : [])
            .filter((row) => receiverOnline(row))
            .slice(0, 8));
        }
      } catch {
        // Guests can still connect with the TV's unguessable QR URL.
      } finally {
        if (!cancelled) setScanning(false);
      }
    };
    scan();
    return () => { cancelled = true; };
  }, []);

  const send = async (targetCode = code) => {
    if (busy) return;
    setMessage("");
    setSuccess(false);
    const token = pairingCodeFromInput(targetCode, window.location.origin);
    if (!token) {
      setMessage("Paste the full Phone Remote QR link or pairing code shown on the TV.");
      return;
    }
    let command;
    try {
      command = mediaGodHandoffCommand(media);
    } catch (error) {
      setMessage(error.message || "Choose a playable film or episode first.");
      return;
    }
    setBusy(true);
    try {
      const rows = await base44.entities.PlayerRemoteSession.filter({
        session_code: token,
      });
      const receiver = (Array.isArray(rows) ? rows : []).find(
        (entry) => entry.session_code === token
      );
      if (!receiverOnline(receiver)) {
        setMessage("Media God on the receiving device is offline or the pairing has expired. Open Phone Remote on the TV again.");
        return;
      }
      await base44.entities.PlayerRemoteSession.update(receiver.id, {
        command: command.command,
        command_value: command.value,
        command_seq: Number(receiver.command_seq || 0) + 1,
      });
      try { window.localStorage.setItem(PAIRING_STORAGE_KEY, token); } catch {}
      setCodeInput(token);
      setSuccess(true);
      setMessage("Sent to Media God on the other device. It will resolve the video with its own player; check that the picture starts on the TV.");
    } catch {
      setMessage("Could not contact that Media God receiver. Check the pairing link and internet connection on both devices.");
    } finally {
      setBusy(false);
    }
  };

  return typeof document === "undefined" ? null : createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/80 p-3" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Play on another Media God device"
        className="w-full max-w-lg rounded-2xl border border-white/20 bg-zinc-950 p-5 text-white shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <MonitorPlay className="h-7 w-7 shrink-0 text-mg-green" />
            <div>
              <h2 className="text-lg font-semibold">Play on Media God TV</h2>
              <p className="text-xs text-white/60">Fire TV, Android TV or another Media God screen</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close device pairing" className="rounded-md p-2 text-white/70 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-white/70">
          Open <strong>Phone Remote</strong> in Media God on your TV. Paste its QR link or pairing code below.
          After pairing, you can send films and episodes even if the devices are on different networks.
          The receiving device must have Media God open and access to its own playback sources.
        </p>

        {receivers.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-white/60">Your active Media God devices</p>
            {receivers.map((receiver) => (
              <button
                type="button"
                key={receiver.id}
                onClick={() => send(receiver.session_code)}
                disabled={busy}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-mg-green/35 bg-mg-green/10 px-3 py-2 text-left text-sm hover:bg-mg-green/20 disabled:opacity-50"
              >
                <span className="flex items-center gap-2"><MonitorPlay className="h-4 w-4" /> Media God screen <span className="text-white/50">· {receiver.status === "playing" ? "Playing" : "Ready"}</span></span>
                <span className="font-semibold text-mg-green">Send</span>
              </button>
            ))}
          </div>
        )}

        <label htmlFor="mg-pair-receiver" className="mt-5 block text-sm font-semibold">Pair using TV remote link or code</label>
        <input
          id="mg-pair-receiver"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={codeInput}
          onChange={(event) => setCodeInput(event.target.value)}
          placeholder="https://.../remote/..."
          className="mt-2 min-h-11 w-full rounded-lg border border-white/20 bg-black px-3 text-sm text-white outline-none focus:border-mg-green"
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={busy || !code}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-mg-green px-4 py-2 font-semibold text-black disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorPlay className="h-4 w-4" />}
          {busy ? "Sending…" : "Send to Media God"}
        </button>
        {scanning && <p className="mt-2 flex items-center gap-2 text-xs text-white/50"><RefreshCw className="h-3 w-3 animate-spin" /> Looking for your signed-in devices…</p>}
        {message && (
          <p role="status" className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm ${success ? "border-mg-green/30 text-mg-green" : "border-amber-400/30 text-amber-200"}`}>
            {success && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
            {message}
          </p>
        )}
        <p className="mt-4 text-xs text-white/50">
          This sends only the catalogue title, episode and resume position. No Real-Debrid key, signed stream URL or magnet is shared.
          Other TVs still require their supported Cast, AirPlay or mirroring method.
        </p>
      </section>
    </div>,
    document.body
  );
}
