import {
  MEDIA_EDITION_OPTIONS,
  detectMediaEdition,
  sourceHasEdition,
} from "./mediaEdition.js";

export const sourceEntriesForPresentation = (entries, mode = "best") => {
  const list = (Array.isArray(entries) ? entries : []).filter(
    (entry) =>
      entry?.readyForUser === true &&
      entry?.item &&
      !entry.item?.diagnostic &&
      entry.item?.type !== "status"
  );

  const value = String(mode || "best");
  if (!value.startsWith("edition:")) return list;

  const edition = value.slice("edition:".length);
  return list.filter((entry) => sourceHasEdition(entry.item, edition));
};

export const editionPresentationState = (entries, mode = "best") => {
  const value = String(mode || "best");
  if (!value.startsWith("edition:")) {
    return {
      edition: "",
      label: "",
      discovered: false,
      readyCount: 0,
      cachedCount: 0,
      pendingCount: 0,
      preparing: false,
    };
  }

  const edition = value.slice("edition:".length);
  const option = MEDIA_EDITION_OPTIONS.find((item) => item.value === edition);
  const matching = (Array.isArray(entries) ? entries : []).filter(
    (entry) => sourceHasEdition(entry?.item, edition)
  );
  const readyCount = matching.filter((entry) => entry.readyForUser === true).length;
  const cachedCount = matching.filter((entry) => entry.cached === true).length;
  const pendingCount = matching.filter((entry) => entry.pendingCache === true).length;

  return {
    edition,
    label: option?.label || matching[0]?.editionLabel || edition,
    discovered: matching.length > 0,
    readyCount,
    cachedCount,
    pendingCount,
    preparing: cachedCount === 0 && pendingCount > 0,
  };
};

const BASE_SOURCE_SORT_OPTIONS = [
  { value: "best", label: "Best" },
  { value: "cached", label: "Cached" },
  { value: "4k", label: "4K" },
  { value: "1080p", label: "1080p" },
  { value: "compatible", label: "Compatible" },
  { value: "smallest", label: "Smallest" },
];

export const sourceSortOptionsForEntries = (entries, currentMode = "best") => {
  const list = Array.isArray(entries) ? entries : [];
  const discovered = new Set(
    list
      .filter(
        (entry) =>
          entry?.item &&
          !entry.item?.diagnostic &&
          entry.item?.type !== "status"
      )
      .map((entry) => entry.editionValue || detectMediaEdition(entry.item).value)
  );

  const currentEdition = String(currentMode || "").startsWith("edition:")
    ? String(currentMode).slice("edition:".length)
    : "";

  if (currentEdition && discovered.has(currentEdition)) {
    discovered.add(currentEdition);
  }

  const editionOptions = MEDIA_EDITION_OPTIONS
    .filter((option) => option.value !== "any" && discovered.has(option.value))
    .map((option) => {
      const mode = `edition:${option.value}`;
      const state = editionPresentationState(list, mode);

      return {
        value: mode,
        label: state.preparing
          ? `${option.label} • Preparing`
          : option.label,
        preparing: state.preparing,
        readyCount: state.readyCount,
        cachedCount: state.cachedCount,
        pendingCount: state.pendingCount,
      };
    });

  return [...BASE_SOURCE_SORT_OPTIONS, ...editionOptions];
};
