import React, {
  useEffect,
  useState,
} from "react";
import {
  createPortal,
} from "react-dom";
import {
  ListVideo,
} from "lucide-react";

import { base44 } from "@/api/base44Client";

const positiveInt = (
  value
) => {
  const number =
    Number(
      value
    );

  return Number.isInteger(
    number
  ) &&
    number > 0
    ? number
    : null;
};

const visible = (
  element
) => {
  if (
    !(
      element instanceof
        HTMLElement
    )
  ) {
    return false;
  }

  const rect =
    element.getBoundingClientRect();

  if (
    rect.width <
      2 ||
    rect.height <
      2
  ) {
    return false;
  }

  const style =
    window.getComputedStyle(
      element
    );

  return (
    style.display !==
      "none" &&
    style.visibility !==
      "hidden" &&
    Number(
      style.opacity ||
        1
    ) >
      0.02
  );
};

const playerOverlay =
  () => {
    const selectors =
      Array.from(
        document.querySelectorAll(
          [
            'select[aria-label="Choose playback source"]',
            'button[aria-label="Fullscreen"]',
            'video',
          ].join(",")
        )
      ).filter(
        visible
      );

    for (
      let index =
        selectors.length -
        1;
      index >= 0;
      index -=
        1
    ) {
      const overlay =
        selectors[index].closest(
          ".fixed.inset-0"
        );

      if (
        overlay instanceof
          HTMLElement &&
        visible(
          overlay
        )
      ) {
        return overlay;
      }
    }

    return null;
  };

const readContext =
  () => {
    const context =
      typeof window !==
      "undefined"
        ? window.__MG_PLAYER_CONTEXT__ ||
          {}
        : {};

    return {
      mediaType:
        context?.mediaType ||
        null,

      tmdbId:
        context?.tmdbId ??
        null,

      title:
        context?.title ||
        "",

      season:
        positiveInt(
          context?.season
        ),

      episode:
        positiveInt(
          context?.episode
        ),
    };
  };

const unwrap = (
  response
) =>
  response?.data ??
  response ??
  {};

const regularSeasons = (
  items
) =>
  (Array.isArray(
    items
  )
    ? items
    : []
  )
    .filter(
      (
        item
      ) =>
        positiveInt(
          item?.season_number
        ) != null &&
        Number(
          item?.episode_count ||
            0
        ) > 0
    )
    .sort(
      (
        a,
        b
      ) =>
        Number(
          a?.season_number ||
            0
        ) -
        Number(
          b?.season_number ||
            0
        )
    );

