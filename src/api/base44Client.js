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
