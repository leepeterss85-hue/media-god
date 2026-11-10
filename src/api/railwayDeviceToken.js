const KEY = 'mg:railway-device-capability:v1';
export function railwayDeviceToken() {
  const existing = window.localStorage.getItem(KEY);
  if (/^[a-f0-9]{64}$/.test(existing || '')) return existing;
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure device login is unavailable. Sign in to Media God.');
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  window.localStorage.setItem(KEY, token);
  if (window.localStorage.getItem(KEY) !== token) throw new Error('Device storage is unavailable. Sign in to Media God.');
  return token;
}
