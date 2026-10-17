const FEEDS = {
  film: "https://news.google.com/rss/search?q=(film+OR+movie)+news+when%3A7d&hl=en-GB&gl=GB&ceid=GB%3Aen",
  tv: "https://news.google.com/rss/search?q=(TV+OR+television)+series+news+when%3A7d&hl=en-GB&gl=GB&ceid=GB%3Aen",
};

const decodeXml = (value = "") => String(value)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

const field = (item, name) => {
  const match = item.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? decodeXml(match[1]).trim() : "";
};

const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
};

const cleanText = (value = "") => String(value)
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const parseFeed = (xml, category) => {
  const items = [];
  const matches = String(xml || "").match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  for (const item of matches) {
    const title = cleanText(field(item, "title"));
    const link = safeUrl(field(item, "link"));
    const publishedAt = field(item, "pubDate");
    const sourceMatch = item.match(/<source(?:\s+url=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? cleanText(decodeXml(sourceMatch[2])) : "Entertainment News";
    const sourceUrl = sourceMatch ? safeUrl(sourceMatch[1] || "") : "";
    const rawDescription = field(item, "description");
    const imageMatch = rawDescription.match(/<img[^>]+src=["']([^"']+)["']/i) || item.match(/<media:content[^>]+url=["']([^"']+)["']/i) || item.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    const image = imageMatch ? safeUrl(decodeXml(imageMatch[1])) : "";
    const description = cleanText(rawDescription);
    const timestamp = Date.parse(publishedAt);
    if (!title || !link) continue;
    items.push({
      id: link,
      title: title.replace(/\s+-\s+[^-]+$/, "").trim() || title,
      url: link,
      source,
      sourceUrl,
      category,
      publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "",
      description: description.slice(0, 360),
      image,
    });
  }
  return items;
};

export default async function(req: Request) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { section?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const section = ["all", "film", "tv"].includes(String(body?.section || "").toLowerCase())
    ? String(body.section).toLowerCase()
    : "all";
  const selected = section === "all" ? ["film", "tv"] : [section];

  const results = await Promise.allSettled(selected.map(async (category) => {
    const response = await fetch(FEEDS[category], {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error("News feed request failed");
    return parseFeed(await response.text(), category);
  }));

  const stories = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const unique = new Map();
  for (const story of stories) {
    const key = story.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!unique.has(key)) unique.set(key, story);
  }

  const sorted = [...unique.values()].sort((a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || ""));
  return Response.json({
    stories: sorted.slice(0, 36),
    updatedAt: new Date().toISOString(),
    partial: results.some((result) => result.status === "rejected"),
  }, {
    headers: { "Cache-Control": "public, max-age=900" },
  });
}
