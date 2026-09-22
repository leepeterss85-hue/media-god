import React from "react";
import {
  Activity,
  Download,
  FileJson,
  HardDrive,
  Link,
  ListVideo,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";

const TOOLS = [
  {
    id: "updates",
<<<<<<< HEAD
    label: "Check for Updates",
    description: "Check for a new Media God version and view release information.",
=======
    label: "Updates",
    description: "Check Media God updates and view release information.",
>>>>>>> origin/main
    icon: ListVideo,
    featured: true,
  },
  {
    id: "rdlib",
    label: "RD Library",
    description: "Browse and play your Real-Debrid library.",
    icon: HardDrive,
  },
  {
    id: "downloads",
    label: "Debrid Downloads",
    description: "Manage debrid torrents, files and download activity.",
    icon: Download,
  },
  {
    id: "reezn",
    target: "sources",
    label: "Reezn",
    description: "Open Reezn and other external media providers.",
    icon: Link,
<<<<<<< HEAD
  },
  {
    id: "sources",
    label: "Sources & Providers",
    description: "Manage playback sources, Reezn and external providers.",
    icon: Link,
  },
  {
    id: "remote",
    label: "Phone Remote",
    description: "Open the phone / QR remote for controlling Media God.",
    icon: Smartphone,
  },
  {
    id: "watchparty",
    label: "Watch Party",
    description: "Create or join a synchronized watch session.",
    icon: Users,
  },
  {
=======
  },
  {
    id: "addons",
    label: "Addons",
    description: "Manage installed playback and catalogue addons.",
    icon: Puzzle,
  },
  {
    id: "sources",
    label: "Sources & Providers",
    description: "Manage playback sources, Reezn and external providers.",
    icon: Link,
  },
  {
    id: "remote",
    label: "Phone Remote",
    description: "Open the phone / QR remote for controlling Media God.",
    icon: Smartphone,
  },
  {
    id: "watchparty",
    label: "Watch Party",
    description: "Create or join a synchronized watch session.",
    icon: Users,
  },
  {
>>>>>>> origin/main
    id: "diagnostics",
    label: "Diagnostics",
    description: "Check app health and copy a privacy-safe support report.",
    icon: Activity,
  },
  {
    id: "backup",
    label: "Backup & Restore",
    description: "Back up Watchlist, Favorites and display preferences.",
    icon: FileJson,
  },
  {
    id: "getting-started",
    label: "Getting Started",
    description: "Reopen the quick guide to Media God’s catalogue and account tools.",
    icon: Sparkles,
  },
]

export default function SettingsTools({ onSelect }) {
  return (
    <section
      data-mg-settings-tools="true"
      className="bg-mg-card border border-white/10 rounded-lg 3xl:rounded-xl overflow-hidden"
    >
      <div className="p-4 3xl:p-5 border-b border-white/5">
        <h2 className="text-sm 3xl:text-lg font-bold text-white">
          Settings menu
        </h2>
        <p className="text-xs 3xl:text-sm text-white/40 mt-1">
          Updates and Debrid tools are kept first, followed by the rest of Media God’s settings.
        </p>
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-2 3xl:gap-3 3xl:p-4">
        {TOOLS.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === "getting-started") {
                  window.dispatchEvent(new CustomEvent("mg:open-onboarding"));
                  return;
                }

                onSelect?.(item.target || item.id);
              }}
              className={`group min-h-20 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green 3xl:min-h-24 3xl:p-4 ${
                item.featured
                  ? "border-mg-green/45 bg-mg-green/[0.10] hover:border-mg-green/70 hover:bg-mg-green/[0.14]"
                  : "border-white/10 bg-white/[0.03] hover:border-mg-green/35 hover:bg-mg-green/[0.06]"
              }`}
              aria-label={`Open ${item.label}`}
            >
              <span className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-mg-green 3xl:h-11 3xl:w-11">
                  <Icon className="h-4 w-4 3xl:h-5 3xl:w-5" />
                </span>

                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white 3xl:text-base">
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-white/40 3xl:text-sm">
                    {item.description}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

