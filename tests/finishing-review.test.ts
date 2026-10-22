import {expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {feedbackStage} from "../src/lib/concept/review-stages";
import {assertFilmFeedbackResolved,pendingFilmComments} from "../src/lib/concept/film-feedback";
import {FinishingSettings,finishingTarget,assertFinishingApproval,interpretFinishingFeedback,type FinishingReview} from "../src/lib/concept/finishing-review";
const hash="a".repeat(64),settings=FinishingSettings.parse({});
it("defers sound, editing and subtitles without blocking the visual approval",()=>{
 for(const text of ["Lower the music","Les sous-titres sont trop petits","Change the editing","La voix est trop forte"]){
  expect(feedbackStage(text)).toBe("finishing");
  expect(()=>assertFilmFeedbackResolved([{id:randomUUID(),target:hash,text,seconds:null,actor:"client",at:new Date().toISOString()}],hash)).not.toThrow();
 }
 expect(feedbackStage("Change the character and lower the music")).toBe("mixed");
 expect(()=>assertFilmFeedbackResolved([{id:randomUUID(),target:hash,text:"Change the character and lower the music",seconds:null,actor:"client",at:new Date().toISOString()}],hash)).toThrow(/pending/);
});
it("binds final approval to the rendered film and settings and refuses unfinished work",()=>{
 const target=finishingTarget(hash,hash,settings);
 const review={target,pending:null} as FinishingReview;
 expect(()=>assertFinishingApproval(review,target,0)).not.toThrow();
 expect(()=>assertFinishingApproval(review,finishingTarget(hash,"b".repeat(64),settings),0)).toThrow(/changed/);
 expect(()=>assertFinishingApproval(review,finishingTarget(hash,hash,{...settings,captions:false}),0)).toThrow(/changed/);
 expect(()=>assertFinishingApproval({...review,pending:settings},target,0)).toThrow(/changed/);
 expect(()=>assertFinishingApproval(review,target,1)).toThrow(/feedback/);
});
it("applies only complete supported finishing requests, never a partial interpretation",()=>{
 expect(interpretFinishingFeedback("Lower the music",settings)?.musicLevel).toBe("quiet");
 expect(interpretFinishingFeedback("Make the captions bigger",settings)?.captionSize).toBe("large");
 expect(interpretFinishingFeedback("Enlève la musique",settings)?.musicLevel).toBe("off");
 for(const request of ["Lower music at 10 seconds","Lower the music and replace the voice","Make the subtitles bigger with red letters","Use piano music","Remove the character behind the subtitles"]){
  expect(interpretFinishingFeedback(request,settings)).toBeNull();
 }
});

it("keeps deferred finishing across visual revisions and removes only applied requests",()=>{
 const deferred={id:randomUUID(),target:hash,text:"Lower the music",seconds:null,actor:"client",at:new Date().toISOString()};
 const oldVisual={...deferred,id:randomUUID(),text:"Change the character"};
 const next="b".repeat(64);
 expect(pendingFilmComments([deferred,oldVisual],next,null)).toEqual([deferred]);
 expect(pendingFilmComments([deferred],next,{target:next,appliedComments:[]})).toEqual([deferred]);
 expect(pendingFilmComments([deferred],next,{target:next,appliedComments:[deferred.id]})).toEqual([]);
});
