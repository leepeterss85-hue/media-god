const RELEASE_APK_URL =
  "https://github.com/leepeterss85-hue/media-god/releases/download/firetv-latest/Media-God-Fire-TV.apk";

const isSafeDirectAsset = (value) => {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      (host === "release-assets.githubusercontent.com" ||
        host === "objects.githubusercontent.com" ||
        host.endsWith(".githubusercontent.com"))
    );
  } catch {
    return false;
  }
};

export default async function (req) {
  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      {
        status: 405,
        headers: { Allow: "POST" },
      }
    );
  }

  try {
    /*
     * Resolve GitHub's friendly release URL on the server.  Older Fire TV
     * browsers can hang on github.com, while the final release-assets host
     * is a plain APK response with Content-Disposition: attachment.
     *
     * We deliberately do this on every install attempt because the final
     * GitHub asset URL is signed and expires after a short period.
     */
    const response = await fetch(RELEASE_APK_URL, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "application/vnd.android.package-archive, application/octet-stream, */*",
        "User-Agent": "MediaGodFireTV-Updater/1.0",
      },
    });

    const directUrl = String(response.url || "").trim();

    if (!response.ok || !isSafeDirectAsset(directUrl)) {
      return Response.json(
        {
          error: `Could not resolve the Fire TV APK download (${response.status || "unknown"}).`,
        },
        { status: 502 }
      );
    }

    return Response.json(
      {
        url: directUrl,
        contentType:
          response.headers.get("content-type") ||
          "application/vnd.android.package-archive",
        size: Number(response.headers.get("content-length") || 0),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Could not prepare the direct Media God Fire TV download.",
      },
      { status: 502 }
    );
  }
}
