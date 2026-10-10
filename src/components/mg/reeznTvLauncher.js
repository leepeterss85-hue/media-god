import {
  launchNativeReeznTvApp,
  openNativeFireTvExternalUrl,
} from "@/components/mg/nativeFireTvBridge";

const REEZN_TV_DOWNLOAD_URL = "https://reezntvapp.com/download";

/**
 * Open the installed ReeznTV app where the native Android host supports it.
 * ReeznTV has no verified public title deep-link contract, so do not invent
 * title-specific URLs. If the app is missing, open its official download page.
 */
export const launchReeznTv = () => {
  if (launchNativeReeznTvApp()) return true;
  if (openNativeFireTvExternalUrl(REEZN_TV_DOWNLOAD_URL)) return true;

  if (typeof window !== "undefined") {
    return Boolean(window.open(REEZN_TV_DOWNLOAD_URL, "_blank", "noopener,noreferrer"));
  }

  return false;
};
