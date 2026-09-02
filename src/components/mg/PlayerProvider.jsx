import React, { createContext, useContext, useState } from "react";
import { base44 } from "@/api/base44Client";

const NO_PLAYER = { play: () => {}, close: () => {} };
const PlayerContext = createContext(NO_PLAYER);

export const DEMO_VIDEO = "https://media.w3.org/2010/05/sintel/trailer.mp4";

export function buildMagnet(title, id, quality) {
  return `magnet:?xt=urn:btih:${id || "media"}&dn=${encodeURIComponent(title || "media")}`;
}

export function buildMediaSources({ title, id, poster, trailerUrl, providers = [] }) {
  const sources = [];
  if (providers && Array.isArray(providers)) {
    providers.forEach((p) => {
      if (p && p.link) sources.push({ label: p.name || "Provider", type: "provider", src: p.link, logo: p.logo });
    });
  }
  if (trailerUrl) sources.push({ label: "Trailer", type: "youtube", src: trailerUrl });
  return sources;
}

export function usePlayer() {
  return useContext(PlayerContext);
}

function getYouTubeEmbedUrl(url) {
  if (!url) return "";
  let videoId = "";
  if (url.includes("youtu.be/")) {
    videoId = url.split("youtu.be/")[1]?.split("?")[0];
  } else if (url.includes("watch?v=")) {
    videoId = url.split("watch?v=")[1]?.split("&")[0];
  } else if (url.includes("/embed/")) {
    videoId = url.split("/embed/")[1]?.split("?")[0];
  }
  return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : url;
}

export function PlayerProvider({ children }) {
  const [activePlayback, setActivePlayback] = useState(null);
  const [loading, setLoading] = useState(false);

  const play = async (s) => {
    if (!s) return;

    let targetUrl = "";
    if (s.src && typeof s.src === 'string') {
      targetUrl = s.src;
    } else if (s.url) {
      targetUrl = s.url;
    }

    if (targetUrl && !targetUrl.includes('media-god.app') && !targetUrl.endsWith('.torrent')) {
      setActivePlayback({
        title: s.title || "Media Playback",
        url: targetUrl,
        poster: s.poster || ""
      });
      return;
    }

    setActivePlayback({
      title: s.title || "Media Playback",
      url: "",
      poster: s.poster || ""
    });
    setLoading(true);

    try {
      let resolvedUrl = "";
      let mediaId = s.imdbId || s.imdb_id;

      if (!mediaId && s.id && String(s.id).startsWith('tt')) {
        mediaId = s.id;
      }

      if (!mediaId && s.id && !isNaN(s.id)) {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/movie/${s.id}/external_ids?api_key=38267272847a9ef3878b273b37963d76`);
          const data = await res.json();
          if (data?.imdb_id) mediaId = data.imdb_id;
        } catch (e) {}
      }

      if (!mediaId && s.title) {
        try {
          const res = await fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search?search=${encodeURIComponent(s.title)}.json`);
          const data = await res.json();
          if (data?.metas?.[0]) {
            mediaId = data.metas[0].imdb_id || data.metas[0].id;
          }
        } catch (e) {}
      }

      if (mediaId) {
        try {
          const addons = await base44.entities.Addon.list("-created_date", 100);
          const activeAddons = (addons || []).filter((a) => a.active && a.url);

          const isTv = s.season && s.episode;
          const streamType = isTv ? 'series' : 'movie';
          const streamTarget = isTv ? `${mediaId}:${s.season}:${s.episode}` : mediaId;

          for (const addon of activeAddons) {
            try {
              const addonUrl = addon.url.replace('/manifest.json', `/stream/${streamType}/${streamTarget}.json`);
              const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(addonUrl)}`;
              const res = await fetch(proxyUrl);
              const json = await res.json();
              
              if (json && json.streams) {
                const found = json.streams.find(st => {
                  if (!st || !st.url) return false;
                  const streamUrl = String(st.url);
                  return (
                    (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) &&
                    !streamUrl.includes('youtube') && 
                    !streamUrl.includes('youtu.be') &&
                    !streamUrl.endsWith('.torrent') &&
                    !streamUrl.includes('magnet:')
                  );
                });
                
                if (found && found.url) {
                  resolvedUrl = found.url;
                  break;
                }
              }
            } catch (err) {}
          }
        } catch (dbErr) {}
      }

      if (!resolvedUrl) {
        const fallbackId = mediaId || (s.id && !isNaN(s.id) ? `tmdb-${s.id}` : null) || (s.title ? s.title.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'tt10872600');
        const isTv = s.season && s.episode;
        resolvedUrl = isTv 
          ? `https://media-god.app/api/stream?id=${fallbackId}&season=${s.season}&episode=${s.episode}`
          : `https://media-god.app/api/stream?id=${fallbackId}`;
      }

      setActivePlayback({
        title: s.title || "Media Playback",
        url: resolvedUrl,
        poster: s.poster || ""
      });
    } catch (e) {
      setActivePlayback({
        title: s.title || "Media Playback",
        url: DEMO_VIDEO,
        poster: s.poster || ""
      });
    } finally {
      setLoading(false);
    }
  };

  const close = () => setActivePlayback(null);

  const isYouTube = activePlayback?.url && (activePlayback.url.includes('youtube') || activePlayback.url.includes('youtu.be'));
  const finalPlayerUrl = isYouTube ? getYouTubeEmbedUrl(activePlayback.url) : activePlayback?.url;

  return (
    <PlayerContext.Provider value={{ play, close }}>
      {children}
      {activePlayback && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ width: '90%', maxWidth: '1000px', display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#fff' }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {activePlayback.title} {loading ? "(Fetching Stream...)" : ""}
            </span>
            <button 
              onClick={close} 
              style={{ background: '#e50914', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Close
            </button>
          </div>
          {finalPlayerUrl ? (
            isYouTube ? (
              <iframe
                key={finalPlayerUrl}
                src={finalPlayerUrl}
                title={activePlayback.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ width: '90%', maxWidth: '1000px', height: '80vh', border: 'none', backgroundColor: '#000', borderRadius: '8px' }}
              />
            ) : (
              <video 
                key={finalPlayerUrl}
                src={finalPlayerUrl} 
                controls 
                autoPlay 
                poster={activePlayback.poster}
                style={{ width: '90%', maxWidth: '1000px', maxHeight: '80vh', backgroundColor: '#000', borderRadius: '8px' }}
              />
            )
          ) : (
            <div style={{ color: '#fff', padding: '40px', fontSize: '18px', textAlign: 'center' }}>
              Resolving stream...
            </div>
          )}
        </div>
      )}
    </PlayerContext.Provider>
  );
}
