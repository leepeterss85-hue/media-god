import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const API_BASE = "https://dce-frontoffice.imggaming.com/api";
const DEVICE_LOGIN_URL = "https://www.skysportnow.co.nz/tv-login";
const BUFFER_SECONDS = 21600;

const SKY_HEADERS = {
  "x-api-key": "eca673f3-11cb-4716-8c75-1d1bd024aee2",
  realm: "dce.skynz",
  "x-app-var": "5.0.1 (5117)",
  "user-agent": "okhttp/4.9.2",
};

const DRM_INFO = "eyJzeXN0ZW0iOiJjb20ud2lkZXZpbmUuYWxwaGEifQ==";

const clean = (value) => String(value || "").trim();

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const apiErrorText = (data, fallback) =>
  clean(
    data?.message ||
      data?.statusText ||
      data?.error_description ||
      data?.error ||
      (Array.isArray(data?.messages) ? data.messages[0] : "") ||
      fallback
  );

const checkApiError = (data, fallback = "Sky Sport Now request failed.") => {
  const statusCode = Number(data?.statusCode || data?.status || 0);
  if (statusCode && statusCode !== 200) {
    throw new Error(apiErrorText(data, fallback));
  }
};

const decodeJwtPayload = (token) => {
  try {
    const part = clean(token).split(".")[1] || "";
    if (!part) return {};

    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
};

const tokenExpiryIso = (token) => {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0);

  if (Number.isFinite(exp) && exp > 0) {
    return new Date(Math.max(0, exp * 1000 - 30_000)).toISOString();
  }

  return new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString();
};

const updateCurrentUser = async (base44, user, patch) => {
  try {
    return await base44.auth.updateMe(patch);
  } catch (error) {
    if (!user?.id) throw error;
    return await base44.asServiceRole.entities.User.update(user.id, patch);
  }
};

const saveAuth = async ({ base44, user, data }) => {
  const authToken = clean(data?.authorisationToken);
  if (!authToken) {
    throw new Error("Sky Sport Now did not return an authorization token.");
  }

  await updateCurrentUser(base44, user, {
    ssn_auth_token: authToken,
    ssn_refresh_token: clean(data?.refreshToken || user?.ssn_refresh_token),
    ssn_token_expires_at: tokenExpiryIso(authToken),
    ssn_connected_at: new Date().toISOString(),
  });

  return authToken;
};

const requestApi = async ({ path, method = "GET", token = "", body, params, headers = {} }) => {
  const url = /^https?:\/\//i.test(path)
    ? new URL(path)
    : new URL(`${API_BASE}${path}`);

  if (params && typeof params === "object") {
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === "") return;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
      } else {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const requestHeaders = {
    ...SKY_HEADERS,
    ...headers,
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let requestBody;
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      apiErrorText(data, `Sky Sport Now request failed (${response.status}).`)
    );
  }

  checkApiError(data);
  return data;
};

const storedTokenNeedsRefresh = (user, force = false) => {
  if (force) return true;

  const expiresAt = Date.parse(clean(user?.ssn_token_expires_at));
  if (!Number.isFinite(expiresAt)) return false;

  return expiresAt - Date.now() < 5 * 60 * 1000;
};

const refreshStoredToken = async ({ base44, user, force = false }) => {
  const currentToken = clean(user?.ssn_auth_token);
  const refreshToken = clean(user?.ssn_refresh_token);

  if (!refreshToken || (!force && !storedTokenNeedsRefresh(user))) {
    return currentToken;
  }

  try {
    const data = await requestApi({
      path: "/v2/token/refresh",
      method: "POST",
      body: { refreshToken },
    });

    if (clean(data?.code).toUpperCase() === "TOO_MANY_REQUESTS") {
      return currentToken;
    }

    if (!data?.authorisationToken) {
      return currentToken;
    }

    return await saveAuth({ base44, user, data });
  } catch (error) {
    if (currentToken) return currentToken;
    throw error;
  }
};

const requireToken = async ({ base44, user, forceRefresh = false }) => {
  const stored = clean(user?.ssn_auth_token);

  if (!stored) {
    throw new Error("Connect Sky Sport Now in Sources first.");
  }

  return (
    (await refreshStoredToken({ base44, user, force: forceRefresh })) || stored
  );
};

const normalizeChannel = (row) => {
  const programmes = Array.isArray(row?.programmes)
    ? row.programmes
    : Array.isArray(row?.programmingInfo?.programmes)
      ? row.programmingInfo.programmes
      : [];

  const currentProgramme =
    row?.programmingInfo?.currentProgramme || programmes[0] || null;
  const nextProgramme =
    row?.programmingInfo?.nextProgramme || programmes[1] || null;

  return {
    id: clean(row?.channelId || row?.id || row?.liveEventId),
    channelId: clean(row?.channelId || row?.id),
    eventId: clean(row?.liveEventId || row?.id),
    name: clean(row?.title || row?.name || "Sky Sport Now"),
    logo: clean(row?.logoUrl || row?.thumbnailUrl || row?.programmingInfo?.channelLogoUrl),
    type: clean(row?.type || "EPG"),
    now: currentProgramme
      ? {
          title: clean(currentProgramme?.episode || currentProgramme?.title || currentProgramme?.name),
          description: clean(currentProgramme?.description),
          start: clean(currentProgramme?.startDate),
          end: clean(currentProgramme?.endDate),
          image: clean(currentProgramme?.thumbnailUrl),
        }
      : null,
    next: nextProgramme
      ? {
          title: clean(nextProgramme?.episode || nextProgramme?.title || nextProgramme?.name),
          description: clean(nextProgramme?.description),
          start: clean(nextProgramme?.startDate),
          end: clean(nextProgramme?.endDate),
          image: clean(nextProgramme?.thumbnailUrl),
        }
      : null,
  };
};

