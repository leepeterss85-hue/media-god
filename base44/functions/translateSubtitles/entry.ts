import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

const MAX_CUES = 600;
const MAX_CHARS = 12000;

const normaliseLanguage = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0] || "en";

const languageName = (code) => {
  const map = {
    en: "English",
    fr: "French",
    es: "Spanish",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    nl: "Dutch",
    pl: "Polish",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
    hi: "Hindi",
    ru: "Russian",
    uk: "Ukrainian",
    tr: "Turkish",
  };
  return map[code] || String(code || "English");
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const cues = Array.isArray(body?.cues) ? body.cues : [];
    const target = normaliseLanguage(body?.targetLanguage || "en");

    if (cues.length === 0) {
      return Response.json({ translated: [] });
    }

    const trimmed = cues
      .map((line) => String(line ?? ""))
      .slice(0, MAX_CUES)
      .map((line) => line.slice(0, 400));

    const totalChars = trimmed.reduce((sum, line) => sum + line.length, 0);
    if (totalChars > MAX_CHARS) {
      return Response.json(
        { error: "Subtitle track is too long to translate in one pass." },
        { status: 413 }
      );
    }

    const numbered = trimmed
      .map((line, index) => `${index + 1}|${line}`)
      .join("\n");

    const prompt = [
      `You translate subtitles for a media player.`,
      `Translate every line below into ${languageName(target)}.`,
      `Keep the leading number and pipe separator exactly as given.`,
      `Preserve meaning, tone and brevity. Do not merge or split lines.`,
      `Return only the translated lines, one per line, in the same order.`,
      `If a line is empty, return the number and pipe with nothing after it.`,
      ``,
      numbered,
    ].join("\n");

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          lines: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["lines"],
      },
    });

    const lines = Array.isArray(result?.lines) ? result.lines : [];

    const translated = [];
    for (let index = 0; index < trimmed.length; index += 1) {
      const raw = String(lines[index] ?? "");
      const match = raw.match(/^\s*\d+\s*\|(.*)$/s);
      translated.push(match ? match[1] : raw);
    }

    while (translated.length < trimmed.length) {
      translated.push("");
    }

    return Response.json({ translated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}