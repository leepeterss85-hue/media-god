export const normaliseRequestedFileIndex = (value) => {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const numeric = Number(value);

  return Number.isInteger(numeric) && numeric >= 0
    ? numeric
    : null;
};
