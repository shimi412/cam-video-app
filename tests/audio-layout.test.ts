import {it,expect} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {measureLoudness} from "../src/lib/concept/editorial-audio";
const exec=promisify(execFile);
it("calibrates mono sources against the stereo playback layout used by the renderer",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"cam-audio-layout-"));
 try{
  const mono=path.join(root,"mono.wav"),stereo=path.join(root,"stereo.wav");
  await exec("ffmpeg",["-v","error","-f","lavfi","-i","sine=frequency=440:duration=4","-ac","1",mono]);
  await exec("ffmpeg",["-v","error","-i",mono,"-af","pan=stereo|c0=c0|c1=c0",stereo]);
  const original=await measureLoudness(mono),predicted=await measureLoudness(mono,true),actual=await measureLoudness(stereo);
  expect(predicted.integratedLufs).toBeCloseTo(actual.integratedLufs,1);
  expect(Math.abs(predicted.integratedLufs-original.integratedLufs-3.01)).toBeLessThan(.15);
  expect(predicted.truePeakDb).toBeCloseTo(original.truePeakDb,1);
  const gainDb=Math.min(-14-predicted.integratedLufs,-1.2-predicted.truePeakDb),output=path.join(root,"final.m4a");
  await exec("ffmpeg",["-v","error","-i",mono,"-af",`pan=stereo|c0=c0|c1=c0,volume=${gainDb}dB`,"-c:a","aac",output]);
  const rendered=await measureLoudness(output);
  expect(Math.abs(rendered.integratedLufs+14)).toBeLessThan(.5);
  expect(rendered.truePeakDb).toBeLessThan(-1);
 }finally{await rm(root,{recursive:true,force:true});}
});
