import {expect,it} from "vitest";
import {AUDIO_RATE,audibleLevelStep,sourceSpeechStep} from "../src/lib/concept/editorial-audio";
import type {ConceptTiming} from "../src/lib/concept/types";
const timing={duration:1,estimated:false,words:[{word:"parliament",start:.2,end:.8}],phrases:[{text:"parliament",start:.2,end:.8}]} as ConceptTiming;
const source=Float32Array.from({length:AUDIO_RATE},(_,i)=>i<AUDIO_RATE*.5?.001:.1);
it("ignores sub-silence codec tails but still catches audible cuts and attacks",()=>{
 expect(audibleLevelStep(-73,-106.6)).toBe(false);
 expect(audibleLevelStep(-170,-240)).toBe(false);
 expect(audibleLevelStep(-28,-106)).toBe(true);
 expect(audibleLevelStep(-240,-35)).toBe(true);
 expect(audibleLevelStep(-30,-38)).toBe(false);
});
it("recognizes an identical natural step inside a spoken word",()=>{
 expect(sourceSpeechStep({at:.5,deltaDb:40},timing,source)).toBe(true);
});
it("keeps unexplained render steps, reversed jumps and cuts outside words detectable",()=>{
 expect(sourceSpeechStep({at:.5,deltaDb:40},timing,new Float32Array(AUDIO_RATE).fill(.01))).toBe(false);
 expect(sourceSpeechStep({at:.5,deltaDb:-40},timing,source)).toBe(false);
 expect(sourceSpeechStep({at:.5,deltaDb:50},timing,source)).toBe(false);
 expect(sourceSpeechStep({at:.5,deltaDb:40},{...timing,words:[]},source)).toBe(false);
});
