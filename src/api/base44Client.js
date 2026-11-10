import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { railwayDeviceToken } from './railwayDeviceToken.js';
import { invokeIndependentMetadata, invokeIndependentImdbResolver, invokeIndependentAddonSources, invokeIndependentPublicFeature } from './independentMetadata.js';
import { INDEPENDENT_RD_FUNCTIONS, invokeIndependentRealDebrid, readAccountSessionToken } from './independentRealDebrid.js';
import { searchAddonSourcesWithPublicFallback } from './addonSourceRecovery.js';

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
    return searchAddonSourcesWithPublicFallback(payload, {
      readToken: readAccountSessionToken,
      searchPersonal: (request, options) =>
        invokeIndependentRealDebrid('fetchAddonStreams', request, options),
      searchPublic: invokeIndependentAddonSources,
    });
  }
  if (name === 'getEntertainmentNews' || name === 'getSkipSegments' ||
      name === 'getFireTvApkLink') {
    return invokeIndependentPublicFeature(name, payload);
  }
  // Both account and isolated guest-device requests run on Railway.
  if (INDEPENDENT_RD_FUNCTIONS.has(String(name || ''))) {
    const sessionToken = await readAccountSessionToken();
    if (sessionToken) return invokeIndependentRealDebrid(name, payload, { token: sessionToken });
    return invokeIndependentRealDebrid(name, payload, { deviceToken: railwayDeviceToken() });
  }
  return rawInvoke(name, payload, ...rest);
};
