import { readdir, readFile, stat } from "node:fs/promises";
import process from "node:process";

const root = process.cwd();
const roots = ["src", "base44/functions"];
const extensions = /\.(js|jsx|ts|tsx|mjs)$/i;
const forbiddenConsole = /console\.(?:log|warn|error|info)\([\s\S]{0,320}?(?:rd_token|refresh_token|client_secret|api[_-]?key|authorization|password)/gi;
const forbiddenSupportTerms = [
  "rd_token",
  "rd_refresh_token",
  "rd_client_secret",
  "apiKey",
  "authorization",
  "providerPlaybackUrl",
  "manifestUrl",
  "streamUrl",
];

const files = [];

const walk = async (path) => {
  for (const entry of await readdir(path)) {
    const full = `${path}/${entry}`;
    const info = await stat(full);

    if (info.isDirectory()) {
      await walk(full);
    } else if (extensions.test(entry)) {
      files.push(full);
    }
  }
};

for (const base of roots) {
  await walk(`${root}/${base}`);
}

const consoleLeaks = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  if (forbiddenConsole.test(source)) {
    consoleLeaks.push(file.replace(`${root}/`, ""));
  }
  forbiddenConsole.lastIndex = 0;
}

if (consoleLeaks.length) {
  throw new Error(
    `Potential sensitive console logging found in: ${consoleLeaks.join(", ")}`
  );
}

for (const path of [
  "src/components/mg/DiagnosticsView.jsx",
  "src/components/mg/DataBackupView.jsx",
]) {
  const source = await readFile(`${root}/${path}`, "utf8");

  for (const term of forbiddenSupportTerms) {
    if (source.includes(term)) {
      throw new Error(
        `${path} references forbidden secret/source field ${term}`
      );
    }
  }
}

const diagnostics = await readFile(
  `${root}/src/components/mg/diagnostics.js`,
  "utf8"
);

for (const required of [
  "sanitizeDiagnosticText",
  "[redacted]",
  "[url]",
  "[magnet]",
]) {
  if (!diagnostics.includes(required)) {
    throw new Error(`Diagnostics sanitizer is missing ${required}`);
  }
}

console.log("ok privacy audit passed: diagnostics/backups exclude secret/source fields");
