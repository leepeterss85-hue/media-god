/* Shared in-memory movie-addon availability checks across Home and Search.
 * No playback URLs, credentials or personal history are retained here.
 */
import { base44 } from '@/api/base44Client';
import { createCatalogueSourceChecker } from './catalogueSourceAvailability.js';
import { isLowCapacityTvDevice } from './deviceCapacity.js';
import { isFireTvRuntime } from './runtimePlatform.js';

export const catalogueSourceChecker = createCatalogueSourceChecker(
  (name, payload) => base44.functions.invoke(name, payload),
  // A low-RAM Android TV WebView may have hundreds of poster cards mounted.
  // These are optional *browse hints*, never active playback sources.
  isLowCapacityTvDevice()
    ? { maxStatusEntries: 48, maxWaitingChecks: 24 }
    : {}
);

export const showBrowseTitleWithSourceEvidence = item =>
  // Addon-only checks cannot verify web scrapers, and transient gateway
  // failures must not make titles vanish from an Android TV catalogue.
  // Keep the established non-TV catalogue behaviour unchanged.
  isFireTvRuntime() || catalogueSourceChecker.getStatus(item) !== 'no-sources';