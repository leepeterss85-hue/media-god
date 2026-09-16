const clean = (value) =>
  String(value || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const MEDIA_EDITION_OPTIONS = [
  { value: "any", label: "Any edition" },
  { value: "theatrical", label: "Theatrical" },
  { value: "directors_cut", label: "Director's Cut" },
  { value: "extended", label: "Extended" },
  { value: "unrated", label: "Unrated" },
  { value: "final_cut", label: "Final Cut" },
  { value: "special_edition", label: "Special Edition" },
  { value: "ultimate_edition", label: "Ultimate Edition" },
  { value: "imax", label: "IMAX / Expanded" },
  { value: "uncut", label: "Uncut" },
  { value: "alternate", label: "Alternate Version" },
  { value: "assembly_cut", label: "Assembly Cut" },
  { value: "international_cut", label: "International Cut" },
  { value: "roadshow", label: "Roadshow" },
  { value: "redux", label: "Redux" },
  { value: "anniversary", label: "Anniversary Edition" },
];

const EDITION_RULES = [
  ["directors_cut", /\b(?:director'?s?|directors)\s+(?:cut|edition|version)\b|\bdc\b/i],
  ["extended", /\bextended(?:\s+(?:cut|edition|version))?\b|\bextended\s+episode\b/i],
  ["unrated", /\bunrated(?:\s+(?:cut|edition|version))?\b/i],
  ["final_cut", /\bfinal\s+cut\b/i],
  ["ultimate_edition", /\bultimate(?:\s+(?:cut|edition|version))\b/i],
  ["special_edition", /\bspecial(?:\s+(?:cut|edition|version))\b/i],
  ["assembly_cut", /\bassembly\s+cut\b/i],
  ["international_cut", /\b(?:international|european)\s+(?:cut|version|edition)\b/i],
  ["roadshow", /\broadshow(?:\s+(?:cut|version|edition))?\b/i],
  ["redux", /\bredux\b/i],
  ["anniversary", /\b(?:anniversary|collector'?s)\s+(?:cut|edition|version)\b/i],
  ["imax", /\bimax\b|\bexpanded\s+(?:aspect|ratio|frame|version)\b|\bopen\s+matte\b/i],
  ["uncut", /\buncut\b|\buncensored\b/i],
  ["alternate", /\balternate\s+(?:cut|version|ending|edit)\b|\balternative\s+(?:cut|version|ending|edit)\b/i],
  ["theatrical", /\btheatrical(?:\s+(?:cut|edition|version))?\b/i],
];

export const mediaEditionText = (item) =>
  clean(
    [
      item?.edition,
      item?.label,
      item?.name,
      item?.title,
      item?.description,
      item?.filename,
      item?.fileName,
      item?.path,
      item?.releaseTitle,
      item?.release_title,
    ]
      .filter(Boolean)
      .join(" ")
  );

export const detectMediaEdition = (item) => {
  const text = mediaEditionText(item);
  for (const [value, re] of EDITION_RULES) {
    if (re.test(text)) {
      const option = MEDIA_EDITION_OPTIONS.find((entry) => entry.value === value);
      return {
        value,
        label: option?.label || value,
        explicit: true,
      };
    }
  }

  return {
    value: "standard",
    label: "Standard / Original",
    explicit: false,
  };
};

export const mediaEditionLabel = (item) => detectMediaEdition(item).label;

export const mediaEditionSortScore = (item, preferred = "any") => {
  const edition = detectMediaEdition(item);
  const preference = String(preferred || "any");

  if (preference === "any") {
    return edition.explicit ? 100 : 0;
  }

  if (edition.value === preference) return 100000;

  if (preference === "theatrical" && edition.value === "standard") {
    return 15000;
  }

  return edition.explicit ? -5000 : 0;
};

export const sourceHasEdition = (item, edition) =>
  String(edition || "any") === "any" ||
  detectMediaEdition(item).value === String(edition);
