import React from "react";
import { createPortal } from "react-dom";
import VideoPlayer from "@/components/mg/VideoPlayer";
import VidSrcEmbedPlayer from "@/components/mg/VidSrcEmbedPlayer";
import EmbedSuPlayer from "@/components/mg/EmbedSuPlayer";
import VidCoreEmbedPlayer from "@/components/mg/VidCoreEmbedPlayer";
import ExtraEmbedPlayer from "@/components/mg/ExtraEmbedPlayer";
import OnlyFlixEmbedPlayer from "@/components/mg/OnlyFlixEmbedPlayer";
import WebtorEmbedPlayer from "@/components/mg/WebtorEmbedPlayer";
import WebTorrentPlayer from "@/components/mg/WebTorrentPlayer";
import { buildEmbedSuEmbedUrl } from "@/components/mg/webEmbedProviders";
import { buildVidSrcEmbedUrl } from "@/components/mg/vidsrcEmbed";
import { stopExclusivePlayback } from "@/components/mg/exclusivePlayback";

class PlayerRenderBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[Media God] Player render failed", error);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mg:player-status", {
          detail: {
            message:
              "The web player hit an error. Media God kept the app alive so you can go back and try another source.",
          },
        })
      );
    }
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <div
        data-mg-player-root="true"
        className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black p-6 text-white"
        style={{ backgroundColor: "#000" }}
      >
        <div className="max-w-md rounded-xl border border-white/10 bg-mg-card p-5 text-center">
          <h2 className="text-base font-bold">Player recovered safely</h2>
          <p className="mt-2 text-sm text-white/60">
            This source could not open in the web player. Go back and choose another source.
          </p>
          <button
            type="button"
            data-mg-player-exit="true"
            aria-label="Back to main menu"
            onClick={this.props.onClose}
            className="mt-4 min-h-10 rounded-lg bg-mg-green px-4 text-sm font-bold text-black"
          >
            Back to Media God
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Renders the active player surface into a document.body portal.
 * Extracted from MediaPlayerProvider so magnet-based players (Webtor.io,
 * WebTorrent) can be added without growing the already-large provider file.
 */
export default function PlayerPortalRenderer({
  source,
  vidSrcEmbed,
  magnetPlayer,
  close,
  setVidSrcEmbed,
  setMagnetPlayer,
}) {
  if (!source || typeof document === "undefined") return null;

  const openEmbedSu = (mediaType) => {
    if (!source || source.type === "live") return false;
    const media = { ...source, mediaType };
    const url = buildEmbedSuEmbedUrl(media);
    if (!url) return false;
    stopExclusivePlayback();
    setVidSrcEmbed({
      provider: "embedsu",
      url,
      media: {
        mediaType,
        tmdbId: media.tmdbId ?? media.id,
        season: media.season ?? media.rdSeason,
        episode: media.episode ?? media.rdEpisode,
      },
      title: String(source.title || "Video"),
    });
    return true;
  };

  const openVidSrc = (mediaType) => {
    if (!source || source.type === "live") return false;
    const url = buildVidSrcEmbedUrl({ ...source, mediaType });
    if (!url) return false;
    stopExclusivePlayback();
    setVidSrcEmbed({ url, title: String(source.title || "Video") });
    return true;
  };

  return createPortal(
    <PlayerRenderBoundary
      key={
        source?.playRequestId ||
        `${source?.title || "player"}-${source?.src || source?.url || ""}`
      }
      onClose={close}
    >
      {magnetPlayer?.type === "webtor" ? (
        <WebtorEmbedPlayer
          magnet={magnetPlayer.magnet}
          title={magnetPlayer.title}
          onBack={magnetPlayer.fromDetails ? close : () => setMagnetPlayer(null)}
          backLabel={magnetPlayer.fromDetails ? "Details" : "Sources"}
        />
      ) : magnetPlayer?.type === "webtorrent" ? (
        <WebTorrentPlayer
          magnet={magnetPlayer.magnet}
          title={magnetPlayer.title}
          onBack={magnetPlayer.fromDetails ? close : () => setMagnetPlayer(null)}
          backLabel={magnetPlayer.fromDetails ? "Details" : "Sources"}
        />
      ) : vidSrcEmbed?.provider === "embedsu" ? (
        <EmbedSuPlayer
          url={vidSrcEmbed.url}
          media={vidSrcEmbed.media}
          title={vidSrcEmbed.title}
          onBack={vidSrcEmbed.fromDetails ? close : () => setVidSrcEmbed(null)}
          backLabel={vidSrcEmbed.fromDetails ? "Details" : "Sources"}
        />
      ) : vidSrcEmbed?.provider === "vidcore" ? (
        <VidCoreEmbedPlayer
          url={vidSrcEmbed.url}
          title={vidSrcEmbed.title}
          onBack={vidSrcEmbed.fromDetails ? close : () => setVidSrcEmbed(null)}
          backLabel={vidSrcEmbed.fromDetails ? "Details" : "Sources"}
        />
      ) : ["twoembed", "cinesrc", "multiembed"].includes(vidSrcEmbed?.provider) ? (
        <ExtraEmbedPlayer
          url={vidSrcEmbed.url}
          title={vidSrcEmbed.title}
          providerLabel={{ twoembed: "2Embed", cinesrc: "CineSrc", multiembed: "MultiEmbed" }[vidSrcEmbed.provider]}
          onBack={vidSrcEmbed.fromDetails ? close : () => setVidSrcEmbed(null)}
          backLabel={vidSrcEmbed.fromDetails ? "Details" : "Sources"}
        />
      ) : vidSrcEmbed?.provider === "onlyflix" ? (
        <OnlyFlixEmbedPlayer
          url={vidSrcEmbed.url}
          title={vidSrcEmbed.title}
          onBack={vidSrcEmbed.fromDetails ? close : () => setVidSrcEmbed(null)}
          backLabel={vidSrcEmbed.fromDetails ? "Details" : "Sources"}
        />
      ) : vidSrcEmbed ? (
        <VidSrcEmbedPlayer
          url={vidSrcEmbed.url}
          title={vidSrcEmbed.title}
          onBack={vidSrcEmbed.fromDetails ? close : () => setVidSrcEmbed(null)}
          backLabel={vidSrcEmbed.fromDetails ? "Details" : "Sources"}
        />
      ) : (
        <VideoPlayer
          source={source}
          onClose={close}
          onOpenVidSrc={openVidSrc}
          onOpenEmbedSu={openEmbedSu}
        />
      )}
    </PlayerRenderBoundary>,
    document.body
  );
}