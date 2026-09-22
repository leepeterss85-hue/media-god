import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const RD_API_BASE = "https://api.real-debrid.com/rest/1.0";
const RD_OAUTH_BASE = "https://api.real-debrid.com/oauth/v2";
const RD_DEVICE_GRANT = "http://oauth.net/grant_type/device/1.0";
const MEDIAFUSION_ORIGIN = "https://mediafusion.elfhosted.com";

const clean = (value) => String(value ?? "").trim();

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const fetchWithTimeout = async (
  url,
  options = {},
  timeoutMs = 15000
) => {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }
};

const updateCurrentUser = async (
  base44,
  user,
  patch
) => {
  try {
    return await base44.auth.updateMe(patch);
  } catch (error) {
    if (!user?.id) {
      throw error;
    }

    return await base44.asServiceRole.entities.User.update(
      user.id,
      patch
    );
  }
};

const requestRefreshedRdToken = async (
  user
) => {
  const refreshToken =
    clean(
      user?.rd_refresh_token
    );

  const clientId =
    clean(
      user?.rd_client_id
    );

  const clientSecret =
    clean(
      user?.rd_client_secret
    );

  if (
    !refreshToken ||
    !clientId ||
    !clientSecret
  ) {
    return null;
  }

  const body =
    new URLSearchParams({
      client_id:
        clientId,

      client_secret:
        clientSecret,

      code:
        refreshToken,

      grant_type:
        RD_DEVICE_GRANT,
    });

  const response =
    await fetchWithTimeout(
      `${RD_OAUTH_BASE}/token`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          body.toString(),
      },
      12000
    );

  const data =
    await readJson(
      response
    );

  if (
    !response.ok ||
    !data?.access_token
  ) {
    return null;
  }

  return {
    token:
      clean(
        data.access_token
      ),

    refreshToken:
      clean(
        data.refresh_token
      ) ||
      refreshToken,

    expiresIn:
      Math.max(
        0,
        Number(
          data.expires_in ||
          0
        )
      ),

    clientId,

    clientSecret,
  };
};

const validateRdToken = async (
  token
) => {
  if (!token) {
    return {
      ok:
        false,

      status:
        0,
    };
  }

  try {
    const response =
      await fetchWithTimeout(
        `${RD_API_BASE}/user`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        },
        10000
      );

    return {
      ok:
        response.ok,

      status:
        response.status,
    };
  } catch {
    return {
      ok:
        false,

      status:
        0,
    };
  }
};

const ensureRdToken = async ({
  base44,
  user,
}) => {
  let token =
    clean(
      user?.rd_token
    );

  if (!token) {
    return {
      token:
        "",

      error:
        "Connect Real-Debrid in Settings first.",
    };
  }

  let validation =
    await validateRdToken(
      token
    );

  if (
    validation.ok
  ) {
    return {
      token,
      error:
        "",
    };
  }

  if (
    validation.status ===
      401
  ) {
    const refreshed =
      await requestRefreshedRdToken(
        user
      );

    if (
      refreshed?.token
    ) {
      token =
        refreshed.token;

      await updateCurrentUser(
        base44,
        user,
        {
          rd_token:
            token,

          rd_refresh_token:
            refreshed.refreshToken,

          rd_client_id:
            refreshed.clientId,

          rd_client_secret:
            refreshed.clientSecret,

          rd_token_expires_at:
            refreshed.expiresIn > 0
              ? new Date(
                  Date.now() +
                    refreshed.expiresIn *
                      1000
                ).toISOString()
              : clean(
                  user?.rd_token_expires_at
                ),
        }
      );

      validation =
        await validateRdToken(
          token
        );

      if (
        validation.ok
      ) {
        return {
          token,
          error:
            "",
        };
      }
    }
  }

  return {
    token:
      "",

    error:
      validation.status ===
        401
        ? "Your Real-Debrid connection has expired. Reconnect it in Settings, then try MediaFusion again."
        : "Media God could not verify Real-Debrid right now. Try again in a moment.",
  };
};

const mediaFusionProvider = (
  token
) => ({
  name:
    "Media God Real-Debrid",

  service:
    "realdebrid",

  token,

  enable_watchlist_catalogs:
    false,

  only_show_cached_streams:
    false,

  use_mediaflow:
    false,

  priority:
    0,

  enabled:
    true,
});

const buildMediaFusionUserData = (
  token
) => {
  const provider =
    mediaFusionProvider(
      token
    );

  return {
    streaming_providers:
      [
        provider,
      ],

    /*
     * MediaFusion still accepts the legacy single-provider field. Supplying
     * both forms keeps this auto-generated profile compatible across public
     * instance upgrades without changing the user's Media God setup.
     */
    streaming_provider:
      provider,

    /*
     * Media God only needs MediaFusion's stream endpoint here. Do not import
     * MediaFusion catalog/watchlist/live-TV rows into the app.
     */
    enable_catalogs:
      false,

    enable_imdb_metadata:
      false,

    live_search_streams:
      false,

    enable_usenet_streams:
      false,

    prefer_usenet_over_torrent:
      false,

    enable_telegram_streams:
      false,

    enable_acestream_streams:
      false,

    /*
     * Return a broad source pool. Media God keeps ownership of source ranking,
     * English preference, cache handling and final playback selection.
     */
    max_streams:
      50,

    max_streams_per_resolution:
      20,

    stream_type_grouping:
      "separate",

    stream_type_order:
      [
        "torrent",
        "http",
        "usenet",
        "telegram",
        "acestream",
        "youtube",
      ],
  };
};

