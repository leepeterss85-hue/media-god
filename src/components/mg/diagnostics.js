const ERROR_STORAGE_KEY = "mg:diagnostics-errors:v1";
const MAX_ERRORS = 20;

export const sanitizeDiagnosticText = (value) =>
  String(value || "")
    .replace(/magnet:\?[^\s]+/gi, "[magnet]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[url]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .replace(
      /\b(token|api[_-]?key|secret|password|authorization|rd_token|refresh_token)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]"
    )
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 600);

const readStored = () => {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(ERROR_STORAGE_KEY) || "[]"
    );
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ERRORS) : [];
  } catch {
    return [];
  }
};

const writeStored = (items) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      ERROR_STORAGE_KEY,
      JSON.stringify(items.slice(0, MAX_ERRORS))
    );
  } catch {
    // Diagnostics must never interrupt the application.
  }
};

export const recordDiagnosticError = (error, context = "app") => {
  const message = sanitizeDiagnosticText(
    error?.message || error?.reason?.message || error?.reason || error
  );

  if (!message) return;

  const next = [
    {
      time: new Date().toISOString(),
      context: sanitizeDiagnosticText(context) || "app",
      message,
    },
    ...readStored(),
  ].slice(0, MAX_ERRORS);

  writeStored(next);
};

export const readDiagnosticErrors = () => readStored();

export const clearDiagnosticErrors = () => writeStored([]);

export const installGlobalDiagnosticsCapture = () => {
  if (typeof window === "undefined") return () => {};

  const onError = (event) => {
    recordDiagnosticError(
      event?.error || event?.message || "Unknown window error",
      "window"
    );
  };

  const onUnhandled = (event) => {
    recordDiagnosticError(
      event?.reason || "Unhandled promise rejection",
      "promise"
    );
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandled);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandled);
  };
};
