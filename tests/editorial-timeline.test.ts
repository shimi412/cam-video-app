import {expect,it} from "vitest";
import {editorialTimeline,DIRECTOR_EDITORIAL_METHOD} from "../src/lib/concept/editorial-method";
import {planConcept} from "../src/lib/concept/storyboard";
import {getRecipe} from "../src/lib/recipes";
import {placeholderTiming} from "../src/lib/concept/timing";
it("exports audit markers at the actual voice times without altering narration or proposing paid extras",()=>{
 const script="Read the original source.",board=planConcept(script,getRecipe("cam-clay")!,"9:16"),timing=placeholderTiming([script]);
 timing.estimated=false;const before=JSON.stringify({board,timing});
 const result=editorialTimeline(board,timing,{start:timing.duration+.5,end:timing.duration+2});
 expect(result.estimated).toBe(false);expect(result.scenes[0].narration).toBe(script);expect(result.logo.startFrame).toBe(Math.round((timing.duration+.5)*30));
 expect(result.scenes[0].words[0].startFrame).toBe(Math.round(timing.words[0].start*30));
 expect(result.policy).toMatchObject({audioTransitions:"fades-required",automaticSecondTakes:false,generatedVideoAudio:"discarded"});expect(result.paidOperations).toBe(0);
 expect(JSON.stringify({board,timing})).toBe(before);
 expect(()=>editorialTimeline(board,timing,{start:0,end:1})).toThrow(/bounds/);
 expect(DIRECTOR_EDITORIAL_METHOD).toContain("human-reviewed draft");
});
