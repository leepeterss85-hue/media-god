import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const paths = ['base44/functions/getTmdbMovies/entry.ts', 'deploy/media-god-api/getTmdbMovies.mjs'];
const url = 'https://www.cinemauk.org.uk/the-industry/facts-and-figures/latest-uk-cinema-statistics/weekend-top-10-box-office/';
const names = ['Ramayana: Rise of a Legend', 'Wild Horse Nine', 'Godzilla Minus Zero',
  'Wicker', 'George Michael: The Faith Tour', 'Primetime',
  'Ghosts: The Possession of Button House', 'Clayface', 'I Play Rocky',
  "Stray Kids World Tour 'Run It'"];
const table = '<html><h3>6-8 November 2026</h3><table><tr><th>Rank</th><th>Film</th><th>Weekend</th><th>Total</th></tr>' +
  names.map((name, i) => '<tr><td>' + (i + 1) + '</td><td>' + name +
    ' (Distributor)</td><td>£' + ((10 - i) * 100_000).toLocaleString('en-GB') +
    '</td><td>£1,000,000</td></tr>').join('') + '</table></html>';

function runHelper(path, fetch) {
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf('const UK_CINEMA_CHART_SOURCES =');
  const end = source.indexOf('const IMG_BASE', start);
  assert.ok(start >= 0 && end > start, 'production chart helper must exist');
  const context = {
    fetch, AbortSignal, URLSearchParams, Date, Promise, Map,
    TMDB_BASE: 'https://api.themoviedb.org/3',
    mapItem: movie => ({...movie, id: String(movie.id), tmdb_id: movie.id, poster_url: 'poster'}),
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) +
    '\nglobalThis.chart = { parseUkCinemaChart, getUkCinemaTop10 };', context);
  return { chart: context.chart, source };
}

for (const path of paths) {
  test(path + ': Top 10 parses the official chart with real ranks and ticket revenue', () => {
    const { chart } = runHelper(path, async () => ({ok:false}));
    const result = chart.parseUkCinemaChart(table);
    assert.equal(result.period, '6-8 November 2026');
    assert.equal(result.rows.length, 10);
    assert.equal(result.rows[0].title, names[0]);
    assert.equal(result.rows[0].weekend_gross_gbp, 1000000);
    assert.equal(result.rows[9].rank, 10);
  });

  test(path + ': backend uses the chart rank, keeps unmatched entries and refuses popularity fallbacks', async () => {
    const { chart, source } = runHelper(path, async requestUrl => {
      if (String(requestUrl) === url) return {ok:true,text:async()=>table};
      if (String(requestUrl).includes('/search/movie?')) {
        const title = new URL(String(requestUrl)).searchParams.get('query');
        return {ok:true,json:async()=>({results: title === 'Wild Horse Nine'
          ? [{id:123,title:'Wild Horse Nine',popularity:100}] : []})};
      }
      return {ok:false};
    });
    const result = await chart.getUkCinemaTop10('test-key');
    assert.equal(result.movies.length, 10);
    assert.equal(result.movies[1].tmdb_id, 123);
    assert.equal(result.movies[1].chart_rank, 2);
    assert.equal(result.movies[0].tmdb_id, null);
    assert.equal(result.chart_source_url, url);
    assert.equal(result.chart_period, '6-8 November 2026');
    assert.match(source, /body.category === 'cinema_top10'/);
    assert.match(source, /getUkCinemaTop10\(apiKey\)/);
  });

  test(path + ': an inaccessible official chart never becomes an invented TMDB Top 10', async () => {
    const { chart } = runHelper(path, async () => ({ok:false}));
    const result = await chart.getUkCinemaTop10('test-key');
    assert.equal(result.chart_unavailable, true);
    assert.equal(result.movies.length, 0);
  });
}
