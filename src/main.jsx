import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

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

const installFireTvBackHandler = () => {
  if (!isFireTv || typeof window === 'undefined') {
    return
  }

  let lastHandledAt = 0

  window.addEventListener(
    'keydown',
    (event) => {
      if (!isBackEvent(event)) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()

      const now = Date.now()

      if (event.repeat || now - lastHandledAt < 260) {
        return
      }

      lastHandledAt = now

      const fullscreenButtons = Array.from(
        document.querySelectorAll(
          'button[aria-label="Exit fullscreen"]'
        )
      ).filter(isVisible)

      const fullscreenExit = lastItem(fullscreenButtons)

      if (fullscreenExit) {
        fullscreenExit.click()
        return
      }

      const overlay = topVisibleOverlay()
      const overlayBack = findBackTarget(overlay)

      if (overlayBack) {
        overlayBack.click()
        return
      }

      const globalBackButtons = Array.from(
        document.querySelectorAll(
          'button[data-mg-global-back="true"]'
        )
      ).filter(isVisible)

      const globalBack = lastItem(globalBackButtons)

      if (globalBack) {
        globalBack.click()
        return
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
    },
    true
  )
}

if (isFireTv && typeof document !== 'undefined') {
  document.documentElement.classList.add('mg-fire-tv')
  document.body?.classList.add('mg-fire-tv')
}

installFireTvBackHandler()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
