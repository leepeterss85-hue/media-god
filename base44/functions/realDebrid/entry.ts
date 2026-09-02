    if (action === 'resolve_best') {
      const magnet = body.magnet;
      if (!magnet || !magnet.startsWith('magnet:')) {
        return Response.json({ error: 'A valid magnet URI is required' }, { status: 400 });
      }

      // Force direct magnet addition for all scraped addon streams so unwatched items process immediately
      const addRes = await fetch(`${RD_BASE}/torrents/addMagnet`, {
        method: 'POST',
        headers: formHeaders,
        body: `magnet=${encodeURIComponent(magnet)}`,
      });
      if (!addRes.ok) {
        const t = await addRes.text();
        return Response.json({ error: `addMagnet failed: ${addRes.status} ${t}` }, { status: 502 });
      }
      const torrentId = (await addRes.json()).id;
      
      // Select files so Real-Debrid starts processing the stream immediately
      await fetch(`${RD_BASE}/torrents/selectFiles/${torrentId}`, {
        method: 'POST',
        headers: formHeaders,
        body: 'files=all',
      });

      const ep = {
        title: body.title,
        ...(body.year != null ? { year: String(body.year) } : {}),
        ...(body.season != null ? { season: String(body.season) } : {}),
        ...(body.episode != null ? { episode: String(body.episode) } : {}),
      };

      const stream = await resolveStreamable(torrentId, authHeaders, formHeaders, ep);
      if (stream.error) return Response.json({ error: stream.error }, { status: 502 });

      return Response.json({
        status: stream.ready ? 'ready' : 'preparing',
        torrent_id: String(torrentId),
        stream_url: stream.stream_url || '',
        filename: stream.filename || '',
        files: stream.files || [],
      });
    }
