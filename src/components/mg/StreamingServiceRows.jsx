import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import MediaRow from "@/components/mg/MediaRow";
import { sortCatalogueNewestFirst } from "@/components/mg/catalogueDateOrder";
import { resolveStreamingServices } from "@/components/mg/streamingServices";
import {
  detectStreamingRegion,
  streamingRegionName,
} from "@/components/mg/streamingRegion";

const providerCatalogCache = new Map();
const serviceItemsCache = new Map();
const SERVICE_ITEMS_REFRESH_MS = 4 * 60 * 60 * 1000;

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

const mergeNewest = (left, right, limit) =>
  sortCatalogueNewestFirst(dedupe([...left, ...right])).slice(0, limit);

const getProviderCatalog = async (region) => {
  const key = String(region || detectStreamingRegion()).toUpperCase();
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
    return mergeNewest(tv, movies, rowLimit);
  }

  return sortCatalogueNewestFirst(dedupe(await request("tv"))).slice(0, rowLimit);
};

const fetchItemsCached = (options) => {
  const key = [options.region, options.mediaType, options.rowLimit, options.service.key].join(":");
  const cached = serviceItemsCache.get(key);
  const now = Date.now();
  if (cached && now < cached.expiresAt) return cached.promise;
  // An unchanged session must not keep showing last month's provider rows.
  // This remains a small on-demand cache; no background provider polling.
  const promise = fetchItems(options);
  serviceItemsCache.delete(key);
  serviceItemsCache.set(key, { promise, expiresAt: now + SERVICE_ITEMS_REFRESH_MS });
  while (serviceItemsCache.size > 120) serviceItemsCache.delete(serviceItemsCache.keys().next().value);
  return promise;
};

export default function StreamingServiceRows({
  mediaType = "tv",
  region = "",
  onOpen,
  onWatchlist = null,
  watched = {},
  onBrowseAll = null,
  heading = "Streaming Services",
  rowLimit = 18,
  maxServices,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalServices, setTotalServices] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(
    Number(maxServices || (mediaType === "mixed" ? 12 : 20))
  );
  const activeRegion = String(region || detectStreamingRegion()).toUpperCase();
  const activeRegionName = streamingRegionName(activeRegion);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setRows([]);
      setLoading(true);
      setTotalServices(0);

      const catalog = await getProviderCatalog(activeRegion);
      if (cancelled) return;

      const availableServices = resolveStreamingServices(catalog);
      setTotalServices(availableServices.length);
      const services = availableServices.slice(0, visibleLimit);

      const loaded = [];
      const batchSize = mediaType === "mixed" ? 3 : 4;

      for (let offset = 0; offset < services.length; offset += batchSize) {
        const batch = services.slice(offset, offset + batchSize);
        const results = await Promise.all(
          batch.map(async (service) => ({
            service,
            items: await fetchItemsCached({
              service,
              mediaType,
              region: activeRegion,
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
  }, [mediaType, activeRegion, rowLimit, visibleLimit]);

  if (!loading && rows.length === 0 && totalServices <= visibleLimit) return null;

  return (
    <section data-mg-streaming-service-rows="true" className="flex flex-col gap-6 3xl:gap-8">
      <div className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14">
        <h2 className="text-lg font-bold text-white sm:text-xl 3xl:text-2xl 4xl:text-3xl">
          {heading}
        </h2>
        <p className="mt-1 text-xs text-white/45 sm:text-sm 3xl:text-base">
          Browse what is listed on each service in {activeRegionName}, newest film releases and TV premieres first. Dates are not the day a service added the title. Playback still uses Media God&apos;s normal source system.
        </p>
      </div>

      {rows.map(({ service, items }) => (
        <MediaRow
          key={service.key}
          title={mediaType === "tv" || mediaType === "mixed" ? "" : service.label}
          iconUrl={service.logoUrl}
          iconSize={mediaType === "tv" || mediaType === "mixed" ? "large" : "default"}
          items={items}
          onOpen={onOpen}
          onWatchlist={onWatchlist}
          watched={watched}
          showReleaseDate
          actionLabel={onBrowseAll ? "See all TV" : ""}
          onAction={onBrowseAll ? () => onBrowseAll(service) : undefined}
        />
      ))}

      {!loading && totalServices > visibleLimit && (
        <div className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14">
          <button
            type="button"
            onClick={() => setVisibleLimit((count) => Math.min(totalServices, count + 12))}
            className="min-h-11 rounded-xl border border-mg-green/30 bg-mg-card px-5 py-3 text-sm font-semibold text-mg-green hover:border-mg-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mg-green"
            data-mg-focus-key="streaming:load-more"
          >
            Browse more streaming services
          </button>
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14 text-sm text-white/40">
          Loading streaming services…
        </div>
      )}
    </section>
  );
}
