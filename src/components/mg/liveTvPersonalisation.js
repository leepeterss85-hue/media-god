const HIDDEN_CHANNELS_KEY = "mg:live-tv-hidden-channels-v1";
const HIDDEN_GROUPS_KEY = "mg:live-tv-hidden-groups-v1";
const CHANNEL_ORDER_KEY = "mg:live-tv-channel-order-v1";
const GROUP_ORDER_KEY = "mg:live-tv-group-order-v1";

const readList = (key) => {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(key) || "[]"
    );

    return Array.isArray(parsed)
      ? parsed.map(String).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const writeList = (key, values) => {
  if (typeof window === "undefined") return [];

  const next = [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map(String)
        .filter(Boolean)
    ),
  ];

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(next)
    );
  } catch {
    // Live TV personalisation remains device-local and best effort.
  }

  return next;
};

export const readHiddenLiveTvChannels = () =>
  readList(HIDDEN_CHANNELS_KEY);

export const writeHiddenLiveTvChannels = (values) =>
  writeList(HIDDEN_CHANNELS_KEY, values);

export const readHiddenLiveTvGroups = () =>
  readList(HIDDEN_GROUPS_KEY);

export const writeHiddenLiveTvGroups = (values) =>
  writeList(HIDDEN_GROUPS_KEY, values);

export const readLiveTvChannelOrder = () =>
  readList(CHANNEL_ORDER_KEY);

export const writeLiveTvChannelOrder = (values) =>
  writeList(CHANNEL_ORDER_KEY, values);

export const readLiveTvGroupOrder = () =>
  readList(GROUP_ORDER_KEY);

export const writeLiveTvGroupOrder = (values) =>
  writeList(GROUP_ORDER_KEY, values);

export const orderedValues = (
  values,
  preferredOrder
) => {
  const list = Array.isArray(values)
    ? values
    : [];
  const order = new Map(
    (Array.isArray(preferredOrder)
      ? preferredOrder
      : []
    ).map((value, index) => [
      String(value),
      index,
    ])
  );

  return [...list].sort((a, b) => {
    const aKey = String(a);
    const bKey = String(b);
    const aIndex = order.has(aKey)
      ? order.get(aKey)
      : Number.MAX_SAFE_INTEGER;
    const bIndex = order.has(bKey)
      ? order.get(bKey)
      : Number.MAX_SAFE_INTEGER;

    return (
      aIndex - bIndex ||
      aKey.localeCompare(bKey)
    );
  });
};

export const movedOrder = (
  currentOrder,
  visibleKeys,
  key,
  direction
) => {
  const wanted = String(key || "");
  if (!wanted) {
    return Array.isArray(currentOrder)
      ? currentOrder
      : [];
  }

  const visible = [
    ...new Set(
      (Array.isArray(visibleKeys)
        ? visibleKeys
        : []
      ).map(String)
    ),
  ];

  const existing = [
    ...new Set(
      [
        ...(Array.isArray(currentOrder)
          ? currentOrder
          : []),
        ...visible,
      ].map(String)
    ),
  ];

  const index = existing.indexOf(wanted);
  if (index < 0) return existing;

  const delta =
    direction === "up" ? -1 : 1;
  const nextIndex = Math.max(
    0,
    Math.min(
      existing.length - 1,
      index + delta
    )
  );

  if (nextIndex === index) {
    return existing;
  }

  const next = [...existing];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);

  return next;
};
