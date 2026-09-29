import { secrets } from "base44:runtime";
import { load } from "npm:cheerio@1.1.2";
import {
  buildEmbedSuEmbedUrl,
  extractEmbedSuServers,
} from "./embedServers.mjs";

const fetchPage = async (url) => {
  const response = await fetch(url, {
    headers: { Accept: "text/html" },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Embed.su did not respond");
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) throw new Error("Embed.su did not return HTML");
  if (Number(response.headers.get("content-length") || 0) > 750_000) {
    throw new Error("Embed.su response is too large");
  }
  const html = await response.text();
  return html.slice(0, 750_000);
};

// Puppeteer uses a separately configured browser endpoint. The Base44
// function does not install or launch Chromium in its Deno runtime.
const browserPage = async (url) => {
  const browserWSEndpoint = String(secrets.get("EMBED_SU_BROWSER_WS_URL") || "").trim();
  if (!browserWSEndpoint) return "";
  const puppeteer = (await import("npm:puppeteer-core@24.20.0")).default;
  const browser = await puppeteer.connect({ browserWSEndpoint });
  let page;
  try {
    page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
    if (new URL(page.url()).hostname !== "embed.su") return "";
    await page.waitForFunction(
      () => /upstream\.to|mixdrop\.(?:ag|co)|vidcloud\.org/i.test(document.documentElement.innerHTML),
      { timeout: 4000 }
    ).catch(() => {});
    return (await page.content()).slice(0, 750_000);
  } finally {
    await page?.close().catch(() => {});
    browser.disconnect();
  }
};

export default async function (req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let media;
  try {
    media = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const url = buildEmbedSuEmbedUrl(media);
  if (!url) {
    return Response.json({ error: "An exact TMDb title and episode are required" }, { status: 400 });
  }

  let html = "";
  let status = "no_servers";
  try {
    html = await fetchPage(url);
  } catch {
    status = "unavailable";
  }

  let servers = html ? extractEmbedSuServers(html, load) : [];
  if (servers.length === 0) {
    try {
      const rendered = await browserPage(url);
      if (rendered) servers = extractEmbedSuServers(rendered, load);
    } catch {
      // The optional browser endpoint must never prevent the manual iframe.
    }
  }

  return Response.json({
    servers,
    status: servers.length ? "ready" : status,
  }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
