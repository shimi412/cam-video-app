import {it,expect} from "vitest";
import {alignVoice,scriptHash,type VoiceAlignment} from "../src/lib/concept/voice-alignment";
import {CAM_VOICE} from "../src/lib/concept/cam-voice";
const audio={kind:"audio" as const,file:"narration.wav" as const,sha256:"a".repeat(64),sourceSha256:"b".repeat(64),duration:4};
function alignment(phrase:string,spoken:string):VoiceAlignment{return {version:1,audioSha256:audio.sha256,scriptSha256:scriptHash([phrase]),voiceId:CAM_VOICE.voiceId,requestId:"saved",source:"fal-whisper",words:spoken.split(" ").map((word,i)=>({word,start:i*.5,end:i*.5+.4}))};}
it("accepts Defence/Defense spelling without rewriting captions or timestamps",()=>{
 for(const [original,spoken] of [["Israel Defence Forces.","Israel Defense Forces."],["Israel Defense Forces.","Israel Defence Forces."]]){
  const a=alignment(original,spoken),t=alignVoice([original],audio,a,"live");
  expect(t.words.map(w=>w.word).join(" ")).toBe(original);
  expect(t.words.map(w=>[w.start,w.end])).toEqual(a.words.map(w=>[w.start,w.end]));
 }
});
it("still rejects changed, missing or additional words",()=>{
 for(const text of ["Israel Defeat Forces.","Israel Forces.","Israel Defence Armed Forces."])
  expect(()=>alignVoice(["Israel Defence Forces."],audio,alignment("Israel Defence Forces.",text),"live")).toThrow();
});
it("still rejects invalid timestamps even for equivalent spelling",()=>{
 const a=alignment("Defence Forces.","Defense Forces.");a.words[1].start=.1;
 expect(()=>alignVoice(["Defence Forces."],audio,a,"live")).toThrow(/overlap/);
});

it("preserves isolated zero-width interior anchors without invented word durations",()=>{
 const a=alignment("Doctors and nurses.","Doctors and nurses.");a.words[1].end=a.words[1].start;
 expect(alignVoice(["Doctors and nurses."],audio,a,"live").words).toEqual(a.words);
 a.words[0].end=a.words[0].start;
 expect(()=>alignVoice(["Doctors and nurses."],audio,a,"live")).toThrow();
});

it("joins explicit hyphen continuations while preserving measured boundaries and captions",()=>{
 const phrase="A longstanding century-old conspiracy.";
 const a=alignment(phrase,"A long -standing century -old conspiracy.");
 const timing=alignVoice([phrase],audio,a,"live");
 expect(timing.words.map(w=>w.word).join(" ")).toBe(phrase);
 expect(timing.words[1]).toEqual({word:"longstanding",start:.5,end:1.4});
 expect(timing.words[2]).toEqual({word:"century-old",start:1.5,end:2.4});
 a.words[2].start=.6;
 expect(()=>alignVoice([phrase],audio,a,"live")).toThrow(/overlap/);
});
it("does not invent equivalence for tense, negation or arbitrary word joins",()=>{
 for(const [phrase,spoken] of [["It helped us.","It help us."],["We are here.","We aren't here."],["Go nowhere.","Go now here."],["Please resign.","Please re-sign."]])
  expect(()=>alignVoice([phrase],audio,alignment(phrase,spoken),"live")).toThrow();
});
it('treats digits and number words as the same spelling in transcript comparison',async()=>{
 const {norm,numberWord}=await import('../src/lib/motion/voice');
 expect(norm('in the top 5 countries')).toBe(norm('in the top five countries'));
 expect(norm("it's number 10.")).toBe(norm('it is number ten').replace('itis','its'));
 expect(numberWord(42)).toBe('fortytwo');expect(numberWord(0)).toBe('zero');expect(numberWord(90)).toBe('ninety');
 expect(norm('2026')).toBe('2026');
});
