import { actorFor, withAccess } from "@/lib/access";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { storedVideoUrl } from "@/lib/stored-media";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
const pending=new Map<string,Promise<Buffer>>();
export const GET=withAccess(async (_request,{params}:{params:Promise<{id:string}>})=>{
 const {id}=await params;if(!z.uuid().safeParse(id).success)return new Response(null,{status:400});
 const [job]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,id));if(!job)return new Response(null,{status:404});
 if((job.params as {filmType?:string})?.filmType==='comics'){
  const {getComic,comicDirectory}=await import('@/lib/comics/store');
  try{const s=await getComic(id,(await actorFor(_request))!.id),image=Object.values(s.images)[0];if(!image)return new Response(null,{status:404});
   return new Response(new Uint8Array(await readFile(path.join(comicDirectory(id),image))),{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store'}});
  }catch{return new Response(null,{status:404});}
 }
 if((job.params as {filmType?:string})?.filmType==='motion'){
  const {getMotion,motionDirectory}=await import('@/lib/motion/store');
  try{const s=await getMotion(id,(await actorFor(_request))!.id);if(!['board','visuals','finishing','complete'].includes(s.phase))return new Response(null,{status:404});
   const bytes=await readFile(path.join(motionDirectory(id,s.revision),`${s.film!.scenes[0].id}.jpg`));
   return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store'}});
  }catch{return new Response(null,{status:404});}
 }
 let bytes:Buffer;let type="image/jpeg";
 if(job.outputPath&&await storedVideoUrl(job.outputPath)){
  const file=job.outputPath,info=await stat(file),key=createHash("sha256").update(`${file}:${info.mtimeMs}:${info.size}:frame1`).digest("hex");
  if(!pending.has(key))pending.set(key,(async()=>{const directory=path.join(process.cwd(),"storage/thumbnails"),target=path.join(directory,`${key}.jpg`);await mkdir(directory,{recursive:true});try{return await readFile(target);}catch{}await promisify(execFile)("ffmpeg",["-y","-ss","1","-i",file,"-frames:v","1","-vf","scale=640:-2","-q:v","3",target],{timeout:20000});return readFile(target);})());
  try{bytes=await pending.get(key)!;}catch{bytes=await readFile(path.join(process.cwd(),"public/recipes/cam-clay/narrator.png"));type="image/png";}finally{pending.delete(key);}
 }else{bytes=await readFile(path.join(process.cwd(),"public/recipes/cam-clay/narrator.png"));type="image/png";}
 return new Response(new Uint8Array(bytes),{headers:{"Content-Type":type,"Cache-Control":"private, max-age=60"}});
});
