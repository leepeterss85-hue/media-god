import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import FireTvFocusMemory from '@/components/mg/FireTvFocusMemory.jsx'
import FireTvAuthNavigation from '@/components/mg/FireTvAuthNavigation.jsx'
import FireTvPlayerTakeover from '@/components/mg/FireTvPlayerTakeover.jsx'
import PlaybackReliabilityAssist from '@/components/mg/PlaybackReliabilityAssist.jsx'
import PlayerEpisodeQuickNav from '@/components/mg/PlayerEpisodeQuickNav.jsx'
import ContinueWatchingAssist from '@/components/mg/ContinueWatchingAssist.jsx'
import { installFireTvStableMode } from '@/components/mg/fireTvStableMode.js'
import '@/index.css'
import '@/fire-tv-stable.css'
import '@/fire-tv-player-failsafe.css'

const userAgent =
  typeof navigator !== 'undefined'
    ? navigator.userAgent || ''
    : ''

const knownFireTv =
  /\bAFT[A-Z0-9]*\b/i.test(userAgent) ||
  /Fire\s*TV/i.test(userAgent) ||
  /AmazonWebAppPlatform/i.test(userAgent) ||
  /Silk/i.test(userAgent)

const androidNoTouch =
  /Android/i.test(userAgent) &&
  typeof navigator !== 'undefined' &&
  Number(navigator.maxTouchPoints || 0) === 0

let tvRemoteDetected =
  knownFireTv ||
  androidNoTouch

const markTvRemoteDetected = () => {
  const firstDetection = !tvRemoteDetected
  tvRemoteDetected = true

  if (typeof document !== 'undefined') {
    document.documentElement.classList.add(
      'mg-fire-tv',
      'mg-tv-remote'
    )

    document.body?.classList.add(
      'mg-fire-tv',
      'mg-tv-remote'
    )
  }

  if (firstDetection && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('mg:tv-remote-detected')
    )
  }
}

const keyCode = (event) =>
  Number(event?.keyCode || event?.which || 0)

const keyName = (event) =>
  String(event?.key || event?.code || '')

const isStrongTvRemoteEvent = (event) => {
  const code = keyCode(event)
  const key = keyName(event)

  if (
    code === 4 ||
    code === 19 ||
    code === 20 ||
    code === 21 ||
    code === 22 ||
    code === 23 ||
    code === 82 ||
    code === 85 ||
    code === 89 ||
    code === 90 ||
    code === 126 ||
    code === 127 ||
    code === 166 ||
    code === 461
  ) {
    return true
  }

  return (
    key === 'Select' ||
    key === 'Accept' ||
    key === 'BrowserBack' ||
    key === 'GoBack' ||
    key === 'MediaPlayPause' ||
    key === 'MediaRewind' ||
    key === 'MediaFastForward'
  )
}

const isVisible = (element) => {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  const rect = element.getBoundingClientRect()

  if (rect.width < 2 || rect.height < 2) {
    return false
  }

  const style = window.getComputedStyle(element)

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity || 1) > 0.02 &&
    style.pointerEvents !== 'none'
  )
}

const lastItem = (items) =>
  items.length > 0
    ? items[items.length - 1]
    : null

const findPlayerOverlay = () => {
  const explicit = document.querySelector(
    '[data-mg-player-root="true"]'
  )

  if (explicit instanceof HTMLElement && isVisible(explicit)) {
    return explicit
  }

  const overlays = Array.from(
    document.querySelectorAll('.fixed.inset-0')
  ).reverse()

  for (const overlay of overlays) {
    if (!(overlay instanceof HTMLElement) || !isVisible(overlay)) {
      continue
    }

    if (overlay.classList.contains('bg-black/95')) {
      return overlay
    }

    if (
      overlay.querySelector(
        [
          'select[aria-label="Choose playback source"]',
          'select[aria-label="Choose source or quality while loading"]',
          'button[aria-label="No sound"]',
          'button[title="No sound"]',
          'button[aria-label="Back to main menu"]',
          'video',
          'iframe',
        ].join(',')
      )
    ) {
      return overlay
    }
  }

  return null
}

