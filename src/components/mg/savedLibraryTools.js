export const normalizeLibraryQuery = value => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const matchesLibraryQuery = (item, query) => {
  const haystack = normalizeLibraryQuery(`${item?.title || ""} ${item?.year || ""}`);
  return normalizeLibraryQuery(query).split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
};

export const selectVisibleLibraryIds = (selected, visible, select) => {
  const ids = new Set(visible.map(item => item.id));
  return select ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.has(id));
};
