const STORAGE_KEY =
  "mg:guest-real-debrid-device-key:v1";

const clean = (value) =>
  String(value ?? "").trim();

const randomKey = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues ===
      "function"
  ) {
    const bytes =
      new Uint8Array(32);

    crypto.getRandomValues(
      bytes
    );

    return Array.from(
      bytes,
      (value) =>
        value
          .toString(16)
          .padStart(2, "0")
    ).join("");
  }

  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2),
    Math.random()
      .toString(36)
      .slice(2),
    Math.random()
      .toString(36)
      .slice(2),
  ].join("-");
};

export const readGuestDebridDeviceKey =
  () => {
    if (
      typeof window ===
      "undefined"
    ) {
      return "";
    }

    try {
      return clean(
        window.localStorage.getItem(
          STORAGE_KEY
        )
      );
    } catch {
      return "";
    }
  };

export const ensureGuestDebridDeviceKey =
  () => {
    const existing =
      readGuestDebridDeviceKey();

    if (existing) {
      return existing;
    }

    const next =
      randomKey();

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        next
      );
    } catch {
      // Device-local persistence is best effort.
    }

    return next;
  };

export const withGuestDebridPayload =
  (payload = {}) => ({
    ...payload,
    guest_device_key:
      ensureGuestDebridDeviceKey(),
  });
