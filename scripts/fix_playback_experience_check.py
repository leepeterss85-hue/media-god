from pathlib import Path

path = Path("scripts/native-structure-check.mjs")
text = path.read_text()

old = '''    [streamPreflight.includes('setRequestProperty("Range", "bytes=0-1")') && streamPreflight.includes("451"), "resolved stream HTTP preflight"],'''
new = '''    [
      streamPreflight.includes('setRequestProperty("Range", "bytes=0-${wanted - 1}")') &&
        streamPreflight.includes("networkRisk") &&
        streamPreflight.includes("estimatedMbps") &&
        streamPreflight.includes("451"),
      "resolved stream HTTP/network preflight",
    ],'''

if new in text:
    raise SystemExit(0)
if old not in text:
    raise SystemExit("Could not find old resolved stream HTTP preflight check")

path.write_text(text.replace(old, new, 1))
