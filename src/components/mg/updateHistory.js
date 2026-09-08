export const UPDATE_HISTORY = [
  {
    id: "gigoplast-public-source-v1",
    date: "8 September 2026",
    title: "Additional worldwide public TV backups added",
    summary:
      "Media God now includes selected public/free broadcaster feeds discovered in the gigoplast/iptv-1 repository without importing its adult, PPV, movie or subscription-channel lists.",
    changes: [
      "Added a verified CGTN Documentary HLS backup from the repository.",
      "Added a verified Arirang TV HLS backup from the repository.",
      "Added a verified DW Latinoamerica HLS backup from the repository.",
      "Kept the new entries below existing higher-priority working sources so they act as backups rather than replacing known-good channels.",
      "Excluded the repository's Adultivo list, movie-file catalogue, PPV entries and OSN/BEIN/SKY subscription-channel collections.",
    ],
  },
  {
    id: "worldwide-live-tv-codecs-v1",
    date: "8 September 2026",
    title: "Worldwide Live TV and device codecs expanded",
    summary:
      "Media God now loads the worldwide IPTV-org country catalogue as a low-priority source, preserves existing working sources, keeps native-only backups for Fire TV and uses the device's real decoder list when ranking difficult formats.",
    changes: [
      "Added IPTV-org Worldwide as a low-priority catalogue source with roughly fourteen thousand current country-grouped entries, while keeping existing Free-TV, FreeCastHub and UK sources at higher priority.",
      "Worldwide candidates are merged as backups instead of replacing an already working higher-priority source.",
      "Merged channels retain worldwide country grouping so the Live TV group selector can be used to browse by country.",
      "Added a Worldwide quick filter and incremental Show more loading so the global catalogue remains usable without rendering thousands of cards at once.",
      "Preserved browser-incompatible candidates as hidden native Fire TV backups instead of discarding them during deduplication.",
      "Native Fire TV can now attempt HTTP, header-required and other Media3-compatible direct feeds that normal browser playback correctly avoids.",
      "Playlist Referer and User-Agent requirements are passed through to the native Fire TV player when supplied by the source.",
      "Known HLS and DASH MIME types are passed to Media3 explicitly, improving streams whose URLs do not clearly identify the adaptive format.",
      "Added verified direct fallbacks for Al Jazeera English, NHK World-Japan, ABC News Live and VOA TV Africa alongside the existing international direct feeds.",
      "Added official-service fallbacks for Al Jazeera, NHK World, ABC News Live, CBS News, NBC News NOW, Euronews, CGTN, Arirang and VOA.",
      "The native Fire TV shell now reports the decoder MIME types actually installed on that device rather than relying only on browser codec probes.",
      "Source ranking gives a positive boost to codecs the specific Fire TV explicitly reports, including model-dependent HEVC, AV1, VP9, MPEG-2, DTS and other formats.",
      "Media3 decoder fallback remains enabled, and unsupported Real-Debrid/VOD sources continue to use Media God's existing compatibility/audio rescue path where available.",
      "A broad worldwide sample check returned playable HLS media for 34 of 42 sampled country feeds; unavailable/geo-blocked examples remain eligible for backup or official-service fallback rather than being treated as universally working.",
      "Fire TV APK version increased to 1.2.0 / version code 3 so installed native builds can detect the worldwide/player update.",
    ],
  },
  {
    id: "live-tv-codec-compatibility-v2",
    date: "8 September 2026",
    title: "Live TV and codec compatibility improved",
    summary:
      "Live TV now keeps reliable broadcaster fallbacks, supports BBC MPEG-DASH feeds, avoids stale channel overrides and gives the native Fire TV player more chances to decode difficult video and audio formats.",
    changes: [
      "Added MPEG-DASH playback to the web player using dash.js while the dedicated Fire TV app continues to use Media3 natively.",
      "Added stable official BBC One, Two, Three, Four, News, Parliament, CBBC and CBeebies entries with BBC iPlayer fallback instead of silently losing the channels.",
      "Removed stale hard-coded Live TV overrides that could replace current working playlist feeds with dead GB News, Talk, Bloomberg, TRT or other URLs.",
      "Updated the built-in GB News, Talk, Bloomberg TV Europe and TRT World public feeds to currently responding endpoints.",
      "Added official service fallbacks for BBC, ITVX, Channel 4, 5, Sky News, GB News, Talk, Bloomberg, TRT World, France 24 and DW when a direct feed is unavailable.",
      "The player itself now offers the broadcaster's official service after every direct Live TV backup has failed.",
      "Commercial UK public-service channels that normally require their broadcaster platform are no longer promoted from unknown community relay URLs as if they were official direct streams.",
      "Codec detection now recognises DASH, VP8, H.263, AC-4 and xHE-AAC/USAC in addition to the existing H.264, HEVC, AV1, VP9, MPEG-2, AAC, AC3/EAC3, DTS, TrueHD, Opus, FLAC and other formats.",
      "The dedicated Fire TV app distinguishes native Media3 playback from the older WebView so browser codec probes no longer bury formats the native hardware may decode.",
      "Native Fire TV source ranking is more tolerant of AV1, MKV, MPEG-2, DTS and TrueHD while still preferring safer AAC/AC3/EAC3 sources when available.",
      "Media3 decoder fallback is enabled so Fire TV can try another available hardware/software decoder before abandoning a source.",
      "Fire TV APK version increased to 1.1.0 / version code 2 so already-installed native builds can detect this player update.",
    ],
  },
  {
    id: "fire-tv-app-updater-v1",
    date: "8 September 2026",
    title: "Fire TV app update detection added",
    suppressNotice: true,
    summary:
      "The Fire Stick web wrapper can now detect the dedicated Media God Fire TV app and offer its permanent APK download, while the native Fire TV build reports its installed version to the web app.",
    changes: [
      "Added a Fire TV-only update checker that does not appear on normal phones, tablets or desktop browsers.",
      "Legacy Wix/Base44 Fire Stick installs now receive a migration prompt for the dedicated Fire TV app instead of needing a manually supplied APK link.",
      "The dedicated native Fire TV shell now exposes package name, version code and version name to Media God so current builds do not show false update prompts.",
      "Added a permanent GitHub release download address for the latest Fire TV APK instead of relying on expiring workflow artifacts.",
      "The native Fire TV bridge can open the update download in an external browser while retaining Android/Fire OS installation confirmation.",
    ],
  },
  {
    id: "fire-tv-catalogue-scale-v1",
    date: "8 September 2026",
    title: "Fire Stick screen scale and card layout corrected",
    summary:
      "The Fire Stick catalogue now uses one consistent television scale instead of inheriting oversized 3xl/4xl desktop controls and coarse-pointer hover overlays.",
    changes: [
      "Reduced the Fire TV hero height, title, synopsis and action sizes so the home screen no longer feels vertically stretched.",
      "Reduced Continue Watching and Recently Watched card widths and spacing so more items fit evenly across the television.",
      "Standardised Home poster cards at a fixed television width with consistent 2:3 artwork proportions.",
      "Stopped Fire OS coarse-pointer detection from forcing every hidden hover action visible at the same time.",
      "Removed the persistent giant Play, Details and Watchlist bubbles visible across every Home poster in the Fire Stick layout.",
      "Fire TV catalogue posters now expose one clean full-poster focus target; selecting a Home poster opens Details first for consistent remote controls.",
      "Removed low-value row arrow and hero arrow focus controls on Fire TV so D-pad navigation stays on useful content.",
      "Movies and TV Shows now use fixed 112px Fire TV grid columns instead of changing size with 3xl/4xl desktop breakpoints.",
      "Movies and TV Shows filter controls, poster text and artwork now use a fixed compact television scale regardless of the CSS resolution reported by Fire OS.",
    ],
  },
  {
    id: "search-settings-addons-performance-v1",
    date: "8 September 2026",
    title: "Search, details, settings and performance improved",
    summary:
      "Search and title details are cleaner on Fire Stick, Settings/Addons are easier to operate with a remote, and several unnecessary network, image and DOM workloads have been reduced.",
    changes: [
      "Search now waits for at least two characters and uses a slightly calmer debounce to avoid unnecessary backend searches while typing.",
      "Search renders at most 60 results at once and lazy-loads result artwork to reduce memory and image decoding work.",
      "Search gained stronger Fire TV focus states plus accessible loading and error announcements.",
      "Opening title details on Fire TV now puts the first useful focus on Play instead of Close, while Back still closes the dialog normally.",
      "Details now lazy-load poster, provider and cast artwork and cap the visible cast row at 20 people to reduce image memory use.",
      "Play, Watchlist, Favorites and provider links in Details now have clearer remote focus and action labels.",
      "Settings now describes the current stall-recovery behaviour accurately, including the longer grace period used for torrents.",
      "Search, Details, Settings and Addons now share stronger Fire TV safe-zone and D-pad focus treatment.",
      "Addons now blocks duplicate manifest URLs before creating another configured addon.",
      "Addon add, enable/disable and delete actions are locked while another addon mutation is running to prevent duplicate writes.",
      "Addon changes update the local list immediately instead of reloading the entire addon collection after every small change.",
      "Navbar player-state monitoring is now animation-frame batched, uses a 750ms safety watchdog instead of 100ms polling, and skips watchdog DOM work while hidden.",
    ],
  },
  {
    id: "home-live-tv-polish-v1",
    date: "8 September 2026",
    title: "Home screen and Live TV polished",
    summary:
      "Home navigation is cleaner on Fire Stick and Live TV now does less background work, handles channel selection more clearly and keeps its TV layout separate from poster-card sizing.",
    changes: [
      "Improved focus rings and accessible labels on the Home hero Watch, Watchlist, Details and featured-title controls.",
      "Removed the six tiny hero pagination focus stops on Fire TV while keeping the larger previous and next featured controls.",
      "Tightened Home row spacing on television and removed the low-value footer from the Fire TV scroll path.",
      "Live TV no longer prewarms streams merely because D-pad focus moves across channels, favourites or recent channels.",
      "Only the best source for the channel the user actually selects is prewarmed before Live TV playback starts.",
      "Starting a television channel now stops any radio stream that was still playing in the Live TV view.",
      "Live TV channels can now launch from a working direct backup even when their primary channel URL is unavailable.",
      "A channel with no browser-playable source now shows a dismissible channel notice instead of being reported as a playlist-loading failure.",
      "Live TV filters, search, group selector and view controls gained clearer focus states, accessibility state and a one-button Reset filters action.",
      "Fixed Fire TV Live TV quick/guide card sizing so those controls no longer inherit the 118px Home poster-card width; technical playlist statistics are also hidden on television.",
    ],
  },
  {
    id: "fire-tv-playback-hardening-v1",
    date: "8 September 2026",
    title: "Fire Stick and playback stability hardened",
    summary:
      "The player now has one source-switch authority, serialized torrent resolution and calmer Fire TV layout handling so recovery systems no longer fight each other.",
    changes: [
      "PlaybackReliabilityAssist is now learning-only and can no longer change the active source behind the player.",
      "All normal, audio-rescue and video-compatibility source changes now pass through the same central player switch routine.",
      "Torrent and debrid resolution is serialized so two main torrent resolutions cannot run at the same time.",
      "Fix audio is disabled while debrid resolution or torrent-file switching is already in progress.",
      "Fire TV player takeover no longer reacts to the inline style changes it writes itself.",
      "The Fire TV takeover watchdog was reduced from roughly 16 checks per second to 4 while keeping mutation-based updates.",
      "The JavaScript Fire TV header fallback now matches the 5% television safe zone instead of forcing controls back to the screen edge.",
      "Legacy native requestFullscreen fallback was removed from the old party-player control surface so it cannot reintroduce Android WebView fullscreen problems.",
      "Reliability messages now report learning/recovery accurately instead of implying the helper itself is switching sources.",
      "Fire TV player CSS comments were corrected so future changes do not accidentally hide the on-TV source and torrent-file controls again.",
    ],
  },
  {
    id: "torrent-player-stability-v1",
    date: "8 September 2026",
    title: "Torrent playback and Fire TV player stability fixed",
    summary:
      "Torrent playback is calmer and more predictable, with background torrent resolving removed and picture-in-picture blocked from interfering with normal Fire TV playback.",
    changes: [
      "Stopped Media God from pre-resolving a backup torrent a few seconds after playback begins.",
      "Backup torrents are now resolved only after a genuine failure or when the user explicitly chooses another source.",
      "Torrent failover is now sequential with a short pause instead of rapidly jumping through sources.",
      "Torrent playback now gets up to 28 seconds without progress before stall recovery switches source.",
      "Automatic torrent recovery now has a 30-second cooldown between source switches.",
      "Picture-in-picture is explicitly disabled on the main video element and any accidental PiP session is pushed back to inline playback.",
      "Embedded video providers no longer receive picture-in-picture permission from the Media God player.",
      "Remote playback is disabled on the main player so Fire TV playback stays on the intended screen.",
      "Pending delayed torrent failover is cancelled when the player closes or the user changes title/source.",
    ],
  },
  {
    id: "playback-live-tv-v1",
    date: "8 September 2026",
    title: "Playback & Live TV improved",
    summary:
      "Playback and Live TV now recover more quickly, preserve viewing position during source changes and make better use of learned source reliability on Fire TV and other devices.",
    changes: [
      "Improved automatic playback recovery so a failed movie or episode source can move to the best unused backup more reliably.",
      "Manual and automatic source switching now preserve the current viewing position for films and episodes whenever possible.",
      "Prepared debrid backup streams can be reused immediately during a source switch instead of always resolving them again from scratch.",
      "Fire TV playback keeps source, torrent-file, audio and episode controls available while also recognising more Back-button key variants from TV and Android remotes.",
      "Existing audio rescue remains integrated with failover for streams that start with video but no usable sound.",
      "Live TV now abandons a source that takes too long to start and automatically tries the best available backup.",
      "Live TV now detects prolonged waiting or stalls and switches to another channel source instead of remaining frozen indefinitely.",
      "Live TV backup selection now includes learned URL reliability so recently successful and faster sources are preferred.",
      "Radio streams now learn successful, failed and stalled sources, rank alternatives using that history and automatically try a backup after a prolonged stall.",
      "Source-change and recovery messages are clearer so users can see when Media God is switching or resuming playback.",
    ],
  },
  {
    id: "fire-tv-repair-v1",
    date: "8 September 2026",
    title: "Fire Stick playback and screen fit repaired",
    summary:
      "A focused Fire TV repair that restores torrent playback and keeps the interface safely inside the television screen without shrinking the video.",
    changes: [
      "Fixed Fire Stick sizing so menus and controls stay inside the TV-safe area instead of being clipped at the edges.",
      "Restored torrent sources marked as torrent so they correctly enter the debrid playback path again.",
      "Bare torrent hashes are recognised again and can be sent through debrid resolution.",
      "Restored the on-TV Torrent file selector for multi-file debrid torrents.",
      "Restored the Fire TV source and playback-options panel that had been hidden by a later fullscreen CSS rule.",
      "Restored episode quick-navigation controls on Fire TV instead of forcing episode management to the phone remote.",
      "Kept the actual movie or episode full-screen with contain fitting so video is not stretched or cropped.",
      "Moved Fire TV top controls, QR controls and bottom playback controls into a 5% TV-safe area for better overscan compatibility.",
      "Reduced the oversized Fire TV home-layout override so posters, hero content and Continue Watching fit the screen more naturally.",
      "Kept the narrow Fire TV navigation rail while adding safer left and right screen margins.",
    ],
  },
  {
    id: "source-debrid-subtitles-v1",
    date: "8 September 2026",
    title: "Better sources, debrid files and subtitles",
    summary:
      "More control over source quality, cached debrid choices, torrent files and subtitle behaviour.",
    changes: [
      "Added source sorting for Best, Cached, 4K, 1080p, Compatible and Smallest.",
      "Source choices show useful quality, HDR, video codec, audio codec, cache and debrid-provider information when available.",
      "Multi-file torrent selection works across AllDebrid, TorBox, Premiumize and Debrid-Link as well as Real-Debrid.",
      "You can switch to another video file from a supported debrid torrent without leaving the player.",
      "If one cached debrid service fails to resolve a torrent, Media God can try the next cached connected service.",
      "Subtitle choices are remembered per film or series, including whether subtitles were turned off.",
      "Forced and foreign-parts subtitles are selected more intelligently.",
      "SDH captions can be preferred or kept behind cleaner dialogue subtitles.",
      "Subtitle timing can be moved earlier or later in 0.5-second steps and reset instantly.",
      "Embedded, HLS and external/addon subtitles share the same smarter language and preference selection.",
    ],
  },
  {
    id: "playback-compatibility-v1",
    date: "8 September 2026",
    title: "More formats, better torrents, fewer playback failures",
    summary:
      "A major playback compatibility pass for Fire TV, debrid streams, difficult codecs and multi-file torrents.",
    changes: [
      "Broadened torrent playback support with less aggressive codec rejection on Fire TV.",
      "DTS, DTS-HD and TrueHD sources can remain playable when a compatibility transcode is unavailable.",
      "Improved support for HEVC/H.265, AV1, VP9, HDR and Dolby Vision without blanket Fire TV blocking.",
      "Recognised more video containers including MP4, MKV, M4V, MOV, WebM, MPEG, TS/M2TS, AVI, VOB, OGV, WMV, ASF, F4V, MXF and DIVX-style files.",
      "Broadened audio handling for AAC, AC3, EAC3/DD+, DTS, TrueHD, FLAC, ALAC, Opus, Vorbis, PCM/LPCM, MP2 and MP3.",
      "Improved multi-file torrent selection so samples, trailers, extras and bonus clips are less likely to be chosen by mistake.",
      "Improved torrent file labels with quality, HDR, codec, audio, channels, container and file size when available.",
      "Fixed Real-Debrid file-link mapping so alternate files inside a torrent can actually be opened.",
      "Added compatibility-stream fallback for difficult video codecs and containers while keeping the original file available as a fallback.",
      "Separated Audio Rescue and Video Compatibility Rescue so one recovery path does not block the other.",
    ],
  },
  {
    id: "fire-tv-navigation-v1",
    date: "7 September 2026",
    title: "Fire TV navigation and back-button improvements",
    summary:
      "Remote control behaviour was made more predictable across the home screen, player and selectors.",
    changes: [
      "Improved D-pad navigation between the Fire TV sidebar, hero area and poster rows.",
      "Stopped a single D-pad tap from skipping multiple cards by throttling repeated remote movement.",
      "Improved focus recovery when Fire TV opens without a currently focused control.",
      "Added a consistent visible Back control away from the plain Home screen.",
      "Improved physical Fire Stick Back behaviour for detail screens, search, selectors and player overlays.",
      "Player navigation now stays isolated from the normal home-screen navigation while playback is open.",
      "The sidebar is removed while the player owns the TV screen so it cannot sit over video controls.",
      "Improved focus outlines so the current Fire TV selection is easier to see from across the room.",
      "Kept editable fields, sliders and native selects using their normal browser behaviour instead of forcing D-pad navigation through them.",
    ],
  },
  {
    id: "season-episode-player-v1",
    date: "5 September 2026",
    title: "Season, episode and player controls",
    summary:
      "Series playback was expanded so season and episode choices stay connected to the player instead of trapping the user in one season.",
    changes: [
      "Improved season selection so a series is not limited to only the season containing the currently selected episode.",
      "Improved episode selection and playback hand-off between the episode picker and video player.",
      "Added clearer Back and Exit controls around the player and selectors.",
      "Added a visible Fix audio control for streams that start without usable sound.",
      "Added safe in-app fullscreen instead of handing fullscreen to Android WebView in a way that can close or restart the app.",
      "Player controls can change source while playback is active.",
      "Continue Watching progress is preserved when compatible backup sources are used.",
      "Automatic source recovery can resume close to the previous playback position after a failed or stalled source.",
      "Improved direct URL, HLS and debrid playback inside the same player flow.",
    ],
  },
  {
    id: "search-playback-repair-v1",
    date: "5 September 2026",
    title: "Search and playback repair",
    summary:
      "Search results and movie playback were reconnected after blank-screen and source-resolution failures.",
    changes: [
      "Fixed search selections opening the correct media details instead of falling into a blank screen.",
      "Improved TMDB and IMDb identity handling before requesting addon streams.",
      "Normalised addon results into direct streams or torrent/debrid sources before playback.",
      "Real playable sources are ranked ahead of trailer and provider placeholders.",
      "Added automatic failover when a selected stream cannot be played.",
      "Improved handling of direct HTTP video sources alongside torrent sources.",
      "Added clearer playback error handling when no usable source remains.",
      "Improved LiveVideo error reporting so fatal HLS or video errors can trigger source failover.",
      "Fixed module/export problems that had interrupted film search and playback flows.",
    ],
  },
  {
    id: "playback-learning-v1",
    date: "Earlier September 2026",
    title: "Smarter playback learning and automatic recovery",
    summary:
      "Media God started learning which sources and providers behave well on the current device and using that information during playback.",
    changes: [
      "Added playback reliability learning for successful starts, failures, buffering and no-sound events.",
      "Recently successful sources can receive a ranking boost on the same device.",
      "Recently failed or repeatedly buffering sources can be ranked lower.",
      "Known no-sound sources can trigger automatic audio recovery on devices where the problem was previously observed.",
      "Added automatic stall detection and source switching when playback stops progressing for too long.",
      "Backup sources can be pre-warmed while the current stream is playing to reduce recovery delay.",
      "Debrid-provider reliability and response time can influence which cached provider is tried first.",
      "Live TV playback can record startup success, failure and stalls to improve future source selection.",
      "Source recovery keeps the current viewing position where possible instead of restarting from the beginning.",
    ],
  },
  {
    id: "media-god-core-v1",
    date: "Earlier September 2026",
    title: "Media God core experience improvements",
    summary:
      "The main application was expanded into a TV-friendly media hub with more sections, playback helpers and cross-device controls.",
    changes: [
      "Expanded the main sidebar with Home, Movies, TV Shows, Live TV, Watchlist, Favorites and Watch Party.",
      "Added RD Library and Downloads areas for debrid content management.",
      "Added Addons and Sources sections for managing where playback results come from.",
      "Added a Roadmap section for planned work and feature direction.",
      "Added a Phone Remote section and QR-based player remote support.",
      "Improved responsive behaviour across phone, tablet, monitor and television layouts.",
      "Added Continue Watching and recently watched experiences to make resuming easier.",
      "Added favorites and watchlist surfaces alongside discovery rows.",
      "Added player casting support where a compatible cast environment is available.",
      "Added dedicated Live TV playback handling alongside films and series.",
      "Added watch-party surfaces for shared playback features.",
      "Improved details screens with playback actions, source information and season/episode access.",
      "Added a central search flow for films and TV shows.",
      "Added user-facing playback update notices that are shown once per release.",
    ],
  },
];

export const LATEST_UPDATE = UPDATE_HISTORY.find(
  (release) =>
    release.status !== "planned" &&
    release.suppressNotice !== true
);

export const ALL_UPDATE_COUNT = UPDATE_HISTORY.reduce(
  (total, release) =>
    release.status === "planned"
      ? total
      : total + release.changes.length,
  0
);

export const RELEASED_UPDATE_COUNT = UPDATE_HISTORY.filter(
  (release) => release.status !== "planned"
).length;
