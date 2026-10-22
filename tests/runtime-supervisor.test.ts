import {expect,it} from "vitest";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {supervise} from "../scripts/runtime-supervisor";
it("restarts a killed web or worker child independently and shuts both down cleanly",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"cam-supervisor-"));
 const source=`const fs=require('node:fs');const p=process.argv[1];let n=0;try{n=Number(fs.readFileSync(p,'utf8'))}catch{}fs.writeFileSync(p,String(n+1));setInterval(()=>{},1000);`;
 const runtime=supervise(["web","worker"].map(name=>({name,command:process.execPath,args:["-e",source,path.join(root,name)]})),{cwd:root,env:{NODE_ENV:"test",PATH:process.env.PATH},restartMs:25});
 const waitCount=async(name:string,count:number)=>{
  const deadline=Date.now()+5000;
  while(Number(await readFile(path.join(root,name),"utf8").catch(()=>"0"))<count){if(Date.now()>deadline)throw new Error("Child did not restart");await new Promise(r=>setTimeout(r,20));}
 };
 try{
  await waitCount("web",1);await waitCount("worker",1);
  const worker=runtime.children.get("worker")!.pid;
  runtime.children.get("web")!.kill("SIGKILL");await waitCount("web",2);expect(runtime.children.get("worker")!.pid).toBe(worker);
  runtime.children.get("worker")!.kill("SIGKILL");await waitCount("worker",2);expect(runtime.children.get("worker")!.pid).not.toBe(worker);
 }finally{runtime.stop();await runtime.done;await rm(root,{recursive:true,force:true});}
},15000);
