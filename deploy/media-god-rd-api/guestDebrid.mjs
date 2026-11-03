// Guest-device credentials are protected by Base44 service-role entities and
// MUST NOT be accessed using a public device-key proxy. The independent
// authenticated service rejects guests before reaching either path.
export async function loadGuestDebridCredential() {
  throw new Error("Guest Real-Debrid migration requires an authenticated device binding.");
}
export async function saveGuestDebridCredential() {
  throw new Error("Guest Real-Debrid migration requires an authenticated device binding.");
}
