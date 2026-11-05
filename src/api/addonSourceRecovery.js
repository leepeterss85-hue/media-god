/**
 * A signed-in source search may succeed at the transport layer yet contain
 * zero streams because an upstream provider has rate-limited the addon.
 * Recover with the separate credential-free public catalogue in that case.
 *
 * Only identifiers/title are allowed into the public request by
 * invokeIndependentAddonSources. No account token or private addon settings
 * are forwarded, and an existing personal result is never replaced.
 */
export async function searchAddonSourcesWithPublicFallback(
  payload,
  {
    readToken,
    searchPersonal,
    searchPublic,
    personalTimeoutMs = 22_000,
  },
) {
  let sessionToken = "";
  try {
    sessionToken = String(await readToken() || "").trim();
  } catch {
    // Older Android boxes can have stale authentication SDK state. Public
    // source discovery remains available, without exposing account secrets.
  }
  if (!sessionToken) return searchPublic(payload);

  let personal;
  try {
    personal = await searchPersonal(payload, {
      token: sessionToken,
      timeoutMs: personalTimeoutMs,
    });
  } catch {
    return searchPublic(payload);
  }

  if (Array.isArray(personal?.data?.streams) && personal.data.streams.length > 0) {
    return personal;
  }

  // Preserve the user's personal diagnostics when the public service has
  // nothing better. This also keeps addon errors visible for troubleshooting.
  let publicResult;
  try {
    publicResult = await searchPublic(payload);
  } catch {
    return personal;
  }
  if (!Array.isArray(publicResult?.data?.streams) ||
      publicResult.data.streams.length === 0) {
    return personal;
  }
  return {
    ...personal,
    data: {
      ...(personal?.data || {}),
      streams: publicResult.data.streams,
      diagnostics: [
        ...(Array.isArray(personal?.data?.diagnostics) ? personal.data.diagnostics : []),
        ...(Array.isArray(publicResult.data?.diagnostics) ? publicResult.data.diagnostics : []),
      ],
      addons_checked: Math.max(
        Number(personal?.data?.addons_checked || 0),
        Number(publicResult.data?.addons_checked || 0),
      ),
      reason: "Recovered public sources after configured providers returned none.",
    },
  };
}
