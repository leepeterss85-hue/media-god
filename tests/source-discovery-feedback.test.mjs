import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalImdbLookupFields,
  emptyPlaybackSourceMessage,
  sourceLookupFailed,
} from "../src/components/mg/sourceDiscoveryFeedback.js";

test("episode IMDb lookup uses the show's name and year", () => {
  assert.deepEqual(
    canonicalImdbLookupFields({
      title: "Law & Order: Special Victims Unit — S01E08",
      year: "2000",
      rdTitle: "Law & Order: Special Victims Unit",
      rdYear: "1999",
    }),
    { title: "Law & Order: Special Victims Unit", year: "1999" }
  );
  assert.deepEqual(
    canonicalImdbLookupFields({ title: "The Matrix", year: "1999" }),
    { title: "The Matrix", year: "1999" }
  );
});

test("blocked addon lookup is reported as failed only when no stream was returned", () => {
  const blocked = { diagnostics: [{ name: "Torrentio", status: "http_403" }], streams: [] };
  assert.equal(sourceLookupFailed(blocked), true);
  assert.equal(sourceLookupFailed({ ...blocked, streams: [{ url: "https://example.org/video" }] }), false);
  assert.equal(sourceLookupFailed({ streams: [], diagnostics: [{ status: "ok" }] }), false);
});

test("empty player explains the blocked addon and connection state", () => {
  const diagnostics = {
    imdbStatus: "FAILED",
    diagnostics: [{ name: "Torrentio", status: "http_403" }],
  };
  assert.match(emptyPlaybackSourceMessage({ ...diagnostics, rdConnected: true }), /HTTP 403.*Real-Debrid is connected/);
  assert.doesNotMatch(emptyPlaybackSourceMessage(diagnostics), /Real-Debrid is connected/);
  assert.match(emptyPlaybackSourceMessage({ imdbStatus: "FAILED" }), /could not identify this title/);
});

test("both playback entry points use canonical show identity and the player ends an empty search", () => {
  const provider = readFileSync(
    new URL("../src/components/mg/MediaPlayerProvider.jsx", import.meta.url), "utf8"
  );
  const player = readFileSync(
    new URL("../src/components/mg/VideoPlayer.jsx", import.meta.url), "utf8"
  );
  const tmdbDetails = readFileSync(
    new URL("../base44/functions/getTmdbMovies/entry.ts", import.meta.url), "utf8"
  );

  assert.equal((provider.match(/\.\.\.canonicalImdbLookupFields\(request\)/g) || []).length, 2);
  assert.match(tmdbDetails, /details\.imdb_id = validImdbId\(idData\?\.imdb_id\)/);
  assert.match(player, /Boolean\(source\?\.sourceDiagnostics\?\.diagnosticLabel\)/);
  assert.match(player, /noPlayableVodSources \? \([\s\S]*?No video sources found/);
});
