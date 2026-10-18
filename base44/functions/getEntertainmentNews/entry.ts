const FEEDS = {
  film: [
    { url: "https://news.google.com/rss/search?q=(film+OR+movie)+news+when%3A3d&hl=en-GB&gl=GB&ceid=GB%3Aen", label: "Google News" },
    { url: "https://www.theguardian.com/film/rss", label: "The Guardian" },
    { url: "https://www.indiewire.com/feed/", label: "IndieWire" },
    { url: "https://feeds.feedburner.com/ign/movies-articles", label: "IGN" },
    { url: "https://variety.com/v/film/feed/", label: "Variety" },
    { url: "https://www.hollywoodreporter.com/c/movies/feed/", label: "The Hollywood Reporter" },
    { url: "https://collider.com/feed/", label: "Collider" },
    { url: "https://www.rollingstone.com/tv-movies/feed/", label: "Rolling Stone" },
    { url: "https://www.digitalspy.com/rss/default.xml", label: "Digital Spy" },
    { url: "https://screenrant.com/movies/feed/", label: "Screen Rant" },
    { url: "https://www.thewrap.com/category/film/feed/", label: "TheWrap" },
    { url: "https://deadline.com/feed/", label: "Deadline" },
  ],
  tv: [
    { url: "https://news.google.com/rss/search?q=(TV+OR+television+OR+streaming)+series+news+when%3A3d&hl=en-GB&gl=GB&ceid=GB%3Aen", label: "Google News" },
    { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", label: "BBC News" },
    { url: "https://deadline.com/feed/", label: "Deadline" },
    { url: "https://feeds.feedburner.com/ign/tv-articles", label: "IGN" },
    { url: "https://variety.com/v/tv/feed/", label: "Variety" },
    { url: "https://www.hollywoodreporter.com/c/tv/feed/", label: "The Hollywood Reporter" },
    { url: "https://www.digitalspy.com/rss/tv.xml", label: "Digital Spy" },
    { url: "https://www.rollingstone.com/tv-movies/feed/", label: "Rolling Stone" },
    { url: "https://screenrant.com/tv/feed/", label: "Screen Rant" },
    { url: "https://www.thewrap.com/category/tv/feed/", label: "TheWrap" },
  ],
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map<string, { expiresAt: number; payload: any }>();

const decodeXml = (value = "") => String(value)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

const cleanText = (value = "") => decodeXml(String(value))
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const safeUrl = (value) => {
  try {
    const url = new URL(decodeXml(value).trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
};

const field = (item, name) => {
  const match = item.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  if (match) return decodeXml(match[1]).trim();
  if (name === "link") {
    const atom = item.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
    if (atom) return decodeXml(atom[1]).trim();
  }
  return "";
};

const parseFeed = (xml, category, feedLabel) => {
  const items = [];
  const matches = String(xml || "").match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) || [];
  for (const item of matches) {
    const title = cleanText(field(item, "title"));
    const link = safeUrl(field(item, "link"));
    const publishedAt = field(item, "pubDate") || field(item, "published") || field(item, "updated");
    const sourceMatch = item.match(/<source(?:\s+url=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? cleanText(sourceMatch[2]) : "";
    const sourceUrl = sourceMatch ? safeUrl(sourceMatch[1] || "") : "";
    const rawDescription = field(item, "description") || field(item, "summary") || field(item, "content");
    const imageMatch = rawDescription.match(/<img[^>]+src=["']([^"']+)["']/i)
      || item.match(/<media:content[^>]+url=["']([^"']+)["']/i)
      || item.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    const image = imageMatch ? safeUrl(imageMatch[1]) : "";
    const description = cleanText(rawDescription);
    const timestamp = Date.parse(publishedAt);
    if (!title || !link) continue;
    let fallbackSource = feedLabel || "Entertainment News";
    try {
      const hostname = new URL(link).hostname.replace(/^www\./, "");
      if (!fallbackSource) fallbackSource = hostname;
    } catch {}
    const cleanTitle = title.replace(/\s+-\s+[^-]+$/, "").trim() || title;
    items.push({
      id: link,
      title: cleanTitle,
      url: link,
      source: source || fallbackSource,
      sourceUrl,
      category,
      publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "",
      description: description.slice(0, 360),
      image,
      breaking: /\bbreaking\b/i.test(cleanTitle) && Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp < 6 * 60 * 60 * 1000,
      justIn: Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp < 90 * 60 * 1000,
    });
  }
  return items;
};

async function fetchFeed(feed, category) {
  const response = await fetch(feed.url, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "MediaGodEntertainmentNews/1.0",
    },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error("Feed request failed: " + response.status);
  const stories = parseFeed(await response.text(), category, feed.label);
  if (!stories.length) throw new Error("Feed returned no parseable stories");
  return stories;
}

export default async function(req: Request) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { section?: string; forceRefresh?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const requested = String(body?.section || "all").toLowerCase();
  const section = ["all", "film", "tv"].includes(requested) ? requested : "all";
  const cached = responseCache.get(section);
  if (!body.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return Response.json({ ...cached.payload, cached: true }, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  const selected = section === "all" ? ["film", "tv"] : [section];
  const feedResults = await Promise.allSettled(
    selected.flatMap((category) => FEEDS[category].map((feed) => fetchFeed(feed, category)))
  );
  const stories = feedResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const unique = new Map();
  for (const story of stories) {
    const key = story.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key) continue;
    const existing = unique.get(key);
    const existingTime = Date.parse(existing?.publishedAt || "");
    const storyTime = Date.parse(story.publishedAt || "");
    // If multiple publishers syndicate the same headline, retain the freshest copy.
    if (!existing || (Number.isFinite(storyTime) && (!Number.isFinite(existingTime) || storyTime > existingTime))) unique.set(key, story);
  }

  const sorted = [...unique.values()].sort((a, b) => {
    // Freshness always wins: an old headline containing “breaking” must never outrank new reporting.
    const aTime = Date.parse(a.publishedAt || "");
    const bTime = Date.parse(b.publishedAt || "");
    const aValid = Number.isFinite(aTime), bValid = Number.isFinite(bTime);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && bValid && aTime !== bTime) return bTime - aTime;
    if (Boolean(a.justIn) !== Boolean(b.justIn)) return a.justIn ? -1 : 1;
    if (Boolean(a.breaking) !== Boolean(b.breaking)) return a.breaking ? -1 : 1;
    return 0;
  });
  const failedFeeds = feedResults.filter((result) => result.status === "rejected").length;
  const payload = {
    stories: sorted.slice(0, 72),
    updatedAt: new Date().toISOString(),
    partial: failedFeeds > 0 && sorted.length > 0,
    unavailable: sorted.length === 0,
    sourceCount: [...new Set(stories.map((story) => story.source))].length,
  };
  if (payload.stories.length) {
    responseCache.set(section, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  }
  return Response.json(payload, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}