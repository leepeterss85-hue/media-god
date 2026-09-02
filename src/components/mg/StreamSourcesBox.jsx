    if (s.kind === "rd") {
      const fallbackStream = scrapedStreams.find(addonStream => addonStream.url);
      player.play({
        title,
        poster,
        rdTitle: title,
        rdYear,
        sources: [{ 
          label: "Real-Debrid", 
          type: "rd", 
          src: fallbackStream ? fallbackStream.url : `magnet:?xt=urn:btih:0000000000000000000000000000000000000000&dn=${encodeURIComponent(title)}`,
          magnet: fallbackStream ? fallbackStream.url : `magnet:?xt=urn:btih:0000000000000000000000000000000000000000&dn=${encodeURIComponent(title)}`
        }],
      });
    }
