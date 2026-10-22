import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
vi.mock('../src/db',()=>({pool:{query:vi.fn()}}));
import {supervisedStep} from '../src/lib/agent/recovery-step';
import {recoveryDependencies,canonicalRecovery,recoveryHash} from '../src/lib/agent/recovery-supervisor';
const dirs:string[]=[];afterEach(async()=>{vi.restoreAllMocks();for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
async function input(){const directory=await mkdtemp(path.join(os.tmpdir(),'cam-step-'));dirs.push(directory);return {jobId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',category:'clay' as const,stage:'price',inputs:{budget:'same',feedback:['Original note']},directory,assertOwned:async()=>{}};}
it('returns the client explanation and preserves the failed request for exact replay',async()=>{
 const i=await input(),execute=vi.fn(async()=>{throw Error('Pricing connection unavailable');});
 const analyse=vi.spyOn(recoveryDependencies,'diagnose').mockRejectedValueOnce(Error('Analysis temporarily unavailable')).mockResolvedValue({action:'needs-attention',reason:'The pricing service needs its saved connection checked.',clientMessage:'The price is not available yet. Your saved request is preserved.'});
 await expect(supervisedStep({...i,execute})).rejects.toThrow('recovery analysis could not complete');
 await expect(supervisedStep({...i,execute})).rejects.toThrow('price is not available');
 expect(execute).toHaveBeenCalledTimes(1);expect(analyse.mock.calls[1][0]).toEqual(analyse.mock.calls[0][0]);
 const [name]=await readdir(path.join(i.directory,'recovery-actions'));const saved=JSON.parse(await readFile(path.join(i.directory,'recovery-actions',name),'utf8'));
 expect(saved.recovery.attempts).toBe(1);expect(saved.recovery.current.input.facts.inputs.feedback).toEqual(['Original note']);
});
it('applies one Claude-authorized retry to the same price inputs and no other action',async()=>{
 const i=await input();const execute=vi.fn().mockRejectedValueOnce(Error('Temporary read error')).mockResolvedValue({price:35});
 vi.spyOn(recoveryDependencies,'diagnose').mockResolvedValue({action:'retry-saved',reason:'Retry the same price read after the temporary outage.'});
 vi.spyOn(globalThis,'setTimeout').mockImplementation(((fn:()=>void)=>{fn();return 0;}) as unknown as typeof setTimeout);
 expect(await supervisedStep({...i,execute})).toEqual({price:35});expect(execute).toHaveBeenCalledTimes(2);
});
it('keeps recovery identity and prompt stable when PostgreSQL reorders JSONB keys',()=>{
 const a={jobId:'id',facts:{quote:{expires:123,id:'same'},notes:['a','b']},category:'clay'};
 const b={category:'clay',facts:{notes:['a','b'],quote:{id:'same',expires:123}},jobId:'id'};
 expect(recoveryHash(a)).toBe(recoveryHash(b));expect(JSON.stringify(canonicalRecovery(a))).toBe(JSON.stringify(canonicalRecovery(b)));
});
it('runs the free local narration recheck directly, without a paid Claude decision, and journals a failure as a client message',async()=>{
 const {supervisedAudioCheck,RecoveryStepError}=await import('../src/lib/agent/recovery-step');const i=await input(),execute=vi.fn(async()=>({recording:'unchanged'}));
 const diagnose=vi.spyOn(recoveryDependencies,'diagnose');
 expect(await supervisedAudioCheck({...i,execute})).toEqual({recording:'unchanged'});expect(execute).toHaveBeenCalledTimes(1);expect(diagnose).not.toHaveBeenCalled();
 const second=await input(),failing=vi.fn(async()=>{throw Error('word 7 missing');});
 await expect(supervisedAudioCheck({...second,execute:failing})).rejects.toBeInstanceOf(RecoveryStepError);expect(diagnose).not.toHaveBeenCalled();
});
