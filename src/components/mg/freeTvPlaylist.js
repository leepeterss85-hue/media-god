import { fetchAntSportsEvents } from "./antSportsScraper.js";

export const LIVE_TV_SOURCES = [
  {
    id: "free-tv",
    name: "Free-TV",
    url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
    priority: 100,
    category: "General",
  },
  {
    id: "freecasthub",
    name: "FreeCastHub",
    url: "https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u",
    priority: 95,
    category: "General",
  },
  {
    id: "freecasthub-sports",
    name: "FreeCastHub Sports",
    url: "https://raw.githubusercontent.com/freecasthub/public-iptv/main/sports.m3u",
    priority: 96,
    category: "Sports",
  },
  {
    id: "samsung-tv-plus-gb-buddy",
    name: "Samsung TV Plus GB",
    url: "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/refs/heads/main/playlists/samsungtvplus_gb.m3u",
    priority: 120,
    category: "United Kingdom",
  },
  {
    id: "samsung-tv-plus-uk-kilirushi",
    name: "Samsung TV Plus UK Mirror",
    url: "https://raw.githubusercontent.com/kilirushi/iptv/master/uk_samsung.m3u",
    priority: 88,
    category: "United Kingdom",
  },
  {
    id: "tubi-us-buddy",
    name: "Tubi US",
    url: "https://raw.githubusercontent.com/BuddyChewChew/tubi-scraper/refs/heads/main/tubi_playlist.m3u",
    priority: 98,
    category: "United States",
    country: "US",
  },
  {
    id: "xumo-us-buddy",
    name: "Xumo US",
    url: "https://raw.githubusercontent.com/BuddyChewChew/xumo-playlist-generator/refs/heads/main/playlists/xumo_playlist.m3u",
    priority: 97,
    category: "United States",
    country: "US",
  },
  {
    id: "plex-us-buddy",
    name: "Plex US",
    url: "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plex_us.m3u",
    priority: 94,
    category: "United States",
    country: "US",
  },
  {
    id: "samsung-tv-plus-community",
    name: "Samsung TV Plus Community",
    url: "https://gist.githubusercontent.com/cmj/b978c6f0974b703ddaec3396d5e866f8/raw/tvplus.m3u8",
    priority: 76,
    category: "Worldwide",
  },
  {
    id: "jpt-free-tv-uk",
    name: "JPT Free-TV UK Mirror",
    url: "https://gitea.jpt.land/jpt/IPTV/raw/branch/master/playlists/playlist_uk.m3u8",
    priority: 91,
    category: "United Kingdom",
  },
  {
    id: "jpt-free-tv-global",
    name: "JPT Free-TV Global Mirror",
    url: "https://gitea.jpt.land/jpt/IPTV/raw/branch/master/playlist.m3u8",
    priority: 69,
    category: "Worldwide",
  },
  {
    id: "iptv-org-uk",
    name: "IPTV-org UK",
    url: "https://iptv-org.github.io/iptv/countries/uk.m3u",
    priority: 90,
    category: "United Kingdom",
  },
  {
    id: "iptv-org-uk-raw",
    name: "IPTV-org UK Raw Repository",
    url: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/uk.m3u",
    priority: 93,
    category: "United Kingdom",
    country: "GB",
  },
  {
    id: "dearbulut-uk-healthchecked",
    name: "Dearbulut UK Health-Checked",
    url: "https://dearbulut.github.io/iptv/playlists/country/uk.m3u",
    priority: 104,
    category: "United Kingdom",
    country: "GB",
  },
  {
    id: "radio-browser-uk",
    name: "UK Radio Browser",
    url: "https://all.api.radio-browser.info/m3u/stations/bycountrycodeexact/GB?hidebroken=true&order=votes&reverse=true&limit=1000",
    priority: 130,
    category: "Radio",
    country: "GB",
  },
  {
    id: "iptv-org-worldwide",
    name: "IPTV-org Worldwide",
    url: "https://iptv-org.github.io/iptv/index.m3u",
    priority: 70,
    category: "Worldwide",
  },
  {
    id: "pluto-tv-all-buddy",
    name: "Pluto TV Global",
    url: "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plutotv_all.m3u",
    priority: 77,
    category: "FAST TV",
  },
  {
    id: "plex-all-buddy",
    name: "Plex TV Global",
    url: "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plex_all.m3u",
    priority: 76,
    category: "FAST TV",
  },
  {
    id: "samsung-tv-plus-all-buddy",
    name: "Samsung TV Plus Global",
    url: "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/samsungtvplus_all.m3u",
    priority: 75,
    category: "FAST TV",
  },
  {
    id: "iptv-org-ireland",
    name: "IPTV-org Ireland",
    url: "https://iptv-org.github.io/iptv/countries/ie.m3u",
    priority: 88,
    category: "Ireland",
    country: "IE",
  },
  {
    id: "iptv-org-international",
    name: "IPTV-org International",
    url: "https://iptv-org.github.io/iptv/countries/int.m3u",
    priority: 76,
    category: "International",
  },
  {
    id: "iptv-org-canada",
    name: "IPTV-org Canada",
    url: "https://iptv-org.github.io/iptv/countries/ca.m3u",
    priority: 75,
    category: "Canada",
    country: "CA",
  },
  {
    id: "iptv-org-australia",
    name: "IPTV-org Australia",
    url: "https://iptv-org.github.io/iptv/countries/au.m3u",
    priority: 74,
    category: "Australia",
    country: "AU",
  },
  {
    id: "iptv-org-new-zealand",
    name: "IPTV-org New Zealand",
    url: "https://iptv-org.github.io/iptv/countries/nz.m3u",
    priority: 73,
    category: "New Zealand",
    country: "NZ",
  },
  {
    id: "iptv-org-sports",
    name: "IPTV-org Sports",
    url: "https://iptv-org.github.io/iptv/categories/sports.m3u",
    priority: 80,
    category: "Sports",
  },
  {
    id: "iptv-org-movies",
    name: "IPTV-org Movies",
    url: "https://iptv-org.github.io/iptv/categories/movies.m3u",
    priority: 80,
    category: "Movies",
  },
  {
    id: "gigoplast-tv",
    name: "Gigoplast TV",
    url: "https://raw.githubusercontent.com/gigoplast/iptv-1/master/tv.m3u",
    priority: 85,
    category: "Gigoplast",
  },
  {
    id: "gigoplast-premium",
    name: "Gigoplast Premium",
    url: "https://raw.githubusercontent.com/gigoplast/iptv-1/master/OSN%20%2C%20BEIN%20%2CART%20%2CFOX%20%2C%20SKY.m3u8",
    priority: 84,
    category: "Gigoplast",
  },
  {
    id: "nimeyer-uk-list",
    name: "Nimeyer UK Gist",
    url: "https://gist.githubusercontent.com/nimeyer22/4dc9fe46ca393956801bf65625168477/raw/UKList.m3u",
    priority: 99,
    category: "United Kingdom",
  },
  {
    id: "pluto-tv-gb-buddy",
    name: "Pluto TV UK",
    url: "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plutotv_gb.m3u",
    priority: 119,
    category: "United Kingdom",
    country: "GB",
  },
  {
    id: "plex-gb-buddy",
    name: "Plex TV UK",
    url: "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plex_gb.m3u",
    priority: 117,
    category: "United Kingdom",
    country: "GB",
  },
  {
    id: "roku-all-buddy",
    name: "The Roku Channel",
    url: "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/roku_all.m3u",
    priority: 101,
    category: "FAST TV",
  },
  {
    id: "localnow-apsattv",
    name: "LocalNow",
    url: "https://www.apsattv.com/localnow.m3u",
    priority: 89,
    category: "United States",
    country: "US",
  },
  {
    id: "lg-channels-gb",
    name: "LG Channels UK",
    url: "https://www.apsattv.com/gblg.m3u",
    priority: 116,
    category: "United Kingdom",
    country: "GB",
  },
  {
    id: "iptv-org-news",
    name: "IPTV-org News",
    url: "https://iptv-org.github.io/iptv/categories/news.m3u",
    priority: 82,
    category: "News",
  },
  {
    id: "iptv-org-entertainment",
    name: "IPTV-org Entertainment",
    url: "https://iptv-org.github.io/iptv/categories/entertainment.m3u",
    priority: 81,
    category: "Entertainment",
  },
  {
    id: "iptv-org-documentary",
    name: "IPTV-org Documentary",
    url: "https://iptv-org.github.io/iptv/categories/documentary.m3u",
    priority: 79,
    category: "Documentary",
  },
  {
    id: "iptv-org-kids",
    name: "IPTV-org Kids",
    url: "https://iptv-org.github.io/iptv/categories/kids.m3u",
    priority: 79,
    category: "Kids",
  },
  {
    id: "iptv-org-music",
    name: "IPTV-org Music",
    url: "https://iptv-org.github.io/iptv/categories/music.m3u",
    priority: 78,
    category: "Music",
  },
  {
    id: "iptv-org-comedy",
    name: "IPTV-org Comedy",
    url: "https://iptv-org.github.io/iptv/categories/comedy.m3u",
    priority: 77,
    category: "Comedy",
  },
  {
    id: "iptv-org-classic",
    name: "IPTV-org Classic TV",
    url: "https://iptv-org.github.io/iptv/categories/classic.m3u",
    priority: 76,
    category: "Classic TV",
  },
  {
    id: "iptv-org-cooking",
    name: "IPTV-org Cooking",
    url: "https://iptv-org.github.io/iptv/categories/cooking.m3u",
    priority: 75,
    category: "Cooking",
  },
  {
    id: "iptv-org-education",
    name: "IPTV-org Education",
    url: "https://iptv-org.github.io/iptv/categories/education.m3u",
    priority: 74,
    category: "Education",
  },
];

