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
        const personal = await invokeIndependentRealDebrid(name, payload, {
          token: sessionToken,
          // Source discovery is not an RD media resolve. A stalled personal
          // addon must not trap an Android box on "Loading sources" for 60s.
          timeoutMs: 22_000,
        });
        if (Array.isArray(personal?.data?.streams) &&
            personal.data.streams.length > 0) {
          return personal;
        }

        // An authenticated 200 response with zero results can still be a
        // failed provider search (e.g. an addon HTTP 429). Try the separate
        // public service before reporting that no playable source exists.
        const publicSources = await invokeIndependentAddonSources(payload);
        if (!Array.isArray(publicSources?.data?.streams) ||
            publicSources.data.streams.length === 0) return personal;

        return {
          ...personal,
          data: {
            ...personal.data,
            streams: publicSources.data.streams,
            diagnostics: [
              ...(Array.isArray(personal.data?.diagnostics) ? personal.data.diagnostics : []),
              ...(Array.isArray(publicSources.data?.diagnostics) ? publicSources.data.diagnostics : []),
            ],
            addons_checked: Math.max(
              Number(personal.data?.addons_checked || 0),
              Number(publicSources.data?.addons_checked || 0),
            ),
            reason: "Recovered available public addon sources after the configured providers returned none.",
          },
        };
      } catch {
        // Keep source discovery available if the account session expired,
        // the private gateway is restarting or a slow addon timed out.
        // Do not route these searches back through Base44 credits.
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
