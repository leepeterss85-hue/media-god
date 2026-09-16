const VIDEO_RE =
  /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts|mts|vob|ogv|3gp|3g2|wmv|asf|f4v|mxf|divx)$/i;

export const normaliseRequestedFileIndex = (value) => {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const numeric = Number(value);

  return Number.isInteger(numeric) && numeric >= 0
    ? numeric
    : null;
};

export const isVideoTorrentFile = (file) =>
  Boolean(file?.path) && VIDEO_RE.test(String(file.path));

const isLikelyExtraTorrentFile = (file) =>
  /\b(?:sample|trailer|teaser|featurette|extras?|bonus|special[ ._-]?features?|behind[ ._-]?(?:the[ ._-]?)?scenes|making[ ._-]?of|interview|deleted[ ._-]?scene|alternate[ ._-]?ending|gag[ ._-]?reel|bloopers?|outtakes?|commentary|music[ ._-]?video|storyboards?|previz|proof)\b/i.test(
    String(file?.path || "")
  );

export const torrentSelectionMetadataPending = (info = {}) => {
  const status = String(info?.status || "").toLowerCase();
  const files = Array.isArray(info?.files) ? info.files : [];

  return (
    /^(?:waiting_files_selection|waiting_selection)$/.test(status) &&
    files.length === 0
  );
};

export const chooseVideoFileForPlayback = (files, ep = {}) => {
  const safeFiles = Array.isArray(files) ? files : [];
  if (safeFiles.length === 0) return null;

  if (ep?.season != null && ep?.episode != null) {
    const season = String(ep.season).replace(/^0+/, "");
    const episode = String(ep.episode).replace(/^0+/, "");
    const patterns = [
      new RegExp(`s0*${season}[ ._-]*e0*${episode}(?!\\d)`, "i"),
      new RegExp(`(?:^|\\D)0*${season}x0*${episode}(?!\\d)`, "i"),
      new RegExp(
        `season[ ._-]*0*${season}.*(?:episode|ep)[ ._-]*0*${episode}(?!\\d)`,
        "i"
      ),
      new RegExp(
        `s0*${season}[ ._-]+(?:ep?|episode)[ ._-]*0*${episode}(?!\\d)`,
        "i"
      ),
    ];

    const episodeMatch = safeFiles.find((file) =>
      patterns.some((pattern) => pattern.test(String(file?.path || "")))
    );

    if (episodeMatch) return episodeMatch;
  }

  const titleWords = String(ep?.title || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (word) =>
        word.length >= 3 && !["the", "and", "with"].includes(word)
    );
  const year = String(ep?.year || "").trim();

  const scoreFile = (file) => {
    const path = String(file?.path || "");
    const text = path.toLowerCase();
    const extension = text.split(".").pop() || "";
    let score = Number(file?.bytes || 0);

    if (
      /\b(?:sample|trailer|teaser|featurette|extras?|bonus|special[ ._-]?features?|behind[ ._-]?(?:the[ ._-]?)?scenes|making[ ._-]?of|interview|deleted[ ._-]?scene|alternate[ ._-]?ending|gag[ ._-]?reel|bloopers?|outtakes?|commentary|music[ ._-]?video|storyboards?|previz|proof)\b/i.test(
        text
      )
    ) {
      score -= 10_000_000_000_000;
    }

    if (titleWords.length > 0) {
      const matched = titleWords.filter((word) => text.includes(word)).length;
      score += matched * 900_000_000_000;
      if (matched === titleWords.length) score += 2_500_000_000_000;
    }

    if (year && text.includes(year)) score += 700_000_000_000;

    if (["mp4", "m4v", "mkv", "webm", "mov"].includes(extension)) {
      score += 350_000_000_000;
    } else if (
      ["ts", "m2ts", "mts", "mpg", "mpeg", "f4v", "3gp", "3g2", "ogv"].includes(
        extension
      )
    ) {
      score += 120_000_000_000;
    }

    return score;
  };

  return safeFiles.slice().sort((a, b) => scoreFile(b) - scoreFile(a))[0];
};

export const chooseRequestedTorrentFileForPlayback = (allFiles, ep = {}) => {
  const files = Array.isArray(allFiles) ? allFiles : [];
  const manualSelection =
    ep?.manual_file_selection === true || ep?.manualFileSelection === true;
  const requestedFileId = normaliseRequestedFileIndex(
    ep?.file_id ?? ep?.fileId
  );
  const requestedPath = String(
    ep?.file_path ?? ep?.filePath ?? ""
  ).trim();
  const requestedIndex = normaliseRequestedFileIndex(
    ep?.file_idx ?? ep?.fileIdx
  );

  if (manualSelection && requestedPath) {
    const exactPath = files.find(
      (file) =>
        String(file?.path || "").trim() === requestedPath &&
        isVideoTorrentFile(file)
    );
    if (exactPath) return exactPath;
  }

  if (manualSelection && Number.isInteger(requestedFileId)) {
    const exactId = files.find(
      (file) =>
        Number(file?.id) === requestedFileId &&
        isVideoTorrentFile(file)
    );
    if (exactId) return exactId;
  }

  if (Number.isInteger(requestedIndex) && requestedIndex >= 0) {
    const candidates = [
      files[requestedIndex],
      files.find((file) => Number(file?.id) === requestedIndex),
      files.find((file) => Number(file?.id) === requestedIndex + 1),
    ].filter(Boolean);

    const indexedVideo = candidates.find(
      (file) =>
        isVideoTorrentFile(file) &&
        (manualSelection || !isLikelyExtraTorrentFile(file))
    );
    if (indexedVideo) return indexedVideo;
  }

  return chooseVideoFileForPlayback(files.filter(isVideoTorrentFile), ep);
};

export const mapTorrentLinksByFileId = (allFiles, links) => {
  const files = Array.isArray(allFiles) ? allFiles : [];
  const safeLinks = Array.isArray(links) ? links : [];
  const selectedFiles = files.filter(
    (file) => file?.selected === 1 || file?.selected === true
  );
  const videoFiles = files.filter(isVideoTorrentFile);
  let linkedFiles = [];

  if (safeLinks.length === files.length) {
    linkedFiles = files;
  } else if (
    selectedFiles.length > 0 &&
    safeLinks.length === selectedFiles.length
  ) {
    linkedFiles = selectedFiles;
  } else if (safeLinks.length === videoFiles.length) {
    linkedFiles = videoFiles;
  }

  const result = new Map();
  linkedFiles.forEach((file, index) => {
    const link = String(safeLinks[index] || "").trim();
    if (file?.id != null && link) {
      result.set(file.id, link);
    }
  });

  return result;
};
