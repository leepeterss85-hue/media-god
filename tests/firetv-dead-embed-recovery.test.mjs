import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { needsFireTvScraperRecovery } from '../src/components/mg/fireTvScraperRecovery.js';

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

test('Broken Fire TV embed calls existing source discovery and never mounts black iframe', () => {
  const embed=source('src/components/mg/OnlyFlixEmbedPlayer.jsx');
  const portal=source('src/components/mg/PlayerPortalRenderer.jsx');
  const core=source('src/components/mg/MediaPlayerProvider.jsx');
  assert.match(embed,/const recoverBrokenFireTvEmbed = needsFireTvScraperRecovery/);
  assert.match(embed,/if \(!recoverBrokenFireTvEmbed \|\| torrentStartedRef\.current\) return;\s*beginTorrentFallback\(\);/);
  assert.match(embed,/if \(recoverBrokenFireTvEmbed\) \{\s*return \(/);
  assert.ok(embed.indexOf('if (recoverBrokenFireTvEmbed) {') < embed.indexOf('data-mg-embed-iframe="true"'));
  assert.match(embed,/typeof onOpenSources === "function"/);
  assert.match(portal,/onOpenSources=\{onOpenSources\}/);
  assert.match(core,/onOpenSources=\{\(\) => \{[\s\S]*?skipRdLookup: false,[\s\S]*?skipAddonLookup: false/);
});

test('The verified source card keeps manual external OnlyFlix and web-player options', () => {
  const card=source('src/components/mg/MediaStreamSourcesBox.jsx');
  assert.match(card,/label: "OnlyFlix • Multiple Servers"/);
  assert.match(card,/onClick: \(\) => onlyFlixTitlePageUrl && window\.open\(onlyFlixTitlePageUrl/);
  assert.match(card,/player\.playVidCore\(/);
  assert.match(card,/player\.playVidSrc\(/);
});
