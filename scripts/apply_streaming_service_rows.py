from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"Missing anchor for {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Shared streaming-service definitions and resolver.
# ---------------------------------------------------------------------------
write(
    "src/components/mg/streamingServices.js",
    r'''const normaliseProviderName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const STREAMING_SERVICE_DEFINITIONS = [
  { key: "netflix", label: "Netflix", contains: ["netflix"] },
  { key: "prime", label: "Prime Video", contains: ["amazon prime video", "prime video"] },
  { key: "disney", label: "Disney+", contains: ["disney plus"] },
  { key: "apple", label: "Apple TV+", contains: ["apple tv plus"] },
  { key: "paramount", label: "Paramount+", contains: ["paramount plus"] },
  { key: "now", label: "NOW", exact: ["now", "now tv"], contains: ["now tv"] },
  { key: "sky", label: "Sky Go", exact: ["sky go"] },
  { key: "bbc", label: "BBC iPlayer", contains: ["bbc iplayer"] },
  { key: "itvx", label: "ITVX", contains: ["itvx"] },
  { key: "channel4", label: "Channel 4", exact: ["channel 4"] },
  { key: "my5", label: "My5", exact: ["my5"] },
  { key: "discovery", label: "Discovery+", contains: ["discovery plus"] },
  { key: "crunchyroll", label: "Crunchyroll", contains: ["crunchyroll"] },
  { key: "britbox", label: "BritBox", contains: ["britbox"] },
  { key: "u", label: "U / UKTV Play", exact: ["u", "uktv play"] },
  { key: "hayu", label: "Hayu", contains: ["hayu"] },
  { key: "mubi", label: "MUBI", contains: ["mubi"] },
  { key: "shudder", label: "Shudder", contains: ["shudder"] },
  { key: "acorn", label: "Acorn TV", contains: ["acorn tv"] },
  { key: "stv", label: "STV Player", contains: ["stv player"] },
];

const matchesDefinition = (providerName, definition) => {
  const name = normaliseProviderName(providerName);
  if (!name) return false;

  const exact = (definition.exact || []).map(normaliseProviderName);
  if (exact.includes(name)) return true;

  return (definition.contains || [])
    .map(normaliseProviderName)
    .some((term) => term && name.includes(term));
};

export const resolveStreamingServices = (catalog = []) =>
  STREAMING_SERVICE_DEFINITIONS.map((definition) => {
    const matches = (catalog || []).filter((provider) =>
      matchesDefinition(provider?.provider_name, definition)
    );

    const providerIds = Array.from(
      new Set(
        matches
          .map((provider) => String(provider?.provider_id || "").trim())
          .filter(Boolean)
      )
    );

    if (!providerIds.length) return null;

    const logoProvider = matches.find((provider) => provider?.logo_url) || matches[0];

    return {
      ...definition,
      providerIds,
      logoUrl: logoProvider?.logo_url || "",
      providerNames: matches
        .map((provider) => provider?.provider_name)
        .filter(Boolean),
    };
  }).filter(Boolean);
'''
)

# ---------------------------------------------------------------------------
# Shared provider rows. Loads progressively to avoid hammering Fire TV.
# ---------------------------------------------------------------------------
write(
    "src/components/mg/StreamingServiceRows.jsx",
    r'''import React, { useEffect, useState } from "react";
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
'''
)

