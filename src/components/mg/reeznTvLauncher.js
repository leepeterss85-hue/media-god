import { launchNativeFireTvReeznTV, openNativeFireTvExternalUrl } from "@/components/mg/nativeFireTvBridge";

const REEZN_TV_DOWNLOAD_URL = "https://reezntvapp.com/download";

/**
 * Launch the installed ReeznTV streaming app when available.
 * ReeznTV does not expose a verified title-specific embed URL, so this hands
 * off to its own app rather than inventing a stream endpoint.
 */
export const launchReeznTv = () => {
  if (launchNativeFireTvReeznTV()) return true;
  if (openNativeFireTvExternalUrl(REEZN_TV_DOWNLOAD_URL)) return true;

  if (typeof window !== "undefined") {
    return Boolean(window.open(REEZN_TV_DOWNLOAD_URL, "_blank", "noopener,noreferrer"));
  }

  return false;
};