const topVisibleOverlay = () => {
  const playerOverlay = findPlayerOverlay()

  if (playerOverlay) {
    return playerOverlay
  }

  const overlays = Array.from(
    document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"], .fixed.inset-0'
    )
  ).filter(isVisible)

  if (!overlays.length) {
    return null
  }

  const sorted = overlays
    .map((element, index) => {
      const zIndex = Number(window.getComputedStyle(element).zIndex)

      return {
        element,
        index,
        zIndex: Number.isFinite(zIndex) ? zIndex : 0,
      }
    })
    .sort((a, b) =>
      a.zIndex === b.zIndex
        ? a.index - b.index
        : a.zIndex - b.zIndex
    )

  return lastItem(sorted)?.element || null
}

const findBackTarget = (scope) => {
  if (!(scope instanceof HTMLElement)) {
    return null
  }

  const selectors = [
    'button[data-mg-player-exit="true"]',
    'button[aria-label="Exit player"]',
    'button[aria-label="Exit fullscreen"]',
    'button[aria-label="Close season and episode picker"]',
    'button[data-mg-overlay-back="true"]',
    'button[aria-label="Back to main menu"]',
    'button[aria-label="Back"]',
    'button[aria-label="Close details"]',
    'button[aria-label="Close search"]',
    'button[aria-label^="Close "]',
    'button[aria-label="Close"]',
    'button[title="Close"]',
  ]

  for (const selector of selectors) {
    const candidates = Array.from(
      scope.querySelectorAll(selector)
    ).filter(
      (button) =>
        !button.hasAttribute('data-mg-global-back') &&
        isVisible(button)
    )

    if (candidates.length) {
      return candidates[candidates.length - 1]
    }
  }

  return null
}

const isBackEvent = (event) => {
  const key = keyName(event)
  const code = keyCode(event)
  const tag = String(event?.target?.tagName || '').toLowerCase()

  const editing =
    tag === 'input' ||
    tag === 'textarea' ||
    event?.target?.isContentEditable

  if (
    key === 'BrowserBack' ||
    key === 'GoBack' ||
    key === 'Escape' ||
    code === 4 ||
    code === 166 ||
    code === 461
  ) {
    return true
  }

  return (
    (key === 'Backspace' || code === 8) &&
    !editing
  )
}

const mediaGodAppMounted = () =>
  document.querySelector('#root main') instanceof HTMLElement

let lastFireTvBackActionAt = 0

const performFireTvBackAction = () => {
  const now = Date.now()

  if (now - lastFireTvBackActionAt < 240) {
    return true
  }

  lastFireTvBackActionAt = now

  const playerOverlay = findPlayerOverlay()
  const playerBack = findBackTarget(playerOverlay)

  if (playerBack) {
    playerBack.click()
    return true
  }

  const overlay = topVisibleOverlay()
  const overlayBack = findBackTarget(overlay)

  if (overlayBack) {
    overlayBack.click()
    return true
  }

  const globalBackButtons = Array.from(
    document.querySelectorAll(
      'button[data-mg-global-back="true"]'
    )
  ).filter(isVisible)

  const globalBack = lastItem(globalBackButtons)

  if (globalBack) {
    globalBack.click()
    return true
  }

  const homeButton = document.querySelector(
    'aside nav button[title="Home"]'
  )

  if (homeButton instanceof HTMLElement && isVisible(homeButton)) {
    const className = String(homeButton.className || '')
    const isAlreadyHome =
      className.includes('text-mg-green') ||
      homeButton.getAttribute('aria-current') === 'page'

    if (!isAlreadyHome) {
      homeButton.click()
      return true
    }

    return false
  }

  return false
}

const installTvRemoteDetection = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const detect = (event) => {
    if (isStrongTvRemoteEvent(event)) {
      markTvRemoteDetected()
    }
  }

  window.addEventListener('keydown', detect, true)
  document.addEventListener('keydown', detect, true)
}

