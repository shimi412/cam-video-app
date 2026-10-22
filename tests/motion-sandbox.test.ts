import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sandbox} from '../src/lib/motion/sandbox';
describe.skipIf(process.platform!=='darwin')('motion OS isolation',()=>{
 it('allows job files but denies an outside file and outbound network',async()=>{
  const parent=await mkdtemp(path.join(os.tmpdir(),'cam-motion-isolation-'));
  const {mkdir}=await import('node:fs/promises');const job=path.join(parent,'job');await mkdir(job);
  const outside=path.join(parent,'private.txt');await writeFile(outside,'private');
  try{
   await sandbox(job,'/bin/bash',['-c','echo rendered > result.txt']);
   expect((await readFile(path.join(job,'result.txt'),'utf8')).trim()).toBe('rendered');
   await expect(sandbox(job,'/bin/cat',[outside])).rejects.toThrow();
   await expect(sandbox(job,'/bin/bash',['-c','echo changed > "$1"','sh',outside])).rejects.toThrow();
   await expect(sandbox(job,'/usr/bin/curl',['--connect-timeout','1','http://127.0.0.1:3108'])).rejects.toThrow();
   expect(await readFile(outside,'utf8')).toBe('private');
  }finally{await rm(parent,{recursive:true,force:true});}
 },15000);
});
