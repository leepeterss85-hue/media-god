import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/archive-stable-apks.sh', import.meta.url));
for (const corrupt of [false, true]) {
  test(`interrupted draft archive ${corrupt ? 'rejects different bytes' : 'publishes only after matching both original APKs'}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'mg-archive-'));
    try {
      const oldSha = 'a'.repeat(40), newSha = 'b'.repeat(40);
      const assets = ['Media-God-Android-Mobile.apk', 'Media-God-Fire-TV.apk'];
      const asset = (id, name) => ({id, name, size: 1000001, state: 'uploaded'});
      const base = {target_commitish:oldSha, draft:false, published_at:'2026-11-14', body:''};
      const releases = {
        'android-mobile-latest': {...base, assets:[asset(1,assets[0])]},
        'firetv-latest': {...base, assets:[asset(2,assets[1])]},
        [`stable-${oldSha.slice(0,12)}`]: {...base,id:3,draft:true,published_at:null,assets:[asset(3,assets[0]),asset(4,assets[1])]}
      };
      writeFileSync(join(dir,'releases.json'), JSON.stringify(releases));
      writeFileSync(join(dir,'gh'), `#!/usr/bin/env python3
import sys,os,json
args=sys.argv[1:]; root=os.environ['MOCK_ROOT']
path=next((a for a in args if a.startswith('repos/')), '')
if '--method' in args:
    json.dump(args,open(root+'/patch.json','w'))
    print(json.dumps({'draft':False,'published_at':'2026-11-14'}))
elif '/assets/' in path:
    id=int(path.rsplit('/',1)[1])
    with open(root+'/downloads','a') as f: f.write(str(id)+'\\n')
    sys.stdout.buffer.write((b'x' if id%2 else b'y')*1000001 if not (os.environ['CORRUPT']=='1' and id==4) else b'z'*1000001)
else:
    print(json.dumps(json.load(open(root+'/releases.json'))[path.rsplit('/',1)[1]]))
`, {mode:0o755});
      const result = spawnSync('bash',[script],{encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,MOCK_ROOT:dir,RUNNER_TEMP:dir,GITHUB_REPOSITORY:'owner/repo',GITHUB_SHA:newSha,CORRUPT:corrupt?'1':'0'}});
      if (corrupt) {
        assert.notEqual(result.status,0);
        assert.match(result.stderr,/differs from original/);
        assert.equal(existsSync(join(dir,'patch.json')),false);
      } else {
        assert.equal(result.status,0,result.stderr);
        assert.deepEqual(readFileSync(join(dir,'downloads'),'utf8').trim().split('\n'),['1','3','2','4']);
        const patch = JSON.parse(readFileSync(join(dir,'patch.json'),'utf8'));
        assert.ok(patch.includes('draft=false'));
        assert.ok(patch.includes('target_commitish='+newSha));
        assert.ok(patch.some(a=>a.includes('Original-APK-Commit: '+oldSha)));
        assert.match(result.stdout,/Completed and verified interrupted archive/);
      }
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
}
