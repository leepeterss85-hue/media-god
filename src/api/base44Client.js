import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { withGuestDebridPayload } from '@/components/mg/guestDebridDevice';
import { invokeIndependentMetadata, invokeIndependentImdbResolver, invokeIndependentAddonSources, invokeIndependentPublicFeature } from './independentMetadata.js';
import { INDEPENDENT_RD_FUNCTIONS, invokeIndependentRealDebrid, readAccountSessionToken } from './independentRealDebrid.js';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

const DEVICE_SCOPED_DEBRID_FUNCTIONS = new Set([
  'realDebridAuth',
  'realDebrid',
  'multiDebrid',
  'findRdLibrary',
]);

const rawInvoke = base44.functions.invoke.bind(base44.functions);

base44.functions.invoke = async (name, payload = {}, ...rest) => {
  // Public catalogue, search and metadata never use Base44 integration
  // credits. This endpoint contains no personal data or credentials.
  if (name === 'getTmdbMovies') {
    return invokeIndependentMetadata(payload);
  }
  if (name === 'resolveImdb' || name === 'resolveTvImdb') {
    return invokeIndependentImdbResolver(name, payload);
  }
  if (name === 'fetchAddonStreams' && !payload?.action) {
    // Signed-in Media God accounts may have their own configured torrent
    // addons. The public Railway service knows only fixed free manifests,
    // so querying it alone silently loses all of those account sources.
    // The authenticated Railway service verifies auth.me() and reads Addon
    // entities scoped to this user. Never send their configured manifests,
    // debrid tokens or session data to the public metadata endpoint.
    const sessionToken = await readAccountSessionToken();
    if (sessionToken) {
      try {
        return await invokeIndependentRealDebrid(name, payload, {
          token: sessionToken,
          timeoutMs: 60_000,
        });
      } catch {
        // Keep source discovery available if the account session expired or
        // the private gateway is restarting; anonymous public addons can
        // still be searched without consuming Base44 integration credits.
      }
    }
    return invokeIndependentAddonSources(payload);
  }
  if (name === 'getEntertainmentNews' || name === 'getSkipSegments' ||
      name === 'getFireTvApkLink') {
    return invokeIndependentPublicFeature(name, payload);
  }
  // Real-Debrid and cache checks run through a separate user-authenticated
  // Railway backend. It validates this Media God account with Base44 auth.me,
  // reads only that user's RD credentials, and never gets service-role access.
  // Guest-device connections cannot authenticate there yet and retain their
  // existing device-scoped path, without exposing any guest credentials.
  if (INDEPENDENT_RD_FUNCTIONS.has(String(name || ''))) {
    const sessionToken = await readAccountSessionToken();
    if (sessionToken) {
      return invokeIndependentRealDebrid(name, payload, { token: sessionToken });
    }
  }
  // Keep the old guest-device path until a secure migration is complete.
  return rawInvoke(
    name,
    DEVICE_SCOPED_DEBRID_FUNCTIONS.has(String(name || ''))
      ? withGuestDebridPayload(payload)
      : payload,
    ...rest
  );
};
