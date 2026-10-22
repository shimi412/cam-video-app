import { expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { localWordAlignment, recoverLocalVoiceAlignment } from "../src/lib/concept/local-voice-alignment";
import { alignVoice, alignmentHash, scriptHash, type VoiceAlignment } from "../src/lib/concept/voice-alignment";
import { CAM_VOICE } from "../src/lib/concept/cam-voice";
import { sha256 } from "../src/lib/concept/checkpoints";

const phrases=["It helped us."];
const bytes=Buffer.from("saved recording fixture"),hash=sha256(bytes);
const audio={kind:"audio" as const,file:"narration.wav" as const,duration:3,sha256:hash,sourceSha256:hash};
const original:VoiceAlignment={version:1,audioSha256:hash,scriptSha256:scriptHash(phrases),voiceId:CAM_VOICE.voiceId,requestId:"paid-original",source:"fal-whisper",words:["It","help","us."].map((word,i)=>({word,start:i,end:i+.7}))};
const result={transcription:[{text:" ",offsets:{from:0,to:10}},...["It","helped","us."].map((text,i)=>({text,offsets:{from:i*1000+10,to:i*1000+700}}))]};
it("uses measured local word timings, never relabels the original transcription",()=>{
 const alignment=localWordAlignment(result,original);
 expect(alignVoice(phrases,audio,alignment,"live").words[1]).toEqual({word:"helped",start:1.01,end:1.7});
 expect(original.words[1].word).toBe("help");
 expect(alignment.source).toBe("local-whisper");
 expect(()=>localWordAlignment({transcription:[{text:"It helped us.",offsets:{from:0,to:2700}}]},original)).toThrow(/word-level/);
});
it("reuses hash-bound evidence without commands or providers, rejects changed audio and unresolved words",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"cam-alignment-")),file=path.join(directory,"narration.wav");
 try {
  await writeFile(file,bytes);
  const key=sha256(JSON.stringify({version:1,original:alignmentHash(original),audio:hash}));
  const receiptDir=path.join(directory,"alignment-recovery",key);await mkdir(receiptDir,{recursive:true});
  const receiptFile=path.join(receiptDir,"receipt.json");
  const receipt={version:1,key,model:"fixture",result};
  await writeFile(receiptFile,JSON.stringify(receipt));
  const input={directory,file,phrases,audio,original,assertOwned:async()=>{}};
  const recovered=await recoverLocalVoiceAlignment(input);
  expect(recovered.words[1].word).toBe("helped");
  await writeFile(receiptFile,JSON.stringify({...receipt,result:{transcription:result.transcription.map(t=>t.text==="helped"?{...t,text:"hurt"}:t)}}));
  await expect(recoverLocalVoiceAlignment(input)).rejects.toThrow(/Narration still differs/);
  await writeFile(file,"changed");
  await expect(recoverLocalVoiceAlignment(input)).rejects.toThrow(/recording changed/);
 } finally {await rm(directory,{recursive:true,force:true});}
});
