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

      if (!resolvedUrl && mediaId) {
        const isTv = s.season && s.episode;
        resolvedUrl = isTv 
          ? `https://media-god.app/torrents/${mediaId}:${s.season}:${s.episode}1080p.torrent`
          : `https://media-god.app/torrents/${mediaId}1080p.torrent`;
      }
