import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('an unusable stream limit stops startup before the world is opened', t => {
  const directory=mkdtempSync(join(tmpdir(),'a-view-config-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  for(const value of ['-1','0','Infinity','2.5','many','']){
    const path=join(directory,`world-${value||'empty'}.sqlite`);
    const result=spawnSync(process.execPath,['src/server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,A_VIEW_DB:path,PORT:'0',A_VIEW_MAX_STREAMS:value},encoding:'utf8',timeout:10_000});
    assert.equal(result.status,1,`"${value}" should be refused`);
    assert.match(result.stderr,/A_VIEW_MAX_STREAMS must be a positive whole number/);
    assert.equal(existsSync(path),false);
  }
});
