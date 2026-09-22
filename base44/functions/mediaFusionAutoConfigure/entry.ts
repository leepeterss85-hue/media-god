import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const MEDIAFUSION_BASE = "https://mediafusion.elfhosted.com";
const RD_API_BASE = "https://api.real-debrid.com/rest/1.0";
const RD_OAUTH_BASE = "https://api.real-debrid.com/oauth/v2";
const RD_DEVICE_GRANT = "http://oauth.net/grant_type/device/1.0";

const clean = (value) => String(value ?? "").trim();

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const updateCurrentUser = async (base44, user, patch) => {
  try {
    return await base44.auth.updateMe(patch);
  } catch (error) {
    if (!user?.id) throw error;

    return await base44.asServiceRole.entities.User.update(
      user.id,
      patch
    );
  }
};

const tokenExpiryIso = (expiresIn) => {
  const seconds = Math.max(0, Number(expiresIn || 0));
  return new Date(Date.now() + seconds * 1000).toISOString();
};

const requestRefreshedToken = async (user) => {
  const refreshToken = clean(user?.rd_refresh_token);
  const clientId = clean(user?.rd_client_id);
  const clientSecret = clean(user?.rd_client_secret);

  if (!refreshToken || !clientId || !clientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: refreshToken,
    grant_type: RD_DEVICE_GRANT,
  });

  const response = await fetchWithTimeout(
    `${RD_OAUTH_BASE}/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
    15000
  );

  const data = await readJson(response);

  if (!response.ok || !data?.access_token) {
    return null;
  }

  return {
    accessToken: clean(data.access_token),
    refreshToken: clean(data.refresh_token) || refreshToken,
    clientId,
    clientSecret,
    expiresIn: Number(data.expires_in || 0),
  };
};

const validateRdToken = async (token) => {
  if (!token) return false;

  const response = await fetchWithTimeout(
    `${RD_API_BASE}/user`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    12000
  );

  return response.ok;
};

const getValidRdToken = async ({ base44, user }) => {
  let token = clean(user?.rd_token);

  if (token && await validateRdToken(token)) {
    return token;
  }

  const refreshed = await requestRefreshedToken(user);

  if (!refreshed?.accessToken) {
    return "";
  }

  await updateCurrentUser(
    base44,
    user,
    {
      rd_token: refreshed.accessToken,
      rd_refresh_token: refreshed.refreshToken,
      rd_client_id: refreshed.clientId,
      rd_client_secret: refreshed.clientSecret,
      rd_token_expires_at: tokenExpiryIso(refreshed.expiresIn),
      rd_connected_at: clean(user?.rd_connected_at) || new Date().toISOString(),
    }
  );

  return refreshed.accessToken;
};

const mediaFusionUserData = (token) => {
  const provider = {
    name: "Media God Real-Debrid",
    service: "realdebrid",
    token,
    enable_watchlist_catalogs: false,
    enabled: true,
    priority: 0,
    use_mediaflow: false,
    only_show_cached_streams: false,
  };

  return {
    streaming_providers: [provider],
    streaming_provider: provider,
    enable_catalogs: false,
    enable_imdb_metadata: true,
    max_streams: 50,
  };
};

const mediaFusionManifestUrl = (secret) =>
  `${MEDIAFUSION_BASE}/${encodeURIComponent(secret)}/manifest.json`;

const isMediaFusionElfHostedUrl = (value) => {
  try {
    const parsed = new URL(clean(value));
    return /(^|\.)mediafusion\.elfhosted\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
};

const saveAddon = async ({ base44, manifestUrl }) => {
  const addons = await base44.entities.Addon.list("-created_date", 100);

  const existing = (addons || []).find((addon) => {
    const name = clean(addon?.name).toLowerCase();

    return (
      name === "mediafusion" ||
      (
        isMediaFusionElfHostedUrl(addon?.url) &&
        /mediafusion/i.test(name || "mediafusion")
      )
    );
  });

  const patch = {
    name: "MediaFusion",
    description:
      "Auto-configured by Media God using your connected Real-Debrid account. The Real-Debrid token is never exposed to the browser.",
    url: manifestUrl,
    active: true,
    installed: true,
  };

  if (existing?.id) {
    const updated = await base44.entities.Addon.update(existing.id, patch);
    return {
      addonId: existing.id,
      updated: true,
      addon: updated || { ...existing, ...patch },
    };
  }

  const created = await base44.entities.Addon.create(patch);

  return {
    addonId: created?.id || "",
    updated: false,
    addon: created || patch,
  };
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const token = await getValidRdToken({
      base44,
      user,
    });

    if (!token) {
      return Response.json(
        {
          error:
            "Real-Debrid is not connected, or the saved connection has expired. Reconnect Real-Debrid in Settings and try again.",
          code: "RD_NOT_CONNECTED",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * The Real-Debrid token stays entirely on the server. MediaFusion receives
     * it directly from this Base44 function and returns an encrypted profile
     * secret. The browser only ever sees the success state / Addon record.
     */
    const encryptedResponse = await fetchWithTimeout(
      `${MEDIAFUSION_BASE}/encrypt-user-data`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(
          mediaFusionUserData(token)
        ),
      },
      25000
    );

    const encrypted = await readJson(encryptedResponse);
    const secret = clean(encrypted?.encrypted_str);

    if (!encryptedResponse.ok || !secret) {
      const detail = clean(
        encrypted?.message ||
          encrypted?.error ||
          encrypted?.detail
      );

      return Response.json(
        {
          error:
            detail ||
            `MediaFusion could not create the encrypted configuration (HTTP ${encryptedResponse.status}).`,
          code: "MEDIAFUSION_CONFIGURATION_FAILED",
        },
        {
          status: 502,
        }
      );
    }

    const manifestUrl = mediaFusionManifestUrl(secret);

    const manifestResponse = await fetchWithTimeout(
      manifestUrl,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Media-God/MediaFusion-Auto-Configure",
        },
      },
      15000
    );

    const manifest = await readJson(manifestResponse);
    const resources = Array.isArray(manifest?.resources)
      ? manifest.resources
      : [];

    if (
      !manifestResponse.ok ||
      !resources.some((resource) => {
        if (typeof resource === "string") {
          return resource === "stream";
        }

        return clean(resource?.name).toLowerCase() === "stream";
      })
    ) {
      return Response.json(
        {
          error:
            "MediaFusion created a profile, but its manifest did not pass Media God's stream check.",
          code: "MEDIAFUSION_MANIFEST_CHECK_FAILED",
        },
        {
          status: 502,
        }
      );
    }

    const saved = await saveAddon({
      base44,
      manifestUrl,
    });

    return Response.json({
      configured: true,
      updated: saved.updated,
      addon_id: saved.addonId,
      name: "MediaFusion",
      manifest_host: "mediafusion.elfhosted.com",
    });
  } catch (error) {
    const timeout =
      error?.name === "AbortError";

    return Response.json(
      {
        error: timeout
          ? "MediaFusion did not answer in time. Try Auto-configure again."
          : error?.message ||
            "MediaFusion auto-configuration failed.",
        code: timeout
          ? "MEDIAFUSION_TIMEOUT"
          : "MEDIAFUSION_AUTO_CONFIGURE_FAILED",
      },
      {
        status: timeout ? 504 : 500,
      }
    );
  }
}