export const FREE_TV_PLAYLIST_URL = LIVE_TV_SOURCES[0].url;

export const LIVE_TV_REGION = "GLOBAL";

export const EXTERNAL_ADDON_SOURCES = [
  {
    id: "slyguy-sky-sport-now-0.7.5",
    name: "Sky Sport Now · SlyGuy Kodi add-on v0.7.5",
    url: "https://github.com/matthuisman/slyguy.addons/commit/64a7e1b8035f08df2000338a8cf073259ca4ab9d",
    repositoryUrl: "https://slyguy.uk/.repo/",
    installGuideUrl: "https://www.matthuisman.nz/2020/02/slyguy-kodi-repository.html",
    category: "Sports",
    country: "NZ",
    platform: "Kodi",
    note: "Media God integration based on the SlyGuy Sky Sport Now flow. Connect your own subscription with the provider's TV code; live channels then appear in Live TV with protected playback handled by supported devices.",
  },
];

export const PUBLIC_DIRECT_CHANNELS = [
  {
    id: "ANTSports.us@Official",
    tvgId: "ANTSports.us",
    name: "ANT SPORTS",
    url: "https://antsports.tv/us",
    category: "Sports",
    country: "US",
    priority: 65,
    sourceName: "ANT SPORTS Official",
    officialUrl: "https://antsports.tv/us",
    officialLabel: "Open ANT SPORTS",
    kind: "external",
  },
  {
    id: "BBCAlba.uk@Official",
    tvgId: "BBCAlba.uk",
    name: "BBC ALBA",
    url: "https://www.bbc.co.uk/iplayer/live/bbcalba",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcalba",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "CBBC.uk@Official",
    tvgId: "CBBC.uk",
    name: "CBBC",
    url: "https://www.bbc.co.uk/iplayer/live/cbbc",
    category: "Kids",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/cbbc",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "CBeebies.uk@Official",
    tvgId: "CBeebies.uk",
    name: "CBeebies",
    url: "https://www.bbc.co.uk/iplayer/live/cbeebies",
    category: "Kids",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/cbeebies",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "BBCParliament.uk@Official",
    tvgId: "BBCParliament.uk",
    name: "BBC Parliament",
    url: "https://www.bbc.co.uk/iplayer/live/bbcparliament",
    category: "News",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcparliament",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "BBCNews.uk@Official",
    tvgId: "BBCNews.uk",
    name: "BBC News",
    url: "https://www.bbc.co.uk/iplayer/live/bbcnews",
    category: "News",
    country: "GB",
    priority: 60,
    sourceName: "BBC iPlayer Official",
    officialUrl: "https://www.bbc.co.uk/iplayer/live/bbcnews",
    officialLabel: "Open BBC iPlayer",
    kind: "external",
  },
  {
    id: "S4C.uk@Official",
    tvgId: "S4C.uk",
    name: "S4C",
    url: "https://www.s4c.cymru/clic/",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "S4C Clic Official",
    officialUrl: "https://www.s4c.cymru/clic/",
    officialLabel: "Open S4C Clic",
    kind: "external",
  },
  {
    id: "STV.uk@Official",
    tvgId: "STV.uk",
    name: "STV",
    url: "https://player.stv.tv/live",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "STV Player Official",
    officialUrl: "https://player.stv.tv/live",
    officialLabel: "Open STV Player",
    kind: "external",
  },
  {
    id: "Channel4.uk@Official",
    tvgId: "Channel4.uk",
    name: "Channel 4",
    url: "https://www.channel4.com/",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/",
    officialLabel: "Open Channel 4",
    kind: "external",
  },
  {
    id: "E4.uk@Official",
    tvgId: "E4.uk",
    name: "E4",
    url: "https://www.channel4.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/",
    officialLabel: "Open Channel 4",
    kind: "external",
  },
  {
    id: "More4.uk@Official",
    tvgId: "More4.uk",
    name: "More4",
    url: "https://www.channel4.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/",
    officialLabel: "Open Channel 4",
    kind: "external",
  },
  {
    id: "Film4.uk@Official",
    tvgId: "Film4.uk",
    name: "Film4",
    url: "https://www.channel4.com/",
    category: "Movies",
    country: "GB",
    priority: 60,
    sourceName: "Channel 4 Official",
    officialUrl: "https://www.channel4.com/",
    officialLabel: "Open Channel 4",
    kind: "external",
  },
  {
    id: "Channel5.uk@Official",
    tvgId: "Channel5.uk",
    name: "Channel 5",
    url: "https://www.channel5.com/",
    category: "United Kingdom",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "5USA.uk@Official",
    tvgId: "5USA.uk",
    name: "5USA",
    url: "https://www.channel5.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "5Star.uk@Official",
    tvgId: "5Star.uk",
    name: "5STAR",
    url: "https://www.channel5.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "5Action.uk@Official",
    tvgId: "5Action.uk",
    name: "5ACTION",
    url: "https://www.channel5.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "5Select.uk@Official",
    tvgId: "5Select.uk",
    name: "5SELECT",
    url: "https://www.channel5.com/",
    category: "Entertainment",
    country: "GB",
    priority: 60,
    sourceName: "5 Official",
    officialUrl: "https://www.channel5.com/",
    officialLabel: "Open 5",
    kind: "external",
  },
  {
    id: "ITV1.uk@Official",
    name: "ITV1",
    url: "https://www.itv.com/watch?channel=itv",
    category: "General",
    country: "GB",
    priority: 132,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv",
    kind: "external",
  },
  {
    id: "ITV2.uk@Official",
    name: "ITV2",
    url: "https://www.itv.com/watch?channel=itv2",
    category: "General",
    country: "GB",
    priority: 130,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv2",
    kind: "external",
  },
  {
    id: "ITV3.uk@Official",
    name: "ITV3",
    url: "https://www.itv.com/watch?channel=itv3",
    category: "General",
    country: "GB",
    priority: 128,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv3",
    kind: "external",
  },
  {
    id: "ITV4.uk@Official",
    name: "ITV4",
    url: "https://www.itv.com/watch?channel=itv4",
    category: "General",
    country: "GB",
    priority: 128,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itv4",
    kind: "external",
  },
  {
    id: "ITVBe.uk@Official",
    name: "ITVBe",
    url: "https://www.itv.com/watch?channel=itvbe",
    category: "General",
    country: "GB",
    priority: 126,
    sourceName: "ITVX Official",
    officialUrl: "https://www.itv.com/watch?channel=itvbe",
    kind: "external",
  },
  {
    id: "PlutoTVBiography.uk@Verified",
    tvgId: "PlutoTVBiography.uk",
    name: "Pluto TV Biography",
    logo: "https://i.imgur.com/MwuIHbX.png",
    url: "https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/5d4af2a24f1c5ab2d298776b/master.m3u8?advertisingId=channel&appName=rokuchannel&appVersion=1.0&bmodel=bm1&channel_id=channel&content=channel&content_rating=ROKU_ADS_CONTENT_RATING&content_type=livefeed&coppa=false&deviceDNT=1&deviceId=channel&deviceMake=rokuChannel&deviceModel=web&deviceType=rokuChannel&deviceVersion=1.0&embedPartner=rokuChannel&genre=ROKU_CONTENT_TAGS&is_lat=1&platform=web&rdid=channel&studio_id=viacom&tags=ROKU_CONTENT_TAGS",
    category: "Documentary",
    country: "GB",
    priority: 108,
    sourceName: "Pluto TV UK",
    kind: "direct",
  },
  {
    id: "V2BEATTV.uk@Verified",
    tvgId: "V2BEATTV.uk",
    name: "V2BEAT TV",
    logo: "https://i.imgur.com/PXGqyLn.png",
    url: "https://abr.de1se01.v2beat.live/playlist.m3u8",
    category: "Music",
    country: "GB",
    priority: 108,
    sourceName: "V2BEAT Public",
    kind: "direct",
  },
  {
    id: "AfrobeatTVEntertainment.uk@Verified",
    tvgId: "AfrobeatTVEntertainment.uk",
    name: "Afrobeat TV Entertainment",
    logo: "https://i.imgur.com/232ndRK.png",
    url: "https://stream.ecable.tv/afrobeats/index.m3u8",
    category: "Music",
    country: "GB",
    priority: 108,
    sourceName: "Afrobeat TV Public",
    kind: "direct",
  },
  {
    id: "DunyaNewsUK.uk@Verified",
    tvgId: "DunyaNewsUK.uk",
    name: "Dunya News UK",
    logo: "https://i.imgur.com/dtrTfZC.png",
    url: "https://ukintl.dunyanews.tv/liveuk/ngrp:dunyalive_all/playlist.m3u8",
    category: "News",
    country: "GB",
    priority: 108,
    sourceName: "Dunya News Public",
    kind: "direct",
  },
  {
    id: "PlutoTVRetroDrama.uk@Verified",
    tvgId: "PlutoTVRetroDrama.uk",
    name: "Pluto TV Retro Drama",
    logo: "https://i.imgur.com/a2xIDMJ.png",
    url: "https://service-stitcher.clusters.pluto.tv/stitch/hls/channel/5dde47b63585b500099f74ec/master.m3u8?advertisingId=&appName=web&appStoreUrl=&appVersion=DNT&app_name=&architecture=&buildVersion=&deviceDNT=1&deviceId=5dde47b63585b500099f74ec&deviceLat=&deviceLon=&deviceMake=web&deviceModel=web&deviceType=web&deviceVersion=DNT&includeExtendedEvents=false&marketingRegion=DE&serverSideAds=false&sid=5204e9ec-0585-11eb-a18c-0242ac110002&terminate=false&userId=",
    category: "Entertainment",
    country: "GB",
    priority: 108,
    sourceName: "Pluto TV UK",
    kind: "direct",
  },
  {
    id: "PlutoTVSports.uk@Verified",
    tvgId: "PlutoTVSports.uk",
    name: "Pluto TV Sports",
    logo: "https://i.imgur.com/LW77x7g.png",
    url: "https://service-stitcher.clusters.pluto.tv/stitch/hls/channel/56340779a738201b4ccfeac9/master.m3u8?advertisingId=&appName=web&appStoreUrl=&appVersion=DNT&app_name=&architecture=&buildVersion=&deviceDNT=0&deviceId=56340779a738201b4ccfeac9&deviceLat=&deviceLon=&deviceMake=web&deviceModel=web&deviceType=web&deviceVersion=DNT&includeExtendedEvents=false&marketingRegion=US&serverSideAds=false&sid=725&terminate=false&userId=",
    category: "Sports",
    country: "GB",
    priority: 108,
    sourceName: "Pluto TV UK",
    kind: "direct",
  },
];

