import {withAccess,actorFor} from '@/lib/access';
import {getComic,saveComic} from '@/lib/comics/store';
import {mkdir,writeFile,readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
export const runtime='nodejs';
const MAX_FILES=10,MAX_BYTES=100*1024*1024,MAX_TOTAL=1024*1024*1024,TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
/** Reference images attached by the client to a video (Shimi, 2026-10-26). Stored outside the work folders, in
 * `storage/references/<jobId>/`, listed in the film state (`references`) and in the studio notification, so the
 * producer finds them with the script. */
export function referencesDirectory(id:string){return path.resolve('storage','references',z.uuid().parse(id));}
const safeName=(name:string,index:number)=>{const base=path.basename(name).replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||`image-${index+1}`;return /\.(png|jpe?g|webp|gif)$/i.test(base)?base:`${base}.png`;};
export const POST=withAccess(async(request:Request,{params}:{params:Promise<{id:string}>})=>{
 const {id}=await params;const actor=(await actorFor(request))!;
 try{
  const s=await getComic(id,actor.id);
  const form=await request.formData();const files=form.getAll('files').filter((f):f is File=>f instanceof File);
  if(!files.length)return Response.json({error:'Choose at least one image.'},{status:400});
  const existing=s.references??[];if(existing.length+files.length>MAX_FILES)return Response.json({error:`Up to ${MAX_FILES} images per video.`},{status:400});
  const dir=referencesDirectory(id);await mkdir(dir,{recursive:true});const saved:string[]=[];
  const already=(await Promise.all(existing.map(n=>stat(path.join(dir,n)).then(i=>i.size).catch(()=>0)))).reduce((a,b)=>a+b,0);if(already+files.reduce((a,f)=>a+f.size,0)>MAX_TOTAL)return Response.json({error:'Up to 1 GB of images per video.'},{status:400});
  for(const [i,f] of files.entries()){if(!TYPES.has(f.type))return Response.json({error:'PNG, JPG, WEBP or GIF images only.'},{status:400});if(f.size>MAX_BYTES)return Response.json({error:'Each image must be under 100 MB, 1 GB in total.'},{status:400});
   let name=safeName(f.name,existing.length+i);if(existing.includes(name)||saved.includes(name))name=`${Date.now()}-${name}`;
   await writeFile(path.join(dir,name),new Uint8Array(await f.arrayBuffer()));saved.push(name);}
  s.references=[...existing,...saved];await saveComic(s);
  return Response.json({references:s.references});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Your images could not be attached.'},{status:409});}
});
export const GET=withAccess(async(request:Request,{params}:{params:Promise<{id:string}>})=>{
 const {id}=await params;const actor=(await actorFor(request))!;
 try{const s=await getComic(id,actor.id);const name=new URL(request.url).searchParams.get('file');
  if(!name)return Response.json({references:s.references??[]});
  if(!(s.references??[]).includes(name))return new Response(null,{status:404});
  const bytes=await readFile(path.join(referencesDirectory(id),name));const type=/\.png$/i.test(name)?'image/png':/\.webp$/i.test(name)?'image/webp':/\.gif$/i.test(name)?'image/gif':'image/jpeg';
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':type,'Cache-Control':'private, no-store'}});
 }catch{return new Response(null,{status:404});}
});
export async function listReferenceFiles(id:string){try{return await readdir(referencesDirectory(id));}catch{return [] as string[];}}
