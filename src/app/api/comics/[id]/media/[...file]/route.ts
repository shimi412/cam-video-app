import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {actorFor,withAccess} from '@/lib/access';
import {getComic,comicDirectory} from '@/lib/comics/store';
import {hash} from '@/lib/comics/model';
export const GET=withAccess(async(request:Request,context:{params:Promise<{id:string;file:string[]}>})=>{
 try{const {id,file}=await context.params,s=await getComic(id,(await actorFor(request))!.id),name=file.join('/'),download=name==='download';
 if(download&&(s.phase!=='complete'||s.approved.final!==s.mediaHash))throw Error('Approve the final film first.');
 const target=download?s.media:name;
 if(!target||![...Object.values(s.images),s.media,s.media?.replace(/final\.mp4$/,'preview.mp4'),...(s.checks?.flashNotes??[]).flatMap(n=>n.evidence)].includes(target)||target.includes('..')||path.isAbsolute(target))throw Error('Media unavailable.');
 const bytes=await readFile(path.join(comicDirectory(id),target));if(download&&hash(bytes.toString('base64'))!==s.approved.final)throw Error('Approved file changed.');
 const range=request.headers.get('range'),match=range?.match(/^bytes=(\d+)-(\d*)$/);if(range&&!match)return new Response(null,{status:416});
 const start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;if(start>end||start>=bytes.length)return new Response(null,{status:416});
 return new Response(new Uint8Array(bytes.subarray(start,end+1)),{status:match?206:200,headers:{'Content-Type':target.endsWith('.png')?'image/png':target.endsWith('.jpg')?'image/jpeg':'video/mp4','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store',...(match?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{ }),...(download?{'Content-Disposition':`attachment; filename="cam-attack-${id}.mp4"`}:{})}});
 }catch{return Response.json({error:'Media unavailable at this review step.'},{status:403});}
});
