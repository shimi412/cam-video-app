import {motionBudgets} from './budgets';
import {z} from 'zod';
import {runAgent} from '../agent/runtime';
import {digest} from '../agent/store';
import {getSetting} from '../settings';
import type {MotionState} from './state';
export const MotionFeedbackDirection=z.object({stage:z.enum(['visual','finishing','mixed']),visualFeedback:z.string().trim().max(4000),finishingFeedback:z.string().trim().max(4000),explanation:z.string().trim().min(10).max(800),summary:z.string().trim().min(10).max(160),actionable:z.boolean()}).strict();
export type MotionFeedbackDirection=z.infer<typeof MotionFeedbackDirection>;
export async function directMotionFeedback(id:string,s:MotionState,targets:string[],feedback:string){
 const input={revision:s.revision,script:s.script,targets,feedback,scenes:s.film?.scenes,settings:s.settings,previousFinishingNote:s.deferredFeedback};
 const model=process.env.CAM_MOTION_MODEL??await getSetting<string>('ai_deep_model')??'anthropic/claude-sonnet-5';
 if(!model.startsWith('anthropic/claude-'))throw Error('Configure Claude supervision before continuing.');
 return runAgent({session:id,jobId:id,turn:`motion-feedback-${digest({input,model})}`,model,skill:'cam-feedback',contextReads:0,system:'Interpret this exact Motion feedback before pricing or executing it. Visual means composition, objects, logo integration, typography content or movement of selected scenes. Finishing means sound, editing/pacing/raccords or subtitle settings. Mixed notes must retain their finishing part and provide a faithful visual instruction for the selected scenes. Do not ask the user to delete a finishing note to continue. Never expand the selected scope, invent extra requests, print the user instruction as artwork, or turn all logo requests into a generic badge. The output is an interpretation, not a claim of execution or approval. Keep explanations in English; preserve all meaning of the original note. `summary` is the one client-facing sentence shown next to the price: plain words, what will change in the film, no scene identifiers, no mention of interpretation, models or approvals. A global rejection ("I don’t like it", "try again", "do it differently", "start over") is a clear request: a fresh creative take on every selected scene, with new movements, compositions and transitions, keeping the narration text, meaning and timing; never read it as "preserve as-is". `actionable` is false only when the note carries no request at all (a greeting, a question, a test word): then `summary` is one short sentence inviting a precise note.',prompt:JSON.stringify(input),schema:MotionFeedbackDirection,maximumUsd:motionBudgets().feedbackUsd,maxOutputTokens:1500,minimumOutputTokens:500,validate:r=>{
  if(r.stage!=='finishing'&&r.visualFeedback.trim().length<3||r.stage!=='visual'&&r.finishingFeedback.trim().length<3||r.stage==='finishing'&&r.visualFeedback||r.stage==='visual'&&r.finishingFeedback)throw Error('Account for the visual and finishing parts consistently.');return r;
 }});
}
