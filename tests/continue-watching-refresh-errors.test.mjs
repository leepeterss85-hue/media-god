import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/mg/ContinueWatchingRow.jsx", import.meta.url), "utf8");
const loadSource = source.slice(source.indexOf("  const load = () => {"), source.indexOf("\n  useEffect(() => {\n    const cleanup = watchContinueWatchingChanges"));
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const pending = [];
  const state = { items: [{ id: "saved" }], error: "", loading: true, profile: "main" };
  const context = {
    loadVersionRef: { current: 0 }, displayedProfileRef: { current: "main" },
    activeHouseholdProfileId: () => state.profile,
    profiledLibrary: { ContinueWatching: { list: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) } },
    setItems: value => { state.items = value; },
    setSyncError: value => { state.error = value; },
    setLoading: value => { state.loading = value; },
  };
  vm.runInNewContext(loadSource + "\nglobalThis.load = load;", context);
  return { state, pending, load: context.load };
}
test("failed refresh preserves history with a visible stale warning, then retry clears it", async () => {
  const h = harness();
  h.load();
  h.pending[0].reject(new Error("Network unavailable"));
  await tick();
  assert.equal(h.state.items[0].id, "saved");
  assert.match(h.state.error, /out of date/);
  assert.equal(h.state.loading, false);
  h.load();
  h.pending[1].resolve([]);
  await tick();
  assert.equal(h.state.error, "");
  assert.equal(h.state.items.length, 0);
});
test("expired sessions clear displayed history and ask for sign-in", async () => {
  const h = harness();
  h.load();
  h.pending[0].reject({ response: { status: 401 } });
  await tick();
  assert.equal(h.state.items.length, 0);
  assert.match(h.state.error, /Sign in/);
});
test("old failed requests cannot overwrite a newer successful refresh", async () => {
  const h = harness();
  h.load();
  h.load();
  h.pending[1].resolve([]);
  await tick();
  h.pending[0].reject(new Error("Old failure"));
  await tick();
  assert.equal(h.state.error, "");
});
test("profile switching clears old titles even when the new profile request fails", async () => {
  const h = harness();
  h.state.profile = "p-family";
  h.load();
  assert.equal(h.state.items.length, 0);
  h.pending[0].reject(new Error("Offline"));
  await tick();
  assert.equal(h.state.items.length, 0);
  assert.match(h.state.error, /out of date/);
});
