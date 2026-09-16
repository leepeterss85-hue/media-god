const clean = (value) =>
  String(value || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const MEDIA_EDITION_OPTIONS = [
  { value: "any", label: "Any edition" },
  { value: "standard", label: "Standard / Original" },
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
  { value: "collectors_edition", label: "Collector's Edition" },
  { value: "broadcast_cut", label: "Broadcast / TV Cut" },
  { value: "restored", label: "Restored / Remastered" },
  { value: "noir", label: "Black & White / Noir" },
];

export const MEDIA_EXTRA_OPTIONS = [
  { value: "deleted_scene", label: "Deleted Scene" },
  { value: "alternate_ending", label: "Alternate Ending" },
  { value: "featurette", label: "Featurette" },
  { value: "behind_scenes", label: "Behind the Scenes" },
  { value: "making_of", label: "Making Of" },
  { value: "interview", label: "Interview" },
  { value: "gag_reel", label: "Gag Reel / Bloopers" },
  { value: "commentary", label: "Commentary" },
  { value: "music_video", label: "Music Video" },
  { value: "storyboard", label: "Storyboard / Previz" },
  { value: "trailer", label: "Trailer / Teaser" },
  { value: "sample", label: "Sample" },
  { value: "bonus", label: "Bonus / Extra" },
];

const EXTRA_RULES = [
  ["deleted_scene", /\bdeleted\s+scenes?\b/i],
  ["alternate_ending", /\b(?:alternate|alternative)\s+endings?\b/i],
  ["featurette", /\bfeaturettes?\b/i],
  ["behind_scenes", /\bbehind\s+(?:the\s+)?scenes\b|\bbts\b/i],
  ["making_of", /\bmaking\s+of\b/i],
  ["interview", /\binterviews?\b/i],
  ["gag_reel", /\b(?:gag\s+reel|bloopers?|outtakes?)\b/i],
  ["commentary", /\bcommentary\b/i],
  ["music_video", /\bmusic\s+videos?\b/i],
  ["storyboard", /\b(?:storyboards?|previz|previsuali[sz]ation)\b/i],
  ["trailer", /\b(?:trailers?|teasers?)\b/i],
  ["sample", /\bsamples?\b/i],
  ["bonus", /\b(?:bonus|extras?|special\s+features?)\b/i],
];

const EDITION_RULES = [
  ["directors_cut", /\b(?:director'?s?|directors)\s+(?:cut|edition|version)\b/i],
  ["extended", /\bextended(?:\s+(?:cut|edition|version))?\b|\bextended\s+episode\b/i],
  ["unrated", /\bunrated(?:\s+(?:cut|edition|version))?\b/i],
  ["final_cut", /\bfinal\s+cut\b/i],
  ["ultimate_edition", /\bultimate(?:\s+(?:cut|edition|version))\b/i],
  ["special_edition", /\bspecial(?:\s+(?:cut|edition|version))\b/i],
  ["assembly_cut", /\bassembly\s+cut\b/i],
  ["international_cut", /\b(?:international|european)\s+(?:cut|version|edition)\b/i],
  ["roadshow", /\broadshow(?:\s+(?:cut|version|edition))?\b/i],
  ["redux", /\bredux\b/i],
  ["anniversary", /\banniversary\s+(?:cut|edition|version)\b/i],
  ["collectors_edition", /\bcollector'?s?\s+(?:cut|edition|version)\b/i],
  ["broadcast_cut", /\b(?:broadcast|television|tv)\s+(?:cut|edit|version|edition)\b/i],
  ["restored", /\b(?:restored|remastered)(?:\s+(?:cut|edition|version))?\b/i],
  ["noir", /\b(?:black\s*(?:and|&)\s*white|noir|black\s*&\s*chrome)\s+(?:cut|edition|version)\b/i],
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

export const detectMediaExtra = (item) => {
  const text = mediaEditionText(item);

  for (const [value, re] of EXTRA_RULES) {
    if (re.test(text)) {
      const option = MEDIA_EXTRA_OPTIONS.find((entry) => entry.value === value);
      return {
        value,
        label: option?.label || value,
        explicit: true,
      };
    }
  }

  return {
    value: "main_feature",
    label: "Main Feature",
    explicit: false,
  };
};

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

export const sourceHasEdition = (item, edition) => {
  const wanted = String(edition || "any");
  if (wanted === "any") return true;

  const detected = detectMediaEdition(item);

  /*
   * An untagged original is the theatrical/default release when no more
   * specific edition marker is present. Explicit Director's Cut, Extended,
   * Unrated, etc. remain separate and do not leak into the theatrical group.
   */
  if (
    wanted === "theatrical" &&
    detected.value === "standard" &&
    detected.explicit === false
  ) {
    return true;
  }

  return detected.value === wanted;
};
