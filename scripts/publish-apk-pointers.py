#!/usr/bin/env python3
"""Swap verified assets without deleting releases; restore old assets on failure."""
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile

REPO = os.environ['GITHUB_REPOSITORY']
SHA = os.environ['GITHUB_SHA']

def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)

def api(path, **fields):
    args = ['api', f'repos/{REPO}/{path}']
    if fields:
        args += ['--method', 'PATCH']
        for key, value in fields.items():
            args += ['-F' if isinstance(value, bool) else '-f', f'{key}={str(value).lower() if isinstance(value, bool) else value}']
    return json.loads(gh(*args))

def release(tag):
    # Exact-tag list fallback for the observed tag-route 404.
    try:
        return api(f'releases/tags/{tag}')
    except subprocess.CalledProcessError:
        pages = json.loads(gh('api', '--paginate', '--slurp', f'repos/{REPO}/releases?per_page=100'))
        matches = [r for page in pages for r in page if r['tag_name'] == tag]
        if len(matches) != 1:
            raise RuntimeError(f'Cannot unambiguously find {tag}')
        return matches[0]

def publish():
    prepared = []
    changed = []
    with tempfile.TemporaryDirectory() as root:
        # Upload and byte-verify BOTH candidate assets while old URLs still work.
        for tag, asset in [('android-mobile-latest', 'Media-God-Android-Mobile.apk'),
                           ('firetv-latest', 'Media-God-Fire-TV.apk')]:
            old = release(tag)
            prior = next(a for a in old['assets'] if a['name'] == asset and a['state'] == 'uploaded')
            candidate_name = f'{SHA}-{os.environ.get("GITHUB_RUN_ID", "manual")}-{os.environ.get("GITHUB_RUN_ATTEMPT", "1")}-{asset}'
            candidate_path = Path(root) / candidate_name
            shutil.copyfile(asset, candidate_path)
            existing = next((a for a in old['assets'] if a['name'] == candidate_name), None)
            if not existing:
                gh('release', 'upload', tag, str(candidate_path), '--repo', REPO)
            fresh = release(tag)
            candidate = next(a for a in fresh['assets'] if a['name'] == candidate_name and a['state'] == 'uploaded')
            with open(Path(root) / 'verified.apk', 'wb') as target:
                subprocess.run(['gh', 'api', '-H', 'Accept: application/octet-stream',
                                f'repos/{REPO}/releases/assets/{candidate["id"]}'], stdout=target, check=True)
            import hashlib
            def digest(path):
                h = hashlib.sha256()
                with open(path, 'rb') as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        h.update(chunk)
                return h.digest()
            if digest(asset) != digest(Path(root) / 'verified.apk'):
                raise RuntimeError('Uploaded candidate differs from signed build')
            original = re.search(r'^Original-APK-Commit: ([0-9a-f]{40})$', old.get('body') or '', re.MULTILINE)
            old['_apk_source'] = original.group(1) if original else old['target_commitish']
            prepared.append((old, prior, candidate, asset, candidate_name))
        try:
            for old, prior, candidate, asset, candidate_name in prepared:
                # Suppress update prompts throughout the switch. The workflow
                # restores the ready marker only after verifying both public URLs.
                changed.append((old, prior, candidate, asset, candidate_name))
                api(f'releases/{old["id"]}', target_commitish=SHA, body='APK publication in progress; readiness pending verification.')
                api(f'releases/assets/{prior["id"]}', name=f'previous-{prior["id"]}-{asset}')
                api(f'releases/assets/{candidate["id"]}', name=asset)
                api(f'git/refs/tags/{old["tag_name"]}', sha=SHA, force=True)
                api(f'releases/{old["id"]}', target_commitish=SHA)
        except Exception:
            for old, prior, candidate, asset, candidate_name in reversed(changed):
                try:
                    api(f'releases/assets/{candidate["id"]}', name=candidate_name)
                    api(f'releases/assets/{prior["id"]}', name=asset)
                    # Older workflow commits can require permissions unavailable
                    # to GITHUB_TOKEN. Restore downloads, suppress all update
                    # prompts, and retain provenance without retargeting backwards.
                    api(f'releases/{old["id"]}', target_commitish=SHA,
                        body='Previous APK restored after publication failure.\nOriginal-APK-Commit: ' + old['_apk_source'])
                except Exception as recovery_error:
                    print(f'Automatic recovery needs attention: {recovery_error}', flush=True)
            raise

if __name__ == '__main__':
    publish()
