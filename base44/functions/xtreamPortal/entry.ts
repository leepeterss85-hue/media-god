import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const MAX_CHANNELS = 25000;
const REDIRECT_LIMIT = 3;

const clean = (value) => String(value ?? "").trim();

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const ipv4Parts = (hostname) => {
  const match = clean(hostname).match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );

  if (!match) return null;

  const parts = match.slice(1).map(Number);

  if (
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255
    )
  ) {
    return null;
  }

  return parts;
};

const privateHost = (hostname) => {
  const host = clean(hostname)
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");

  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  const ipv4 = ipv4Parts(host);

  if (ipv4) {
    const [a, b] = ipv4;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (host.includes(":")) {
    if (
      host === "::" ||
      host === "::1" ||
      /^f[cd]/i.test(host) ||
      /^fe[89ab]/i.test(host) ||
      /^ff/i.test(host)
    ) {
      return true;
    }

    if (host.startsWith("::ffff:")) {
      return privateHost(host.slice("::ffff:".length));
    }
  }

  return false;
};

const assertPublicDns = async (hostname) => {
  const host = clean(hostname);

  if (!host || privateHost(host)) {
    throw new Error(
      "Xtream server must use a public internet address."
    );
  }

  const deno = (globalThis)?.Deno;

  if (!deno?.resolveDns) {
    return;
  }

  const resolved = [];

  for (const type of ["A", "AAAA"]) {
    try {
      const rows = await deno.resolveDns(host, type);
      if (Array.isArray(rows)) {
        resolved.push(...rows.map(String));
      }
    } catch {
      // Some hosts only expose one family. Literal/private checks still apply.
    }
  }

  if (resolved.some(privateHost)) {
    throw new Error(
      "Xtream server resolved to a local or private network address."
    );
  }
};

const validateServer = async (value) => {
  const raw = clean(value);

  if (!raw) {
    throw new Error("Enter the Xtream server address.");
  }

  const withProtocol = /^https?:\/\//i.test(raw)
    ? raw
    : `https://${raw}`;

  const url = new URL(withProtocol);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Xtream server must use HTTP or HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error(
      "Put the Xtream username and password in their own fields."
    );
  }

  await assertPublicDns(url.hostname);

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");

  return url;
};

const readLimitedText = async (response) => {
  const contentLength = Number(
    response.headers.get("content-length") || 0
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_RESPONSE_BYTES
  ) {
    throw new Error(
      "Xtream response exceeded the safety size limit."
    );
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    bytes += Number(value?.byteLength || 0);

    if (bytes > MAX_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // Response is already being discarded.
      }

      throw new Error(
        "Xtream response exceeded the safety size limit."
      );
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
};

const safeFetchJson = async (
  inputUrl,
  timeoutMs = 15000
) => {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    let current = new URL(inputUrl);

    for (
      let redirects = 0;
      redirects <= REDIRECT_LIMIT;
      redirects += 1
    ) {
      await assertPublicDns(current.hostname);

      const response = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "Media-God/1.0 Xtream-Client",
        },
      });

      if (
        response.status >= 300 &&
        response.status < 400
      ) {
        const location = clean(
          response.headers.get("location")
        );

        try {
          await response.body?.cancel?.();
        } catch {
          // Headers are enough for redirect validation.
        }

        if (!location) {
          throw new Error(
            `Xtream server returned HTTP ${response.status} without a redirect target.`
          );
        }

        if (redirects >= REDIRECT_LIMIT) {
          throw new Error(
            "Xtream server redirected too many times."
          );
        }

        const next = new URL(location, current);

        if (!["http:", "https:"].includes(next.protocol)) {
          throw new Error(
            "Xtream redirect used an unsupported protocol."
          );
        }

        await assertPublicDns(next.hostname);
        current = next;
        continue;
      }

      const text = await readLimitedText(response);

      if (!response.ok) {
        throw new Error(
          `Xtream server returned HTTP ${response.status}.`
        );
      }

      try {
        return text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          "Xtream server did not return valid JSON."
        );
      }
    }

    throw new Error(
      "Xtream server redirected too many times."
    );
  } finally {
    clearTimeout(timer);
  }
};

const apiUrl = (
  server,
  username,
  password,
  action = ""
) => {
  const url = new URL(
    `${server.origin}${server.pathname || ""}/player_api.php`
  );

  url.searchParams.set("username", username);
  url.searchParams.set("password", password);

  if (action) {
    url.searchParams.set("action", action);
  }

  return url.toString();
};

