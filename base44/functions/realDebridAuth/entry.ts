import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const OAUTH_BASE = "https://api.real-debrid.com/oauth/v2";
const API_BASE = "https://api.real-debrid.com/rest/1.0";
const OPEN_SOURCE_CLIENT_ID = "X245A4XAIBGVM";
const DEVICE_GRANT = "http://oauth.net/grant_type/device/1.0";

const clean = (value) => String(value || "").trim();

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const errorText = (data, fallback) =>
  clean(
    data?.error_description ||
      data?.error ||
      data?.message ||
      fallback
  );

const updateCurrentUser = async (
  base44,
  user,
  patch
) => {
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
  const seconds = Math.max(
    0,
    Number(expiresIn || 0)
  );

  return new Date(
    Date.now() + seconds * 1000
  ).toISOString();
};

const saveTokenSet = async ({
  base44,
  user,
  credentials,
  tokenData,
}) => {
  if (!tokenData?.access_token) {
    throw new Error(
      "Real-Debrid did not return an access token."
    );
  }

  await updateCurrentUser(
    base44,
    user,
    {
      rd_token: clean(
        tokenData.access_token
      ),

      rd_refresh_token: clean(
        tokenData.refresh_token
      ),

      rd_client_id: clean(
        credentials.client_id
      ),

      rd_client_secret: clean(
        credentials.client_secret
      ),

      rd_token_expires_at:
        tokenExpiryIso(
          tokenData.expires_in
        ),

      rd_connected_at:
        new Date().toISOString(),
    }
  );
};

const requestToken = async ({
  clientId,
  clientSecret,
  code,
}) => {
  const body =
    new URLSearchParams({
      client_id: clean(clientId),
      client_secret:
        clean(clientSecret),
      code: clean(code),
      grant_type: DEVICE_GRANT,
    });

  const response =
    await fetch(
      `${OAUTH_BASE}/token`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body: body.toString(),
      }
    );

  const data =
    await readJson(response);

  if (
    !response.ok ||
    !data?.access_token
  ) {
    throw new Error(
      errorText(
        data,
        `Real-Debrid token request failed (${response.status}).`
      )
    );
  }

  return data;
};

const refreshStoredToken = async ({
  base44,
  user,
}) => {
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
    return {
      refreshed: false,
      token: clean(
        user?.rd_token
      ),
    };
  }

  const tokenData =
    await requestToken({
      clientId,
      clientSecret,
      code: refreshToken,
    });

  await saveTokenSet({
    base44,
    user,

    credentials: {
      client_id: clientId,
      client_secret:
        clientSecret,
    },

    tokenData,
  });

  return {
    refreshed: true,
    token: clean(
      tokenData.access_token
    ),
  };
};

const storedTokenNeedsRefresh = (
  user
) => {
  const expiresAt =
    Date.parse(
      clean(
        user?.rd_token_expires_at
      )
    );

  if (
    !Number.isFinite(
      expiresAt
    )
  ) {
    return false;
  }

  return (
    expiresAt <=
    Date.now() + 120000
  );
};

const fetchRdUser = async (
  token
) => {
  const response =
    await fetch(
      `${API_BASE}/user`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      }
    );

  const data =
    await readJson(response);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
};

