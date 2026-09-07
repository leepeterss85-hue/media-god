import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getPlaybackDeviceProfile,
  scoreSourceCompatibility,
} from "@/components/mg/mediaCompatibility";

const STORAGE_KEY =
  "mg:playback-reliability-v1";

const FAILURE_TTL =
  12 * 60 * 60 * 1000;

const NO_SOUND_TTL =
  7 * 24 * 60 * 60 * 1000;

const GOOD_TTL =
  30 * 24 * 60 * 60 * 1000;

const BUFFER_TTL =
  48 * 60 * 60 * 1000;

const START_TTL =
  30 * 24 * 60 * 60 * 1000;

const normaliseLabel = (
  value
) =>
  String(
    value ||
      ""
  )
    .replace(
      /^failed\s*[—-]\s*/i,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

const sourceKey = (
  value
) =>
  normaliseLabel(
    value
  )
    .toLowerCase()
    .slice(
      0,
      260
    );

const readStore = () => {
  try {
    const raw =
      window.localStorage.getItem(
        STORAGE_KEY
      );

    const parsed =
      raw
        ? JSON.parse(
            raw
          )
        : {};

    return parsed &&
      typeof parsed ===
        "object"
      ? parsed
      : {};
  } catch {
    return {};
  }
};

const writeStore = (
  value
) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        value
      )
    );
  } catch {
    // Storage is optional.
  }
};

const fresh = (
  timestamp,
  ttl
) =>
  Number(
    timestamp ||
      0
  ) >
  Date.now() -
    ttl;

const cleanStore = (
  store
) => {
  const next =
    {};

  Object.entries(
    store ||
      {}
  ).forEach(
    ([
      key,
      record,
    ]) => {
      if (
        !record ||
        typeof record !==
          "object"
      ) {
        return;
      }

      if (
        fresh(
          record.lastFailure,
          FAILURE_TTL
        ) ||
        fresh(
          record.lastNoSound,
          NO_SOUND_TTL
        ) ||
        fresh(
          record.lastGood,
          GOOD_TTL
        ) ||
        fresh(
          record.lastBuffer,
          BUFFER_TTL
        ) ||
        fresh(
          record.lastStartAt,
          START_TTL
        )
      ) {
        next[key] =
          record;
      }
    }
  );

  return next;
};

const saveReliability = (
  label,
  kind,
  value = null
) => {
  const key =
    sourceKey(
      label
    );

  if (!key) {
    return;
  }

  const store =
    cleanStore(
      readStore()
    );

  const current = {
    failures:
      0,

    noSound:
      0,

    lastFailure:
      0,

    lastNoSound:
      0,

    lastGood:
      0,

    buffers:
      0,

    lastBuffer:
      0,

    avgStartMs:
      0,

    startSamples:
      0,

    lastStartAt:
      0,

    ...(store[key] ||
      {}),
  };

  const now =
    Date.now();

  if (
    kind ===
    "failure"
  ) {
    current.failures =
      Number(
        current.failures ||
          0
      ) +
      1;

    current.lastFailure =
      now;
  }

  if (
    kind ===
    "no-sound"
  ) {
    current.noSound =
      Number(
        current.noSound ||
          0
      ) +
      1;

    current.lastNoSound =
      now;
  }

  if (
    kind ===
    "buffer"
  ) {
    current.buffers =
      Number(
        current.buffers ||
          0
      ) +
      1;

    current.lastBuffer =
      now;
  }

  if (
    kind ===
    "startup"
  ) {
    const startMs =
      Math.max(
        0,
        Math.min(
          60000,
          Number(value || 0)
        )
      );

    if (startMs > 0) {
      const samples =
        Number(
          current.startSamples ||
            0
        );

      const previous =
        Number(
          current.avgStartMs ||
            0
        );

      current.avgStartMs =
        samples > 0
          ? Math.round(
              previous * 0.7 +
                startMs * 0.3
            )
          : Math.round(
              startMs
            );

      current.startSamples =
        samples +
        1;

      current.lastStartAt =
        now;
    }
  }

  if (
    kind ===
    "good"
  ) {
    current.lastGood =
      now;

    /*
     * A stream that later proves healthy should gradually recover
     * from an old transient failure, but a remembered no-sound
     * problem stays in force for its longer TTL.
     */
    current.failures =
      Math.max(
        0,
        Number(
          current.failures ||
            0
        ) -
          1
      );
  }

  store[key] =
    current;

  writeStore(
    store
  );
};

