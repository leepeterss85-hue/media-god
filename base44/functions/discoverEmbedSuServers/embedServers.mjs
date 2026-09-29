import { buildEmbedSuEmbedUrl, hostedEmbedPage, hostedEmbedLabel } from "../../../src/components/mg/webEmbedProviders.js";

/** Parse only concrete server embed URLs. Never return media/CDN URLs or page scripts. */
export const extractEmbedSuServers = (html, load) => {
  const $ = load(String(html || "").slice(0, 750_000));
  const found = new Map();
  const add = (candidate) => {
    const page = hostedEmbedPage(candidate);
    if (page && !found.has(page.url) && found.size < 12) {
      found.set(page.url, {
        provider: page.provider,
        label: hostedEmbedLabel[page.provider],
        url: page.url,
      });
    }
  };

  $("iframe[src], a[href], [data-src], [data-url], [data-embed]").each((_, element) => {
    for (const attr of ["src", "href", "data-src", "data-url", "data-embed"]) {
      const value = $(element).attr(attr);
      if (value) add(value);
    }
  });

  // Some pages keep server links in a JSON configuration rather than DOM nodes.
  $("script:not([src])").each((_, element) => {
    const script = $(element).html() || "";
    for (const match of script.matchAll(/https?:\\?\/\\?\/[^"'\s<>]{5,300}/g)) {
      add(match[0].replaceAll("\\/", "/").replace(/\\u0026/gi, "&"));
    }
  });

  return Array.from(found.values());
};

export { buildEmbedSuEmbedUrl };
