import {expect,it} from "vitest";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {backgroundCandidates,backgroundCycle} from "../src/lib/concept/background-worker";
import {requestedBackground} from "../src/lib/concept/background-policy";
it("discovers only explicit unfinished intents and isolates unreadable checkpoints and job errors",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"cam-worker-discovery-"));
 const [legacy,finished,first,second,corrupt]=Array.from({length:5},()=>randomUUID());
 const put=async(id:string,state:unknown)=>{const dir=path.join(root,"storage/concepts",id,"live");await mkdir(dir,{recursive:true});await writeFile(path.join(dir,"production.json"),typeof state==="string"?state:JSON.stringify(state));};
 try{
  await put(legacy,{finished:false});await put(finished,{finished:true,background:requestedBackground()});
  for(const id of [first,second])await put(id,{finished:false,background:requestedBackground()});
  await put(corrupt,"{broken");
  const errors:string[]=[];
  expect((await backgroundCandidates(root,id=>errors.push(id))).sort()).toEqual([first,second].sort());
  expect(errors).toContain(corrupt);
  const ran:string[]=[];
  await backgroundCycle(async id=>{ran.push(id);if(id===first)throw new Error("isolated fault");},id=>errors.push(id),root);
  expect(ran.sort()).toEqual([first,second].sort());expect(errors).toContain(first);
 }finally{await rm(root,{recursive:true,force:true});}
});
