import { isFireTvRuntime } from "./runtimePlatform.js";

// Keep third-party TV players inside their frame, including nested frames.
// Scripts, cookies/storage and forms remain available for embedded playback.
// No popups, top navigation, downloads or external-app protocol launches.
export const TV_SCRAPER_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-presentation";

export const tvScraperSandbox = () =>
  isFireTvRuntime() ? TV_SCRAPER_SANDBOX : undefined;
