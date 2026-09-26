import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_UX_PREFERENCES,
  moveHomeSection,
  normaliseUxPreferences,
  setHomeSectionVisible,
} from "../src/components/mg/uxPreferences.js";
import { sanitizeDiagnosticText } from "../src/components/mg/diagnostics.js";
import { movedOrder } from "../src/components/mg/liveTvPersonalisation.js";

test("remembered guest mode can skip account creation without weakening account-only endpoints", () => {
  const authSource = readFileSync(
    new URL("../src/lib/AuthContext.jsx", import.meta.url),
    "utf8"
  );
  const routeSource = readFileSync(
    new URL("../src/components/ProtectedRoute.jsx", import.meta.url),
    "utf8"
  );
  const registerSource = readFileSync(
    new URL("../src/pages/Register.jsx", import.meta.url),
    "utf8"
  );
  const loginSource = readFileSync(
    new URL("../src/pages/Login.jsx", import.meta.url),
    "utf8"
  );
  const settingsSource = readFileSync(
    new URL("../src/components/mg/SettingsView.jsx", import.meta.url),
    "utf8"
  );
  const catalogSource = readFileSync(
    new URL("../base44/functions/getTmdbMovies/entry.ts", import.meta.url),
    "utf8"
  );
  const imdbSource = readFileSync(
    new URL("../base44/functions/resolveImdb/entry.ts", import.meta.url),
    "utf8"
  );
  const xtreamSource = readFileSync(
    new URL("../base44/functions/xtreamPortal/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(authSource, /GUEST_MODE_KEY = 'mg_guest_mode'/);
  assert.match(authSource, /window\.localStorage\.setItem\(GUEST_MODE_KEY, '1'\)/);
  assert.match(authSource, /const continueAsGuest = \(\) =>/);
  assert.match(routeSource, /!isAuthenticated && !isGuest/);
  assert.match(registerSource, /Skip for now/);
  assert.match(loginSource, /Skip for now/);
  assert.match(settingsSource, /Using Media God without an account/);
  assert.doesNotMatch(catalogSource, /base44\.auth\.me\(\)/);
  assert.doesNotMatch(imdbSource, /base44\.auth\.me\(\)/);

  // Private-account integrations stay authenticated; guest mode is not a
  // blanket bypass around credentials or user-scoped services.
  assert.match(xtreamSource, /base44\.auth\.me\(\)/);
});

test("movie, show and episode reviews use a public 1-to-5 star auto-publish model", () => {
  const schema = readFileSync(
    new URL("../base44/entities/MediaReview.jsonc", import.meta.url),
    "utf8"
  );
  const reviews = readFileSync(
    new URL("../src/components/mg/MediaReviews.jsx", import.meta.url),
    "utf8"
  );
  const details = readFileSync(
    new URL("../src/components/mg/DetailModal.jsx", import.meta.url),
    "utf8"
  );
  const episodes = readFileSync(
    new URL("../src/components/mg/EpisodeSelector.jsx", import.meta.url),
    "utf8"
  );

  assert.match(schema, /"read"\s*:\s*\{\s*\}/);
  assert.deepEqual(JSON.parse(schema).properties.media_type.enum, ["movie", "tv", "episode"]);
  assert.match(schema, /"enum"\s*:\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*\]/);
  for (const operation of ["create", "update", "delete"]) {
    assert.match(
      schema,
      new RegExp(
        `"${operation}"\\s*:\\s*\\{[\\s\\S]*?"created_by_id"\\s*:\\s*"\\{\\{user\\.id\\}\\}"`
      )
    );
  }

  assert.match(reviews, /STAR_VALUES = \[1, 2, 3, 4, 5\]/);
  assert.match(reviews, /MAX_REVIEW_LENGTH = 1500/);
  assert.match(reviews, /published:\s*true/);
  assert.match(reviews, /Reviews publish immediately\./);
  assert.match(reviews, /displayNameFor\(user\)/);
  assert.doesNotMatch(
    reviews,
    /user\?\.email\s*\|\|\s*"Media God user"/
  );
  assert.match(reviews, /mediaType === "tv" \? "tv" : "movie"/);
  assert.match(details, /<MediaReviews[\s\S]{0,180}?mediaType=\{resolvedMediaType\}/);
  assert.match(details, /activeTab === "reviews" && <div>[\s\S]{0,80}?<MediaReviews/);
  assert.match(details, /hidden=\{activeTab !== "episodes"\}/);
  assert.match(episodes, /<MediaReviews[\s\S]{0,260}?mediaType="episode"/);
  assert.match(episodes, />\s*Review\s*<\/button>/);
});

test("related movie and TV cards use exact TMDB recommendation links and open details", () => {
  const backend = readFileSync(
    new URL("../base44/functions/getTmdbMovies/entry.ts", import.meta.url),
    "utf8"
  );
  const detail = readFileSync(
    new URL("../src/components/mg/DetailModal.jsx", import.meta.url),
    "utf8"
  );
  const row = readFileSync(
    new URL("../src/components/mg/MediaRow.jsx", import.meta.url),
    "utf8"
  );
  const card = readFileSync(
    new URL("../src/components/mg/MediaCard.jsx", import.meta.url),
    "utf8"
  );
  const home = readFileSync(
    new URL("../src/components/mg/HomeDashboard.jsx", import.meta.url),
    "utf8"
  );

  assert.match(backend, /\/recommendations\?/);
  assert.match(backend, /\/similar\?/);
  assert.match(backend, /mapItem\([\s\S]{0,120}?mediaType/);
  assert.match(backend, /related,[\s\S]{0,80}?\}\);/);

  assert.match(detail, /data-mg-related-titles="true"/);
  assert.match(detail, /data-mg-detail-tabs="true"/);
  for (const tab of ["overview", "reviews", "related", "cast", "watch"]) {
    assert.match(detail, new RegExp(`id: "${tab}"`));
  }
  assert.match(detail, /Related to \$\{displayTitle\}/);
  assert.match(detail, /<MediaRow[\s\S]{0,120}?embedded[\s\S]{0,120}?detailsOnly/);
  assert.match(detail, /onOpen=\{[\s\S]{0,80}?onSelectRelated/);
  assert.match(backend, /\/person\/\$\{personId\}\/combined_credits\?/);
  assert.match(detail, /data-mg-actor-credits="true"/);
  assert.match(detail, /person_id: selectedActor\.id/);

  assert.match(row, /detailsOnly=\{detailsOnly\}/);
  assert.match(card, /detailsOnly \|\| isFireTvRuntime\(\) \|\| mediaType === "tv"/);

  assert.match(home, /linkedRecommendations/);
  assert.match(home, /payload\?\.related/);
  assert.match(home, /\.\.\.linked,[\s\S]{0,120}?\.\.\.rankedFallback/);
  assert.match(home, /Because You Watched \$\{recommendationSeed\.title\}/);
});

test("Real-Debrid 8-digit device linking works for guests in Addons and Settings", () => {
  const addons = readFileSync(
    new URL("../src/components/mg/AddonsView.jsx", import.meta.url),
    "utf8"
  );
  const settings = readFileSync(
    new URL("../src/components/mg/SettingsView.jsx", import.meta.url),
    "utf8"
  );
  const settingsTools = readFileSync(
    new URL("../src/components/mg/SettingsTools.jsx", import.meta.url),
    "utf8"
  );
  const connector = readFileSync(
    new URL("../src/components/mg/RealDebridDeviceConnect.jsx", import.meta.url),
    "utf8"
  );
  const client = readFileSync(
    new URL("../src/api/base44Client.js", import.meta.url),
    "utf8"
  );
  const deviceHelper = readFileSync(
    new URL("../src/components/mg/guestDebridDevice.js", import.meta.url),
    "utf8"
  );
  const backend = readFileSync(
    new URL("../base44/functions/realDebridAuth/entry.ts", import.meta.url),
    "utf8"
  );
  const realDebrid = readFileSync(
    new URL("../base44/functions/realDebrid/entry.ts", import.meta.url),
    "utf8"
  );
  const multiDebrid = readFileSync(
    new URL("../base44/functions/multiDebrid/entry.ts", import.meta.url),
    "utf8"
  );
  const guestSchema = readFileSync(
    new URL("../base44/entities/GuestDebridCredential.jsonc", import.meta.url),
    "utf8"
  );

  assert.match(addons, /<RealDebridDeviceConnect compact \/>/);
  assert.match(settingsTools, /id: "real-debrid"/);
  assert.match(settingsTools, /Link Real-Debrid with the 8-digit device code/);
  assert.match(settingsTools, /mg-real-debrid-device-login/);
  assert.match(settings, /id="mg-real-debrid-device-login"/);
  assert.match(settings, /Get 8-digit Real-Debrid code/);
  assert.match(settings, /No Media God sign-in is required/);

  assert.match(connector, /Real-Debrid 8-digit device login/);
  assert.match(connector, /action:\s*"start_device"/);
  assert.match(connector, /action:\s*"poll_device"/);
  assert.match(connector, /deviceFlow\.user_code/);
  assert.match(connector, /https:\/\/real-debrid\.com\/device/);
  assert.match(connector, /Media God checks automatically/);
  assert.match(connector, /without signing in to Media God/);
  assert.doesNotMatch(connector, /Sign in to connect Real-Debrid/);

  assert.match(deviceHelper, /mg:guest-real-debrid-device-key:v1/);
  assert.match(deviceHelper, /crypto\.getRandomValues/);
  assert.match(client, /DEVICE_SCOPED_DEBRID_FUNCTIONS/);
  assert.match(client, /withGuestDebridPayload\(payload\)/);

  assert.match(guestSchema, /"device_key_hash"/);
  assert.match(guestSchema, /"role": "__disabled__"/);
  assert.match(backend, /loadGuestDebridCredential/);
  assert.match(backend, /guest_device_key/);
  assert.match(backend, /action ===\s*"start_device"/);
  assert.match(backend, /action ===\s*"poll_device"/);
  assert.match(backend, /saveGuestDebridCredential/);
  assert.match(backend, /user_code:/);
  assert.match(backend, /rd_token:/);
  assert.match(realDebrid, /GuestRdLink/);
  assert.match(realDebrid, /guest_device_key/);
  assert.match(multiDebrid, /guest_device_key/);
});

test("UX preferences normalise unknown values and preserve every known Home row", () => {
  const value = normaliseUxPreferences({
    textScale: "huge",
    homeOrder: ["favorites", "favorites", "unknown"],
    homeHidden: ["trending", "unknown"],
  });

  assert.equal(value.textScale, "standard");
  assert.equal(value.homeOrder[0], "favorites");
  assert.equal(new Set(value.homeOrder).size, DEFAULT_UX_PREFERENCES.homeOrder.length);
  assert.deepEqual(value.homeHidden, ["trending"]);
});

test("Home-row movement and visibility helpers are stable and reversible", () => {
  const base = normaliseUxPreferences(DEFAULT_UX_PREFERENCES);
  const moved = moveHomeSection(base, "favorites", "up");
  assert.notDeepEqual(moved.homeOrder, base.homeOrder);

  const hidden = setHomeSectionVisible(moved, "favorites", false);
  assert.equal(hidden.homeHidden.includes("favorites"), true);

  const shown = setHomeSectionVisible(hidden, "favorites", true);
  assert.equal(shown.homeHidden.includes("favorites"), false);
});

test("diagnostic sanitizer removes URLs, magnets and credential-like values", () => {
  const raw =
    "failed https://example.test/private?q=secret magnet:?xt=urn:btih:abc token=123 password=hunter2 Bearer abc.def";
  const safe = sanitizeDiagnosticText(raw);

  assert.match(safe, /\[url\]/);
  assert.match(safe, /\[magnet\]/);
  assert.match(safe, /token=\[redacted\]/i);
  assert.match(safe, /password=\[redacted\]/i);
  assert.match(safe, /Bearer \[redacted\]/);
  assert.doesNotMatch(safe, /hunter2|example\.test|btih:abc|abc\.def/);
});

test("saved addon profiles are owner-scoped at the Base44 entity layer", () => {
  const schema = readFileSync(
    new URL("../base44/entities/Addon.jsonc", import.meta.url),
    "utf8"
  );

  for (const operation of ["read", "create", "update", "delete"]) {
    assert.match(
      schema,
      new RegExp(
        `"${operation}"\\s*:\\s*\\{[\\s\\S]*?"created_by_id"\\s*:\\s*"\\{\\{user\\.id\\}\\}"`
      )
    );
  }
});

test("addon backend blocks unsafe network targets, redirects and oversized JSON", () => {
  const source = readFileSync(
    new URL("../base44/functions/fetchAddonStreams/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /Addon requests must use HTTPS/);
  assert.match(source, /local or private network addresses are blocked/);
  assert.match(source, /redirect:\s*"manual"/);
  assert.match(source, /ADDON_REDIRECT_LIMIT/);
  assert.match(source, /ADDON_RESPONSE_LIMIT_BYTES/);
  assert.match(source, /response exceeded the safety size limit/i);
});

test("Live TV manual ordering is stable and reversible", () => {
  const base = ["a", "b", "c"];
  const movedDown = movedOrder([], base, "a", "down");
  assert.deepEqual(movedDown.slice(0, 3), ["b", "a", "c"]);

  const movedBack = movedOrder(movedDown, base, "a", "up");
  assert.deepEqual(movedBack.slice(0, 3), ["a", "b", "c"]);
});

test("Xtream backend requires authenticated use and blocks local/private targets", () => {
  const source = readFileSync(
    new URL("../base44/functions/xtreamPortal/entry.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /base44\.auth\.me\(\)/);
  assert.match(source, /public internet address/);
  assert.match(source, /resolveDns/);
  assert.match(source, /redirect:\s*"manual"/);
  assert.match(source, /MAX_RESPONSE_BYTES/);
  assert.match(source, /get_live_streams/);
});

test("custom Live TV and Xtream rows are merged into the catalogue", () => {
  const source = readFileSync(
    new URL("../src/components/mg/freeTvPlaylist.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /readCustomLiveSources/);
  assert.match(source, /customDirectSources/);
  assert.match(source, /customXtreamSources/);
  assert.match(source, /xtreamPortal/);
});

test("Sky Sport Now account fields are declared in the User schema", () => {
  const schema = readFileSync(
    new URL("../base44/entities/User.jsonc", import.meta.url),
    "utf8"
  );

  for (const field of [
    "ssn_auth_token",
    "ssn_refresh_token",
    "ssn_token_expires_at",
    "ssn_connected_at",
  ]) {
    assert.match(schema, new RegExp(`"${field}"\\s*:`));
  }
});
