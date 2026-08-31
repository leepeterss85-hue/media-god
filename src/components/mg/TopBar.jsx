import React from "react";
import { ArrowLeft, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TopBar({ title, onBack, canGoBack, onMenu }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-mg-background/80 backdrop-blur border-b border-white/5">
      <button
        onClick={onMenu}
        className="md:hidden flex items-center justify-center w-8 h-8 -ml-1 rounded-lg text-white hover:bg-white/5"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>
      <button
        onClick={onBack}
        disabled={!canGoBack}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors",
          canGoBack ? "text-white hover:bg-white/5" : "text-white/25 cursor-default"
        )}
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>
      <h1 className="text-sm font-semibold text-white truncate">{title}</h1>
    </div>
  );
}