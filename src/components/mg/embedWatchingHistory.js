// Embedded providers do not reliably expose their playhead. Save a bookmark,
// not an invented playback time, so leaving their player never loses the title.
export const EMBED_HISTORY_CHANGED = 'mg:continue-watching-saved';
export function embedHistoryEntry(media, embed) {
  const mediaType = media?.mediaType === 'tv' || media?.type === 'series' ? 'tv' : 'movie';
  if (!media?.title || media?.mediaType === 'live' || media?.type === 'live') return null;
  let url;
  try {
    url = new URL(embed?.url);
    if (url.protocol !== 'https:') return null;
  } catch { return null; }
  const title = String(media.rdTitle || media.title).replace(/\s+[—-]\s+S\d{1,2}E\d{1,3}.*$/i, '').trim();
  const year = String(media.rdYear || media.year || '');
  const season = media.season ?? media.rdSeason ?? '';
  const episode = media.episode ?? media.rdEpisode ?? '';
  return {
    content_key: ['mg2', media.tmdbId ?? media.tmdb_id ?? media.id ?? '', mediaType,
      year, season, episode, encodeURIComponent(title)].join('|'),
    title, year, poster_url: media.poster || media.poster_url || '',
    episode_name: media.episodeName || '',
    source_type: 'embed', progress: 0, duration: 0,
    video_url: `mgembed:${encodeURIComponent(JSON.stringify({ url: url.href, provider: embed.provider || 'vidsrc' }))}`,
  };
}
export function readEmbedBookmark(row) {
  if (row?.source_type !== 'embed' || !row?.video_url?.startsWith('mgembed:')) return null;
  try {
    const saved = JSON.parse(decodeURIComponent(row.video_url.slice(8)));
    return new URL(saved.url).protocol === 'https:' ? saved : null;
  } catch { return null; }
}
export async function saveEmbedBookmark(entity, entry) {
  if (!entry) return;
  const rows = await entity.filter({ content_key: entry.content_key });
  if (rows?.length) {
    // A real playhead and its source always win over an unmeasured bookmark.
    const row = rows[0];
    const patch = Number(row.progress) > 0
      ? { title: entry.title, poster_url: entry.poster_url || row.poster_url }
      : entry;
    return entity.update(row.id, patch);
  }
  return entity.create(entry);
}
