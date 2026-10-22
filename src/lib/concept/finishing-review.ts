import {z} from "zod";
import {Hash,sha256} from "./checkpoints";
import type {RenderPacket} from "./production-flow";
export const FinishingSettings=z.object({
 musicLevel:z.enum(["off","quiet","normal"]).default("normal"),
 captions:z.boolean().default(true),captionSize:z.enum(["normal","large"]).default("normal"),
 pace:z.enum(["brisk","natural","relaxed"]).default("natural"),
 ending:z.enum(["cream","last-frame"]).default("cream"),
 captionCorrections:z.array(z.object({from:z.string().trim().min(1).max(160),to:z.string().trim().min(1).max(160)}).strict()).max(30).default([]),
}).strict();
export type FinishingSettings=z.infer<typeof FinishingSettings>;
export const FinishingReviewSchema=z.object({version:z.literal(1),packet:z.custom<RenderPacket>(),settings:FinishingSettings,pending:FinishingSettings.nullable(),
 file:z.string(),sha256:Hash,duration:z.number().positive(),target:Hash,
 appliedComments:z.array(z.string()),pendingComments:z.array(z.string()),approvedBy:z.string().optional(),approvedAt:z.string().optional()});
export type FinishingReview=z.infer<typeof FinishingReviewSchema>;
export function finishingTarget(packet:string,hash:string,settings:FinishingSettings){return sha256(JSON.stringify({stage:"finishing-film",packet,hash,settings}));}
export function assertFinishingApproval(review:FinishingReview,target:string,pendingComments:number){
 if(review.pending||review.target!==target)throw new Error("The finishing preview changed. Watch the latest version before approving.");
 if(pendingComments)throw new Error("Apply or withdraw your remaining finishing feedback before approving the final film.");
}
/** Supported local edits are explicit. Unsupported requests are never marked applied. */
export function interpretFinishingFeedback(text:string,settings:FinishingSettings):FinishingSettings|null{
 const t=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 // Only whole-film commands with an unambiguous supported meaning are applied.
 // A request involving a time range, a new voice, a music choice or a second
 // change stays pending instead of being partly declared successful.
 const command=t.replace(/[.!?]+$/g,"").replace(/^(please|s il te plait|merci de)\s+/,"").trim();
 const routes:[RegExp,Partial<FinishingSettings>][]=[
  [/^(?:remove|mute|turn off|disable)(?: the)? (?:music|background music)$|^(?:enleve|supprime|coupe)(?: la)? musique$|^sans musique$/,{musicLevel:"off"}],
  [/^(?:lower|reduce)(?: the)? (?:music|music volume|background music)$|^(?:make|keep)(?: the)? music (?:quieter|softer)$|^(?:baisse|reduis)(?: le volume de)?(?: la)? musique$/,{musicLevel:"quiet"}],
  [/^(?:restore|reset)(?: the)? music(?: volume)?$|^(?:make|keep)(?: the)? music louder$|^remets la musique normale$/,{musicLevel:"normal"}],
  [/^(?:hide|remove|disable)(?: the)? (?:subtitles|captions)$|^(?:enleve|supprime|masque)(?: les)? sous[ -]?titres$/,{captions:false}],
  [/^(?:show|add|enable)(?: the)? (?:subtitles|captions)$|^(?:ajoute|affiche)(?: les)? sous[ -]?titres$/,{captions:true}],
  [/^(?:make|keep)(?: the)? (?:subtitles|captions) (?:larger|bigger)$|^(?:agrandis|grossis)(?: les)? sous[ -]?titres$/,{captions:true,captionSize:"large"}],
  [/^(?:make|keep)(?: the)? (?:subtitles|captions) (?:smaller|normal)$|^reduis(?: les)? sous[ -]?titres$/,{captionSize:"normal"}],
  [/^(?:make|keep)(?: the)? (?:pace|pacing|rhythm) faster$|^accelere le rythme$/,{pace:"brisk"}],
  [/^(?:make|keep)(?: the)? (?:pace|pacing|rhythm) slower$|^ralentis le rythme$/,{pace:"relaxed"}],
 ];
 const matches=routes.filter(([pattern])=>pattern.test(command));
 return matches.length===1?FinishingSettings.parse({...settings,...matches[0][1]}):null;
}
