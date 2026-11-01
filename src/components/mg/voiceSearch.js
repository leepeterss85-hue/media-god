/**
 * Shared voice-search engine for Media God.
 *
 * One place owns the native bridge handoff (Fire TV / Android shells) and the
 * browser SpeechRecognition fallback, so the Home screen, the navigation rail,
 * the search dialog and the catalogue search fields all behave identically.
 *
 * Native shells answer through a window event (`mg:voice-search-result` on
 * Fire TV, `mg:native-voice-search-result` on Android) carrying either a
 * `text`/`transcript` value or an `error` code.
 */

export const VOICE_SEARCH_TIMEOUT_MS = 15000;

const NATIVE_VOICE_EVENTS = [
  "mg:voice-search-result",
  "mg:native-voice-search-result",
];

let activeSession = null;

export const cleanVoiceSearch = (value) =>
  String(value || "")
    .replace(/[\u201c\u201d"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const nativeVoiceBridge = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = window.MediaGodNative;

  if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) {
    return null;
  }

  return typeof candidate.startVoiceSearch === "function" ? candidate : null;
};

const browserRecognition = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

export const hasNativeVoiceSearch = () => Boolean(nativeVoiceBridge());

export const isVoiceSearchAvailable = () =>
  Boolean(nativeVoiceBridge() || browserRecognition());

export const voiceSearchFailureMessage = (error) => {
  const code = String(error?.code || "");

  if (code === "unavailable") {
    return "Voice search is not available on this device. Use the keyboard or type a title instead.";
  }

  if (code === "denied") {
    return "Microphone access was denied. Allow microphone access in settings, or use the keyboard to type a title.";
  }

  if (code === "no-speech") {
    return "No speech was heard. Try again or use the keyboard.";
  }

  if (code === "timeout") {
    return "No voice-search result arrived. Try again or use the keyboard.";
  }

  return "Voice search could not complete. Try again or use the keyboard.";
};

const releaseSession = (session) => {
  if (!session) {
    return;
  }

  window.clearTimeout(session.timer);
  session.timer = null;

  session.listeners.forEach(([name, handler]) => {
    window.removeEventListener(name, handler);
  });
  session.listeners = [];

  const recognition = session.recognition;
  session.recognition = null;

  if (recognition) {
    try {
      recognition.abort?.();
    } catch {
      // The recogniser may already be closed.
    }
  }
};

export const cancelVoiceSearch = () => {
  const session = activeSession;

  if (!session) {
    return false;
  }

  activeSession = null;
  session.settled = true;
  releaseSession(session);
  session.reject({ code: "cancelled", message: "Voice search was cancelled." });

  return true;
};

/**
 * Start one voice-search attempt.
 *
 * Resolves with `{ text, source }` and rejects with `{ code }` where code is
 * one of: unavailable, denied, no-speech, timeout, cancelled, failed.
 */
export const startVoiceSearch = ({
  timeoutMs = VOICE_SEARCH_TIMEOUT_MS,
  language = "en-GB",
} = {}) => {
  cancelVoiceSearch();

  return new Promise((resolve, reject) => {
    const session = {
      resolve,
      reject,
      settled: false,
      listeners: [],
      recognition: null,
      timer: null,
    };

    activeSession = session;

    const settle = (result, error) => {
      if (session.settled) {
        return;
      }

      session.settled = true;

      if (activeSession === session) {
        activeSession = null;
      }

      releaseSession(session);

      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    };

    const armTimeout = () => {
      window.clearTimeout(session.timer);
      session.timer = window.setTimeout(
        () => settle(null, { code: "timeout" }),
        Math.max(3000, Number(timeoutMs) || VOICE_SEARCH_TIMEOUT_MS)
      );
    };

    const detachNativeListeners = () => {
      session.listeners.forEach(([name, handler]) => {
        window.removeEventListener(name, handler);
      });
      session.listeners = [];
      window.clearTimeout(session.timer);
      session.timer = null;
    };

    const tryNative = () => {
      const bridge = nativeVoiceBridge();

      if (!bridge) {
        return false;
      }

      const onNativeResult = (event) => {
        const detail = event?.detail || {};
        const spoken = cleanVoiceSearch(detail.text || detail.transcript);

        if (spoken) {
          settle({ text: spoken, source: "native" });
          return;
        }

        if (detail.error === "cancelled") {
          settle(null, { code: "cancelled" });
          return;
        }

        settle(null, { code: detail.error ? "failed" : "no-speech" });
      };

      NATIVE_VOICE_EVENTS.forEach((name) => {
        window.addEventListener(name, onNativeResult);
        session.listeners.push([name, onNativeResult]);
      });

      armTimeout();

      let started = false;

      try {
        const value = bridge.startVoiceSearch();
        started = value === true || value === "true";
      } catch {
        started = false;
      }

      if (started) {
        return true;
      }

      // The shell refused (no recogniser installed) — try the browser next.
      detachNativeListeners();
      return false;
    };

    const tryBrowser = () => {
      const Recognition = browserRecognition();

      if (!Recognition) {
        return false;
      }

      let recognition = null;

      try {
        recognition = new Recognition();
      } catch {
        return false;
      }

      session.recognition = recognition;
      recognition.lang = language;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const spoken = cleanVoiceSearch(event?.results?.[0]?.[0]?.transcript);

        if (spoken) {
          settle({ text: spoken, source: "browser" });
          return;
        }

        settle(null, { code: "no-speech" });
      };

      recognition.onerror = (event) => {
        const failure = String(event?.error || "");

        settle(null, {
          code:
            failure === "not-allowed" || failure === "service-not-allowed"
              ? "denied"
              : failure === "no-speech"
                ? "no-speech"
                : "failed",
        });
      };

      recognition.onend = () => {
        if (!session.settled) {
          settle(null, { code: "no-speech" });
        }
      };

      try {
        recognition.start();
      } catch {
        session.recognition = null;
        return false;
      }

      armTimeout();
      return true;
    };

    if (tryNative()) {
      return;
    }

    if (tryBrowser()) {
      return;
    }

    settle(null, { code: "unavailable" });
  });
};