# ---------------------------------------------------------------------------
# MediaRow: provider logo + See all action while preserving arrows.
# ---------------------------------------------------------------------------
write(
    "src/components/mg/MediaRow.jsx",
    r'''import React, { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MediaCard from "@/components/mg/MediaCard";

export default function MediaRow({
  title,
  items,
  onOpen,
  onWatchlist,
  watched,
  iconUrl = "",
  actionLabel = "",
  onAction,
}) {
  const ref = useRef(null);

  const scroll = (direction) => {
    const element = ref.current;
    if (!element) return;

    element.scrollBy({
      left: direction * element.clientWidth * 0.82,
      behavior: "smooth",
    });
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="px-3 min-[420px]:px-4 sm:px-6 md:px-8 3xl:px-10 4xl:px-14">
      <div className="flex items-center justify-between gap-3 mb-2 3xl:mb-3">
        <div className="flex min-w-0 items-center gap-2.5 3xl:gap-3">
          {iconUrl && (
            <img
              src={iconUrl}
              alt=""
              aria-hidden="true"
              className="h-7 w-7 shrink-0 rounded-md object-cover 3xl:h-9 3xl:w-9"
              loading="lazy"
            />
          )}
          <h2 className="truncate text-base font-semibold text-white sm:text-lg xl:text-xl 3xl:text-2xl 4xl:text-3xl">
            {title}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2 3xl:gap-3">
          {actionLabel && onAction && (
            <button
              type="button"
              data-mg-row-action="true"
              onClick={onAction}
              className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/75 transition hover:border-mg-green/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-mg-green/60 3xl:min-h-11 3xl:px-4 3xl:text-sm"
              aria-label={`${actionLabel} ${title}`}
            >
              {actionLabel}
            </button>
          )}

          <div data-mg-row-arrows="true" className="hidden sm:flex gap-1.5 3xl:gap-2">
            <button
              type="button"
              onClick={() => scroll(-1)}
              className="w-9 h-9 3xl:w-11 3xl:h-11 4xl:w-12 4xl:h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6" />
            </button>

            <button
              type="button"
              onClick={() => scroll(1)}
              className="w-9 h-9 3xl:w-11 3xl:h-11 4xl:w-12 4xl:h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={ref}
        data-mg-tv-row="true"
        className="flex gap-2.5 sm:gap-3 xl:gap-4 3xl:gap-5 4xl:gap-6 overflow-x-auto overscroll-x-contain pb-2 3xl:pb-3 scrollbar-hide snap-x snap-proximity"
      >
        {items.map((item) => (
          <div key={`${item?.media_type || "movie"}:${item.id}`} className="snap-start">
            <MediaCard
              item={item}
              onOpen={onOpen}
              onWatchlist={onWatchlist}
              watched={watched?.[item.id]}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
'''
)

# ---------------------------------------------------------------------------
# TMDB backend: provider catalogue + provider-filtered discover browsing.
# ---------------------------------------------------------------------------
path = "base44/functions/getTmdbMovies/entry.ts"
text = read(path)

old = """    const mediaType =\n      body.media_type ===\n      'tv'\n        ? 'tv'\n        : 'movie';\n\n    const country =\n"""
new = """    const requestedMediaType =\n      body.media_type ===\n      'tv'\n        ? 'tv'\n        : body.media_type ===\n          'all'\n          ? 'all'\n          : 'movie';\n\n    const mediaType =\n      requestedMediaType ===\n      'tv'\n        ? 'tv'\n        : 'movie';\n\n    const rawProviderIds =\n      Array.isArray(body.provider_ids)\n        ? body.provider_ids\n        : [\n            body.provider_ids ||\n            body.provider_id ||\n            '',\n          ];\n\n    const providerIds =\n      Array.from(\n        new Set(\n          rawProviderIds\n            .flatMap((value) =>\n              String(value || '')\n                .split(/[|,]/)\n            )\n            .map((value) => value.trim())\n            .filter((value) => /^\\d+$/.test(value))\n        )\n      );\n\n    const country =\n"""
text = replace_once(text, old, new, "TMDB provider id parsing")

anchor = """    if (\n      body.providers_only &&\n      movieId\n    ) {\n"""
provider_catalog = """    if (\n      body.provider_catalog\n    ) {\n      const providerTypes =\n        requestedMediaType === 'all'\n          ? ['movie', 'tv']\n          : [mediaType];\n\n      const lists =\n        await Promise.all(\n          providerTypes.map(async (type) => {\n            const params =\n              new URLSearchParams({\n                api_key: apiKey,\n                language: 'en-GB',\n                watch_region: region,\n              });\n\n            try {\n              const response =\n                await fetch(\n                  `${TMDB_BASE}/watch/providers/${type}?${params.toString()}`,\n                  {\n                    headers: { Accept: 'application/json' },\n                  }\n                );\n\n              if (!response.ok) {\n                return [];\n              }\n\n              const data = await response.json();\n              return Array.isArray(data?.results)\n                ? data.results\n                : [];\n            } catch {\n              return [];\n            }\n          })\n        );\n\n      const providersById = new Map();\n\n      for (const provider of lists.flat()) {\n        const id = String(provider?.provider_id || '').trim();\n        if (!id) continue;\n\n        const priority = Number(\n          provider?.display_priorities?.[region] ??\n          provider?.display_priority ??\n          99999\n        );\n\n        const current = providersById.get(id);\n        if (current && Number(current.display_priority) <= priority) {\n          continue;\n        }\n\n        providersById.set(id, {\n          provider_id: provider?.provider_id || null,\n          provider_name: provider?.provider_name || 'Streaming service',\n          logo_url: provider?.logo_path\n            ? `${PROVIDER_LOGO_BASE}${provider.logo_path}`\n            : '',\n          display_priority: priority,\n        });\n      }\n\n      return Response.json({\n        providers: Array.from(providersById.values())\n          .sort((a, b) =>\n            Number(a.display_priority || 99999) -\n              Number(b.display_priority || 99999) ||\n            String(a.provider_name || '').localeCompare(\n              String(b.provider_name || '')\n            )\n          ),\n        region,\n      });\n    }\n\n""" + anchor
text = replace_once(text, anchor, provider_catalog, "TMDB provider catalog")

