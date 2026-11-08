/**
 * Optional public-playlist shortcuts. They are not fetched on app startup:
 * IPTV-org Worldwide and Free-TV are already bundled as regular sources.
 * Users can choose a country feed without duplicating their existing lists.
 * Public listing does not establish rebroadcast rights for every channel.
 */
export const PUBLIC_PLAYLIST_PRESETS = [
  ["us", "United States", "North America", "us"],
  ["fr", "France", "Europe", "fr"],
  ["de", "Germany", "Europe", "de"],
  ["es", "Spain", "Europe", "es"],
  ["it", "Italy", "Europe", "it"],
  ["pt", "Portugal", "Europe", "pt"],
  ["nl", "Netherlands", "Europe", "nl"],
  ["be", "Belgium", "Europe", "be"],
  ["pl", "Poland", "Europe", "pl"],
  ["se", "Sweden", "Europe", "se"],
  ["no", "Norway", "Europe", "no"],
  ["fi", "Finland", "Europe", "fi"],
  ["dk", "Denmark", "Europe", "dk"],
  ["ch", "Switzerland", "Europe", "ch"],
  ["tr", "Türkiye", "Europe", "tr"],
  ["jp", "Japan", "Asia", "jp"],
  ["kr", "South Korea", "Asia", "kr"],
  ["in", "India", "Asia", "in"],
  ["ph", "Philippines", "Asia", "ph"],
  ["sg", "Singapore", "Asia", "sg"],
  ["br", "Brazil", "South America", "br"],
  ["mx", "Mexico", "North America", "mx"],
  ["ar", "Argentina", "South America", "ar"],
  ["cl", "Chile", "South America", "cl"],
  ["co", "Colombia", "South America", "co"],
  ["za", "South Africa", "Africa", "za"],
  ["eg", "Egypt", "Africa", "eg"],
  ["ae", "United Arab Emirates", "Middle East", "ae"],
  ["sa", "Saudi Arabia", "Middle East", "sa"],
].map(([id, country, region, code]) => ({
  id: `iptv-org-${id}-optional`,
  name: `IPTV-org ${country}`,
  country,
  region,
  category: country,
  url: `https://iptv-org.github.io/iptv/countries/${code}.m3u`,
}));

/** Exact, case-insensitive URL comparison avoids duplicate custom/built-in feeds. */
export const hasPlaylistUrl = (items = [], url = "") => {
  const target = String(url || "").trim().toLowerCase();
  return Boolean(target) && (items || []).some(
    (item) => String(item?.url || "").trim().toLowerCase() === target
  );
};
