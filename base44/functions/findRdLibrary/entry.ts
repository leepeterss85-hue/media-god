import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const RD_BASE =
  "https://api.real-debrid.com/rest/1.0";

const VIDEO_RE =
  /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

const clean = (value) =>
  String(value || "").trim();

const normalise = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isVideoFile = (file) => {
  const path =
    file?.path ||
    file?.filename ||
    "";

  return Boolean(
    path &&
    VIDEO_RE.test(path)
  );
};

const episodeRegex = (
  season,
  episode
) => {
  if (
    season == null ||
    episode == null
  ) {
    return null;
  }

  const s =
    Number(season);

  const e =
    Number(episode);

  if (
    !Number.isFinite(s) ||
    !Number.isFinite(e)
  ) {
    return null;
  }

  return new RegExp(
    `(?:s0*${s}(?!\\d)e0*${e}(?!\\d)|${s}x0*${e}(?!\\d))`,
    "i"
  );
};

const chooseVideoFile = (
  files,
  season,
  episode
) => {
  const videoFiles =
    (files || []).filter(
      isVideoFile
    );

  if (
    videoFiles.length ===
    0
  ) {
    return null;
  }

  const epRe =
    episodeRegex(
      season,
      episode
    );

  if (epRe) {
    const episodeMatch =
      videoFiles.find(
        (file) =>
          epRe.test(
            file?.path ||
              ""
          )
      );

    if (
      episodeMatch
    ) {
      return episodeMatch;
    }
  }

  return [
    ...videoFiles,
  ].sort(
    (
      a,
      b
    ) =>
      Number(
        b?.bytes ||
          0
      ) -
      Number(
        a?.bytes ||
          0
      )
  )[0];
};

const mapFileLinks = (
  info
) => {
  const allFiles =
    Array.isArray(
      info?.files
    )
      ? info.files
      : [];

  const selectedFiles =
    allFiles.filter(
      (file) =>
        file?.selected !==
        0
    );

  const links =
    Array.isArray(
      info?.links
    )
      ? info.links
      : [];

  const map =
    new Map();

  if (
    selectedFiles.length ===
    links.length
  ) {
    selectedFiles.forEach(
      (
        file,
        index
      ) => {
        if (
          links[index]
        ) {
          map.set(
            file.id,
            links[index]
          );
        }
      }
    );
  } else if (
    allFiles.length ===
    links.length
  ) {
    allFiles.forEach(
      (
        file,
        index
      ) => {
        if (
          links[index]
        ) {
          map.set(
            file.id,
            links[index]
          );
        }
      }
    );
  }

  return map;
};

const scoreTorrent = ({
  torrent,
  wantedTitle,
  wantedYear,
  epRe,
}) => {
  const filename =
    torrent?.filename ||
    torrent?.original_filename ||
    "";

  const normalisedFilename =
    normalise(
      filename
    );

  if (
    !wantedTitle ||
    !normalisedFilename.includes(
      wantedTitle
    )
  ) {
    return -1;
  }

  let score = 100;

  if (
    wantedYear &&
    normalisedFilename.includes(
      wantedYear
    )
  ) {
    score += 20;
  }

  if (epRe) {
    if (
      !epRe.test(
        filename
      )
    ) {
      return -1;
    }

    score += 60;
  }

  if (
    torrent?.status ===
    "downloaded"
  ) {
    score += 30;
  }

  return score;
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

    const token =
      clean(
        user?.rd_token
      );

    if (!token) {
      return Response.json(
        {
          error:
            "Real-Debrid token not set. Add it in Settings.",

          status:
            "not_connected",
        },
        {
          status: 400,
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

    const title =
      clean(
        body?.title
      );

    const year =
      clean(
        body?.year
      );

    const season =
      body?.season !=
      null
        ? Number(
            body.season
          )
        : null;

    const episode =
      body?.episode !=
      null
        ? Number(
            body.episode
          )
        : null;

    if (!title) {
      return Response.json(
        {
          error:
            "title required",

          status:
            "not_found",
        },
        {
          status: 400,
        }
      );
    }

    const authHeaders = {
      Authorization:
        `Bearer ${token}`,
    };

    const formHeaders = {
      ...authHeaders,

      "Content-Type":
        "application/x-www-form-urlencoded",
    };

    const torrentsResponse =
      await fetch(
        `${RD_BASE}/torrents?limit=100`,
        {
          headers:
            authHeaders,
        }
      );

    if (
      !torrentsResponse.ok
    ) {
      return Response.json(
        {
          error:
            `Real-Debrid library lookup failed (${torrentsResponse.status}).`,

          status:
            "error",
        },
        {
          status: 502,
        }
      );
    }

    const torrents =
      await torrentsResponse.json();

    const wantedTitle =
      normalise(
        title
      );

    const wantedYear =
      normalise(
        year
      );

    const epRe =
      episodeRegex(
        season,
        episode
      );

    const candidates =
      (torrents || [])
        .map(
          (torrent) => ({
            torrent,

            score:
              scoreTorrent({
                torrent,
                wantedTitle,
                wantedYear,
                epRe,
              }),
          })
        )
        .filter(
          (item) =>
            item.score >= 0
        )
        .sort(
          (
            a,
            b
          ) =>
            b.score -
            a.score
        );

    if (
      candidates.length ===
      0
    ) {
      return Response.json({
        status:
          "not_found",
      });
    }

    for (
      const candidate
      of candidates.slice(
        0,
        8
      )
    ) {
      const torrentId =
        clean(
          candidate
            ?.torrent?.id
        );

      if (!torrentId) {
        continue;
      }

      const infoResponse =
        await fetch(
          `${RD_BASE}/torrents/info/${torrentId}`,
          {
            headers:
              authHeaders,
          }
        );

      if (
        !infoResponse.ok
      ) {
        continue;
      }

      const info =
        await infoResponse.json();

      if (
        info?.status !==
        "downloaded"
      ) {
        continue;
      }

      const target =
        chooseVideoFile(
          info?.files,
          season,
          episode
        );

      if (!target) {
        continue;
      }

      const linkByFileId =
        mapFileLinks(
          info
        );

      const link =
        linkByFileId.get(
          target.id
        ) ||
        "";

      if (!link) {
        continue;
      }

      const unrestrictedResponse =
        await fetch(
          `${RD_BASE}/unrestrict/link`,
          {
            method:
              "POST",

            headers:
              formHeaders,

            body:
              `link=${encodeURIComponent(
                link
              )}`,
          }
        );

      if (
        !unrestrictedResponse.ok
      ) {
        continue;
      }

      const unrestricted =
        await unrestrictedResponse.json();

      if (
        !unrestricted?.download
      ) {
        continue;
      }

      return Response.json({
        status:
          "ready",

        source:
          "library",

        torrent_id:
          torrentId,

        stream_url:
          unrestricted.download,

        filename:
          unrestricted
            ?.filename ||
          target?.path ||
          info?.filename ||
          title,
      });
    }

    return Response.json({
      status:
        "not_found",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Real-Debrid library lookup failed.",

        status:
          "error",
      },
      {
        status: 500,
      }
    );
  }
}
