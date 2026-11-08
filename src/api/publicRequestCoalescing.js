/**
 * Coalesce only concurrent requests to public, credential-free endpoints.
 * This is NOT a cache: results (including signed links) are forgotten as
 * soon as the request settles. Never use for account/Real-Debrid requests.
 *
 * Scope by fetch implementation as tests and embedded WebViews can use
 * different transport implementations with different authentication contexts.
 */
const pendingByFetch = new WeakMap();

export function sharePendingPublicLookup(fetchImpl, scope, payload, run) {
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

  const task = Promise.resolve().then(run);
  pending.set(key, task);
  const release = () => {
    if (pending.get(key) === task) pending.delete(key);
  };
  // Attach both outcomes so a caller can observe a failure without an
  // orphaned rejected promise or a permanently blocked retry.
  void task.then(release, release);
  return task;
}
