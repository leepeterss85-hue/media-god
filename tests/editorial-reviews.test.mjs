import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  selectGuardianReviews,
  selectNytReviews,
} from "../base44/functions/getEditorialReviews/editorialReviewMatch.mjs";

test("publisher results require the exact title, release window, and publisher URL", () => {
  const titles = ["Bad Apples"];
  const rows = [
    {
      display_title: "Bad Apple",
      opening_date: "2025-01-01",
      headline: "Another film",
      link: { url: "https://www.nytimes.com/2025/01/01/movies/bad-apple.html" },
    },
    {
      display_title: "Bad Apples",
      opening_date: "2025-01-01",
      headline: "Bad Apples review",
      summary_short: "An attributed review of the film.",
      link: { url: "https://www.nytimes.com/2025/01/01/movies/bad-apples.html" },
    },
    {
      display_title: "Bad Apples",
      opening_date: "2025-01-01",
      headline: "Fake publisher",
      link: { url: "https://nytimes.com.evil.test/review" },
    },
    {
      display_title: "Bad Apples",
      opening_date: "2013-01-01",
      headline: "Different release",
      link: { url: "https://www.nytimes.com/2013/01/01/movies/review.html" },
    },
  ];
  assert.deepEqual(selectNytReviews(rows, titles, 2025).map((r) => r.headline), ["Bad Apples review"]);
});

test("TV review matching allows later seasons but rejects unrelated headlines", () => {
  const rows = [
    {
      id: "tv/2026/the-bear-review",
      webTitle: "The Bear review – a later season",
      webPublicationDate: "2026-06-01T10:00:00Z",
      webUrl: "https://www.theguardian.com/tv-and-radio/2026/jun/01/the-bear-review",
      fields: { trailText: "<p>Strong performances &amp; sharp writing.</p>" },
    },
    {
      id: "tv/2026/bear-review",
      webTitle: "Bear review – another programme",
      webPublicationDate: "2026-06-01T10:00:00Z",
      webUrl: "https://www.theguardian.com/tv-and-radio/2026/jun/01/bear-review",
    },
    {
      id: "tv/2025/the-bear-series-three-review",
      webTitle: "The Bear series three review – a later season",
      webPublicationDate: "2025-06-01T10:00:00Z",
      webUrl: "https://www.theguardian.com/tv-and-radio/2025/jun/01/the-bear-series-three-review",
    },
    {
      id: "tv/2026/the-bear-feature",
      webTitle: "The Bear: what to watch next",
      webPublicationDate: "2026-06-01T10:00:00Z",
      webUrl: "https://www.theguardian.com/tv-and-radio/2026/jun/01/the-bear-feature",
    },
  ];
  const found = selectGuardianReviews(rows, ["The Bear"], 2022, true);
  assert.equal(found.length, 2);
  assert.equal(found[0].publisher, "The Guardian");
  assert.equal(found[0].excerpt, "Strong performances & sharp writing.");
  assert.equal(selectGuardianReviews(rows, ["The Bear"], 2022, false).length, 0);
});

let handler;
const bundle = await build({
  entryPoints: ["base44/functions/getEditorialReviews/entry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [{
    name: "test-runtime",
    setup(plugin) {
      plugin.onResolve({ filter: /^base44:runtime$/ }, () => ({
        path: "runtime", namespace: "test",
      }));
      plugin.onLoad({ filter: /^runtime$/, namespace: "test" }, () => ({
        contents: "export const secrets = globalThis.__reviewSecrets;",
        loader: "js",
      }));
    },
  }],
});
globalThis.Deno = { serve(callback) { handler = callback; } };
globalThis.__reviewSecrets = { get(name) {
  return {
    TMDB_API_KEY: "tmdb-test",
    NYT_MOVIE_REVIEWS_API_KEY: "nyt-test",
    GUARDIAN_CONTENT_API_KEY: "guardian-test",
  }[name];
} };
await import(`data:text/javascript,${encodeURIComponent(bundle.outputFiles[0].text)}`);

test("the endpoint verifies TMDB identity and returns only matched publisher reviews", async () => {
  const oldFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requested.push(url);
    const data = url.hostname === "api.themoviedb.org"
      ? { title: "Bad Apples", original_title: "Bad Apples", release_date: "2025-09-01" }
      : url.hostname === "api.nytimes.com"
        ? { results: [
            { display_title: "Bad Apples", opening_date: "2025-09-01", publication_date: "2025-09-02", headline: "A real review", link: { url: "https://www.nytimes.com/2025/09/02/movies/bad-apples-review.html" } },
            { display_title: "Bad Apple", opening_date: "2025-09-01", headline: "Wrong title", link: { url: "https://www.nytimes.com/2025/09/02/movies/bad-apple-review.html" } },
          ] }
        : { response: { results: [
            { id: "film/2025/bad-apples-review", webTitle: "Bad Apples review – a film", webPublicationDate: "2025-09-02T00:00:00Z", webUrl: "https://www.theguardian.com/film/2025/sep/02/bad-apples-review", fields: { trailText: "Film review." } },
          ] } };
    return new Response(JSON.stringify(data), { status: 200 });
  };

  try {
    const request = new Request("https://app.example.test/getEditorialReviews", {
      method: "POST",
      body: JSON.stringify({ tmdb_id: 1198654, media_type: "movie", title: "Fake title" }),
    });
    const response = await handler(request);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(data.reviews.map((row) => row.publisher), ["The New York Times", "The Guardian"]);
    assert.equal(requested[0].pathname, "/3/movie/1198654");
    assert.equal(requested[1].searchParams.get("query"), "Bad Apples");
    assert.ok(!JSON.stringify(data).includes("nyt-test"));
  } finally {
    globalThis.fetch = oldFetch;
  }
});
