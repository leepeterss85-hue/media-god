const clean = (value) => String(value || "").trim();

const normaliseHash = (value) =>
  clean(value).toLowerCase();

const cacheValueFor = (values, hash) => {
  if (!values || typeof values !== "object") return undefined;

  const normalized = normaliseHash(hash);
  if (!normalized) return undefined;

  if (Object.prototype.hasOwnProperty.call(values, normalized)) {
    return values[normalized];
  }

  const upper = normalized.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(values, upper)) {
    return values[upper];
  }

  return undefined;
};

const providerKeysFor = (data) => {
  const requested = Array.isArray(data?.providersChecked)
    ? data.providersChecked.map(clean).filter(Boolean)
    : [];

  if (requested.length > 0) {
    return requested.filter(
      (provider, index, list) => list.indexOf(provider) === index
    );
  }

  return [
    ...Object.keys(data?.cached || {}),
    ...Object.keys(data?.providerStats || {}),
  ]
    .map(clean)
    .filter(Boolean)
    .filter((provider, index, list) => list.indexOf(provider) === index);
};

export const classifyDebridCacheCheck = (data, hashes = []) => {
  const providers = providerKeysFor(data);
  const cached = data?.cached || {};
  const providerStats = data?.providerStats || {};

  return Object.fromEntries(
    (Array.isArray(hashes) ? hashes : [])
      .map(normaliseHash)
      .filter(Boolean)
      .map((hash) => {
        const cachedProviders = providers.filter(
          (provider) => cacheValueFor(cached?.[provider], hash) === true
        );

        if (cachedProviders.length > 0) {
          return [
            hash,
            {
              state: "cached",
              cachedProviders,
            },
          ];
        }

        const complete =
          providers.length > 0 &&
          providers.every((provider) => {
            const stats = providerStats?.[provider];
            const error = clean(stats?.error);
            const value = cacheValueFor(cached?.[provider], hash);

            return Boolean(stats) && !error && typeof value === "boolean";
          });

        return [
          hash,
          {
            state: complete ? "uncached" : "unknown",
            cachedProviders: [],
          },
        ];
      })
  );
};

export const mergeDebridCacheCheckState = (current, incoming) => {
  const left = current || { state: "unknown", cachedProviders: [] };
  const right = incoming || { state: "unknown", cachedProviders: [] };

  if (left.state === "cached" || right.state === "cached") {
    return {
      state: "cached",
      cachedProviders: [
        ...(left.cachedProviders || []),
        ...(right.cachedProviders || []),
      ]
        .filter(Boolean)
        .filter((provider, index, list) => list.indexOf(provider) === index),
    };
  }

  if (right.state === "uncached") return right;
  if (left.state === "uncached") return left;

  return {
    state: "unknown",
    cachedProviders: [],
  };
};
