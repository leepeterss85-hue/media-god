import React, { useEffect, useState } from "react";
import { getCatalogueMovies } from "@/components/mg/catalogueRequests";
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
const SERVICE_DIRECTORY_REFRESH_MS = 12 * 60 * 60 * 1000;

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
  const existing = providerCatalogCache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;

  const promise = getCatalogueMovies({
    provider_catalog: true,
    media_type: "all",
    region: key,
  }, SERVICE_DIRECTORY_REFRESH_MS)
    .then(unwrapProviders)
    .catch(() => {
      providerCatalogCache.delete(key);
      return [];
    });
  providerCatalogCache.set(key, { promise, expiresAt: Date.now() + SERVICE_DIRECTORY_REFRESH_MS });
  return promise;
};

const fetchItems = async ({ service, mediaType, region, rowLimit }) => {
  const request = (type) =>
    getCatalogueMovies( {
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

  return sortCatalogueNewestFirst(dedupe(await request(mediaType === "movie" ? "movie" : "tv"))).slice(0, rowLimit);
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
  const [serviceQuery, setServiceQuery] = useState("");
  const [displayType, setDisplayType] = useState(mediaType);
  const [visibleLimit, setVisibleLimit] = useState(
    Number(maxServices || (mediaType === "mixed" ? 12 : 20))
  );
  const effectiveMediaType = mediaType === "mixed" ? displayType : mediaType;
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

      const term = serviceQuery.trim().toLowerCase();
      const availableServices = resolveStreamingServices(catalog)
        .filter((service) => !term || String(service.label || "").toLowerCase().includes(term));
      setTotalServices(availableServices.length);
      const services = availableServices.slice(0, visibleLimit);

      const loaded = [];
      const batchSize = effectiveMediaType === "mixed" ? 3 : 4;

      for (let offset = 0; offset < services.length; offset += batchSize) {
        const batch = services.slice(offset, offset + batchSize);
        const results = await Promise.all(
          batch.map(async (service) => ({
            service,
            items: await fetchItemsCached({
              service,
              mediaType: effectiveMediaType,
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
  }, [effectiveMediaType, activeRegion, rowLimit, visibleLimit, serviceQuery]);

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

      <div className="flex flex-wrap items-center gap-2 px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14">
        <input type="search" value={serviceQuery}
          onChange={(event) => setServiceQuery(event.target.value)}
          placeholder="Find Netflix, Prime, Disney+, BBC…"
          aria-label="Find streaming service"
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 text-xs text-white outline-none placeholder:text-white/40 focus:border-mg-green/50 sm:max-w-xs" />
        {mediaType === "mixed" && (
          <div className="flex gap-1" role="group" aria-label="Service media type">
            {[
              ["mixed", "All"], ["movie", "Films"], ["tv", "TV"],
            ].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setDisplayType(value)}
                aria-pressed={effectiveMediaType === value}
                className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${effectiveMediaType === value ? "bg-mg-green text-black" : "bg-white/5 text-white/70"}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <span className="text-xs text-white/40">{totalServices} services</span>
      </div>

      {rows.map(({ service, items }) => (
        <MediaRow
          key={service.key}
          title={service.label}
          iconUrl={service.logoUrl}
          iconSize={mediaType === "tv" || mediaType === "mixed" ? "large" : "default"}
          items={items}
          onOpen={onOpen}
          onWatchlist={onWatchlist}
          watched={watched}
          showReleaseDate
          actionLabel={onBrowseAll && effectiveMediaType !== "movie" ? "See all TV" : ""}
          onAction={onBrowseAll && effectiveMediaType !== "movie" ? () => onBrowseAll(service) : undefined}
        />
      ))}

      {!loading && rows.length === 0 && serviceQuery.trim() && (
        <p className="px-4 text-xs text-white/50">No services match that search in {activeRegionName}.</p>
      )}

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
