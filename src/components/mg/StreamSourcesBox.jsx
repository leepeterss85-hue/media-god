import React, { useEffect, useState } from "react";
import { Zap, Play, Tv, ExternalLink, Link as LinkIcon } from "lucide-react";
import { usePlayer } from "@/components/mg/PlayerProvider";
import { findChannelsByTitle } from "@/components/mg/freeTvPlaylist";
import { base44 } from "@/api/base44Client";

export default function StreamSourcesBox({
  title,
  poster,
  trailerUrl,
  providers,
  loading,
  rdYear,
  tmdbId,
  imdbId,
  mediaType = "movie",
  rdSeason,
  rdEpisode,
}) {
  const player = usePlayer();
  const [liveMatches, setLiveMatches] = useState([]);
  const [scrapedStreams, setScrapedStreams] = useState([]);
  const [scraping, setScraping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    findChannelsByTitle(title)
      .then((matches) => {
        if (!cancelled) setLiveMatches(matches || []);
      })
      .catch(() => {
        if (!cancelled) setLiveMatches([]);
      });

    const loadAddonSources = async () => {
      try {
        const isSeries = mediaType === "tv";
        let resolvedImdb = imdbId || "";

        if (!resolvedImdb && tmdbId != null) {
          try {
            const res = await fetch(
              `https://api.themoviedb.org/3/${isSeries ? "tv" : "movie"}/${tmdbId}/external_ids?api_key=38267272847a9ef3878b273b37963d76`
            );
            if (res.ok) {
              const data = await res.json();
              resolvedImdb = data?.imdb_id || "";
            }
          } catch {}
        }

        // Invoke the backend server-side function correctly via Base44 SDK
        const response = await base44.functions.invoke("realDebrid", {
          action: "fetch_streams",
          title,
          imdb_id: resolvedImdb,
          season: isSeries ? rdSeason : undefined,
          episode: isSeries ? rdEpisode : undefined,
        });

        if (!cancelled && response) {
          const sourcesList = response.sources || response?.data?.sources || [];
          if (Array.isArray(sourcesList)) {
            setScrapedStreams(sourcesList);
          }
        }
      } catch (err) {
        console.error("Failed to fetch addon streams:", err);
      } finally {
        if (!cancelled) setScraping(false);
      }
    };

    loadAddonSources();

    return () => {
      cancelled = true;
    };
  }, [title, tmdbId, imdbId, mediaType, rdSeason, rdEpisode]);

  const sources = [
    {
      id: "rd",
      kind: "rd",
      label: "Real-Debrid Library / Cloud",
      note: "Instant cache check & download queue",
    },
    ...scrapedStreams.map((s, idx) => ({
      id: `addon-${idx}`,
      kind: "addon-stream",
      label: s.label,
      note: s.addon || "Network Addon",
      url: s.url,
      src: s.src,
      magnet: s.magnet,
      infoHash: s.infoHash,
      type: s.type,
    })),
    {
      id: "paste",
      kind: "paste",
      label: "Paste Magnet / Torrent",
      note: "Send custom magnet through Real-Debrid",
    },
    ...(trailerUrl
      ? [{ id: "trailer", kind: "trailer", label: "Trailer", note: "YouTube Preview" }]
      : []),
    ...(liveMatches || []).map((c, i) => ({
      id: `live-${i}`,
      kind: "live",
      label: c.name,
      note: `Live • ${c.group || "Free-to-air"}`,
      logo: c.logo,
      channel: c,
    })),
    {
      id: "archive",
      kind: "archive",
      label: "Free Internet Archive",
      note: "Public domain library search",
    },
    ...(providers || []).filter((p) => p?.link).map((p) => ({
      id: `provider-${p.name}`,
      kind: "provider",
      label: p.name,
      note: p.tier || "Official Stream",
      logo: p.logo,
      link: p.link,
    })),
  ];

  const handleSelectSource = (s) => {
    if (s.kind === "provider") {
      window.open(s.link, "_blank", "noopener,noreferrer");
      return;
    }

    if (s.kind === "archive") {
      window.open(
        `https://archive.org/search?query=${encodeURIComponent(title)}`,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    if (s.kind === "trailer") {
      player.play({
        title,
        poster,
        sources: [{ label: "Trailer", type: "youtube", src: trailerUrl }],
      });
      return;
    }

    if (s.kind === "live") {
      player.play({
        type: "live",
        title: s.channel.name,
        poster: s.channel.logo,
        sources: [
          {
            label: "LIVE",
            type: "live",
            src: s.channel.url,
            live: true,
          },
        ],
      });
      return;
    }

    player.play({
      id: tmdbId,
      imdbId,
      title,
      poster,
      year: rdYear,
      mediaType,
      sources: [
        {
          label: s.label,
          type: s.type || "rd",
          src: s.src || s.url || "",
          magnet: s.magnet,
          infoHash: s.infoHash,
        },
      ],
    });
  };

  return (
    <div className="space-y-3 p-4 bg-zinc-950 text-white rounded-xl border border-zinc-800">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-green-400 uppercase tracking-wide">Stream Sources</h3>
        {scraping && <span className="text-xs text-zinc-400 animate-pulse">Scanning network addons...</span>}
      </div>

      <div className="grid gap-2">
        {sources.map((s) => (
          <button
            key={s.id}
            onClick={() => handleSelectSource(s)}
            className="flex items-center justify-between p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition text-left group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-zinc-800 rounded-lg group-hover:bg-green-600 group-hover:text-black transition">
                {s.kind === "trailer" ? <Play className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{s.label}</div>
                <div className="text-xs text-zinc-400 truncate">{s.note}</div>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-white shrink-0 ml-2" />
          </button>
        ))}
      </div>
    </div>
  );
}
