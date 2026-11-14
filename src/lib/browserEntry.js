// These are hints, not a complete list: some in-app browsers hide their identity.
export function needsBrowserHelp(userAgent = '', hasNativeBridge = false) {
  if (hasNativeBridge || /MediaGod|AndroidMobile|FireTV|AmazonWebAppPlatform|\bAFT\w*/i.test(userAgent)) return false;
  return /FBAN|FBAV|Instagram|WhatsApp|\bLine\/|TikTok|Bytedance|; wv\)/i.test(userAgent);
}
