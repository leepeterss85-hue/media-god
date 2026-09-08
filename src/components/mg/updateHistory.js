export const UPDATE_HISTORY = [
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

export const LATEST_UPDATE = UPDATE_HISTORY[0];

export const ALL_UPDATE_COUNT = UPDATE_HISTORY.reduce(
  (total, release) => total + release.changes.length,
  0
);
