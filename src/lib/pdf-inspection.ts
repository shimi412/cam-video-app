import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
export async function inspectPdf(bytes: Uint8Array) {
  return new Promise<{pages:number;textBytes:number}>((resolve,reject)=>{
    const child=spawn(process.execPath,["--max-old-space-size=192",path.join(process.cwd(),"scripts/pdf-inspect.mjs")],{stdio:["pipe","pipe","ignore"]});
    let output="";
    const timer=setTimeout(()=>{child.kill("SIGKILL");},15000);
    child.stdout.on("data",(data)=>{output+=data.toString();if(output.length>4096)child.kill("SIGKILL");});
    child.stdin.on("error",()=>{});
    child.on("error",()=>{clearTimeout(timer);reject(new Error("PDF inspection could not start."));});
    child.on("exit",(code)=>{clearTimeout(timer);try{if(code!==0)throw new Error();resolve(z.object({pages:z.number().int().min(1).max(40),textBytes:z.number().int().nonnegative().max(500000)}).parse(JSON.parse(output)));}catch{reject(new Error("This PDF could not be read. Use an unencrypted PDF with at most 40 pages."));}});
    child.stdin.end(bytes);
  });
}
