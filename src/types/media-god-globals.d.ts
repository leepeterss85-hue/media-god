export {};

declare global {
  interface Window {
    cast?: any;
    chrome?: any;
    __onGCastApiAvailable?: (available: boolean) => void;
    mpegts?: any;
    dashjs?: any;
    WebKitMediaSource?: typeof MediaSource;
    __MG_PLAYER_CONTEXT__?: any;
    __MG_NATIVE_PLAYBACK_ACTIVE__?: any;
    __MG_LIVE_TV_DIAGNOSTICS__?: any;
    __MG_NATIVE_PLAYBACK_DIAGNOSTICS__?: any;
    __MG_FIRE_TV_STABLE_MODE__?: any;
    __MG_SINGLE_VIDEO_SURFACE_GUARD__?: any;
  }

  interface Navigator {
    connection?: any;
  }

  interface Document {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  }

  interface HTMLElement {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  }

  interface HTMLVideoElement {
    audioTracks?: any;
  }

  interface Error {
    code?: string | number;
    rdStatus?: string | number;
  }
}
