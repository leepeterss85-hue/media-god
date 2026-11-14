// Requests are started by the caller. Publish each result independently; an
// optional recommendation lookup must never hold the catalogue behind it.
export function loadHomeSections({ catalogue, library, onCatalogue, onLibrary, resolveSeed, onSeed, isActive }) {
  const settle = request => Promise.resolve(request).catch(() => []);
  const catalogueDone = Promise.all(Object.entries(catalogue).map(async ([key, request]) => {
    const items = await settle(request);
    if (isActive()) onCatalogue(key, items);
  }));
  const libraryDone = Promise.all(Object.entries(library).map(async ([key, request]) => {
    const items = await settle(request);
    if (isActive()) onLibrary(key, items);
    return [key, items];
  }));
  const done = Promise.all([catalogueDone, libraryDone]).then(async ([, entries]) => {
    if (!isActive()) return;
    let seed = null;
    try { seed = await resolveSeed(Object.fromEntries(entries)); } catch { /* Recommendations are optional. */ }
    if (isActive()) onSeed(seed);
  });
  return { catalogueDone, libraryDone, done };
}
