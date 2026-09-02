  const play = useCallback(async (s) => {
    let sources = s?.sources ? [...s.sources] : [];
    const isLive = s?.type === "live" || sources.some((x) => x.live || x.type === "live");
    const isSeries = s?.type === "series" || s?.season || s?.episode || s?.mediaType === "tv";

    let mediaId = s?.imdbId || s?.imdb_id;

    if (!mediaId && s?.id && !isNaN(s.id)) {
      try {
        const tmdbType = isSeries ? "tv" : "movie";
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${s.id}/external_ids?api_key=38267272847a9ef3878b273b37963d76`);
        const tmdbData = await tmdbRes.json();
        if (tmdbData?.imdb_id) {
          mediaId = tmdbData.imdb_id;
        }
      } catch (e) {}
    }

    if (!mediaId && s?.id && String(s.id).startsWith('tt')) {
      mediaId = s.id;
    }

    if (!isLive) {
      try {
        const addons = await base44.entities.Addon.list("-created_date", 100);
        const activeAddons = (addons || []).filter((a) => a.active && a.url);

        const scraperPromises = activeAddons.map(async (addon) => {
          try {
            const baseUrl = addon.url.replace(/\/manifest\.json$/, '');
            const mediaType = isSeries ? "series" : "movie";
            
            const queryPath = mediaId 
              ? (isSeries && s.season && s.episode ? `${mediaId}:${s.season}:${s.episode}` : mediaId)
              : `search:${encodeURIComponent(s.title || "")}`;

            const targetUrl = `${baseUrl}/stream/${mediaType}/${queryPath}.json`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 7000);
            
            const res = await fetch(targetUrl, { signal: controller.signal });
            clearTimeout(timeout);
            const data = await res.json();
            
            if (data?.streams) {
              return data.streams.map((st) => {
                const streamUrl = st.url || `magnet:?xt=urn:btih:${st.infoHash}`;
                return {
                  label: st.title ? `${addon.name}: ${st.title.split('\n')[0]}` : `${addon.name} Source`,
                  type: "rd",
                  src: streamUrl,
                };
              });
            }
          } catch (err) {}
          return [];
        });

        const results = await Promise.all(scraperPromises);
        const allScraped = results.flat();
        if (allScraped.length > 0) {
          sources = [...sortEnglishFirst(allScraped), ...sources];
        }
      } catch (e) {}
    }

    if (hasRd && !isLive && !sources.some(x => x.type === "rd")) {
      sources.push({ label: "Real-Debrid Options", type: "rd", src: "" });
    }

    if (sources.length === 0 && s?.src) {
      sources.push({ label: "Stream", type: s.type || "url", src: s.src });
    }

    const playableSource = sources.find((x) => x.src);
    const activeUrl = playableSource ? playableSource.src : (sources[0]?.src || s?.src || "");
    
    setSource({ 
      ...s, 
      rdTitle: s.rdTitle || s.title,
      rdYear: s.rdYear || s.year,
      rdSeason: s.rdSeason || s.season,
      rdEpisode: s.rdEpisode || s.episode,
      sources, 
      url: activeUrl 
    });
  }, [hasRd]);