const createMediaFusionManifest = async (
  token
) => {
  const response =
    await fetchWithTimeout(
      `${MEDIAFUSION_ORIGIN}/encrypt-user-data`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify(
            buildMediaFusionUserData(
              token
            )
          ),
      },
      20000
    );

  const data =
    await readJson(
      response
    );

  const encrypted =
    clean(
      data?.encrypted_str
    );

  if (
    !response.ok ||
    !encrypted
  ) {
    const detail =
      clean(
        data?.message ||
        data?.error
      );

    throw new Error(
      detail ||
        `MediaFusion configuration failed (${response.status}).`
    );
  }

  return (
    `${MEDIAFUSION_ORIGIN}/${encrypted}/manifest.json`
  );
};

const validateManifest = async (
  url
) => {
  const response =
    await fetchWithTimeout(
      url,
      {
        headers: {
          Accept:
            "application/json",
        },
      },
      12000
    );

  const data =
    await readJson(
      response
    );

  const resources =
    Array.isArray(
      data?.resources
    )
      ? data.resources
      : [];

  /*
   * MediaFusion 6.x uses the richer Stremio manifest resource form:
   * { name: "stream", types: [...] }
   * Older builds can still expose the compact string form: "stream".
   * Accept both so a valid encrypted MediaFusion profile is not rejected.
   */
  const hasStreamResource =
    resources.some(
      (resource) => {
        if (
          typeof resource ===
            "string"
        ) {
          return (
            clean(
              resource
            ).toLowerCase() ===
            "stream"
          );
        }

        return (
          resource &&
          typeof resource ===
            "object" &&
          clean(
            resource?.name
          ).toLowerCase() ===
            "stream"
        );
      }
    );

  if (
    !response.ok ||
    !hasStreamResource
  ) {
    throw new Error(
      "MediaFusion created a profile, but its manifest did not advertise playable streams."
    );
  }
};

const isMediaFusionUrl = (
  value
) => {
  try {
    const parsed =
      new URL(
        clean(
          value
        )
      );

    return (
      /(^|\.)mediafusion\.elfhosted\.com$/i.test(
        parsed.hostname
      )
    );
  } catch {
    return false;
  }
};

export default async function (
  req
) {
  try {
    const base44 =
      createClientFromRequest(
        req
      );

    const user =
      await base44.auth.me();

    if (!user) {
      return Response.json(
        {
          error:
            "Unauthorized",
        },
        {
          status:
            401,
        }
      );
    }

    let body = {};

    try {
      body =
        await req.json();
    } catch {
      body = {};
    }

    const action =
      clean(
        body?.action ||
        "configure"
      ).toLowerCase();

    if (
      action !==
      "configure"
    ) {
      return Response.json(
        {
          error:
            `Unknown action: ${action}`,
        },
        {
          status:
            400,
        }
      );
    }

    const rd =
      await ensureRdToken({
        base44,
        user,
      });

    if (
      !rd.token
    ) {
      return Response.json(
        {
          error:
            rd.error ||
            "Real-Debrid is not connected.",
        },
        {
          status:
            400,
        }
      );
    }

    const manifestUrl =
      await createMediaFusionManifest(
        rd.token
      );

    await validateManifest(
      manifestUrl
    );

    const addons =
      await base44.entities.Addon
        .list(
          "-created_date",
          100
        )
        .catch(
          () => []
        );

    const existing =
      (
        addons ||
        []
      ).find(
        (addon) =>
          clean(
            addon?.name
          ).toLowerCase() ===
            "mediafusion" ||
          isMediaFusionUrl(
            addon?.url
          )
      );

    const patch = {
      name:
        "MediaFusion",

      url:
        manifestUrl,

      active:
        true,

      installed:
        true,
    };

    let saved =
      null;

    if (
      existing?.id
    ) {
      saved =
        await base44.entities.Addon.update(
          existing.id,
          patch
        );
    } else {
      saved =
        await base44.entities.Addon.create(
          patch
        );
    }

    return Response.json({
      configured:
        true,

      updated:
        Boolean(
          existing?.id
        ),

      addon_id:
        clean(
          saved?.id ||
          existing?.id
        ),

      manifest:
        `${MEDIAFUSION_ORIGIN}/[encrypted-profile]/manifest.json`,

      message:
        "MediaFusion is configured with your existing Real-Debrid connection and is now active.",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.name ===
            "AbortError"
            ? "MediaFusion took too long to respond. Try again."
            : error?.message ||
              "Could not configure MediaFusion.",
      },
      {
        status:
          500,
      }
    );
  }
}
