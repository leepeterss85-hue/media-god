export const MEDIA_GOD_APP_ID = "6a95b85c1b5a8657bf3906c8";
export const MEDIA_GOD_PUBLIC_ORIGIN =
  "https://mysterious-media-vault-pro.base44.app";

const safePath = (value) => {
  const text = String(value || "/").trim();

  if (!text.startsWith("/") || text.startsWith("//")) {
    return "/";
  }

  try {
    const url = new URL(text, MEDIA_GOD_PUBLIC_ORIGIN);

    if (url.origin !== MEDIA_GOD_PUBLIC_ORIGIN) {
      return "/";
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
};

/**
 * OAuth must always return to the same production Media God origin. This is
 * especially important for the dedicated Fire TV WebView: returning to a
 * preview/workspace/other Base44 app would create a different cookie/local
 * storage scope and make a valid Media God account look logged out.
 */
export const mediaGodAuthReturnUrl = (returnTo = "/") =>
  new URL(safePath(returnTo), MEDIA_GOD_PUBLIC_ORIGIN).toString();

export const isCanonicalMediaGodOrigin = () => {
  if (typeof window === "undefined") return false;
  return window.location.origin === MEDIA_GOD_PUBLIC_ORIGIN;
};
