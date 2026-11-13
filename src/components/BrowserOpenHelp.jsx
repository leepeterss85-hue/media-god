import { useState } from 'react';
import { needsBrowserHelp } from '@/lib/browserEntry';

export default function BrowserOpenHelp() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (sessionStorage.getItem('mg-browser-help-dismissed') === '1') return false;
    } catch { /* Storage can be disabled in an in-app browser. */ }
    return needsBrowserHelp(navigator.userAgent, Boolean(window.MediaGodNative));
  });
  if (!visible) return null;
  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem('mg-browser-help-dismissed', '1'); } catch { /* Optional. */ }
  };
  return (
    <aside aria-label="Browser help" className="fixed bottom-3 left-3 right-3 z-[100] mx-auto max-w-md rounded-xl border border-white/20 bg-slate-900 p-4 text-white shadow-xl">
      <p className="text-sm">Opening from a message? If loading or sign-in fails, try your usual browser.</p>
      <div className="mt-3 flex items-center gap-4">
        <a href="/open.html" className="rounded-lg bg-mg-green px-4 py-3 font-semibold text-black">Open in browser</a>
        <button type="button" onClick={dismiss} className="min-h-11 px-3 text-sm">Dismiss</button>
      </div>
    </aside>
  );
}
