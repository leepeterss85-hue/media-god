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
  componentDidCatch() {}
  render() {
    if (this.state.failed) return null;
    return this.props.children;
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