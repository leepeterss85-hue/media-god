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
  /AmazonWebAppPlatform/i.test(userAgent)

if (isFireTv && typeof document !== 'undefined') {
  document.documentElement.classList.add('mg-fire-tv')
  document.body?.classList.add('mg-fire-tv')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
