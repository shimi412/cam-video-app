/** Actual SIGKILL/restart with PostgreSQL locks, persisted queue receipts and
 * simulated transports. No provider credentials, browser or paid requests. */
import assert from "node:assert/strict";
import {fork,type ChildProcess} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdtemp,mkdir,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {backgroundCycle} from "../src/lib/concept/background-worker";
import {requestedBackground} from "../src/lib/concept/background-policy";
import {advanceRequest,requestReceipts} from "../src/lib/concept/request-journal";
import {acquireJobLock} from "../src/lib/job-lock";
process.env.PROVIDER_MODE="dryrun";
globalThis.fetch=async()=>{throw new Error("Network forbidden in restart test");};
const send=(message:unknown)=>new Promise<void>(resolve=>process.send?.(message,()=>resolve()));
async function child(root:string,id:string,mode:string){
 await backgroundCycle(async candidate=>{
  assert.equal(candidate,id);const lock=await acquireJobLock(id);
  if(!lock){await send({state:"locked"});return;}
  try{
   const directory=path.join(root,"requests");
   const result=await advanceRequest({directory,fingerprint:"a".repeat(64),assertOwned:lock.assertOwned,queue:{mode:"simulation",
    submit:async()=>{
     const file=path.join(root,"submissions.json");const count=JSON.parse(await readFile(file,"utf8").catch(()=>"0"))+1;await writeFile(file,JSON.stringify(count));
     if(mode==="uncertain"){await send({state:"uncertain"});await new Promise(()=>{});}
     return {requestId:"original-paid-id-simulated"};
    },
    poll:async requestId=>{assert.equal(requestId,"original-paid-id-simulated");if(mode==="hold"){await send({state:"accepted"});await new Promise(()=>{});}return {state:"complete",output:"original-output"};}
   }});
   await send({state:result.state});
  }catch(error){await send({state:"blocked",message:String(error)});}
  finally{await lock.release();}
 },(_id,error)=>{throw error;},root);
 process.exit(0);
}
async function main(){
 const roots:string[]=[],children:ChildProcess[]=[];
 try{
  for(const mode of ["hold","uncertain"]){
   const root=await mkdtemp(path.join(tmpdir(),"cam-worker-restart-")),id=randomUUID();roots.push(root);
   await mkdir(path.join(root,"storage/concepts",id,"live"),{recursive:true});
   await writeFile(path.join(root,"storage/concepts",id,"live/production.json"),JSON.stringify({background:requestedBackground(),finished:false}));
   const start=(kind:string)=>{
    const child=fork(process.argv[1],["--child",root,id,kind],{execArgv:["--import","tsx"],stdio:["ignore","inherit","inherit","ipc"]});children.push(child);
    const first=new Promise<{state:string;message?:string}>((resolve,reject)=>{
     const timer=setTimeout(()=>reject(new Error("Restart check timed out")),20000);
     child.once("message",m=>{clearTimeout(timer);resolve(m as {state:string});});child.once("error",reject);
    });return {child,first};
   };
   const initial=start(mode);assert.equal((await initial.first).state,mode==="hold"?"accepted":"uncertain");
   const competitor=start("complete");assert.equal((await competitor.first).state,"locked");
   const exit=new Promise(resolve=>initial.child.once("exit",resolve));initial.child.kill("SIGKILL");await exit;
   // A killed worker releases its DB lock. No lease timeout or browser is needed.
   const restarted=start("complete"),result=await restarted.first;
   assert.equal(result.state,mode==="hold"?"complete":"blocked");
   if(mode==="uncertain")assert.match(result.message!,/Reconcile/);
   assert.equal(JSON.parse(await readFile(path.join(root,"submissions.json"),"utf8")),1);
   const [receipt]=await requestReceipts(path.join(root,"requests"));assert.equal(receipt.state,mode==="hold"?"complete":"submitting");
  }
  const proof={status:"passed",actualWorkerSigkill:true,competingWorkersSerialized:true,savedIdRecoveredAfterRestart:true,uncertainSubmissionNotRepeated:true,newPaidCalls:0};
  await mkdir("storage/qa",{recursive:true});await writeFile("storage/qa/worker-restart-proof.json",JSON.stringify(proof,null,2));console.log(proof);
 }finally{for(const child of children)if(child.exitCode===null)child.kill("SIGKILL");for(const root of roots)await rm(root,{recursive:true,force:true});}
}
if(process.argv[2]==="--child")child(process.argv[3],process.argv[4],process.argv[5]).catch(e=>{console.error(e);process.exit(1);});
else main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
