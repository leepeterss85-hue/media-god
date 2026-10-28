/* Shared in-memory movie-addon availability checks across Home and Search.
 * No playback URLs, credentials or personal history are retained here.
 */
import { base44 } from '@/api/base44Client';
import { createCatalogueSourceChecker } from './catalogueSourceAvailability.js';

export const catalogueSourceChecker = createCatalogueSourceChecker(
  (name, payload) => base44.functions.invoke(name, payload)
);

export const showBrowseTitleWithSourceEvidence = item =>
  catalogueSourceChecker.getStatus(item) !== 'no-sources';
