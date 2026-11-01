import { Loader2, Mic } from "lucide-react";

import useVoiceSearchInput from "@/components/mg/useVoiceSearchInput";
import {
  voiceSearchFailureMessage,
} from "@/components/mg/voiceSearch";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * Microphone control for catalogue search fields.
 *
 * Speaks the query and hands the transcript to `onResult`. Failures stay close
 * to the field: either through the optional `onError` callback or a toast.
 */
export default function VoiceSearchButton({
  onResult,
  onError,
  className,
  iconClassName = "h-4 w-4 3xl:h-5 3xl:w-5",
  label = "Search by voice",
}) {
  const { toast } = useToast();
  const { listening, listen, available } = useVoiceSearchInput((text) => {
    onResult?.(text);
  });

  const handleClick = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (listening) {
      return;
    }

    if (!available) {
      const message = voiceSearchFailureMessage({ code: "unavailable" });
      if (onError) {
        onError(message);
      } else {
        toast({
          title: "Voice search unavailable",
          description: message,
          variant: "destructive",
        });
      }
      return;
    }

    const started = await listen();

    if (!started) {
      // The hook keeps the precise reason; surface it once through the field.
      if (onError) {
        onError("Voice search did not return a title. Try again or type it instead.");
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={listening ? "Listening for a title" : label}
      aria-pressed={listening}
      title={listening ? "Listening…" : label}
      data-mg-voice-search="true"
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mg-green",
        listening
          ? "bg-mg-green text-black animate-pulse"
          : "text-mg-green hover:bg-white/10",
        className
      )}
    >
      {listening ? (
        <Loader2 className={cn(iconClassName, "animate-spin")} />
      ) : (
        <Mic className={iconClassName} />
      )}
    </button>
  );
}