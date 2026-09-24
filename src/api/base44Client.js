import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { withGuestDebridPayload } from '@/components/mg/guestDebridDevice';

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

base44.functions.invoke = (name, payload = {}, ...rest) =>
  rawInvoke(
    name,
    DEVICE_SCOPED_DEBRID_FUNCTIONS.has(String(name || ''))
      ? withGuestDebridPayload(payload)
      : payload,
    ...rest
  );
