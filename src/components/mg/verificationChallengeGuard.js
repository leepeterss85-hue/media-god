/**
 * Conservative verification-page guard.
 * A third-party challenge is an access requirement, NOT a playable stream.
 * Never try to solve/bypass it or ask viewers to scan QR codes.
 * Inspect only explicit URL/metadata signals. Do not reject normal streams
 * because their release/title happens to include the word "human".
 */
export const isVerificationChallengeUrl = (value) => {
  if (typeof value !== "string" || value.length > 8192) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (/(^|\.)(?:hcaptcha\.com|recaptcha\.net|google\.com)$/.test(host) &&
        /\/(?:recaptcha|hcaptcha)\//i.test(url.pathname)) return true;
    if (/(^|\.)(?:challenges\.cloudflare\.com|verify\.cloudflare\.com)$/.test(host)) return true;
    // Challenge endpoints are distinguishable from ordinary media URLs.
    const path = decodeURIComponent(url.pathname).toLowerCase();
    return /(?:^|\/)(?:cdn-cgi\/challenge-platform|captcha|recaptcha|hcaptcha|turnstile|verify[-_]?human|verify[-_]?you[-_]?are[-_]?human|human[-_]?verification|bot[-_]?check|security[-_]?check)(?:\/|$)/i.test(path);
  } catch {
    return false;
  }
};

export const isVerificationChallengeStream = (stream) => {
  if (!stream || typeof stream !== "object") return false;
  const url = String(stream.url || stream.src || stream.link || stream.file || stream.streamUrl || "");
  if (isVerificationChallengeUrl(url)) return true;
  const text = [stream.name, stream.title, stream.description, stream.message, stream.status]
    .filter(value => typeof value === "string").join(" ");
  // A provider may report a challenge in a JSON result but supply a normal
  // looking URL. In that case do not send it to a video decoder either.
  return /\b(?:captcha (?:required|challenge)|verify (?:you are )?human|verification (?:required|challenge)|cloudflare challenge|scan (?:the )?qr (?:code )?to verify)\b/i.test(text);
};
