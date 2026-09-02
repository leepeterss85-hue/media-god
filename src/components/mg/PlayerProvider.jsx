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

    setActivePlayback({
      title: s.title || "Media Playback",
      url: initialUrl,
      poster: s.poster || ""
    });

    if (initialUrl) return;

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

      if (!mediaId) {
        mediaId = s.id || (s.title ? s.title.toLowerCase().replace(/[^a-z0-9]/g, '-') : '');
      }

      if (mediaId) {
        const isTv = s.season && s.episode;
        resolvedUrl = isTv 
          ? `https://media-god.app/torrents/${mediaId}:${s.season}:${s.episode}1080p.torrent`
          : `https://media-god.app/torrents/${mediaId}1080p.torrent`;
      }

      setActivePlayback(prev => ({
        ...prev,
        url: resolvedUrl
      }));
    } catch (e) {
      setActivePlayback(prev => ({
        ...prev,
        url: ""
      }));
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
              {activePlayback.title} {loading ? "(Resolving Stream...)" : ""}
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
              No stream URL generated.
            </div>
          )}
        </div>
      )}
    </PlayerContext.Provider>
  );
}