export default function PlayerEpisodeQuickNav() {
  const [
    context,
    setContext,
  ] =
    useState(
      readContext
    );

  const [
    target,
    setTarget,
  ] =
    useState(
      null
    );

  const [
    previousBusy,
    setPreviousBusy,
  ] =
    useState(
      false
    );

  useEffect(() => {
    const refreshTarget =
      () =>
        setTarget(
          playerOverlay()
        );

    const onContext =
      (
        event
      ) => {
        const detail =
          event?.detail ||
          {};

        setContext({
          mediaType:
            detail?.mediaType ||
            null,

          tmdbId:
            detail?.tmdbId ??
            null,

          title:
            detail?.title ||
            "",

          season:
            positiveInt(
              detail?.season
            ),

          episode:
            positiveInt(
              detail?.episode
            ),
        });

        window.setTimeout(
          refreshTarget,
          60
        );
      };

    window.addEventListener(
      "mg:player-context",
      onContext
    );

    const observer =
      new MutationObserver(
        refreshTarget
      );

    observer.observe(
      document.body,
      {
        childList:
          true,

        subtree:
          true,
      }
    );

    refreshTarget();

    return () => {
      window.removeEventListener(
        "mg:player-context",
        onContext
      );

      observer.disconnect();
    };
  }, []);

  const chooseEpisodes =
    () => {
      window.dispatchEvent(
        new CustomEvent(
          "mg:choose-episode"
        )
      );
    };

  const playNext =
    () => {
      window.dispatchEvent(
        new CustomEvent(
          "mg:play-next-episode"
        )
      );
    };

  const playPrevious =
    async () => {
      const tmdbId =
        context.tmdbId;

      const season =
        positiveInt(
          context.season
        );

      const episode =
        positiveInt(
          context.episode
        );

      if (
        !tmdbId ||
        !season ||
        !episode ||
        previousBusy
      ) {
        return;
      }

      if (
        episode > 1
      ) {
        window.dispatchEvent(
          new CustomEvent(
            "mg:play-specific-episode",
            {
              detail: {
                tmdbId,
                seasonNumber:
                  season,
                episodeNumber:
                  episode -
                  1,
              },
            }
          )
        );

        return;
      }

      setPreviousBusy(
        true
      );

      try {
        const detailsResponse =
          await base44.functions.invoke(
            "getTmdbMovies",
            {
              media_type:
                "tv",

              movie_id:
                tmdbId,
            }
          );

        const details =
          unwrap(
            detailsResponse
          );

        const seasons =
          regularSeasons(
            details?.details
              ?.seasons ||
              details?.seasons
          );

        const previousSeason =
          [...seasons]
            .reverse()
            .find(
              (
                item
              ) =>
                Number(
                  item?.season_number ||
                    0
                ) <
                season
            );

        const previousSeasonNumber =
          positiveInt(
            previousSeason
              ?.season_number
          );

        if (
          !previousSeasonNumber
        ) {
          return;
        }

        const seasonResponse =
          await base44.functions.invoke(
            "getTmdbMovies",
            {
              media_type:
                "tv",

              movie_id:
                tmdbId,

              season_number:
                previousSeasonNumber,
            }
          );

        const seasonData =
          unwrap(
            seasonResponse
          );

        const episodes =
          Array.isArray(
            seasonData?.episodes
          )
            ? seasonData.episodes
            : [];

        const lastEpisode =
          [...episodes]
            .filter(
              (
                item
              ) =>
                positiveInt(
                  item?.episode_number
                ) != null
            )
            .sort(
              (
                a,
                b
              ) =>
                Number(
                  b?.episode_number ||
                    0
                ) -
                Number(
                  a?.episode_number ||
                    0
                )
            )[0];

        const episodeNumber =
          positiveInt(
            lastEpisode
              ?.episode_number
          ) ||
          positiveInt(
            previousSeason
              ?.episode_count
          );

        if (
          !episodeNumber
        ) {
          return;
        }

        window.dispatchEvent(
          new CustomEvent(
            "mg:play-specific-episode",
            {
              detail: {
                tmdbId,
                seasonNumber:
                  previousSeasonNumber,
                episodeNumber,
                episodeItem:
                  lastEpisode ||
                  null,
              },
            }
          )
        );
      } catch (
        error
      ) {
        console.warn(
          "[Media God] Could not load the previous episode",
          error
        );
      } finally {
        setPreviousBusy(
          false
        );
      }
    };

  const isTvEpisode =
    context.mediaType ===
      "tv" &&
    context.tmdbId &&
    context.season &&
    context.episode;

  if (
    !target ||
    !isTvEpisode
  ) {
    return null;
  }

  const controls = (
    <div
      className="absolute right-2 top-2 z-[85] flex items-center rounded-xl border border-white/10 bg-black/70 p-1 shadow-xl backdrop-blur-md sm:right-3 sm:top-3"
      data-mg-episode-quick-nav="true"
    >
      <button
        type="button"
        onClick={
          chooseEpisodes
        }
        className="flex min-h-10 items-center gap-1.5 rounded-lg bg-mg-green/15 px-3 text-xs font-semibold text-mg-green transition hover:bg-mg-green/25 focus:bg-mg-green/25 focus:outline-none focus:ring-2 focus:ring-mg-green sm:min-h-10 sm:text-sm"
        aria-label="Back to episodes"
        title="Back to episodes"
      >
        <ListVideo className="h-4 w-4" />

        <span>
          Back to episodes
        </span>
      </button>

    </div>
  );

  return createPortal(
    controls,
    target
  );
}
