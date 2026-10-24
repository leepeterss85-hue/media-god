import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  clearDiagnosticErrors,
  installGlobalDiagnosticsCapture,
  isCrashMonitoringEnabled,
  readDiagnosticErrors,
  recordDiagnosticError,
  setCrashMonitoringEnabled,
} from "../src/components/mg/diagnostics.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("device-local crash recording is off by default, redacted, bounded and reversible", () => {
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  const store = new Map();
  const listeners = new Map();
  globalThis.CustomEvent = class {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  };
  globalThis.window = {
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    dispatchEvent: () => {},
  };
  try {
    assert.equal(isCrashMonitoringEnabled(), false);
    recordDiagnosticError("private error password=never-log", "app");
    assert.equal(readDiagnosticErrors().length, 0);
    assert.equal(setCrashMonitoringEnabled(true), true);
    const remove = installGlobalDiagnosticsCapture();
    listeners.get("error")({ message: "https://example.test/private?token=abc" });
    listeners.get("unhandledrejection")({ reason: new Error("Bearer abc.def") });
    assert.equal(readDiagnosticErrors().length, 2);
    assert.doesNotMatch(JSON.stringify(readDiagnosticErrors()), /example\.test|abc\.def|token=abc/);
    assert.match(JSON.stringify(readDiagnosticErrors()), /\[url\]|\[redacted\]/);
    remove();
    assert.equal(listeners.size, 0);
    assert.equal(setCrashMonitoringEnabled(false), false);
    recordDiagnosticError("third", "manual");
    assert.equal(readDiagnosticErrors().length, 2);
    clearDiagnosticErrors();
    assert.equal(readDiagnosticErrors().length, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("release gate preserves a known-good backup before replacing either latest URL", () => {
  const workflow = read(".github/workflows/android-apks.yml");
  const archiveScript = read("scripts/archive-stable-apks.sh");
  const gate = read("src/components/mg/nativeReleaseInfo.js");
  const archiveAt = workflow.indexOf("run: bash scripts/archive-stable-apks.sh");
  const publishAt = workflow.indexOf("Publish stable phone and Fire TV downloads from this commit");
  const verifyAt = workflow.indexOf("Verify both published downloads match signed build");
  const enableAt = workflow.indexOf("Mark both APK releases ready for update pop-ups");
  assert.ok(archiveAt > 0 && publishAt > archiveAt);
  assert.ok(verifyAt > publishAt && enableAt > verifyAt);
  assert.match(workflow, /apksigner" verify --verbose --print-certs/);
  assert.match(workflow, /cmp "\$asset" "\$RUNNER_TEMP\/\$dir\/\$asset"/);
  assert.match(workflow, /Verified-APK-Commit:/);
  assert.match(gate, /Verified-APK-Commit:/);
  assert.match(archiveScript, /stable-\$\{old_mobile_sha:0:12\}/);
  assert.match(archiveScript, /old_mobile_sha" != "\$old_firetv_sha/);
  assert.match(archiveScript, /SHA256SUMS\.txt/);
  const shellCheck = spawnSync("bash", ["-n", new URL("../scripts/archive-stable-apks.sh", import.meta.url).pathname]);
  assert.equal(shellCheck.status, 0, shellCheck.stderr?.toString() || "Shell syntax must pass");
});

test("diagnostics and error screen give privacy-first, accessible recovery controls", () => {
  const diagnostics = read("src/components/mg/DiagnosticsView.jsx");
  const boundary = read("src/components/mg/PageErrorBoundary.jsx");
  assert.match(diagnostics, /type="checkbox"/);
  assert.match(diagnostics, /checked=\{monitoringEnabled\}/);
  assert.match(diagnostics, /Record app crashes on this device \(optional\)/);
  assert.match(diagnostics, /No automatic reporting or uploads/);
  assert.match(diagnostics, /aria-live="polite"/);
  assert.match(boundary, /role="alert"/);
  assert.match(boundary, /Try again/);
  assert.match(boundary, /Back to Home/);
  assert.match(boundary, /Show technical details/);
  assert.match(boundary, /focus:ring-2 focus:ring-mg-green/);
});
