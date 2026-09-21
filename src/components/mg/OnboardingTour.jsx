import React, { useEffect, useState } from "react";
import {
  Bookmark,
  CheckCircle2,
  Heart,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";

const STORAGE_KEY = "mg:onboarding-complete:v1";
export const OPEN_ONBOARDING_EVENT = "mg:open-onboarding";

const STEPS = [
  {
    title: "Welcome to Media God",
    description:
      "This quick guide covers the catalogue and account tools without changing any playback settings.",
    icon: Sparkles,
  },
  {
    title: "Find something quickly",
    description:
      "Use Search for movies and TV shows. Recent searches, media filters and year filtering make it easier to narrow results.",
    icon: Search,
  },
  {
    title: "Save titles for later",
    description:
      "Watchlist keeps things you want to watch. Favorites keeps the titles you want to return to most often.",
    icon: Bookmark,
  },
  {
    title: "Organise your library",
    description:
      "Watchlist and Favorites have search, sorting, Movie/TV filters and an Edit mode for multi-select removal.",
    icon: Heart,
  },
  {
    title: "Make Media God yours",
    description:
      "Settings includes text size, contrast, reduced motion, Home-row ordering, updates, diagnostics and privacy-safe backup tools.",
    icon: Settings,
  },
];

const hasCompleted = () => {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
};

const markCompleted = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Onboarding state is best effort.
  }
};

export default function OnboardingTour() {
  const [open, setOpen] = useState(() => !hasCompleted());
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };

    window.addEventListener(OPEN_ONBOARDING_EVENT, reopen);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, reopen);
  }, []);

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const finalStep = step === STEPS.length - 1;

  const finish = () => {
    markCompleted();
    setOpen(false);
    setStep(0);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Getting started with Media God"
      data-mg-onboarding="true"
      className="fixed inset-0 z-[2147483000] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={finish}
    >
      <div
        className="w-full max-w-xl rounded-t-2xl border border-white/10 bg-mg-surface p-5 shadow-2xl sm:rounded-2xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-mg-green/25 bg-mg-green/10 text-mg-green">
          <Icon className="h-6 w-6" />
        </div>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-mg-green">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">
          {current.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/60">
          {current.description}
        </p>

        <div className="mt-6 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={
                "h-1.5 flex-1 rounded-full " +
                (index <= step ? "bg-mg-green" : "bg-white/10")
              }
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-white/45 hover:bg-white/5 hover:text-white"
          >
            Skip
          </button>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/70 hover:bg-white/10"
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (finalStep) {
                  finish();
                } else {
                  setStep((value) => Math.min(STEPS.length - 1, value + 1));
                }
              }}
              className="min-h-11 inline-flex items-center gap-2 rounded-lg bg-mg-green px-4 text-sm font-black text-black"
            >
              {finalStep ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Finish
                </>
              ) : (
                "Next"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