const reliabilityAdjustment = (
  label
) => {
  const key =
    sourceKey(
      label
    );

  if (!key) {
    return 0;
  }

  const record =
    readStore()[key];

  if (!record) {
    return 0;
  }

  let score =
    0;

  if (
    fresh(
      record.lastNoSound,
      NO_SOUND_TTL
    )
  ) {
    score -=
      500000 +
      Math.min(
        200000,
        Number(
          record.noSound ||
            0
        ) *
          25000
      );
  }

  if (
    fresh(
      record.lastFailure,
      FAILURE_TTL
    )
  ) {
    score -=
      220000 +
      Math.min(
        150000,
        Number(
          record.failures ||
            0
        ) *
          18000
      );
  }

  if (
    fresh(
      record.lastBuffer,
      BUFFER_TTL
    )
  ) {
    score -=
      Math.min(
        36000,
        Number(
          record.buffers ||
            0
        ) *
          4500
      );
  }

  if (
    fresh(
      record.lastStartAt,
      START_TTL
    )
  ) {
    const average =
      Number(
        record.avgStartMs ||
          0
      );

    if (
      average > 0 &&
      average <= 2500
    ) {
      score +=
        9000;
    } else if (
      average > 0 &&
      average <= 5000
    ) {
      score +=
        4500;
    } else if (
      average >= 15000
    ) {
      score -=
        16000;
    } else if (
      average >= 9000
    ) {
      score -=
        8000;
    }
  }

  if (
    fresh(
      record.lastGood,
      GOOD_TTL
    )
  ) {
    score +=
      3500;
  }

  return score;
};

const sourceBonus = (
  label
) => {
  const text =
    normaliseLabel(
      label
    ).toLowerCase();

  let score =
    0;

  /*
   * Ready/cached Real-Debrid sources should start before magnets
   * that still need resolving.
   */
  if (
    /real[ ._-]?debrid|\brd\b/.test(
      text
    )
  ) {
    score +=
      18000;
  }

  if (
    /\bcached\b|\binstant\b|\bready\b/.test(
      text
    )
  ) {
    score +=
      16000;
  }

  if (
    /\buncached\b|\bdownloading\b|\bpending\b/.test(
      text
    )
  ) {
    score -=
      12000;
  }

  if (
    /^failed\s*[—-]/i.test(
      String(
        label ||
          ""
      )
    )
  ) {
    score -=
      1000000;
  }

  return score;
};

