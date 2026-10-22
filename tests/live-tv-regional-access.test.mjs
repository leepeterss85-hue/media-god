import test from "node:test";
import assert from "node:assert/strict";

import {
  inferStreamingRegion,
  normaliseStreamingRegion,
} from "../src/components/mg/streamingRegion.js";
import {
  classifyLiveTvAccessIssue,
  liveTvGeoPreferenceTier,
} from "../src/components/mg/liveTvRegionalAccess.js";

test("UK/GB aliases normalise consistently without inventing a location", () => {
  assert.equal(normaliseStreamingRegion("uk"), "GB");
  assert.equal(normaliseStreamingRegion("GBR"), "GB");
  assert.equal(normaliseStreamingRegion("usa"), "US");
  assert.equal(normaliseStreamingRegion("gb"), "GB");
  assert.equal(normaliseStreamingRegion("not a country"), "");
});

test("a UK time zone corrects en-US locale defaults on UK devices", () => {
  assert.deepEqual(
    inferStreamingRegion({ timezone: "Europe/London", locales: ["en-US"] }),
    { region: "GB", source: "timezone" },
  );
  assert.deepEqual(
    inferStreamingRegion({ timezone: "Europe/Belfast", locales: ["en-US"] }),
    { region: "GB", source: "timezone" },
  );
  assert.deepEqual(
    inferStreamingRegion({ timezone: "America/Toronto", locales: ["en-GB"] }),
    { region: "GB", source: "locale" },
  );
});

test("a deliberate country choice wins over device hints", () => {
  assert.deepEqual(
    inferStreamingRegion({
      override: "US",
      timezone: "Europe/London",
      locales: ["en-GB"],
    }),
    { region: "US", source: "manual" },
  );
  assert.deepEqual(
    inferStreamingRegion({ timezone: "Etc/UTC", locales: [] }),
    { region: "US", source: "default" },
  );
});

test("unmarked feeds stay first, matching-region marked feeds outrank other marked feeds", () => {
  assert.equal(liveTvGeoPreferenceTier({ geoRestricted: false, country: "FR" }, "GB"), 0);
  assert.equal(liveTvGeoPreferenceTier({ geoRestricted: true, country: "UK" }, "GB"), 1);
  assert.equal(liveTvGeoPreferenceTier({ geoRestricted: true, country: "US" }, "GB"), 2);
  assert.equal(liveTvGeoPreferenceTier({ geoRestricted: true }, "GB"), 2);
});

test("regional blocking is not inferred from a generic HTTP 403", () => {
  assert.equal(classifyLiveTvAccessIssue({ status: 451 }).reason, "region");
  assert.equal(classifyLiveTvAccessIssue({ status: 403 }).reason, "access");
  assert.equal(classifyLiveTvAccessIssue({ message: "Not available in your country" }).reason, "region");
  assert.equal(classifyLiveTvAccessIssue({ status: 404 }).reason, "missing");
  assert.equal(classifyLiveTvAccessIssue({ message: "MEDIA_ERR_SRC_NOT_SUPPORTED" }).reason, "format");
  assert.equal(classifyLiveTvAccessIssue({ message: "Network error" }).reason, "network");
  assert.equal(classifyLiveTvAccessIssue({ message: "Something failed" }).reason, "unknown");
});
