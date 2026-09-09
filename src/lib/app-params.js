const MEDIA_GOD_APP_ID = '6a95b85c1b5a8657bf3906c8';
const DEFAULT_BASE44_APP_BASE_URL = 'https://app.base44.com';

const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

const getAppParams = () => {
	const clearAccessToken = getAppParamValue("clear_access_token", { removeFromUrl: true });
	if (clearAccessToken === 'true') {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
		storage.removeItem('base44_clear_access_token');
	}

	// Media God must never inherit an app_id or app_base_url from another
	// Base44 workspace. A stale query/local-storage value here is enough to
	// authenticate the user successfully and then send them to the wrong app.
	const canonicalAppId = import.meta.env.VITE_BASE44_APP_ID || MEDIA_GOD_APP_ID;
	const canonicalAppBaseUrl =
		import.meta.env.VITE_BASE44_APP_BASE_URL || DEFAULT_BASE44_APP_BASE_URL;

	if (!isNode) {
		try {
			storage.setItem('base44_app_id', canonicalAppId);
			storage.setItem('base44_app_base_url', canonicalAppBaseUrl);
		} catch {
			// Storage can be unavailable in privacy modes; runtime constants still win.
		}
	}

	return {
		appId: canonicalAppId,
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: isNode ? '' : window.location.href }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl: canonicalAppBaseUrl,
	}
}

export const appParams = {
	...getAppParams()
}
