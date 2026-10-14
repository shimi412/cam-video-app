/** Offline typography calibration, not a user film or storyboard approval. */
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import sharp from "sharp";
import { planConcept } from "../src/lib/concept/storyboard";
import { measuredPhraseTiming } from "../src/lib/concept/timing";
import { writeMontage, conceptCanvas } from "../src/lib/concept/montage";
import { renderConcept, silentVoice } from "../src/lib/concept/render";
import { getRecipe } from "../src/lib/recipes";
const exec=promisify(execFile);
async function main(){
 globalThis.fetch=async()=>{throw new Error("No external network in typography check.");};
 const script="Context can change everything.",timing=measuredPhraseTiming([script],[2.4]);
 const proof=[];
 for(const aspect of ["9:16","1:1","16:9"] as const){
  const root=path.join(process.cwd(),"storage/qa/presenter-text",aspect.replace(":","x"));
  await mkdir(path.join(root,"assets"),{recursive:true});
  const {width,height}=conceptCanvas(aspect);
  // A geometric calibration target occupies the face area; no actor is animated.
  await sharp(Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#FFF4DC"/><rect x="${width*.35}" y="${height*.43}" width="${width*.3}" height="${height*.42}" rx="80" fill="#b9afa1"/><circle cx="${width*.5}" cy="${height*.52}" r="${Math.min(width,height)*.07}" fill="#3B2416"/></svg>`)).png().toFile(path.join(root,"assets/calibration.png"));
  await silentVoice(path.join(root,"assets/narration.wav"),timing.duration);
  const result=await writeMontage(root,planConcept(script,getRecipe("cam-clay")!,aspect),timing,aspect,{1:{kind:"image",file:"assets/calibration.png",heldSeconds:0}},{brandEnding:false});
  const output=path.join(root,"video.mp4"); await renderConcept(root,output);
  await exec("ffmpeg",["-y","-loglevel","error","-ss","1.8","-i",output,"-frames:v","1",path.join(root,"frame.png")]);
  const {stdout}=await exec("ffprobe",["-v","error","-show_entries","stream=width,height:format=duration","-of","json",output]);const probe=JSON.parse(stdout);
  assert.equal(probe.streams[0].width,width);assert.equal(probe.streams[0].height,height);assert(Math.abs(Number(probe.format.duration)-result.duration)<.1);
  const html=await readFile(path.join(root,"index.html"),"utf8");assert(html.includes("presenter-word-0-3"));assert(!html.includes('id="caption-0"'));
  proof.push({aspect,width,height,duration:result.duration,layoutCheck:true,rendered:true});
 }
 await writeFile("storage/qa/cam-presenter-text-proof.json",JSON.stringify({at:new Date().toISOString(),providerCalls:0,userFilmChanged:false,formats:proof},null,2));
 console.log(JSON.stringify(proof));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
