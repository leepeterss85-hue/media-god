import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { needsFireTvScraperRecovery, initialFireTvScraper } from '../src/components/mg/fireTvScraperRecovery.js';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const failedEmbed = 'https://share.cdnm.ink/embed/tmdb/550';

test('Fire TV movie Play recovers from the obsolete direct OnlyFlix embed', () => {
  assert.equal(needsFireTvScraperRecovery({nativeFireTv:true,url:failedEmbed,mediaType:'movie'}), true);
  assert.equal(needsFireTvScraperRecovery({nativeFireTv:true,url:'https://share.cdnm.ink/embed/imdb/tt0137523',mediaType:'movie'}),true);
  assert.equal(needsFireTvScraperRecovery({nativeFireTv:true,url:'https://share.cdnm.ink/embed/tmdb/1399?season=2&episode=4',mediaType:'tv'}),true);
});

test('Phone, browser, Live TV and alternate scraper tabs never take this fallback', () => {
  assert.equal(needsFireTvScraperRecovery({nativeFireTv:false,url:failedEmbed,mediaType:'movie'}), false);
  assert.equal(needsFireTvScraperRecovery({nativeFireTv:true,url:failedEmbed,mediaType:'live'}), false);
  assert.equal(needsFireTvScraperRecovery({nativeFireTv:true,url:'https://vidlink.pro/movie/550',mediaType:'movie'}), false);
  assert.equal(needsFireTvScraperRecovery({nativeFireTv:true,url:'https://share.cdnm.ink.evil.test/embed/tmdb/550',mediaType:'movie'}), false);
  assert.equal(needsFireTvScraperRecovery({nativeFireTv:true,url:'javascript:alert(1)',mediaType:'tv'}), false);
});

test('Fire TV starts another WEB SCRAPER, not torrent discovery, when direct OnlyFlix is broken', () => {
  const opts = [{id: 'vidcore', url:'https://vidcore.org/embed/movie/550'}, {id:'vidrift',url:'https://embed.vidrift.net/embed/movie/550'}];
  assert.equal(initialFireTvScraper({nativeFireTv:true,url:failedEmbed,mediaType:'movie',initialProvider:'onlyflix',alternatives:opts}), 'vidcore');
  assert.equal(initialFireTvScraper({nativeFireTv:true,url:'https://share.cdnm.ink/embed/tmdb/1399?season=2&episode=4',mediaType:'tv',initialProvider:'onlyflix',alternatives:opts}), 'vidcore');
  assert.equal(initialFireTvScraper({nativeFireTv:true,url:failedEmbed,mediaType:'movie',initialProvider:'onlyflix',alternatives:[{id:'vidcore',url:''},opts[1]]}), 'vidrift');
  assert.equal(initialFireTvScraper({nativeFireTv:true,url:failedEmbed,mediaType:'movie',initialProvider:'onlyflix',alternatives:[]}), 'onlyflix');
  assert.equal(initialFireTvScraper({nativeFireTv:false,url:failedEmbed,mediaType:'movie',initialProvider:'onlyflix',alternatives:opts}), 'onlyflix');
  assert.equal(initialFireTvScraper({nativeFireTv:true,url:failedEmbed,mediaType:'live',initialProvider:'onlyflix',alternatives:opts}), 'onlyflix');
  assert.equal(initialFireTvScraper({nativeFireTv:true,url:failedEmbed,mediaType:'movie',initialProvider:'vidcore',alternatives:opts}), 'vidcore');
});

test('Fire TV keeps every manual scraper, fullscreen, source selection and explicit torrent escape hatch', () => {
  const embed=source('src/components/mg/OnlyFlixEmbedPlayer.jsx');
  const portal=source('src/components/mg/PlayerPortalRenderer.jsx');
  assert.match(embed,/const firstFireTvScraper = useMemo\(\(\) => initialFireTvScraper/);
  assert.match(embed,/setActiveEpisodePlayer\(firstFireTvScraper\)/);
  assert.doesNotMatch(embed,/recoverBrokenFireTvEmbed/);
  assert.doesNotMatch(embed,/Finding a working playback source/);
  for (const id of ['onlyflix','vidcore','vidrift','stellar','vidsrc','twoembed','cinesrc','multiembed']) {
    assert.match(embed,new RegExp('id: "'+id+'"'));
  }
  assert.match(embed,/data-mg-embedded-top-fullscreen="true"/);
  assert.match(embed,/data-mg-embedded-top-sources="true"/);
  assert.match(embed,/data-mg-embedded-onlyflix-servers="true"/);
  assert.match(embed,/window\.open\(onlyFlixServersUrl, "_blank", "noopener,noreferrer"\)/);
  assert.match(embed,/onClick=\{\(\) => \{\s*setAutoRecovery\(false\);\s*setActiveEpisodePlayer\(option.id\)/);
  assert.match(embed,/if \(next === "torrents"\) \{\s*beginTorrentFallback\(\)/);
  assert.match(portal,/onOpenSources=\{onOpenSources\}/);
});

test('The verified source card keeps manual external OnlyFlix and web-player options', () => {
  const card=source('src/components/mg/MediaStreamSourcesBox.jsx');
  assert.match(card,/label: "OnlyFlix • Multiple Servers"/);
  assert.match(card,/onClick: \(\) => onlyFlixTitlePageUrl && window\.open\(onlyFlixTitlePageUrl/);
  assert.match(card,/player\.playVidCore\(/);
  assert.match(card,/player\.playVidSrc\(/);
});
