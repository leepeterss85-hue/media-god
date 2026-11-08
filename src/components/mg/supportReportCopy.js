/** Copy a privacy-reviewed support report on newer browsers and old TV WebViews. */
export async function copySupportReportText(text, {
  nav = typeof navigator !== "undefined" ? navigator : {},
  doc = typeof document !== "undefined" ? document : null,
} = {}) {
  const value = String(text || "");
  if (!value) return false;
  try {
    if (typeof nav?.clipboard?.writeText === "function") {
      await nav.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Android TV WebViews may expose Clipboard API but deny permission.
    // Continue to the legacy on-device copy command.
  }
  if (!doc?.body || typeof doc.createElement !== "function" ||
      typeof doc.execCommand !== "function") return false;
  const previous = doc.activeElement;
  const field = doc.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.position = "fixed";
  field.style.left = "-10000px";
  field.style.top = "0";
  try {
    doc.body.appendChild(field);
    field.focus();
    field.select();
    return Boolean(doc.execCommand("copy"));
  } catch {
    return false;
  } finally {
    field.remove();
    // A temporary focus change must not leave the TV remote stranded.
    try { previous?.focus?.({ preventScroll: true }); } catch { /* no focus API */ }
  }
}