const CACHE_MS = 15 * 60 * 1000;

let cache = null;
let cacheAt = 0;
let inflight = null;

export function clearFreeTvCache() {
  cache = null;
  cacheAt = 0;
  inflight = null;
}

const attr = (line, name) => {
  const match = String(line || "").match(
    new RegExp(`${name}="([^"]*)"`, "i")
  );
  return match?.[1] || "";
};

const cleanChannelName = (value) =>
  String(value || "")
    .replace(/[ⓈⒼⓎⓉ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normaliseChannelNameForKey = (value) =>
  cleanChannelName(value)
    .toLowerCase()
    .replace(
      /\[[^\]]*(?:geo|not 24\/7|sd|hd|fhd|uhd|4k|1080|720|576|480)[^\]]*\]/gi,
      " "
    )
    .replace(
      /\([^)]*(?:geo|not 24\/7|sd|hd|fhd|uhd|4k|1080|720|576|480)[^)]*\)/gi,
      " "
    )
    .replace(
      /\b(?:2160p?|4k|uhd|1080p?|fhd|720p?|hd|576p?|480p?|sd)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

const classifyUrl = (url) => {
  const value = String(url || "").trim().toLowerCase();
  if (
    /(?:youtube\.com|youtu\.be)/i.test(value) ||
    /(?:twitch\.tv)/i.test(value) ||
    /(?:dailymotion\.com|dai\.ly)/i.test(value)
  ) {
    return "external";
  }
  return "direct";
};

const streamFormat = (url) => {
  const value = String(url || "").toLowerCase();
  if (/\.m3u8(?:[?#&]|$)/i.test(value)) return "hls";
  if (/\.mpd(?:[?#&]|$)/i.test(value)) return "dash";
  if (/\.(?:mp3|aac|m4a|ogg|opus)(?:[?#&]|$)/i.test(value)) return "audio";
  if (/\.(?:mp4|m4v|webm)(?:[?#&]|$)/i.test(value)) return "file";
  if (/\.(?:ts|m2ts)(?:[?#&]|$)/i.test(value)) return "mpegts";
  return "unknown";
};

const isUnsupportedProtocol = (url) =>
  /^(?:rtmp|rtsp|udp|rtp|acestream|sop):/i.test(String(url || "").trim());

const pageIsHttps = () => {
  if (typeof window === "undefined") return true;
  return String(window.location?.protocol || "https:") === "https:";
};

const isMixedContentUrl = (url) =>
  pageIsHttps() && /^http:\/\//i.test(String(url || "").trim());

const qualityFromText = (value) => {
  const text = String(value || "").toLowerCase();
  if (/\b(?:2160p?|4k|uhd)\b/.test(text)) return 2160;
  if (/\b1080p?\b|\bfhd\b/.test(text)) return 1080;
  if (/\b720p?\b|\bhd\b/.test(text)) return 720;
  if (/\b576p?\b/.test(text)) return 576;
  if (/\b480p?\b|\bsd\b/.test(text)) return 480;
  return 0;
};

const feedSuffix = (tvgId) => {
  const id = String(tvgId || "");
  const at = id.indexOf("@");
  return at >= 0 ? id.slice(at + 1).trim().toUpperCase() : "";
};

const looksLikeUkFeed = (channel) => {
  const country = String(channel?.country || "").toUpperCase();
  const group = String(channel?.group || "").toLowerCase();
  const id = String(channel?.tvgId || channel?.id || "").toLowerCase();
  const suffix = feedSuffix(channel?.tvgId || channel?.id);

  if (/^(?:US|USA|CA|CANADA|AU|AUS|NZ|IN|INDIA|ASIA|AFRICA)$/i.test(suffix)) {
    return false;
  }

  return (
    country === "GB" ||
    country === "UK" ||
    /(?:^|\.)uk(?:@|$)/i.test(id) ||
    group === "uk" ||
    group.includes("united kingdom") ||
    group.includes("great britain")
  );
};

const browserCompatibility = (channel) => {
  const url = String(channel?.url || "").trim();
  const kind = channel?.kind || classifyUrl(url);
  const format = streamFormat(url);

  if (!url) return { browserPlayable: false, browserReason: "Missing URL", format };
  if (kind === "external") return { browserPlayable: true, browserReason: "", format: "external" };
  if (isUnsupportedProtocol(url)) return { browserPlayable: false, browserReason: "Unsupported stream protocol", format };
  if (format === "dash") return { browserPlayable: true, browserReason: "", format };
  if (isMixedContentUrl(url)) return { browserPlayable: false, browserReason: "HTTP stream blocked on HTTPS app", format };
  if (channel?.requiresHeaders) return { browserPlayable: false, browserReason: "Stream requires custom request headers", format };

  return { browserPlayable: true, browserReason: "", format };
};

const sourceScore = (channel) => {
  let score = Number(channel?.sourcePriority || 0) * 12;
  const quality = Number(channel?.quality || 0);
  const url = String(channel?.url || "");
  const format = channel?.format || streamFormat(url);

  if (/^https:\/\//i.test(url)) score += 1800;
  if (format === "hls") score += 1600;
  if (format === "audio") score += 1400;
  if (format === "file") score += 900;
  if (format === "mpegts") score += 700;

  if (quality >= 2160) score += 800;
  else if (quality >= 1080) score += 650;
  else if (quality >= 720) score += 500;
  else if (quality >= 576) score += 250;
  else if (quality > 0) score += 80;

  if (channel?.kind === "external") score -= 400;
  if (channel?.notAlwaysOn) score -= 250;
  if (channel?.standardDefinition) score -= 80;

  if (looksLikeUkFeed(channel) && LIVE_TV_REGION === "GB") score += 1000;
  if (channel?.browserPlayable === false) score -= 100000;

  return score;
};

const inferTags = ({ sourceCategory, group, name, country }) => {
  const tags = new Set();
  const joined = `${sourceCategory || ""} ${group || ""} ${name || ""}`.toLowerCase();

  if (sourceCategory) tags.add(sourceCategory);
  if (/sport/.test(joined)) tags.add("Sports");
  if (/movie|cinema|film/.test(joined)) tags.add("Movies");
  if (/news/.test(joined)) tags.add("News");
  if (/radio|\bfm\b/.test(joined)) tags.add("Radio");
  if (/music/.test(joined)) tags.add("Music");
  if (/kids|children|family/.test(joined)) tags.add("Kids");
  if (/documentary|science/.test(joined)) tags.add("Documentary");
  if (/series|entertainment/.test(joined)) tags.add("Entertainment");
  if (/united kingdom|\buk\b|great britain/.test(joined) || /^(gb|uk)$/i.test(String(country || ""))) {
    tags.add("United Kingdom");
  }

  return [...tags];
};

const parseExtHttp = (line) => {
  const raw = String(line || "").replace(/^#EXTHTTP:/i, "").trim();
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    return {
      referrer: data?.referrer || data?.referer || data?.Referer || data?.Referrer || "",
      userAgent: data?.["user-agent"] || data?.userAgent || data?.UserAgent || "",
    };
  } catch {
    return {};
  }
};

export function parseFreeTvPlaylist(text, source = LIVE_TV_SOURCES[0]) {
  const lines = String(text || "").split(/\r?\n/);
  const channels = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const comma = line.indexOf(",");
      const rawName = comma >= 0 ? line.slice(comma + 1).trim() : attr(line, "tvg-name") || "Unknown";
      const name = cleanChannelName(rawName) || "Unknown";
      const logo = attr(line, "tvg-logo");
      const tvgId = attr(line, "tvg-id");
      const country = attr(line, "tvg-country");
      const group = attr(line, "group-title") || source.category || country || "Other";
      const channelNumber = attr(line, "tvg-chno");
      const quality = qualityFromText(`${rawName} ${line}`);
      const geoRestricted = rawName.includes("Ⓖ") || /\bgeo[- ]?blocked\b/i.test(rawName) || /\bgeo[- ]?restricted\b/i.test(rawName);

      current = {
        id: tvgId || "",
        name,
        rawName,
        logo,
        tvgId,
        country,
        group,
        channelNumber,
        url: "",
        kind: "direct",
        format: "unknown",
        standardDefinition: rawName.includes("Ⓢ") || quality === 480,
        geoRestricted,
        geoAvailableHere: false,
        geoBlocked: false,
        notAlwaysOn: /not 24\/7/i.test(rawName),
        youtube: rawName.includes("Ⓨ"),
        twitch: rawName.includes("Ⓣ"),
        insecure: false,
        mixedContent: false,
        requiresHeaders: false,
        referrer: "",
        userAgent: "",
        browserPlayable: true,
        browserReason: "",
        quality,
        sourceId: source.id,
        sourceName: source.name,
        sourcePriority: source.priority,
        sourceCategory: source.category,
        tags: [],
        alternatives: [],
      };
      continue;
    }

    if (!current) continue;

    if (/^#EXTVLCOPT:http-referrer=/i.test(line)) {
      current.referrer = line.replace(/^#EXTVLCOPT:http-referrer=/i, "").trim();
      continue;
    }
    if (/^#EXTVLCOPT:http-user-agent=/i.test(line)) {
      current.userAgent = line.replace(/^#EXTVLCOPT:http-user-agent=/i, "").trim();
      continue;
    }
    if (/^#EXTHTTP:/i.test(line)) {
      const headers = parseExtHttp(line);
      current.referrer = headers.referrer || current.referrer;
      current.userAgent = headers.userAgent || current.userAgent;
      continue;
    }
    if (line.startsWith("#")) continue;

    const url = line;
    current.url = url;
    current.kind = classifyUrl(url);
    current.insecure = /^http:\/\//i.test(url);
    current.mixedContent = isMixedContentUrl(url);
    current.requiresHeaders = Boolean(current.referrer || current.userAgent);
    current.geoAvailableHere = current.geoRestricted && LIVE_TV_REGION === "GB" && looksLikeUkFeed(current);
    current.geoBlocked = current.geoRestricted && !current.geoAvailableHere;
    current.tags = inferTags({
      sourceCategory: current.sourceCategory,
      group: current.group,
      name: current.name,
      country: current.country,
    });

    if (source.id.startsWith("gigoplast") || source.id === "nimeyer-uk-list") {
      current.group = "United Kingdom";
      if (!current.tags.includes("United Kingdom")) {
        current.tags.push("United Kingdom");
      }
    }

    const compatibility = browserCompatibility(current);
    current.browserPlayable = compatibility.browserPlayable;
    current.browserReason = compatibility.browserReason;
    current.format = compatibility.format;
    current.score = sourceScore(current);
    current.id = current.id || `${source.id}:${current.country || current.group}:${current.name}:${url}`;

    if (url) channels.push(current);
    current = null;
  }

  return channels;
}

const dedupeKey = (channel) => {
  if (channel?.sourceId?.startsWith("gigoplast") || channel?.sourceId === "nimeyer-uk-list") {
    return `custom:${channel.sourceId}:${channel.url}`;
  }
  const tvgId = String(channel?.tvgId || "").trim().toLowerCase();
  if (tvgId) return `id:${tvgId}`;
  const name = normaliseChannelNameForKey(channel?.name);
  const country = String(channel?.country || "").trim().toLowerCase();
  return `name:${name}|country:${country}`;
};

const dedupeMergedChannels = (channels) => {
  const groups = new Map();
  for (const channel of channels || []) {
    if (!channel?.url || !channel?.name) continue;
    const key = dedupeKey(channel);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(channel);
  }

  const merged = [];
  for (const candidates of groups.values()) {
    const uniqueByUrl = [];
    const seenUrls = new Set();
    for (const candidate of candidates) {
      const urlKey = String(candidate?.url || "").trim();
      if (!urlKey || seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);
      uniqueByUrl.push(candidate);
    }

    const browserCandidates = uniqueByUrl.filter((candidate) => candidate?.browserPlayable !== false);
    if (browserCandidates.length === 0) continue;

    browserCandidates.sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
    const best = browserCandidates[0];
    if (!best) continue;

    const tags = new Set();
    const sources = new Set();
    for (const candidate of browserCandidates) {
      sources.add(candidate.sourceName);
      for (const tag of candidate.tags || []) tags.add(tag);
    }

    const alternatives = browserCandidates.slice(1);
    merged.push({
      ...best,
      tags: [...tags],
      sourceNames: [...sources],
      alternatives,
    });
  }

  return merged;
};

export async function getFreeTvChannels(options = {}) {
  const { force = false } = options;
  const now = Date.now();

  if (!force && cache && now - cacheAt < CACHE_MS) return cache;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    const sourceStatus = [];
    const rawChannels = [];
    let rawCount = 0;
    let browserRejectedCount = 0;

    const sortedSources = [...LIVE_TV_SOURCES].sort((a, b) => b.priority - a.priority);

    for (const source of sortedSources) {
      try {
        let response = await fetch(source.url, {
          headers: { Accept: "text/plain, */*" },
        });

        if (!response.ok) {
          const proxyUrl = `https://media-god1.leepeterss85.workers.dev/?url=${encodeURIComponent(source.url)}`;
          response = await fetch(proxyUrl);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        const parsed = parseFreeTvPlaylist(text, source);
        rawCount += parsed.length;

        for (const channel of parsed) {
          if (channel?.browserPlayable === false) browserRejectedCount += 1;
          rawChannels.push(channel);
        }

        sourceStatus.push({ id: source.id, name: source.name, count: parsed.length, error: null });
      } catch (error) {
        sourceStatus.push({ id: source.id, name: source.name, count: 0, error: error?.message || "Failed to fetch" });
      }
    }

    // Pull live event matches from AntSports scraper
    try {
      const scrapedEvents = await fetchAntSportsEvents();
      rawCount += scrapedEvents.length;
      for (const event of scrapedEvents) {
        rawChannels.push(event);
      }
      sourceStatus.push({ id: "antsports-scraper", name: "AntSports Live", count: scrapedEvents.length, error: null });
    } catch (error) {
      sourceStatus.push({ id: "antsports-scraper", name: "AntSports Live", count: 0, error: error?.message || "Failed to fetch" });
    }

    const channels = dedupeMergedChannels(rawChannels);

    channels.sort((a, b) => {
      const ukA = (a?.tags || []).includes("United Kingdom") ? 1 : 0;
      const ukB = (b?.tags || []).includes("United Kingdom") ? 1 : 0;
      if (ukA !== ukB) return ukB - ukA;
      return Number(b?.score || 0) - Number(a?.score || 0);
    });

    const payload = { channels, sourceStatus, rawCount, browserRejectedCount, region: LIVE_TV_REGION, fetchedAt: now };
    cache = payload;
    cacheAt = now;
    inflight = null;
    return payload;
  })().catch((error) => {
    inflight = null;
    throw error;
  });

  return inflight;
}

export function findChannelsByTitle(query) {
  if (!cache || !cache.channels) return [];
  const q = String(query || "").toLowerCase().trim();
  if (!q) return cache.channels;
  return cache.channels.filter((ch) => String(ch?.name || "").toLowerCase().includes(q));
}

export function findDynamicChannelStream(channels, query) {
  const q = String(query || "").toLowerCase().trim();
  const matches = (channels || []).filter(ch => 
    String(ch?.name || "").toLowerCase().includes(q) ||
    String(ch?.group || "").toLowerCase().includes(q)
  );

  if (matches.length === 0) return null;

  matches.sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
  return matches[0]?.url || null;
}