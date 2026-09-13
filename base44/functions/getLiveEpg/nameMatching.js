const clean = (value) => String(value || "").trim();

const decodeXml = (value) =>
  clean(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

export const normaliseGuideName = (
  value,
  { stripProviderDecorations = false } = {}
) => {
  let text = decodeXml(value)
    .toLowerCase()
    .replace(/\+\s*1\b/g, " plus one ")
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ");

  if (stripProviderDecorations) {
    text = text
      .replace(/\bpowered\s+by\s+banijay\b.*$/g, " ")
      .replace(/\bby\s+lionsgate\b.*$/g, " ")
      .replace(/\b(?:on\s+)?rakuten\s+tv\s*$/g, " ")
      .replace(/\b(?:on\s+)?pluto\s+tv\s*$/g, " ")
      .replace(/\bsamsung\s+tv\s+plus\s*$/g, " ")
      .replace(/\bplex(?:\s+tv)?\s*$/g, " ")
      .replace(/\bfast\s*\+?\s*$/g, " ");
  }

  return text
    .replace(/\b(?:uk|hd|fhd|uhd|4k|2160p?|1080p?|720p?|576p?|480p?|sd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const guideNameAliases = (value) => {
  const aliases = new Set();
  const add = (candidate) => {
    const cleaned = String(candidate || "").replace(/\s+/g, " ").trim();
    if (cleaned) aliases.add(cleaned);
  };

  const addFamily = (candidate) => {
    const base = String(candidate || "").replace(/\s+/g, " ").trim();
    if (!base) return;

    add(base);
    add(base.replace(/\bitv\s+([1-4])\b/g, "itv$1"));
    add(base.replace(/\bitv([1-4])\b/g, "itv $1"));
    add(base.replace(/\b5\s+(usa|star|action|select)\b/g, "5$1"));
    add(base.replace(/\b5(usa|star|action|select)\b/g, "5 $1"));
    add(base.replace(/^u\s+and\s+/, ""));
    add(base.replace(/^uktv\s+/, ""));
    add(base.replace(/^bbc\s+1\b/, "bbc one"));
    add(base.replace(/^bbc\s+one\b/, "bbc 1"));
    add(base.replace(/^bbc\s+2\b/, "bbc two"));
    add(base.replace(/^bbc\s+two\b/, "bbc 2"));
    add(base.replace(/^c4\b/, "channel 4"));
    add(base.replace(/^channel\s+4\b/, "c4"));
    add(base.replace(/^five\b/, "channel 5"));
    add(base.replace(/^channel\s+5\b/, "five"));
    add(base.replace(/^bbc\s+news\s+channel\b/, "bbc news"));
  };

  addFamily(normaliseGuideName(value));
  addFamily(normaliseGuideName(value, { stripProviderDecorations: true }));

  return Array.from(aliases);
};
