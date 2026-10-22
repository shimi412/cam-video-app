import type {ConceptBoard,ConceptTiming} from "./types";
import type {SceneDirection} from "./types";
import {changesState, physicalDirectionIssues} from "./physical-direction";

export const EDITORIAL_METHOD_VERSION="cam-editorial-2026-10-15-r2";
/** Independent CAM rules, informed by the reviewed public tutorials. No copied
 * third-party prompt pack, new asset generation, or change to existing boards. */
export const DIRECTOR_EDITORIAL_METHOD=`Build the storyboard as a sequence before choosing a generator. For each exact narration segment, decide what the viewer must understand, the concrete visible subject, the action or graphic relation, and the reason for the framing. Keep the approved CAM handcrafted clay style; do not switch to generic 3D animation.
Choose a literal location, object or action when it directly illustrates the words. Use simple local graphics to show named concepts or relationships. Use presenter-text for a line that benefits from a human reaction or an abstract statement. Avoid forced metaphors; that rule does NOT mean a presenter in the same studio for every sentence. A hospital line can show a hospital reception or medical instruments without inventing doctors; a judicial line can show an empty courtroom and scales without inventing a judge. No unapproved character or faith/ethnicity assigned to the existing presenter.
In scene, specify the setting, subject position, facial expression, visible props, light direction and framing. In motion, describe the initial pose, one principal action, its physical direction, and final readable pose. Locked sheets preserve identity, wardrobe and material, NOT pose, expression, angle, composition or lighting. A neutral sheet is not a production set.
Review adjacent shots together. An establishing shot locates the subject, an insert shows the relevant object or action, a reaction close-up supplies tone, and a wider return resolves the beat. Change scale, angle and subject placement for a reason; do not return the same front-facing full-body portrait across the board. Match geography and light within one continuous action, but use motivated daylight, desk light or window light when the setting changes. Repeat concrete layout and prop state in related shots rather than saying 'same as before'.
Text and graphic symbols are rendered locally and shown in the storyboard composition before human approval. Graphics must identify the spoken subject, not introduce claims; never burn letters or symbols into generated media. Design natively for the requested canvas with one continuous edge-to-edge set, not a square portrait padded with top/bottom bands. The quiet graphic area is part of that set. Never combine a lower-half presenter with a contradictory upper-two-thirds subject rule.
Budget discipline: use one image for stable poses and ordinary gestures. Only the supplied imageManifest may include an end image; do not add another state-change or endpoint during direction. If a new idea would require one, choose a meaningful stable action instead. Preserve narration and approved audio. Use fades at every audio transition. No automatic paid second take, voice, effects track or extra camera angle generation. Fix unclear keyframes before animation; use a human-reviewed draft only within its quoted draft-plus-finish budget.`;

/** Diagnostics describe obvious planning faults; they do not claim visual
 * inspection. Only new machine directions pass through the repair below. */
export function editorialDirectionIssues(directions: SceneDirection[]) {
 const issues: string[]=[];
 if(directions.length>=3 && directions.filter(d=>d.visualMode==="presenter-text").length/directions.length>.7)issues.push("presenter-repetition");
 const scenes=directions.map(d=>d.scene.toLowerCase().replace(/\s+/g," ").trim());
 if(new Set(scenes).size<scenes.length)issues.push("duplicate-staging");
 return issues;
}

/** Repair obvious repetition locally using subject-specific prepared ideas.
 * Never makes another model call, changes narration, invents a character or
 * expands the disclosed image manifest. Custom/human directions bypass this. */
export function repairEditorialDirections(directions: Record<string,SceneDirection>, prepared: Record<string,SceneDirection>) {
 const input=Object.values(directions), repetitive=editorialDirectionIssues(input).length>0;
 const seen=new Set<string>();
 return Object.fromEntries(Object.entries(directions).map(([index,original])=>{
  const fallback=prepared[index];
  if(!fallback)return [index,original];
  const scene=original.scene.toLowerCase().replace(/\s+/g," ").trim();
  const duplicated=seen.has(scene);seen.add(scene);
  const unplannedChange=changesState(original)!==changesState(fallback) || Boolean(original.endScene)!==Boolean(fallback.endScene);
  const restoreSubject=repetitive && original.visualMode==="presenter-text" && fallback.visualMode!=="presenter-text";
  const invalidPhysicalAction=physicalDirectionIssues(original).length>0;
  return [index,unplannedChange||restoreSubject||duplicated||invalidPhysicalAction ? fallback : original];
 }));
}

/** Frame markers for editorial inspection, computed from the ACTUAL paced voice.
 * These are decisions and timing evidence, not hidden LLM reasoning or a claim
 * that a generated motion hit a frame-perfect instruction. */
export function editorialTimeline(board:ConceptBoard,timing:ConceptTiming,ending:{start:number;end:number},fps=30){
 if(!Number.isInteger(fps)||fps<1||fps>120||!Number.isFinite(ending.start)||!Number.isFinite(ending.end)||ending.start<(timing.words.at(-1)?.end??timing.duration)||ending.end<=ending.start)throw new Error("Invalid editorial timeline bounds.");
 if(board.shots.length!==timing.phrases.length)throw new Error("Editorial timeline does not match the reviewed narration.");
 const frame=(seconds:number)=>Math.round(seconds*fps);
 return {version:EDITORIAL_METHOD_VERSION,fps,estimated:timing.estimated,paidOperations:0,
  policy:{originalNarrationPreserved:true,audioTransitions:"fades-required",generatedVideoAudio:"discarded",automaticSecondTakes:false,automaticVfx:false,automaticLogLut:false},
  scenes:board.shots.map((shot,i)=>{
   const phrase=timing.phrases[i];
   const start=i===0?0:phrase.start,end=timing.phrases[i+1]?.start??ending.start;
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error("Invalid editorial scene interval.");
   return {scene:shot.index,startFrame:frame(start),endFrame:frame(end),narration:shot.narration,
    treatment:shot.visualMode??"metaphor",reason:shot.metaphor??"Human meaning review required",references:shot.references,
    localText:shot.overlay,action:shot.motion,initialState:shot.scene,finalState:shot.endScene,
    checks:["Meaning matches narration","Identity, wardrobe and expression","Camera and light continuity","Hands, objects and direction of movement",...(shot.endScene?["Complete transformation before the cut"]:[])],
    words:timing.words.filter(w=>w.start>=phrase.start-.002&&w.end<=phrase.end+.002).map(w=>({text:w.word,startFrame:frame(w.start),endFrame:Math.max(frame(w.start)+1,frame(w.end))}))};
  }),logo:{startFrame:frame(ending.start),endFrame:frame(ending.end)},
  deferred:["Movement-reference transfer requires a separately verified adapter and budget","Extra takes require a new approval","Sound effects require a separate quote or licensed local asset, with fades","No camera-specific Log conversion on generated clay footage"]};
}