old = """    const hasFilters =\n      country ||\n      genre ||\n      year ||\n      language;\n"""
new = """    const hasFilters =\n      country ||\n      genre ||\n      year ||\n      language ||\n      providerIds.length > 0;\n"""
text = replace_once(text, old, new, "TMDB provider discover filter flag")

old = """          if (\n            language\n          ) {\n            params.set(\n              'with_original_language',\n              language\n            );\n          }\n\n          if (\n            mediaType ===\n            'movie'\n          ) {\n"""
new = """          if (\n            language\n          ) {\n            params.set(\n              'with_original_language',\n              language\n            );\n          }\n\n          if (\n            providerIds.length > 0\n          ) {\n            params.set(\n              'watch_region',\n              region\n            );\n            params.set(\n              'with_watch_providers',\n              providerIds.join('|')\n            );\n            params.set(\n              'with_watch_monetization_types',\n              'flatrate|free|ads'\n            );\n          }\n\n          if (\n            mediaType ===\n            'movie'\n          ) {\n"""
text = replace_once(text, old, new, "TMDB provider discover params")

old = """    const pages =\n      category ===\n      'movie_released_today'\n        ? 5\n        : query\n          ? 2\n          : 3;\n"""
new = """    const providerPageCount =\n      Math.max(\n        1,\n        Math.min(\n          10,\n          Number(body.provider_pages || 3) || 3\n        )\n      );\n\n    const pages =\n      providerIds.length > 0\n        ? providerPageCount\n        : category ===\n          'movie_released_today'\n          ? 5\n          : query\n            ? 2\n            : 3;\n"""
text = replace_once(text, old, new, "TMDB provider page count")
write(path, text)

# ---------------------------------------------------------------------------
# Home dashboard: mixed movie/TV rows for the main page.
# ---------------------------------------------------------------------------
path = "src/components/mg/HomeDashboard.jsx"
text = read(path)
text = replace_once(
    text,
    'import MediaRow from "@/components/mg/MediaRow";\n',
    'import MediaRow from "@/components/mg/MediaRow";\nimport StreamingServiceRows from "@/components/mg/StreamingServiceRows";\n',
    "Home streaming row import",
)
text = replace_once(
    text,
    "export default function HomeDashboard() {",
    "export default function HomeDashboard({ onOpenTvService }) {",
    "Home dashboard callback",
)
trending = '''        <MediaRow\n          title="Trending Now"\n          items={rows.trending}\n          onOpen={open}\n          onWatchlist={onWatchlist}\n          watched={watched}\n        />\n'''
trending_new = trending + '''\n        <StreamingServiceRows\n          mediaType="mixed"\n          heading="Movies & TV by Streaming Service"\n          maxServices={12}\n          rowLimit={18}\n          onOpen={open}\n          onWatchlist={onWatchlist}\n          watched={watched}\n          onBrowseAll={onOpenTvService}\n        />\n'''
text = replace_once(text, trending, trending_new, "Home streaming service rows")
write(path, text)

