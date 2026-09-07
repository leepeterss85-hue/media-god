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

const userAgent =
  typeof navigator !== 'undefined'
    ? navigator.userAgent || ''
    : ''

const isFireTv =
  /\bAFT[A-Z0-9]*\b/i.test(userAgent) ||
  /Fire\s*TV/i.test(userAgent) ||
  /AmazonWebAppPlatform/i.test(userAgent) ||
  /Silk/i.test(userAgent)

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

const topVisibleOverlay = () => {
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
  const key = String(event?.key || event?.code || '')
  const code = Number(event?.keyCode || event?.which || 0)
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
  document.querySelector('#root .mg-fire-tv-nav') instanceof HTMLElement

let lastFireTvBackActionAt = 0

const performFireTvBackAction = () => {
  const now = Date.now()

  if (now - lastFireTvBackActionAt < 240) {
    return true
  }

  lastFireTvBackActionAt = now

  const fullscreenButtons = Array.from(
    document.querySelectorAll(
      'button[aria-label="Exit fullscreen"]'
    )
  ).filter(isVisible)

  const fullscreenExit = lastItem(fullscreenButtons)

  if (fullscreenExit) {
    fullscreenExit.click()
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
    }
  }

  /* Home is the end of the Fire TV Back stack. */
  return true
}

const installFireTvBackHandler = () => {
  if (!isFireTv || typeof window === 'undefined') {
    return
  }

  window.addEventListener(
    'keydown',
    (event) => {
      if (!isBackEvent(event)) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()

      if (event.repeat) {
        return
      }

      performFireTvBackAction()
    },
    true
  )
}

/*
 * Some Fire TV WebViews perform the physical Back action as browser history
 * navigation without delivering a usable keydown first. After Google login,
 * /login can therefore still be the previous browser-history entry.
 *
 * Arm one duplicate history entry only while the authenticated Media God UI
 * is mounted. A native Back pops to the duplicate / entry, we immediately
 * re-arm it, then run the same in-app Back action. The login/auth pages are
 * deliberately left untouched.
 */
const installFireTvHistoryBackGuard = () => {
  if (
    !isFireTv ||
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

  const arm = () => {
    if (!mediaGodAppMounted()) {
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
    if (!mediaGodAppMounted()) {
      armed = false
      return
    }

    const safeUrl = guardUrl || currentUrl()
    const state = stateObject()

    /* Re-arm synchronously so a second quick Back cannot reach /login. */
    window.history.pushState(
      {
        ...state,
        __mgFireTvApp: true,
        __mgFireTvBackGuard: true,
      },
      '',
      safeUrl
    )

    armed = true

    /* If keydown already handled this same press, do not back twice. */
    if (Date.now() - lastFireTvBackActionAt >= 360) {
      performFireTvBackAction()
    }
  }

  const observer = new MutationObserver(() => {
    if (mediaGodAppMounted()) {
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

  window.setTimeout(arm, 0)
  window.setTimeout(arm, 250)
  window.setTimeout(arm, 750)
}

if (isFireTv && typeof document !== 'undefined') {
  document.documentElement.classList.add('mg-fire-tv')
  document.body?.classList.add('mg-fire-tv')
}

installFireTvStableMode()
installFireTvBackHandler()
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
