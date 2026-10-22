import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './checkpoints';
import sharp,{type OverlayOptions} from 'sharp';
import {verifiedSceneMedia} from './imported-media';
import {graphicLayersSvg} from './graphic-layers';
import type {FeedbackContext} from './feedback-director';
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/** Small, hash-verified storyboard contact sheet. Local rendering; never a generation. */
export async function feedbackReferenceSheet(input:FeedbackContext):Promise<Buffer|null>{
 const wanted=new Set(input.notes.flatMap(n=>n.scenes)),panels=input.panels.filter(p=>wanted.has(p.scene));
 if(!panels.length)return null;
 const tiles:Buffer[]=[],width=240,height=426,label=36;
 for(const p of panels){
  const media=p.start??p.existing;if(!media&&!p.textOnly)continue;
  let base:Buffer;
  if(p.textOnly)base=await sharp({create:{width,height,channels:3,background:'#F0E8DA'}}).png().toBuffer();
  else {
   if(media!.kind!=='image')continue;
   const verified=await verifiedSceneMedia(input.jobId,media!);
   base=await sharp(verified.bytes).resize(width,height,{fit:'contain',background:'#F0E8DA'}).png().toBuffer();
  }
  const overlays:OverlayOptions[]=[];
  const graphics=graphicLayersSvg(p.graphicLayers??[],width,height,`director-${p.scene}`,Boolean(p.overlay));
  if(graphics)overlays.push({input:Buffer.from(graphics.replace('width="100%" height="100%"',`width="${width}" height="${height}"`))});
  // Overlay text is also supplied exactly in the JSON; this sheet labels it,
  // without pretending to reproduce every animation frame.
  const words=(p.overlay??'').split(/\s+/),lines:string[]=[];let line='';
  for(const word of words){if((line+' '+word).length>26){lines.push(line);line=word;}else line=[line,word].filter(Boolean).join(' ');}if(line)lines.push(line);
  const text=lines.map((l,i)=>`<text x="120" y="${(p.textOnly?150:45)+i*17}" text-anchor="middle" font-size="14" font-weight="bold" fill="#203C6C">${escape(l)}</text>`).join('');
  if(text)overlays.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text}</svg>`)});
  const image=await sharp(base).composite(overlays).png().toBuffer();
  tiles.push(await sharp({create:{width,height:height+label,channels:3,background:'#fff'}}).composite([{input:image,left:0,top:label},{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="36"><text x="12" y="25" font-size="20">Scene ${p.scene} · storyboard</text></svg>`),left:0,top:0}]).png().toBuffer());
 }
 if(input.film){
  const root=path.resolve('storage/concepts',input.jobId,'live'),file=path.resolve(input.film.file);
  if(!file.startsWith(root+path.sep)||sha256(await readFile(file))!==input.film.sha256)throw Error('The reviewed film changed before feedback analysis.');
  for(const sample of input.film.samples){
   if(!Number.isFinite(sample.seconds)||sample.seconds<0)throw Error('Invalid film sample time.');
   const {stdout}=await promisify(execFile)('ffmpeg',['-v','error','-ss',String(sample.seconds),'-i',file,'-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1'],{encoding:'buffer',maxBuffer:8*1024*1024,timeout:30000});
   const image=await sharp(stdout).resize(width,height,{fit:'contain',background:'#F0E8DA'}).png().toBuffer();
   tiles.push(await sharp({create:{width,height:height+label,channels:3,background:'#fff'}}).composite([{input:image,left:0,top:label},{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="36"><text x="8" y="24" font-size="16">Scene ${sample.scene} · film ${sample.seconds.toFixed(1)}s</text></svg>`),left:0,top:0}]).png().toBuffer());
  }
 }
 if(!tiles.length)return null;
 const columns=Math.min(4,tiles.length);
 return sharp({create:{width:columns*width,height:Math.ceil(tiles.length/columns)*(height+label),channels:3,background:'#fff'}}).composite(tiles.map((input,i)=>({input,left:(i%columns)*width,top:Math.floor(i/columns)*(height+label)}))).png().toBuffer();
}