const streamUrl = (
  server,
  username,
  password,
  streamId,
  extension = "ts"
) => {
  const base = `${server.origin}${server.pathname || ""}`.replace(
    /\/+$/,
    ""
  );

  const ext = clean(extension)
    .replace(/^\./, "")
    .replace(/[^a-z0-9]/gi, "") || "ts";

  return (
    `${base}/live/${encodeURIComponent(username)}/` +
    `${encodeURIComponent(password)}/${encodeURIComponent(streamId)}.${ext}`
  );
};

const expiryIso = (value) => {
  const seconds = Number(value || 0);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  const date = new Date(seconds * 1000);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toISOString();
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.id) {
      return jsonResponse(
        { error: "Sign in to use Xtream sources." },
        401
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action || "channels").toLowerCase();
    const username = clean(body?.username);
    const password = clean(body?.password);

    if (!username || !password) {
      return jsonResponse(
        { error: "Enter the Xtream username and password." },
        400
      );
    }

    const server = await validateServer(body?.server);

    const account = await safeFetchJson(
      apiUrl(server, username, password)
    );

    const userInfo =
      account?.user_info &&
      typeof account.user_info === "object"
        ? account.user_info
        : {};

    const authenticated =
      String(userInfo?.auth ?? "") === "1" ||
      userInfo?.auth === 1;

    if (!authenticated) {
      return jsonResponse(
        {
          error:
            "The Xtream server rejected those login details.",
        },
        401
      );
    }

    if (action === "test") {
      return jsonResponse({
        ok: true,
        account: {
          status: clean(userInfo?.status || "Active"),
          activeConnections: Number(
            userInfo?.active_cons || 0
          ),
          maxConnections: Number(
            userInfo?.max_connections || 0
          ),
          expiresAt: expiryIso(
            userInfo?.exp_date
          ),
        },
      });
    }

    const [categoryData, streamData] =
      await Promise.all([
        safeFetchJson(
          apiUrl(
            server,
            username,
            password,
            "get_live_categories"
          )
        ).catch(() => []),

        safeFetchJson(
          apiUrl(
            server,
            username,
            password,
            "get_live_streams"
          ),
          25000
        ),
      ]);

    const categoryMap = new Map(
      (Array.isArray(categoryData)
        ? categoryData
        : []
      ).map((item) => [
        clean(item?.category_id),
        clean(item?.category_name) ||
          "Xtream",
      ])
    );

    const channels = (
      Array.isArray(streamData)
        ? streamData
        : []
    )
      .slice(0, MAX_CHANNELS)
      .map((item) => {
        const id = clean(
          item?.stream_id
        );

        if (!id) {
          return null;
        }

        const group =
          categoryMap.get(
            clean(item?.category_id)
          ) ||
          "Xtream";

        return {
          id: `xtream:${id}`,
          tvgId: clean(
            item?.epg_channel_id
          ),
          name:
            clean(item?.name) ||
            `Channel ${id}`,
          logo: clean(
            item?.stream_icon
          ),
          group,
          category: group,
          country: "",
          url: streamUrl(
            server,
            username,
            password,
            id,
            item?.container_extension ||
              "ts"
          ),
          kind: "direct",
          format:
            clean(
              item?.container_extension
            ).toLowerCase() === "m3u8"
              ? "hls"
              : "unknown",
          sourceName: "Xtream",
          sourceCategory: group,
          sourcePriority: 140,
          browserPlayable: true,
          browserReason: "",
          geoRestricted: false,
          geoBlocked: false,
          quality: 0,
          catchup:
            String(
              item?.tv_archive ??
                ""
            ) === "1" ||
            item?.tv_archive === 1,
          catchupDays: Math.max(
            0,
            Number(
              item?.tv_archive_duration ||
                0
            )
          ),
          alternatives: [],
        };
      })
      .filter(Boolean);

    return jsonResponse({
      ok: true,
      channels,
      categories: [
        ...new Set(
          channels.map(
            (channel) =>
              channel.group
          )
        ),
      ].sort((a, b) =>
        a.localeCompare(b)
      ),
      count: channels.length,
      account: {
        status: clean(
          userInfo?.status ||
            "Active"
        ),
        activeConnections: Number(
          userInfo?.active_cons || 0
        ),
        maxConnections: Number(
          userInfo?.max_connections || 0
        ),
        expiresAt: expiryIso(
          userInfo?.exp_date
        ),
      },
    });
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? "Xtream server timed out."
        : clean(error?.message) ||
          "Xtream request failed.";

    return jsonResponse(
      { error: message },
      400
    );
  }
}