const scoreLabel = (
  label,
  deviceProfile
) => {
  const clean =
    normaliseLabel(
      label
    );

  return (
    scoreSourceCompatibility(
      {
        label:
          clean,

        name:
          clean,
      },
      clean,
      {
        deviceProfile,
        qualityPreference:
          "Auto",
      }
    ) +
    sourceBonus(
      label
    ) +
    reliabilityAdjustment(
      clean
    )
  );
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

const playbackSelect =
  () => {
    const candidates =
      Array.from(
        document.querySelectorAll(
          'select[aria-label="Choose playback source"]'
        )
      ).filter(
        visible
      );

    return candidates[
      candidates.length -
        1
    ] ||
      null;
  };

const activeSourceLabel =
  () => {
    const select =
      playbackSelect();

    if (
      !select ||
      select.selectedIndex <
        0
    ) {
      return "";
    }

    return normaliseLabel(
      select.options[
        select.selectedIndex
      ]?.textContent ||
        ""
    );
  };

const chooseIndex = (
  select,
  index
) => {
  if (
    !select ||
    index <
      0 ||
    index >=
      select.options.length ||
    select.selectedIndex ===
      index
  ) {
    return false;
  }

  select.value =
    String(
      index
    );

  select.dispatchEvent(
    new Event(
      "input",
      {
        bubbles:
          true,
      }
    )
  );

  select.dispatchEvent(
    new Event(
      "change",
      {
        bubbles:
          true,
      }
    )
  );

  return true;
};

const pickBestSource =
  () => {
    const select =
      playbackSelect();

    if (
      !select ||
      select.options.length <
        2
    ) {
      return null;
    }

    const deviceProfile =
      getPlaybackDeviceProfile();

    const ranked =
      Array.from(
        select.options
      )
        .map(
          (
            option,
            index
          ) => ({
            index,

            label:
              normaliseLabel(
                option.textContent ||
                  ""
              ),

            disabled:
              option.disabled,

            score:
              option.disabled
                ? -Infinity
                : scoreLabel(
                    option.textContent ||
                      "",
                    deviceProfile
                  ),
          })
        )
        .sort(
          (
            a,
            b
          ) =>
            b.score -
              a.score ||
            a.index -
              b.index
        );

    const best =
      ranked[0];

    const current =
      ranked.find(
        (
          item
        ) =>
          item.index ===
          select.selectedIndex
      );

    if (
      !best ||
      !Number.isFinite(
        best.score
      )
    ) {
      return null;
    }

    /*
     * Do not churn sources for tiny scoring differences. Switch when
     * the current source is remembered bad or the better source is
     * meaningfully more compatible.
     */
    const currentPenalty =
      current
        ? reliabilityAdjustment(
            current.label
          )
        : 0;

    const shouldSwitch =
      best.index !==
        select.selectedIndex &&
      (
        currentPenalty <
          -100000 ||
        !current ||
        best.score -
          current.score >=
          3000
      );

    if (
      shouldSwitch &&
      chooseIndex(
        select,
        best.index
      )
    ) {
      return best;
    }

    return {
      ...(
        current ||
        best
      ),

      changed:
        false,
    };
  };

export default function PlaybackReliabilityAssist() {
  const [
    message,
    setMessage,
  ] =
    useState(
      ""
    );

  const stateRef =
    useRef({
      seenSelect:
        null,

      inspectTimer:
        null,

      messageTimer:
        null,

      goodTimer:
        null,
    });

  useEffect(() => {
    const state =
      stateRef.current;

    const showMessage =
      (
        value,
        duration =
          1800
      ) => {
        setMessage(
          value
        );

        if (
          state.messageTimer
        ) {
          window.clearTimeout(
            state.messageTimer
          );
        }

        state.messageTimer =
          window.setTimeout(
            () =>
              setMessage(
                ""
              ),
            duration
          );
      };

    const inspectPlayer =
      () => {
        if (
          state.inspectTimer
        ) {
          window.clearTimeout(
            state.inspectTimer
          );
        }

        state.inspectTimer =
          window.setTimeout(
            () => {
              const select =
                playbackSelect();

              if (
                !select ||
                select ===
                  state.seenSelect
              ) {
                return;
              }

              state.seenSelect =
                select;

              const best =
                pickBestSource();

              if (
                best?.label &&
                best.index ===
                  select.selectedIndex
              ) {
                showMessage(
                  `Best source selected · ${best.label}`,
                  1400
                );
              }
            },
            120
          );
      };

    const onError =
      (
        event
      ) => {
        if (
          !(
            event.target instanceof
              HTMLVideoElement
          )
        ) {
          return;
        }

        const label =
          activeSourceLabel();

        if (!label) {
          return;
        }

        saveReliability(
          label,
          "failure"
        );

        showMessage(
          "Source failed · trying the next stream…",
          2200
        );
      };

    const onClick =
      (
        event
      ) => {
        const button =
          event.target instanceof
            Element
            ? event.target.closest(
                'button[aria-label="No sound"], button[title="No sound"]'
              )
            : null;

        if (!button) {
          return;
        }

        const label =
          activeSourceLabel();

        if (!label) {
          return;
        }

        saveReliability(
          label,
          "no-sound"
        );

        showMessage(
          "Audio issue remembered · trying another source…",
          2400
        );
      };

    const onPlaying =
      (
        event
      ) => {
        if (
          !(
            event.target instanceof
              HTMLVideoElement
          )
        ) {
          return;
        }

        const video =
          event.target;

        const label =
          activeSourceLabel();

        if (!label) {
          return;
        }

        if (
          state.goodTimer
        ) {
          window.clearTimeout(
            state.goodTimer
          );
        }

        state.goodTimer =
          window.setTimeout(
            () => {
              if (
                video.isConnected &&
                !video.paused &&
                activeSourceLabel() ===
                  label
              ) {
                saveReliability(
                  label,
                  "good"
                );
              }
            },
            20000
          );
      };

    document.addEventListener(
      "error",
      onError,
      true
    );

    document.addEventListener(
      "click",
      onClick,
      true
    );

    document.addEventListener(
      "playing",
      onPlaying,
      true
    );

    const observer =
      new MutationObserver(
        inspectPlayer
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

    inspectPlayer();

    return () => {
      document.removeEventListener(
        "error",
        onError,
        true
      );

      document.removeEventListener(
        "click",
        onClick,
        true
      );

      document.removeEventListener(
        "playing",
        onPlaying,
        true
      );

      observer.disconnect();

      if (
        state.inspectTimer
      ) {
        window.clearTimeout(
          state.inspectTimer
        );
      }

      if (
        state.messageTimer
      ) {
        window.clearTimeout(
          state.messageTimer
        );
      }

      if (
        state.goodTimer
      ) {
        window.clearTimeout(
          state.goodTimer
        );
      }
    };
  }, []);

  if (!message) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-5 left-1/2 z-[2147483600] max-w-[90vw] -translate-x-1/2 rounded-full border border-white/15 bg-black/85 px-4 py-2 text-center text-xs font-semibold text-white shadow-2xl backdrop-blur-md sm:text-sm"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