const installFireTvBackHandler = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const onBackEvent = (event) => {
    if (!isBackEvent(event)) {
      return
    }

    /*
     * Do not hijack browser Back on the public auth pages. Once the protected
     * Media God shell exists, Back belongs to the app and must never fall
     * through to /login.
     */
    if (!mediaGodAppMounted()) {
      return
    }

    markTvRemoteDetected()

    if (event.__mgBackHandled) {
      return
    }

    try {
      event.__mgBackHandled = true
    } catch {
      // Some WebView event objects are non-extensible.
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    if (event.repeat) {
      return
    }

    performFireTvBackAction()
  }

  const onNativeBack = () => {
    if (!mediaGodAppMounted()) {
      return
    }

    const mobileNative =
      document.documentElement.classList.contains('mg-android-mobile') ||
      document.body?.classList.contains('mg-android-mobile')

    if (mobileNative) {
      const handled = performFireTvBackAction()

      if (!handled) {
        try {
          window.MediaGodNative?.exitApp?.()
        } catch {
          // Android can always fall back to the next Back press.
        }
      }

      return
    }

    markTvRemoteDetected()
    performFireTvBackAction()
  }

  window.addEventListener('keydown', onBackEvent, true)
  document.addEventListener('keydown', onBackEvent, true)
  window.addEventListener('mg:native-back', onNativeBack)
}

const installFireTvMediaLifecycle = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const pauseWebMedia = () => {
    document.querySelectorAll('video, audio').forEach((media) => {
      try {
        if (!media.paused) {
          media.dataset.mgWasPlayingBeforePause = 'true'
          media.pause()
        }
      } catch {
        // A provider-owned element may reject direct control.
      }
    })
  }

  const publishResume = () => {
    window.dispatchEvent(new CustomEvent('mg:fire-tv-app-resume'))
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      pauseWebMedia()
      return
    }

    publishResume()
  }

  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('webkitvisibilitychange', onVisibility)
  document.addEventListener('pause', pauseWebMedia)
  document.addEventListener('resume', publishResume)
}

const installFireTvHistoryBackGuard = () => {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return
  }

  let armed = false
  let guardUrl = ''

  const currentUrl = () =>
    `${window.location.pathname}${window.location.search}${window.location.hash}`

  const stateObject = () => {
    const state = window.history.state

    return state && typeof state === 'object'
      ? state
      : {}
  }

  const shouldArm = () =>
    tvRemoteDetected &&
    mediaGodAppMounted()

  const arm = () => {
    if (!shouldArm()) {
      armed = false
      return
    }

    const url = currentUrl()

    if (armed && guardUrl === url) {
      return
    }

    const state = stateObject()

    window.history.replaceState(
      {
        ...state,
        __mgFireTvApp: true,
      },
      '',
      url
    )

    window.history.pushState(
      {
        ...state,
        __mgFireTvApp: true,
        __mgFireTvBackGuard: true,
      },
      '',
      url
    )

    guardUrl = url
    armed = true
  }

  const onPopState = () => {
    if (!shouldArm()) {
      armed = false
      return
    }

    const safeUrl = guardUrl || '/'
    const state = stateObject()

    if (
      window.location.pathname === '/login' ||
      window.location.pathname === '/register' ||
      window.location.pathname === '/forgot-password' ||
      window.location.pathname === '/reset-password'
    ) {
      window.history.replaceState(
        {
          ...state,
          __mgFireTvApp: true,
        },
        '',
        '/'
      )
    }

    window.history.pushState(
      {
        ...state,
        __mgFireTvApp: true,
        __mgFireTvBackGuard: true,
      },
      '',
      safeUrl
    )

    guardUrl = safeUrl
    armed = true

    if (Date.now() - lastFireTvBackActionAt >= 360) {
      performFireTvBackAction()
    }
  }

  const observer = new MutationObserver(() => {
    if (shouldArm()) {
      arm()
    } else {
      armed = false
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  window.addEventListener('popstate', onPopState)
  window.addEventListener('mg:tv-remote-detected', arm)

  window.setTimeout(arm, 0)
  window.setTimeout(arm, 250)
  window.setTimeout(arm, 750)
}

if (tvRemoteDetected && typeof document !== 'undefined') {
  markTvRemoteDetected()
}

installFireTvStableMode()
installTvRemoteDetection()
window.addEventListener('mg:tv-remote-detected', installFireTvStableMode)
installFireTvBackHandler()
installFireTvMediaLifecycle()
installFireTvHistoryBackGuard()

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <FireTvFocusMemory />
    <FireTvAuthNavigation />
    <FireTvPlayerTakeover />
    <PlaybackReliabilityAssist />
    <PlayerEpisodeQuickNav />
    <ContinueWatchingAssist />
    <App />
  </>
)
