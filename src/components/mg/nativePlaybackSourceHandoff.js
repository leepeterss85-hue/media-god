// The Android phone's native player has no source menu. Keep its Activity
// payload to the selected source; the WebView retains the complete chooser.
// Fire TV still receives its full native source list.
export const sourcesForNativeHandoff = (
  sources,
  activeSourceIndex,
  activeUrl,
  selectedSourceOnly = false
) => {
  if (!Array.isArray(sources)) return [];
  if (!selectedSourceOnly) return sources;

  const index = Number(activeSourceIndex);
  const selected = sources.find((item, position) =>
    Number(item?.webIndex ?? position) === index
  ) || sources.find((item) =>
    String(item?.url || item?.src || "").trim() === activeUrl
  );

  return selected ? [selected] : [];
};
