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

export function PlayerProvider({ children }) {
  const [activePlayback, setActivePlayback] = useState(null);
  const [loading, setLoading] = useState(false);

  const play = async (s) => {
    if (!s) return;

    let initialUrl = "";
    if (s.src && typeof s.src === 'string' && !s.src.includes('youtube') && !s.src.includes('youtu.be')) {
      initialUrl = s.src;
    } else if (s.url && !s.url.includes('youtube')) {
      initialUrl = s.url;
    }

    if (initialUrl) {
      setActivePlayback({
        title: s.title || "Media Playback",
        url: initialUrl,
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
        const addons = await base44.entities.Addon.list("-created_date", 100);
        const activeAddons = (addons || []).filter((a) => a.active && a.url);

        const isTv = s.season && s.episode;
        const streamType = isTv ? 'series' : 'movie';
        const streamTarget = isTv ? `${mediaId}:${s.season}:${s.episode}` : mediaId;

        for (const addon of activeAddons) {
          try {
            const targetUrl = addon.url.replace('/manifest.json', `/stream/${streamType}/${streamTarget}.json`);
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
            const res = await fetch(proxyUrl);
            const json = await res.json();
            if (json && json.streams) {
              const found = json.streams.find(st => st && st.url && !st.url.startsWith('magnet:') && !st.url.includes('youtube'));
              if (found && found.url) {
                resolvedUrl = found.url;
                break;
              }
            }
          } catch (err) {}
        }
      }

      if (!resolvedUrl) {
        const targetId = mediaId || (s.title ? s.title.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'media');
        const isTv = s.season && s.episode;
        resolvedUrl = isTv 
          ? `https://media-god.app/torrents/${targetId}:${s.season}:${s.episode}1080p.torrent`
          : `https://media-god.app/torrents/${targetId}1080p.torrent`;
      }

      setActivePlayback({
        title: s.title || "Media Playback",
        url: resolvedUrl,
        poster: s.poster || ""
      });
    } catch (e) {
      const targetId = s.imdbId || s.imdb_id || s.id || 'media';
      setActivePlayback({
        title: s.title || "Media Playback",
        url: `https://media-god.app/torrents/${targetId}1080p.torrent`,
        poster: s.poster || ""
      });
    } finally {
      setLoading(false);
    }
  };

  const close = () => setActivePlayback(null);

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
              {activePlayback.title} {loading ? "(Resolving...)" : ""}
            </span>
            <button 
              onClick={close} 
              style={{ background: '#e50914', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Close
            </button>
          </div>
          {activePlayback.url ? (
            <video 
              key={activePlayback.url}
              src={activePlayback.url} 
              controls 
              autoPlay 
              poster={activePlayback.poster}
              style={{ width: '90%', maxWidth: '1000px', maxHeight: '80vh', backgroundColor: '#000', borderRadius: '8px' }}
            />
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

