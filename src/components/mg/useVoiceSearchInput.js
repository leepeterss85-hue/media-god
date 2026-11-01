import { useCallback, useEffect, useRef, useState } from "react";

import {
  cancelVoiceSearch,
  isVoiceSearchAvailable,
  startVoiceSearch,
  voiceSearchFailureMessage,
} from "@/components/mg/voiceSearch";

/**
 * One voice-search attempt as React state.
 *
 * `listen()` starts the shared engine (native bridge first, then the browser
 * recogniser) and hands the transcript to `onResult`. Cancelling or unmounting
 * always releases the microphone.
 */
export default function useVoiceSearchInput(onResult) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const resultRef = useRef(onResult);

  resultRef.current = onResult;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cancelVoiceSearch();
    };
  }, []);

  const listen = useCallback(async () => {
    if (!isVoiceSearchAvailable()) {
      setError(voiceSearchFailureMessage({ code: "unavailable" }));
      return false;
    }

    setError("");
    setListening(true);

    try {
      const result = await startVoiceSearch();

      if (mountedRef.current) {
        setError("");
        resultRef.current?.(result.text, result.source);
      }

      return true;
    } catch (failure) {
      if (mountedRef.current && failure?.code !== "cancelled") {
        setError(voiceSearchFailureMessage(failure));
      }

      return false;
    } finally {
      if (mountedRef.current) {
        setListening(false);
      }
    }
  }, []);

  const stop = useCallback(() => {
    cancelVoiceSearch();
    setListening(false);
  }, []);

  const clearError = useCallback(() => setError(""), []);

  return {
    listening,
    error,
    setError,
    clearError,
    listen,
    stop,
    available: isVoiceSearchAvailable(),
  };
}