export const compareLiveTvRankRecords = (
  aRank,
  bRank,
  aName = "",
  bName = ""
) =>
  Number(bRank?.favourite === true) - Number(aRank?.favourite === true) ||
  Number(bRank?.uk === true) - Number(aRank?.uk === true) ||
  Number(aRank?.recentIndex ?? Number.MAX_SAFE_INTEGER) -
    Number(bRank?.recentIndex ?? Number.MAX_SAFE_INTEGER) ||
  Number(bRank?.reliability || 0) - Number(aRank?.reliability || 0) ||
  Number(bRank?.sourcePriority || 0) - Number(aRank?.sourcePriority || 0) ||
  Number(bRank?.quality || 0) - Number(aRank?.quality || 0) ||
  String(aName || "").localeCompare(String(bName || ""));