# ---------------------------------------------------------------------------
# TV Shows: rows plus full provider catalogue in the existing poster grid.
# ---------------------------------------------------------------------------
path = "src/components/mg/TvShowsView.jsx"
text = read(path)
text = replace_once(
    text,
    'import StreamingProviderLogos from "@/components/mg/StreamingProviderLogos";\n',
    'import StreamingProviderLogos from "@/components/mg/StreamingProviderLogos";\nimport StreamingServiceRows from "@/components/mg/StreamingServiceRows";\n',
    "TV streaming rows import",
)
text = replace_once(
    text,
    "export default function TvShowsView() {",
    "export default function TvShowsView({ initialProvider = null, providerRequestKey = 0, onProviderChange }) {",
    "TV provider props",
)
text = replace_once(
    text,
    "  const [selected, setSelected] = useState(null);\n  const debouncedQuery = useDebouncedValue(query, 400);\n",
    "  const [selected, setSelected] = useState(null);\n  const [activeProvider, setActiveProvider] = useState(null);\n  const debouncedQuery = useDebouncedValue(query, 400);\n  const activeProviderIds = Array.isArray(activeProvider?.providerIds)\n    ? activeProvider.providerIds\n    : [];\n  const activeProviderIdsKey = activeProviderIds.join(\"|\");\n\n  const chooseProvider = (service) => {\n    if (!service?.providerIds?.length) return;\n    setActiveProvider(service);\n    setQuery(\"\");\n    setCategory(\"tv_popular\");\n    setCountry(\"\");\n    setGenre(\"\");\n    setYear(\"\");\n    setLanguage(\"\");\n    onProviderChange?.(service);\n    window.setTimeout(() => window.scrollTo({ top: 0, behavior: \"smooth\" }), 0);\n  };\n\n  const clearProvider = () => {\n    setActiveProvider(null);\n    onProviderChange?.(null);\n  };\n\n  useEffect(() => {\n    if (!providerRequestKey) return;\n    if (initialProvider?.providerIds?.length) {\n      setActiveProvider(initialProvider);\n      setQuery(\"\");\n      setCategory(\"tv_popular\");\n      setCountry(\"\");\n      setGenre(\"\");\n      setYear(\"\");\n      setLanguage(\"\");\n    } else {\n      setActiveProvider(null);\n    }\n  }, [providerRequestKey, initialProvider]);\n",
    "TV provider state",
)

old = '''        const response = await base44.functions.invoke("getTmdbMovies", {\n          media_type: "tv",\n          category,\n          country,\n          genre,\n          year,\n          language,\n          query: String(debouncedQuery || "").trim(),\n        });\n'''
new = '''        const response = await base44.functions.invoke("getTmdbMovies", {\n          media_type: "tv",\n          category,\n          country,\n          genre,\n          year,\n          language,\n          query: String(debouncedQuery || "").trim(),\n          ...(activeProviderIds.length\n            ? {\n                provider_ids: activeProviderIds,\n                provider_pages: 10,\n                region: "GB",\n              }\n            : {}),\n        });\n'''
text = replace_once(text, old, new, "TV provider request")
text = replace_once(
    text,
    "  }, [country, category, genre, year, language, debouncedQuery]);",
    "  }, [country, category, genre, year, language, debouncedQuery, activeProviderIdsKey]);",
    "TV provider request dependencies",
)
text = replace_once(
    text,
    "    category === \"tv_airing_today\" &&\n    featured;",
    "    category === \"tv_airing_today\" &&\n    !activeProvider &&\n    featured;",
    "TV featured provider guard",
)
text = replace_once(
    text,
    '''            TV SHOWS\n''',
    '''            {activeProvider ? `TV SHOWS — ${activeProvider.label}` : "TV SHOWS"}\n''',
    "TV provider heading",
)

