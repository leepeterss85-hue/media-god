import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import MediaRow from "@/components/mg/MediaRow";
import { resolveStreamingServices } from "@/components/mg/streamingServices";

const providerCatalogCache = new Map();

const unwrapMovies = (response) => {
  const first = response?.data ?? response ?? {};
  const payload =
    first &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    first.data &&
    typeof first.data === "object" &&
    !Array.isArray(first.data)
      ? first.data
      : first;

  return Array.isArray(payload?.movies) ? payload.movies : [];
};

const unwrapProviders = (response) => {
  const first = response?.data ?? response ?? {};
  const payload =
    first &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    first.data &&
    typeof first.data === "object" &&
    !Array.isArray(first.data)
      ? first.data
      : first;

  return Array.isArray(payload?.providers) ? payload.providers : [];
};

const normaliseItem = (item, fallbackType) => {
  const id = item?.tmdb_id ?? item?.tmdbId ?? item?.id ?? null;
  const date = item?.release_date || item?.first_air_date || "";
  const type =
    String(item?.media_type || fallbackType || "movie").toLowerCase() === "tv"
      ? "tv"
      : "movie";

  return {
    ...item,
    id,
    tmdb_id: id,
    tmdbId: id,
    title: item?.title || item?.name || "Untitled",
    year:
      item?.year ||
      (/^\d{4}/.test(String(date)) ? String(date).slice(0, 4) : ""),
    poster_url: item?.poster_url || item?.posterUrl || item?.poster || "",
    description: item?.description || item?.overview || "",
    media_type: type,
    mediaType: type,
    type,
  };
};

const dedupe = (items) => {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = `${item?.media_type || "movie"}:${item?.id || item?.tmdb_id || ""}`;
    if (!item?.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const interleave = (left, right, limit) => {
  const out = [];
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max && out.length < limit; index += 1) {
    if (left[index]) out.push(left[index]);
    if (right[index] && out.length < limit) out.push(right[index]);
  }
  return dedupe(out).slice(0, limit);
};

const getProviderCatalog = async (region) => {
  const key = String(region || "GB").toUpperCase();
  if (!providerCatalogCache.has(key)) {
    providerCatalogCache.set(
      key,
      base44.functions
        .invoke("getTmdbMovies", {
          provider_catalog: true,
          media_type: "all",
          region: key,
        })
        .then(unwrapProviders)
        .catch(() => [])
    );
  }
  return providerCatalogCache.get(key);
};

const fetchItems = async ({ service, mediaType, region, rowLimit }) => {
  const request = (type) =>
    base44.functions
      .invoke("getTmdbMovies", {
        media_type: type,
        provider_ids: service.providerIds,
        provider_pages: 1,
        region,
      })
      .then(unwrapMovies)
      .then((items) =>
        items.map((item) => normaliseItem(item, type)).filter((item) => item.id)
      )
      .catch(() => []);

  if (mediaType === "mixed") {
    const [tv, movies] = await Promise.all([request("tv"), request("movie")]);
    return interleave(tv, movies, rowLimit);
  }

  return dedupe(await request("tv")).slice(0, rowLimit);
};

export default function StreamingServiceRows({
  mediaType = "tv",
  region = "GB",
  onOpen,
  onWatchlist,
  watched,
  onBrowseAll,
  heading = "Streaming Services",
  rowLimit = 18,
  maxServices,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setRows([]);
      setLoading(true);

      const catalog = await getProviderCatalog(region);
      if (cancelled) return;

      const services = resolveStreamingServices(catalog).slice(
        0,
        Number(maxServices || (mediaType === "mixed" ? 12 : 20))
      );

      const loaded = [];
      const batchSize = mediaType === "mixed" ? 3 : 4;

      for (let offset = 0; offset < services.length; offset += batchSize) {
        const batch = services.slice(offset, offset + batchSize);
        const results = await Promise.all(
          batch.map(async (service) => ({
            service,
            items: await fetchItems({
              service,
              mediaType,
              region,
              rowLimit,
            }),
          }))
        );

        if (cancelled) return;

        loaded.push(...results.filter((result) => result.items.length > 0));
        setRows([...loaded]);
      }

      if (!cancelled) setLoading(false);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [mediaType, region, rowLimit, maxServices]);

  if (!loading && rows.length === 0) return null;

  return (
    <section data-mg-streaming-service-rows="true" className="flex flex-col gap-6 3xl:gap-8">
      <div className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14">
        <h2 className="text-lg font-bold text-white sm:text-xl 3xl:text-2xl 4xl:text-3xl">
          {heading}
        </h2>
        <p className="mt-1 text-xs text-white/45 sm:text-sm 3xl:text-base">
          Browse what is officially available from each service in the UK. Playback still uses Media God&apos;s normal source system.
        </p>
      </div>

      {rows.map(({ service, items }) => (
        <MediaRow
          key={service.key}
          title={service.label}
          iconUrl={service.logoUrl}
          items={items}
          onOpen={onOpen}
          onWatchlist={onWatchlist}
          watched={watched}
          actionLabel={onBrowseAll ? "See all TV" : ""}
          onAction={onBrowseAll ? () => onBrowseAll(service) : undefined}
        />
      ))}

      {loading && rows.length === 0 && (
        <div className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14 text-sm text-white/40">
          Loading streaming services…
        </div>
      )}
    </section>
  );
}
