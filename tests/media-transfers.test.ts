import {it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {uploadReference} from '../src/lib/concept/media-transfers';
import {sha256,saveCheckpoint} from '../src/lib/concept/checkpoints';
/** Live Clay 2026-10-23: hosted references expire after a day and an interrupted upload left a checkpoint
 * "uploading"; both stopped the film with a client-facing error. Both are now retried from the exact bytes. */
it('re-uploads an expired or interrupted reference from the same verified bytes without stopping',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cam-transfer-'));
 try{
  const bytes=Buffer.from('reviewed-reference-bytes'),file=path.join(dir,'ref.png');await writeFile(file,bytes);
  const hash=sha256(bytes),uploads:string[]=[];
  const transport={mode:'simulation' as const,upload:async(_b:Buffer,name:string)=>{uploads.push(name);return {url:`https://simulation.invalid/${uploads.length}`,expiresAt:Date.now()+3600_000};},download:async()=>new Response()};
  const input={directory:dir,transport,assertOwned:async()=>{},file,sha256:hash,contentType:'image/png' as const};
  const first=await uploadReference(input);expect(first.reused).toBe(false);expect(uploads).toHaveLength(1);
  const again=await uploadReference(input);expect(again.reused).toBe(true);expect(uploads).toHaveLength(1);
  const key=sha256(JSON.stringify({mode:'simulation',hash,contentType:'image/png'})),checkpoint=path.join(dir,'uploads',`${key}.json`);
  await saveCheckpoint(checkpoint,{mode:'simulation',fingerprint:key,sha256:hash,state:'complete',url:first.url,expiresAt:Date.now()-1000},async()=>{});
  const refreshed=await uploadReference(input);expect(refreshed.reused).toBe(false);expect(uploads).toHaveLength(2);
  await saveCheckpoint(checkpoint,{mode:'simulation',fingerprint:key,sha256:hash,state:'uploading'},async()=>{});
  const retried=await uploadReference(input);expect(retried.reused).toBe(false);expect(uploads).toHaveLength(3);
  expect(retried.url).toContain('simulation.invalid');
 }finally{await rm(dir,{recursive:true,force:true});}
});
