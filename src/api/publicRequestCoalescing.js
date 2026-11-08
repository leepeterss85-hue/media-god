/**
 * Coalesce only concurrent requests to public, credential-free endpoints.
 * This is NOT a cache: results (including signed links) are forgotten as
 * soon as the request settles. Never use for account/Real-Debrid requests.
 *
 * Scope by fetch implementation as tests and embedded WebViews can use
 * different transport implementations with different authentication contexts.
 */
const pendingByFetch = new WeakMap();

export function sharePendingPublicLookup(fetchImpl, scope, payload, run, {
  timeoutMs = 0,
} = {}) {
  if (typeof fetchImpl !== "function" || typeof run !== "function") {
    throw new TypeError("A public lookup requires a network transport and callback");
  }
  const key = String(scope) + ":" + JSON.stringify(payload);
  let pending = pendingByFetch.get(fetchImpl);
  if (!pending) {
    pending = new Map();
    pendingByFetch.set(fetchImpl, pending);
  }
  if (pending.has(key)) return pending.get(key);

  // Older Android WebViews can ignore AbortController, leaving an unresolved
  // fetch trapped in the shared-pending map. A bounded public-only deadline
  // forgets that stalled operation and lets the next source search retry.
  // No account credentials or user-specific streams are stored here.
  let timer;
  const operation = Promise.resolve().then(run);
  const deadline = Number(timeoutMs);
  const task = Number.isFinite(deadline) && deadline > 0
    ? Promise.race([
        operation,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Public lookup timed out")),
            Math.min(120_000, Math.max(1, deadline)),
          );
        }),
      ])
    : operation;
  pending.set(key, task);
  const release = () => {
    clearTimeout(timer);
    if (pending.get(key) === task) pending.delete(key);
  };
  // Both outcomes clear the slot; late network completions cannot replace
  // a newer request or cause an unhandled rejected promise.
  void task.then(release, release);
  return task;
}
