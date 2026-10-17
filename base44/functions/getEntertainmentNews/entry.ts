const FEEDS = {
  film: [
    "https://news.google.com/rss/search?q=(film+OR+movie)+news+when%3A14d&hl=en-GB&gl=GB&ceid=GB%3Aen",
    "https://www.theguardian.com/film/rss",
    "https://www.indiewire.com/feed/",
  ],
  tv: [
    "https://news.google.com/rss/search?q=(TV+OR+television)+series+news+when%3A14d&hl=en-GB&gl=GB&ceid=GB%3Aen",
    "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
    "https://deadline.com/feed/",
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

const parseFeed = (xml, category) => {
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
    let fallbackSource = "Entertainment News";
    try { fallbackSource = new URL(link).hostname.replace(/^www\./, ""); } catch {}
    items.push({
      id: link,
      title: title.replace(/\s+-\s+[^-]+$/, "").trim() || title,
      url: link,
      source: source || fallbackSource,
      sourceUrl,
      category,
      publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "",
      description: description.slice(0, 360),
      image,
    });
  }
  return items;
};

async function fetchFeed(url, category) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "MediaGodEntertainmentNews/1.0",
    },
    signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) throw new Error("Feed request failed: " + response.status);
  const stories = parseFeed(await response.text(), category);
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
  // Independent feeds run together; each gets a shorter timeout so one slow publisher
  // cannot hold the news page open for too long.
  const feedResults = await Promise.allSettled(
    selected.flatMap((category) => FEEDS[category].map((url) => fetchFeed(url, category)))
  );
  const stories = feedResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const unique = new Map();
  for (const story of stories) {
    const key = story.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key && !unique.has(key)) unique.set(key, story);
  }

  const sorted = [...unique.values()].sort((a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || ""));
  const failedFeeds = feedResults.filter((result) => result.status === "rejected").length;
  const payload = {
    stories: sorted.slice(0, 48),
    updatedAt: new Date().toISOString(),
    partial: failedFeeds > 0 && sorted.length > 0,
    unavailable: sorted.length === 0,
  };
  // Cache useful responses in the warm function instance for five minutes.
  // Do not cache empty failures, so a transient outage can recover on the next request.
  if (payload.stories.length) {
    responseCache.set(section, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  }
  return Response.json(payload, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}