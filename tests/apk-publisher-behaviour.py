import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

os.environ.update(GITHUB_REPOSITORY='test/repo', GITHUB_SHA='b'*40)
spec = importlib.util.spec_from_file_location('publisher', Path(__file__).resolve().parents[1] / 'scripts/publish-apk-pointers.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

class PublisherTests(unittest.TestCase):
    def run_publish(self, fail=False):
        old_sha = 'a'*40
        names = ['Media-God-Android-Mobile.apk', 'Media-God-Fire-TV.apk']
        tags = ['android-mobile-latest', 'firetv-latest']
        releases = {tag: dict(id=i+1, tag_name=tag, target_commitish=old_sha,
                    body='Verified-APK-Commit: '+old_sha,
                    assets=[dict(id=10+i, name=names[i], state='uploaded')]) for i,tag in enumerate(tags)}
        refs = {tag: old_sha for tag in tags}
        failed = False
        def fake_gh(*args):
            if args[:2] == ('release','upload'):
                tag, path = args[2], args[3]
                releases[tag]['assets'].append(dict(id=100+releases[tag]['id'], name=Path(path).name, state='uploaded'))
                return ''
            raise AssertionError(args)
        def fake_api(path, **fields):
            nonlocal failed
            if path.startswith('releases/tags/'):
                return copy.deepcopy(releases[path.split('/')[-1]])
            if path.startswith('git/ref/tags/'):
                return {'object': {'sha': refs[path.split('/')[-1]]}}
            if path.startswith('git/refs/tags/'):
                refs[path.split('/')[-1]] = fields['sha']; return {}
            if path.startswith('releases/assets/'):
                asset = next(a for r in releases.values() for a in r['assets'] if a['id']==int(path.split('/')[-1]))
                if fail and not failed and asset['id']==102 and fields.get('name')==names[1]:
                    failed=True
                    raise RuntimeError('Simulated second-device rename failure')
                asset.update(fields); return asset
            if path.startswith('releases/'):
                release = next(r for r in releases.values() if r['id']==int(path.split('/')[-1]))
                release.update(fields); return release
            raise AssertionError(path)
        def download(*args, **kwargs):
            kwargs['stdout'].write(b'signed-apk')
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as root:
            try:
                os.chdir(root)
                for name in names: Path(name).write_bytes(b'signed-apk')
                with patch.object(publisher,'gh',fake_gh), patch.object(publisher,'api',fake_api), patch.object(publisher.subprocess,'run',download):
                    if fail:
                        with self.assertRaises(RuntimeError): publisher.publish()
                    else: publisher.publish()
            finally: os.chdir(cwd)
        for i,tag in enumerate(tags):
            result=releases[tag]
            canonical=next(a for a in result['assets'] if a['name']==names[i])
            self.assertEqual(canonical['id'], 10+i if fail else 101+i)
            self.assertEqual(result['target_commitish'],'b'*40)
            self.assertEqual(refs[tag], old_sha if fail and i == 1 else 'b'*40)
            self.assertNotIn('Verified-APK-Commit:',result['body'])
            if fail: self.assertIn('Original-APK-Commit: '+old_sha,result['body'])
            self.assertTrue(any(a['id']==10+i for a in result['assets']))
    def test_success_preserves_old_assets(self): self.run_publish()
    def test_failure_restores_both_devices(self): self.run_publish(True)

unittest.main()
