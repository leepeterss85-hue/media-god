export const canAutoHandoffStartup = ({
  sortMode,
  mediaType,
  manuallySelected,
  alreadyClaimed,
  selectorPinned,
  fileSelectorPinned,
  fileSwitching,
  nativePlaying,
}) =>
  sortMode === "best" &&
  mediaType !== "live" &&
  !manuallySelected &&
  !alreadyClaimed &&
  !selectorPinned &&
  !fileSelectorPinned &&
  !fileSwitching &&
  !nativePlaying;