category_anchor = '''        <div\n          data-mg-tv-category-row="true"\n          className="flex gap-2 3xl:gap-3 overflow-x-auto scrollbar-hide pb-1"\n        >\n'''
provider_banner = '''        {activeProvider && (\n          <div\n            data-mg-active-streaming-provider="true"\n            className="flex flex-wrap items-center gap-3 rounded-xl border border-mg-green/30 bg-mg-green/10 p-3 3xl:p-4"\n          >\n            {activeProvider.logoUrl && (\n              <img\n                src={activeProvider.logoUrl}\n                alt=""\n                aria-hidden="true"\n                className="h-9 w-9 rounded-lg object-cover 3xl:h-11 3xl:w-11"\n              />\n            )}\n            <div className="min-w-0 flex-1">\n              <p className="text-sm font-bold text-white 3xl:text-base">\n                Browsing all TV on {activeProvider.label}\n              </p>\n              <p className="text-xs text-white/45 3xl:text-sm">\n                UK subscription, free and ad-supported availability. Your normal genre, year and language filters still work.\n              </p>\n            </div>\n            <button\n              type="button"\n              onClick={clearProvider}\n              className="min-h-10 rounded-full border border-white/15 bg-black/25 px-4 text-xs font-semibold text-white hover:bg-black/40 focus:outline-none focus:ring-2 focus:ring-mg-green/60 3xl:min-h-12 3xl:text-sm"\n            >\n              All TV Shows\n            </button>\n          </div>\n        )}\n\n''' + category_anchor
text = replace_once(text, category_anchor, provider_banner, "TV provider banner")
text = replace_once(
    text,
    "              onClick={() => setCategory(item.id)}",
    "              onClick={() => { clearProvider(); setCategory(item.id); }}",
    "TV category clears provider",
)
text = replace_once(
    text,
    "              onChange={(event) => setQuery(event.target.value)}",
    "              onChange={(event) => { const value = event.target.value; if (value && activeProvider) clearProvider(); setQuery(value); }}",
    "TV search clears provider",
)

controls_end = '''      </div>\n\n      {loading ? (\n'''
rows_insert = '''      </div>\n\n      {!activeProvider && !query && !country && !genre && !year && !language && (\n        <div className="mb-7 3xl:mb-10">\n          <StreamingServiceRows\n            mediaType="tv"\n            heading="TV by Streaming Service"\n            maxServices={20}\n            rowLimit={18}\n            onOpen={(item) => setSelected({ ...item, media_type: "tv", mediaType: "tv" })}\n            onBrowseAll={chooseProvider}\n          />\n        </div>\n      )}\n\n      {loading ? (\n'''
text = replace_once(text, controls_end, rows_insert, "TV service rows")
text = replace_once(
    text,
    '''          No shows found for these filters.\n''',
    '''          {activeProvider\n            ? `No TV shows found on ${activeProvider.label} for these filters.`\n            : "No shows found for these filters."}\n''',
    "TV provider empty state",
)
write(path, text)

# ---------------------------------------------------------------------------
# Home page navigation: See all TV jumps into the provider catalogue and Back
# returns to the normal TV section before leaving it.
# ---------------------------------------------------------------------------
path = "src/pages/Home.jsx"
text = read(path)
view_anchor = '''  const [\n    view,\n    setView,\n  ] = useState(\n    "home"\n  );\n\n'''
view_new = view_anchor + '''  const [\n    tvProviderRequest,\n    setTvProviderRequest,\n  ] = useState({\n    service: null,\n    key: 0,\n  });\n\n'''
text = replace_once(text, view_anchor, view_new, "Home TV provider navigation state")

normal_pages = '''        /*\n         * Normal application pages return Home.\n         */\n        if (\n          view !==\n          "home"\n        ) {\n'''
provider_back = '''        /*\n         * A streaming-service catalogue first returns to the normal TV page.\n         */\n        if (\n          view === "tv" &&\n          tvProviderRequest?.service\n        ) {\n          setTvProviderRequest((current) => ({\n            service: null,\n            key: Number(current?.key || 0) + 1,\n          }));\n\n          return true;\n        }\n\n''' + normal_pages
text = replace_once(text, normal_pages, provider_back, "Home TV provider back")
text = replace_once(
    text,
    '''        searchResult,\n        view,\n      ]\n''',
    '''        searchResult,\n        tvProviderRequest,\n        view,\n      ]\n''',
    "Home goBack provider dependency",
)

settings_anchor = '''  const openSettingsTool = useCallback((nextView) => {\n    setSearchOpen(false);\n    setSearchResult(null);\n    setLiveSearchRequest((current) => ({\n      query: "",\n      key: Number(current?.key || 0) + 1,\n    }));\n    setView(nextView);\n  }, []);\n\n'''
settings_new = settings_anchor + '''  const openTvStreamingService = useCallback((service) => {\n    if (!service?.providerIds?.length) return;\n    setSearchOpen(false);\n    setSearchResult(null);\n    setTvProviderRequest((current) => ({\n      service,\n      key: Number(current?.key || 0) + 1,\n    }));\n    setView("tv");\n  }, []);\n\n  const handleTvProviderChange = useCallback((service) => {\n    setTvProviderRequest((current) => ({\n      service: service || null,\n      key: Number(current?.key || 0) + 1,\n    }));\n  }, []);\n\n'''
text = replace_once(text, settings_anchor, settings_new, "Home TV provider callbacks")