const getStatus = async ({
  base44,
  user,
}) => {
  let token =
    clean(
      user?.rd_token
    );

  let refreshed = false;

  if (!token) {
    return {
      connected: false,
      valid: false,
    };
  }

  if (
    storedTokenNeedsRefresh(
      user
    )
  ) {
    try {
      const result =
        await refreshStoredToken({
          base44,
          user,
        });

      token =
        result.token ||
        token;

      refreshed =
        result.refreshed;
    } catch {
      // The verification request
      // below gives final status.
    }
  }

  let rdUser =
    await fetchRdUser(
      token
    );

  if (
    !rdUser.ok &&
    rdUser.status === 401
  ) {
    try {
      const result =
        await refreshStoredToken({
          base44,
          user,
        });

      if (
        result.refreshed &&
        result.token
      ) {
        token =
          result.token;

        refreshed = true;

        rdUser =
          await fetchRdUser(
            token
          );
      }
    } catch {
      // Return verification
      // failure below.
    }
  }

  if (!rdUser.ok) {
    return {
      connected: false,
      valid: false,

      error: errorText(
        rdUser.data,

        rdUser.status === 401
          ? "Your Real-Debrid connection has expired. Connect it again in Settings."
          : `Real-Debrid status check failed (${rdUser.status}).`
      ),
    };
  }

  return {
    connected: true,
    valid: true,
    refreshed,

    username: clean(
      rdUser.data?.username
    ),

    email: clean(
      rdUser.data?.email
    ),

    premium:
      Boolean(
        rdUser.data?.premium
      ) ||
      rdUser.data?.type ===
        "premium",

    expires: clean(
      rdUser.data?.expiration
    ),

    points: Number(
      rdUser.data?.points ||
        0
    ),
  };
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
          status: 401,
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
          "status"
      );

    /*
     * ----------------------------------------------------
     * START DEVICE LOGIN
     * ----------------------------------------------------
     */
    if (
      action ===
      "start_device"
    ) {
      const url =
        new URL(
          `${OAUTH_BASE}/device/code`
        );

      url.searchParams.set(
        "client_id",
        OPEN_SOURCE_CLIENT_ID
      );

      url.searchParams.set(
        "new_credentials",
        "yes"
      );

      const response =
        await fetch(
          url.toString()
        );

      const data =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !data?.device_code ||
        !data?.user_code
      ) {
        return Response.json(
          {
            error:
              errorText(
                data,
                `Could not start Real-Debrid login (${response.status}).`
              ),
          },
          {
            status: 502,
          }
        );
      }

      return Response.json({
        device_code:
          clean(
            data.device_code
          ),

        user_code:
          clean(
            data.user_code
          ),

        verification_url:
          clean(
            data.verification_url ||
              "https://real-debrid.com/device"
          ),

        interval:
          Math.max(
            5,
            Number(
              data.interval ||
                5
            )
          ),

        expires_in:
          Math.max(
            60,
            Number(
              data.expires_in ||
                1800
            )
          ),
      });
    }

    /*
     * ----------------------------------------------------
     * CHECK DEVICE LOGIN
     * ----------------------------------------------------
     */
    if (
      action ===
      "poll_device"
    ) {
      const deviceCode =
        clean(
          body?.device_code
        );

      if (!deviceCode) {
        return Response.json(
          {
            error:
              "device_code is required",
          },
          {
            status: 400,
          }
        );
      }

      const url =
        new URL(
          `${OAUTH_BASE}/device/credentials`
        );

      url.searchParams.set(
        "client_id",
        OPEN_SOURCE_CLIENT_ID
      );

      url.searchParams.set(
        "code",
        deviceCode
      );

      const credentialsResponse =
        await fetch(
          url.toString()
        );

      const credentials =
        await readJson(
          credentialsResponse
        );

      if (
        !credentialsResponse.ok ||
        !credentials?.client_id ||
        !credentials?.client_secret
      ) {
        /*
         * RD returns an error while
         * the user has not approved
         * the device yet.
         */
        if (
          [
            400,
            401,
            403,
            404,
          ].includes(
            credentialsResponse.status
          )
        ) {
          return Response.json({
            pending: true,
            connected: false,
          });
        }

        return Response.json(
          {
            error:
              errorText(
                credentials,

                `Real-Debrid authorization check failed (${credentialsResponse.status}).`
              ),
          },
          {
            status: 502,
          }
        );
      }

      const tokenData =
        await requestToken({
          clientId:
            credentials.client_id,

          clientSecret:
            credentials.client_secret,

          code:
            deviceCode,
        });

      await saveTokenSet({
        base44,
        user,
        credentials,
        tokenData,
      });

      const freshUser =
        await base44.auth
          .me()
          .catch(
            () => user
          );

      const status =
        await getStatus({
          base44,

          user:
            freshUser ||
            user,
        });

      return Response.json({
        pending: false,
        ...status,
      });
    }

    /*
     * ----------------------------------------------------
     * REFRESH
     * ----------------------------------------------------
     */
    if (
      action ===
      "refresh"
    ) {
      const result =
        await refreshStoredToken({
          base44,
          user,
        });

      if (
        !result.refreshed
      ) {
        return Response.json(
          {
            error:
              "No saved Real-Debrid refresh credentials are available.",
          },
          {
            status: 400,
          }
        );
      }

      const freshUser =
        await base44.auth
          .me()
          .catch(
            () => user
          );

      return Response.json(
        await getStatus({
          base44,

          user:
            freshUser ||
            user,
        })
      );
    }

    /*
     * ----------------------------------------------------
     * DISCONNECT
     * ----------------------------------------------------
     */
    if (
      action ===
      "disconnect"
    ) {
      const token =
        clean(
          user?.rd_token
        );

      if (token) {
        try {
          await fetch(
            `${API_BASE}/disable_access_token`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );
        } catch {
          /*
           * Local disconnect still
           * succeeds if RD is
           * unreachable.
           */
        }
      }

      await updateCurrentUser(
        base44,
        user,
        {
          rd_token: "",

          rd_refresh_token:
            "",

          rd_client_id: "",

          rd_client_secret:
            "",

          rd_token_expires_at:
            "",

          rd_connected_at:
            "",
        }
      );

      return Response.json({
        connected: false,
        valid: false,
        disconnected: true,
      });
    }

    /*
     * ----------------------------------------------------
     * STATUS / AUTO REFRESH
     * ----------------------------------------------------
     */
    if (
      action === "status"
    ) {
      return Response.json(
        await getStatus({
          base44,
          user,
        })
      );
    }

    return Response.json(
      {
        error:
          `Unknown action: ${action}`,
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Real-Debrid authentication failed.",
      },
      {
        status: 500,
      }
    );
  }
}
