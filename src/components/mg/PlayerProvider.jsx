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