const choosePlaybackStream = (playbackData) => {
  const pick = (value) => {
    if (Array.isArray(value)) return value[0] || null;
    return value && typeof value === "object" ? value : null;
  };

  const dash = pick(playbackData?.dash);
  if (dash?.url) {
    return {
      ...dash,
      manifestType: "dash",
      mimeType: "application/dash+xml",
    };
  }

  const hlsWidevine = pick(playbackData?.hlsWidevine);
  if (hlsWidevine?.url) {
    return {
      ...hlsWidevine,
      manifestType: "hls",
      mimeType: "application/x-mpegURL",
    };
  }

  const hls = pick(playbackData?.hls);
  if (hls?.url) {
    return {
      ...hls,
      manifestType: "hls",
      mimeType: "application/x-mpegURL",
    };
  }

  return null;
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const action = clean(body?.action || "status");

    if (action === "status") {
      const connected = Boolean(clean(user?.ssn_auth_token));
      return Response.json({
        connected,
        valid: connected,
        connected_at: clean(user?.ssn_connected_at),
        verification_url: DEVICE_LOGIN_URL,
      });
    }

    if (action === "start_device") {
      const data = await requestApi({ path: "/v2/token/alt/pin" });
      const pin = clean(data?.pin);
      const anchor = clean(data?.anchor);

      if (!pin || !anchor) {
        return Response.json(
          { error: "Sky Sport Now did not return a device login code." },
          { status: 502 }
        );
      }

      return Response.json({
        connected: false,
        pending: true,
        pin,
        anchor,
        verification_url: DEVICE_LOGIN_URL,
        interval: 5,
        expires_in: 300,
      });
    }

    if (action === "poll_device") {
      const pin = clean(body?.pin);
      const anchor = clean(body?.anchor);

      if (!pin || !anchor) {
        return Response.json({ error: "pin and anchor are required" }, { status: 400 });
      }

      let data;
      try {
        data = await requestApi({
          path: "/v2/token/alt/pin",
          method: "POST",
          body: { pin, anchor },
        });
      } catch (error) {
        return Response.json({
          connected: false,
          pending: true,
          error: clean(error?.message),
        });
      }

      if (!data?.authorisationToken) {
        return Response.json({ connected: false, pending: true });
      }

      await saveAuth({ base44, user, data });

      return Response.json({
        connected: true,
        pending: false,
        verification_url: DEVICE_LOGIN_URL,
      });
    }

    if (action === "disconnect") {
      await updateCurrentUser(base44, user, {
        ssn_auth_token: "",
        ssn_refresh_token: "",
        ssn_token_expires_at: "",
        ssn_connected_at: "",
      });

      return Response.json({ connected: false, disconnected: true });
    }

    if (action === "channels") {
      const token = await requireToken({ base44, user });
      const data = await requestApi({
        path: "/v4/content/TV%20Guide",
        token,
        params: {
          bpp: 1,
          rpp: 25,
          displayGeoblocked: "SHOW",
          displayContentAvailableOnSignIn: "SHOW",
          displayEmptyBucketShortcuts: "HIDE",
          premiereEventContentDisplay: "HIDE",
          displayEpgBuckets: "HIDE",
          displaySectionLinkBuckets: "HIDE",
        },
      });

      const rows = Array.isArray(data?.buckets?.[0]?.contentList)
        ? data.buckets[0].contentList
        : [];

      return Response.json({
        connected: true,
        channels: rows.map(normalizeChannel).filter((item) => item.eventId && item.name),
      });
    }

    if (action === "play_event") {
      const eventId = clean(body?.event_id || body?.eventId);
      if (!eventId) {
        return Response.json({ error: "event_id is required" }, { status: 400 });
      }

      const token = await requireToken({ base44, user, forceRefresh: true });

      const eventData = await requestApi({
        path: `/v2/event/${encodeURIComponent(eventId)}`,
        token,
      });

      const streamData = await requestApi({
        path: `/v2/stream/event/${encodeURIComponent(eventId)}`,
        token,
      });

      const callback = clean(streamData?.playerUrlCallback);
      if (!callback) {
        throw new Error("Sky Sport Now did not return a playback callback.");
      }

      const callbackUrl = new URL(callback);
      callbackUrl.searchParams.set("dvr", "true");

      const playbackData = await requestApi({
        path: callbackUrl.toString(),
        token,
      });

      const stream = choosePlaybackStream(playbackData);
      if (!stream?.url) {
        throw new Error("Sky Sport Now did not return a supported live stream.");
      }

      const drm = stream?.drm && typeof stream.drm === "object" ? stream.drm : null;
      const drmJwt = clean(drm?.jwtToken);
      const mediaHeaders = {
        ...SKY_HEADERS,
        ...(drmJwt ? { Authorization: `Bearer ${drmJwt}` } : {}),
        ...(drm ? { "x-drm-info": DRM_INFO } : {}),
      };

      return Response.json({
        connected: true,
        event_id: eventId,
        title: clean(eventData?.title || eventData?.name),
        live: eventData?.live !== false,
        buffer_seconds: BUFFER_SECONDS,
        source: {
          url: clean(stream.url),
          src: clean(stream.url),
          type: "live",
          format: stream.manifestType,
          mimeType: stream.mimeType,
          headers: mediaHeaders,
          drm: drm
            ? {
                scheme: "widevine",
                licenseUrl: clean(drm?.url),
                headers: mediaHeaders,
              }
            : null,
        },
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json(
      {
        error: clean(error?.message) || "Sky Sport Now integration failed.",
      },
      { status: 500 }
    );
  }
}
