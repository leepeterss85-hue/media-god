export const ANT_SPORTS_BASE_URL = "https://antsports.tv";

export async function fetchAntSportsEvents() {
  try {
    const targetUrl = `${ANT_SPORTS_BASE_URL}/us`;
    const proxyUrl = `https://media-god1.leepeterss85.workers.dev/?url=${encodeURIComponent(targetUrl)}`;
    
    const response = await fetch(proxyUrl, {
      headers: { Accept: "text/html,application/xhtml+xml" }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch AntSports directory: HTTP ${response.status}`);
    }

    const html = await response.text();
    return parseAntSportsHtml(html);
  } catch (error) {
    console.error("AntSports Scraper Error:", error);
    return [];
  }
}

function parseAntSportsHtml(html) {
  if (typeof window === "undefined" && typeof DOMParser === "undefined") {
    // Fallback regex extraction if running in a non-DOM worker/SSR context
    return parseWithRegex(html);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const events = [];

  // Locate match cards / list entries based on site structure
  const matchCards = doc.querySelectorAll(".match-item, .live-item, tr, .event-card");
  
  if (matchCards.length === 0) {
    return parseWithRegex(html);
  }

  matchCards.forEach((card, index) => {
    const titleText = card.textContent?.replace(/\s+/g, " ").trim() || "";
    const linkEl = card.querySelector("a");
    const href = linkEl ? linkEl.getAttribute("href") : "";

    if (titleText) {
      events.push({
        id: `antsports:${index}:${titleText.slice(0, 15)}`,
        name: `[AntSports] ${titleText}`,
        group: "AntSports Live",
        url: href ? (href.startsWith("http") ? href : `${ANT_SPORTS_BASE_URL}${href}`) : `${ANT_SPORTS_BASE_URL}/us`,
        kind: "direct",
        format: "hls",
        sourceId: "antsports-scraper",
        sourceName: "AntSports Live",
        sourcePriority: 97,
        sourceCategory: "Sports",
        browserPlayable: true,
        tags: ["Sports", "United Kingdom", "AntSports"],
        score: 4500,
      });
    }
  });

  return events;
}

function parseWithRegex(html) {
  const events = [];
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  let match;
  let index = 0;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].trim();

    if (text.length > 3 && (text.includes("vs") || text.includes("Live") || text.includes("Cup") || text.includes("League"))) {
      const fullUrl = href.startsWith("http") ? href : `${ANT_SPORTS_BASE_URL}${href}`;
      events.push({
        id: `antsports:reg:${index++}`,
        name: `[AntSports] ${text}`,
        group: "AntSports Live",
        url: `https://media-god1.leepeterss85.workers.dev/?url=${encodeURIComponent(fullUrl)}`,
        kind: "direct",
        format: "hls",
        sourceId: "antsports-scraper",
        sourceName: "AntSports Live",
        sourcePriority: 97,
        sourceCategory: "Sports",
        browserPlayable: true,
        tags: ["Sports", "United Kingdom", "AntSports"],
        score: 4500,
      });
    }
  }

  return events;
}
