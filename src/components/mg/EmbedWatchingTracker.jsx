import { useEffect } from 'react';
import { profiledLibrary, activeHouseholdProfileId } from './householdProfiles';
import { embedHistoryEntry, saveEmbedBookmark, EMBED_HISTORY_CHANGED } from './embedWatchingHistory';

export default function EmbedWatchingTracker({ media, embed }) {
  useEffect(() => {
    if (!embed) return undefined;
    const profileId = activeHouseholdProfileId();
    let writes = Promise.resolve();
    let lastUrl = '';
    const record = (frame) => {
      const url = frame?.src || embed.url;
      if (!url || lastUrl === url) return;
      lastUrl = url;
      const entry = embedHistoryEntry(media, { ...embed, url });
      writes = writes.catch(() => {}).then(async () => {
        if (activeHouseholdProfileId() !== profileId) return;
        await saveEmbedBookmark(profiledLibrary.ContinueWatching, entry);
        window.dispatchEvent(new CustomEvent(EMBED_HISTORY_CHANGED));
      }).catch(() => { lastUrl = ''; });
    };
    // Capture iframe loads, including manual provider changes. These are
    // bookmarks of an opened player; load is not treated as proof of playback.
    const onLoad = (event) => {
      const frame = event.target;
      if (frame?.tagName !== 'IFRAME') return;
      if (frame.matches('[data-mg-embed-iframe="true"]') || frame.src === embed.url) record(frame);
    };
    document.addEventListener('load', onLoad, true);
    record(document.querySelector('[data-mg-embed-iframe="true"]'));
    return () => document.removeEventListener('load', onLoad, true);
  }, [media, embed]);
  return null;
}
