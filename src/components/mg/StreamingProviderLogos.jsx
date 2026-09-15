import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { Tv } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { detectStreamingRegion } from "@/components/mg/streamingRegion";

const providerCache = new Map();
const providerRequests = new Map();

const cacheKeyFor = (mediaType, tmdbId, region) =>
  `${String(mediaType || "movie")}:${String(tmdbId || "")}:${String(
    region || detectStreamingRegion()
  ).toUpperCase()}`;

const fetchProviders = async ({ mediaType, tmdbId, region }) => {
  const key = cacheKeyFor(mediaType, tmdbId, region);

  if (providerCache.has(key)) {
    return providerCache.get(key);
  }

  if (providerRequests.has(key)) {
    return providerRequests.get(key);
  }

  const request = base44.functions
    .invoke("getTmdbMovies", {
      providers_only: true,
      movie_id: tmdbId,
      media_type: mediaType === "tv" ? "tv" : "movie",
      region: String(region || "GB").toUpperCase(),
    })
    .then((response) => {
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

      const providers = Array.isArray(payload?.watch_providers)
        ? payload.watch_providers
        : [];

      providerCache.set(key, providers);
      return providers;
    })
    .catch(() => {
      providerCache.set(key, []);
      return [];
    })
    .finally(() => {
      providerRequests.delete(key);
    });

  providerRequests.set(key, request);
  return request;
};

export default function StreamingProviderLogos({
  tmdbId,
  mediaType = "movie",
  region = "",
  limit = 3,
  className = "",
  compact = true,
  initialProviders = null,
}) {
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const activeRegion = String(region || detectStreamingRegion()).toUpperCase();
  const [providers, setProviders] = useState(() =>
    Array.isArray(initialProviders)
      ? initialProviders
      : []
  );

  useEffect(() => {
    const element = rootRef.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "240px 0px",
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!visible || !tmdbId) {
      return () => {
        cancelled = true;
      };
    }

    if (Array.isArray(initialProviders) && initialProviders.length > 0) {
      setProviders(initialProviders);
    }

    fetchProviders({
      mediaType,
      tmdbId,
      region: activeRegion,
    }).then((items) => {
      if (!cancelled && items.length > 0) {
        setProviders(items);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visible, mediaType, tmdbId, activeRegion, initialProviders]);

  const shown = providers.slice(0, Math.max(1, Number(limit || 3)));

  return (
    <div
      ref={rootRef}
      className={`min-h-6 ${className}`}
      aria-label="Streaming services"
    >
      {shown.length > 0 && (
        <div className="flex items-center gap-1">
          {shown.map((provider) => (
            <span
              key={`${provider?.provider_id || provider?.provider_name}-${provider?.availability || "watch"}`}
              className={`inline-flex items-center justify-center overflow-hidden rounded-md border border-white/15 bg-black/65 shadow-sm ${
                compact ? "h-6 w-6" : "h-8 w-8"
              }`}
              title={`${provider?.provider_name || "Streaming service"}${
                provider?.availability ? ` • ${provider.availability}` : ""
              }`}
            >
              {provider?.logo_url ? (
                <img
                  src={provider.logo_url}
                  alt={provider?.provider_name || "Streaming service"}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Tv className="h-3 w-3 text-white/45" />
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
