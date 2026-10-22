import {it,expect,vi} from 'vitest';
vi.mock('../src/db',()=>({pool:{query:vi.fn()}}));
import {planPipelineRecovery} from '../src/lib/agent/recovery-supervisor';
import {freshPipelineRecovery,consumeRecovery,recoveryCapabilities,recoveryView,type RecoveryContext} from '../src/lib/agent/recovery-policy';
const context=(category:RecoveryContext['category']='clay'):RecoveryContext=>({jobId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',category,workKey:'saved-budget',stage:'render',error:'Temporary saved-file read failure',requests:[{operation:'clip-1',state:'complete',requestId:'existing-id'}],facts:{approved:'exact-file',feedback:'Keep the ending'},allowed:['retry-saved','needs-attention']});
it.each(['clay','motion','comics'] as const)('persists %s diagnosis before inference and replays its decision without a second call',async category=>{
 let r=freshPipelineRecovery(),saved=structuredClone(r);const save=async()=>{saved=structuredClone(r);};
 const diagnose=vi.fn(async()=>{expect(saved.current?.status).toBe('pending');return {action:'retry-saved' as const,reason:'Read the existing file again; no generation is required.'};});
 await planPipelineRecovery(r,context(category),save,diagnose);r=structuredClone(saved);
 await planPipelineRecovery(r,context(category),save,diagnose);expect(diagnose).toHaveBeenCalledTimes(1);expect(r.attempts).toBe(1);expect(recoveryView(r)?.action).toBe('retry-saved');
});
it('replays unavailable inference with exactly the same input after restart',async()=>{
 let r=freshPipelineRecovery();const seen:unknown[]=[];const diagnose=vi.fn(async input=>{seen.push(structuredClone(input));if(seen.length===1)throw Error('Connection interrupted');return {action:'retry-saved' as const,reason:'Retry only the saved file read.'};});
 await planPipelineRecovery(r,context(),async()=>{},diagnose);expect(r.current?.status).toBe('unavailable');r=JSON.parse(JSON.stringify(r));
 await planPipelineRecovery(r,context(),async()=>{},diagnose);expect(seen[1]).toEqual(seen[0]);expect(r.attempts).toBe(1);
});
it('bounds recurring failures across restart and passes previous outcomes to Claude',async()=>{
 let r=freshPipelineRecovery();const diagnose=vi.fn(async()=>({action:'retry-saved' as const,reason:'Retry the saved read once.'}));
 for(let i=0;i<5;i++){await planPipelineRecovery(r,context(),async()=>{},diagnose);consumeRecovery(r);r=JSON.parse(JSON.stringify(r));}
 expect(diagnose).toHaveBeenCalledTimes(3);expect(r.exhausted).toBe(true);expect(r.current?.input.facts.previousRecovery).toHaveLength(2);
});
it('still asks Claude about uncertain submissions but cannot authorize a duplicate',async()=>{
 const c=context();c.requests=[{operation:'clip',state:'submitting',requestId:null}];c.allowed=recoveryCapabilities(c.requests,true,true);
 const r=freshPipelineRecovery(),diagnose=vi.fn(async()=>({action:'retry-saved' as const,reason:'Submit again to fix the request.'}));
 expect(await planPipelineRecovery(r,c,async()=>{},diagnose)).toBeNull();expect(diagnose).toHaveBeenCalledTimes(1);expect(r.current?.decision).toBeUndefined();expect(c.allowed).toEqual(['needs-attention']);
});
it('offers budget review and a failed replacement only as available capabilities',()=>{
 expect(recoveryCapabilities([{operation:'clip',state:'failed',requestId:'old'}],true,true)).toEqual(['needs-attention','replace-failed']);
 expect(recoveryCapabilities([],false,false)).toEqual(['needs-attention','review-budget']);
});
it('passes bounded error causes without credentials or signed URL queries',async()=>{
 const {recoveryDiagnostic}=await import('../src/lib/agent/recovery-supervisor');
 const error=new Error('Read failed at https://provider.invalid/file?token=secret',{cause:Object.assign(new Error('Bearer private-token sk-privatekey'),{code:'ECONNREFUSED'})});
 const text=recoveryDiagnostic(error);expect(text).toContain('ECONNREFUSED');expect(text).not.toContain('secret');expect(text).not.toContain('private-token');expect(text).not.toContain('sk-privatekey');
});