text = replace_once(
    text,
    '''              setView(\n                nextView\n              );\n''',
    '''              if (nextView === "tv") {\n                setTvProviderRequest((current) => ({\n                  service: null,\n                  key: Number(current?.key || 0) + 1,\n                }));\n              }\n\n              setView(\n                nextView\n              );\n''',
    "Navbar resets TV provider",
)
text = replace_once(
    text,
    '''          {view ===\n            "home" && (\n            <HomeDashboard />\n          )}\n''',
    '''          {view ===\n            "home" && (\n            <HomeDashboard onOpenTvService={openTvStreamingService} />\n          )}\n''',
    "Home dashboard provider navigation",
)
text = replace_once(
    text,
    '''          {view ===\n            "tv" && (\n            <TvShowsView />\n          )}\n''',
    '''          {view ===\n            "tv" && (\n            <TvShowsView\n              initialProvider={tvProviderRequest.service}\n              providerRequestKey={tvProviderRequest.key}\n              onProviderChange={handleTvProviderChange}\n            />\n          )}\n''',
    "TV provider navigation props",
)
write(path, text)

# ---------------------------------------------------------------------------
# Regression markers.
# ---------------------------------------------------------------------------
path = "scripts/ui-regression-check.mjs"
text = read(path)
text = replace_once(
    text,
    'const movies = await read("src/components/mg/MoviesView.jsx");\n',
    'const movies = await read("src/components/mg/MoviesView.jsx");\nconst tvShows = await read("src/components/mg/TvShowsView.jsx");\nconst homeDashboard = await read("src/components/mg/HomeDashboard.jsx");\nconst streamingServiceRows = await read("src/components/mg/StreamingServiceRows.jsx");\nconst streamingServices = await read("src/components/mg/streamingServices.js");\nconst tmdbBackend = await read("base44/functions/getTmdbMovies/entry.ts");\n',
    "Streaming regression reads",
)
regression_anchor = '''expect(\n  roadmap.includes("onClick={() => onBack?.()}"),\n  "Roadmap back button is not interactive"\n);\n\n'''
regression_new = regression_anchor + '''expect(\n  homeDashboard.includes("StreamingServiceRows") &&\n    homeDashboard.includes('mediaType="mixed"') &&\n    homeDashboard.includes("onOpenTvService"),\n  "Home streaming-service rows are missing"\n);\nexpect(\n  tvShows.includes("StreamingServiceRows") &&\n    tvShows.includes("activeProvider") &&\n    tvShows.includes("provider_pages: 10") &&\n    tvShows.includes("TV by Streaming Service"),\n  "TV streaming-service rows or full provider catalogue are missing"\n);\nexpect(\n  streamingServiceRows.includes("provider_catalog") &&\n    streamingServiceRows.includes("provider_ids") &&\n    streamingServiceRows.includes("See all TV"),\n  "Streaming-service row loader is incomplete"\n);\nexpect(\n  streamingServices.includes("Netflix") &&\n    streamingServices.includes("Prime Video") &&\n    streamingServices.includes("BBC iPlayer") &&\n    streamingServices.includes("ITVX") &&\n    streamingServices.includes("Channel 4"),\n  "Major UK streaming services are missing from the provider catalogue"\n);\nexpect(\n  tmdbBackend.includes("provider_catalog") &&\n    tmdbBackend.includes("with_watch_providers") &&\n    tmdbBackend.includes("with_watch_monetization_types") &&\n    tmdbBackend.includes("watch_region"),\n  "TMDB provider discovery support is missing"\n);\nexpect(\n  home.includes("tvProviderRequest") &&\n    home.includes("openTvStreamingService") &&\n    home.includes("handleTvProviderChange"),\n  "Streaming-service navigation between Home and TV is missing"\n);\n\n'''
text = replace_once(text, regression_anchor, regression_new, "Streaming regression checks")
write(path, text)

print("Streaming-service rows upgrade applied.")
