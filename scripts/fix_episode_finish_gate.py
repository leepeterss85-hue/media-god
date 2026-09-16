from pathlib import Path

path = Path('scripts/ui-regression-check.mjs')
text = path.read_text()
old = r'''    /\[\s*rdTorrentId,\s*rdOverride,\s*\]\s*\n\s*\);/.test(videoPlayer) &&'''
new = r'''    /\[\s*rdTorrentId,\s*rdOverride,\s*(?:rdManualFileSelection,\s*)?\]\s*\n\s*\);/.test(videoPlayer) &&'''

if new not in text:
    if old not in text:
        raise SystemExit('Missing anchor: RD polling dependency regression gate')
    text = text.replace(old, new, 1)

path.write_text(text)
print('UI regression gate now accepts the intentional rdManualFileSelection dependency while still rejecting source replay.')
