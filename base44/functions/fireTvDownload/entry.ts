const APK_URL =
  "https://github.com/leepeterss85-hue/media-god/releases/download/firetv-latest/Media-God-Fire-TV.apk";

const APK_NAME = "Media-God-Fire-TV.apk";

export default async function (req) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
      },
    });
  }

  try {
    const upstream = await fetch(APK_URL, {
      redirect: "follow",
      headers: {
        Accept: "application/vnd.android.package-archive, application/octet-stream, */*",
        "User-Agent": "MediaGodFireTV-Updater/1.0",
      },
    });

    if (!upstream.ok) {
      return Response.json(
        {
          error: `Fire TV APK host returned ${upstream.status}.`,
        },
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") ||
        "application/vnd.android.package-archive"
    );
    headers.set(
      "Content-Disposition",
      `attachment; filename="${APK_NAME}"`
    );
    headers.set("Cache-Control", "public, max-age=300");
    headers.set("X-Content-Type-Options", "nosniff");

    const length = upstream.headers.get("content-length");
    if (length) {
      headers.set("Content-Length", length);
    }

    if (req.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers,
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Could not prepare the Media God Fire TV download.",
      },
      { status: 502 }
    );
  }
}
