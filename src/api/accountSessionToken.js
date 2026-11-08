/**
 * Some Android-box WebViews leave the SDK authentication read unresolved.
 * Limit that read rather than letting every RD status/stream request hang.
 * We do not cache or persist account tokens, and late results are ignored.
 */
export async function resolveAccountToken({
  getToken,
  fallbackToken = "",
  timeoutMs = 1_800,
} = {}) {
  const fallback = typeof fallbackToken === "string" ? fallbackToken.trim() : "";
  if (typeof getToken !== "function") return fallback;

  let timer;
  try {
    const received = await Promise.race([
      Promise.resolve().then(getToken),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(""), Math.max(1, Number(timeoutMs) || 1_800));
      }),
    ]);
    return (typeof received === "string" ? received.trim() : "") || fallback;
  } catch {
    // Expired or storage-blocked SDK sessions should not stall source loading.
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
