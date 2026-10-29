/** Studio-mode estimate (Shimi, 2026-10-26: the software is a screen between Claude Code and the
 * client). Nothing is called at the estimate: no director, no provider. The panel count comes from
 * the script's sentences, the delay from the existing `estimatedMinutes`, and the supplier cost
 * from documented constants, so that a typical script lands on the first tier of the common grid
 * (`firstVersionPriceCents`, 30 $). The executor's real spending is journaled on his side. */
/** Credits per request, read from the live Attack films of 2026-10-22 to 25 (ElevenLabs voice,
 * Nano Banana Pro sheet and 9:16 images at 2K, Kling 3.0 Pro clips of 3 to 8 s). */
export const STUDIO_CREDITS={voice:3,sheet:2,image:2,clip:8} as const;
/** One panel per sentence (split on `.`, `!`, `?`), bounded like the director's plan (3 to 24 panels). */
export function countPanels(script:string){
 const sentences=script.split(/[.!?]+/).map(t=>t.trim()).filter(Boolean).length;
 return Math.max(3,Math.min(24,sentences));
}
/** The executor animates about half the panels (the director's contract: "at most about half the panels generated"); the rest is the free local camera. */
export const estimatedClips=(panels:number)=>Math.ceil(panels/2);
export function studioFirstVersionCost(panels:number,creditUsd:number,b:{directionUsd:number;inspectionUsd:number}){
 const clips=estimatedClips(panels);
 const credits=STUDIO_CREDITS.voice+STUDIO_CREDITS.sheet+panels*STUDIO_CREDITS.image+clips*STUDIO_CREDITS.clip;
 // Same shape as the engine's estimate: media credits at the admin rate, one inspection per image and per clip, the direction allowance.
 return {credits,costUsd:credits*creditUsd+(panels+clips)*b.inspectionUsd+b.directionUsd};
}
/** Estimated supplier cost of one studio revision, priced x2 by the grid (1.50 $ -> 3 $, the example
 * of docs/studio-mode-plan-b-2026-10-23.md). `CAM_STUDIO_REVISION_COST_USD` overrides it. */
export function studioRevisionCostUsd(){
 const raw=process.env.CAM_STUDIO_REVISION_COST_USD;const value=raw===undefined||raw===''?1.5:Number(raw);
 if(!Number.isFinite(value)||value<=0||value>50)throw Error(`CAM_STUDIO_REVISION_COST_USD must be a number between 0 and 50 (got "${raw}").`);
 return value;
}
/** Option C (Shimi, 2026-10-26): the estimate the client sees in studio mode is a whole-dollar price drawn
 * once inside the category's range, more likely near its middle (rounded mean of three uniform draws), and a delay of
 * about 1 h 30. No calculator, no provider call. The price is persisted in the film's quote at the estimate. */
export const STUDIO_ESTIMATE_MINUTES=90;
/** Shimi, 2026-10-29: a film whose narration runs past 1 min 30 is announced at about 5 hours instead of 1 h 30. */
export const STUDIO_ESTIMATE_MINUTES_LONG=300;
export function studioDelayMinutes(script:string){
 const seconds=script.split(/\s+/).filter(Boolean).length/MOTION_WORDS_PER_SECOND;
 return seconds>MOTION_BASE_SECONDS?STUDIO_ESTIMATE_MINUTES_LONG:STUDIO_ESTIMATE_MINUTES;
}
/** Shimi, 2026-10-26 (after the client meeting): Clay and Attack are priced 35 to 40 $, Motion stays around 25 $. */
export const STUDIO_ESTIMATE_RANGE={min:35,max:40} as const;
/** Shimi, 2026-10-26: Motion design is priced a few dollars below Clay and Attack (22 to 28 $, around 25) to steer
 * the client toward the format with the highest margin. */
export const STUDIO_ESTIMATE_RANGE_MOTION={min:22,max:28} as const;
/** Shimi, 2026-10-28 (after the 2 min 13 "1B Views" film): a Motion film is priced by its length. Up to 1 min 30 the
 * usual estimate applies; beyond, at least 5 $ more, and 5 $ more again for every further minute (2 min 30 -> +10 $).
 * The length is estimated from the script at about 1.9 words per second (Bram with breaths: 238 words -> 126 s). */
export const MOTION_WORDS_PER_SECOND=1.9;
export const MOTION_BASE_SECONDS=90;
export function motionLengthSurchargeUsd(script:string){
 const words=script.split(/\s+/).filter(Boolean).length,seconds=words/MOTION_WORDS_PER_SECOND;
 return seconds<=MOTION_BASE_SECONDS?0:5*Math.ceil((seconds-MOTION_BASE_SECONDS)/60);
}
export function studioEstimateUsd(random:()=>number=Math.random,category?:string,script=''){
 const {min,max}=category==='motion'?STUDIO_ESTIMATE_RANGE_MOTION:STUDIO_ESTIMATE_RANGE;
 const draws=[random(),random(),random()].map(r=>min+Math.min(Math.max(r,0),1)*(max-min));
 const base=Math.max(min,Math.min(max,Math.round(draws.reduce((a,b)=>a+b,0)/draws.length)));
 return base+(category==='motion'?motionLengthSurchargeUsd(script):0);
}
/** Client-facing delay: "about 1 h 30", "about 45 min". */
export function studioDelayLabel(minutes:number){
 const m=Math.max(1,Math.round(minutes)),h=Math.floor(m/60),r=m%60;
 return h?`about ${h} h${r?` ${String(r).padStart(2,'0')}`:''}`:`about ${m} min`;
}
