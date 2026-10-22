import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {actorFor,withAccess} from '@/lib/access';
import {getMotion,motionDirectory} from '@/lib/motion/store';
import {digest} from '@/lib/motion/model';
export const GET=withAccess(async(request:Request,context:{params:Promise<{id:string;name:string}>})=>{
 try{const {id,name}=await context.params,s=await getMotion(id,(await actorFor(request))!.id);
 const revision=Number(new URL(request.url).searchParams.get('revision'));
 if(revision!==s.revision||!['board','visuals','finishing','complete'].includes(s.phase))throw Error('Review unavailable.');
 const download=name==='download';
 if(download&&(s.phase!=='complete'||!s.approved.finishing))throw Error('Approve the finished film first.');
 if(!['preview.mp4','final.mp4','download',...(s.film?.scenes.flatMap(scene=>[`${scene.id}.mp4`,`${scene.id}.jpg`])??[])].includes(name))throw Error('Media unavailable.');
 if(name==='final.mp4'&&!['finishing','complete'].includes(s.phase))throw Error('Finishing review unavailable.');
 const bytes=await readFile(path.join(motionDirectory(id,revision),download?'final.mp4':name));
 if(download&&digest(bytes)!==s.approved.finishing)throw Error('Approved file changed.');
 const range=request.headers.get('range');const match=range?.match(/^bytes=(\d+)-(\d*)$/);const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
 if(start>end||start>=bytes.length)return new Response(null,{status:416});
 return new Response(new Uint8Array(bytes.subarray(start,end+1)),{status:match?206:200,headers:{'Content-Type':name.endsWith('.jpg')?'image/jpeg':'video/mp4','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store',...(match?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{ }),...(download?{'Content-Disposition':`attachment; filename="cam-motion-${id}.mp4"`}:{})}});
 }catch{return Response.json({error:'This media is not available at the current review step.'},{status:403});}
});
