import {StoryboardEditSchema} from "./storyboard-review";
import {z} from "zod";
import {sha256,Hash} from "./checkpoints";
import type {FilmComment} from "./film-feedback";
import {ImageRevisionSchema,type ImageRevisions} from "./storyboard-feedback";
import type {PreparedCast} from "./cast-preparation";
import {FinishingSettings} from "./finishing-review";
/** `finishing`, `summary` and `version` belong to the single journey (2026-10-23): a revision of a complete
 * version may carry finishing settings only (no scene), one client-facing reading of the notes, and the number
 * of the version it produces. Staged films never set them. */
export const FilmCorrectionSchema=z.object({source:Hash,comment:z.string().uuid(),commentHash:Hash,notes:z.array(z.object({id:z.uuid(),hash:Hash})).min(1).max(37).optional(),scenes:z.array(z.number().int().positive()),status:z.enum(["quoted","working","applied"]),revisions:z.record(z.string(),ImageRevisionSchema),edits:z.record(z.string(),StoryboardEditSchema).optional(),reuseOnly:z.boolean().optional(),completedInputs:z.record(z.string(),Hash),result:Hash.optional(),finishing:FinishingSettings.optional(),summary:z.string().max(4000).optional(),version:z.number().int().positive().optional()});
export type FilmCorrection=z.infer<typeof FilmCorrectionSchema>;
const Timeline=z.object({fps:z.number().positive(),scenes:z.array(z.object({scene:z.number().int().positive(),startFrame:z.number().nonnegative(),endFrame:z.number().positive()}))});
export function correctionScenes(comment:FilmComment,timeline:unknown){
 const t=Timeline.parse(timeline);
 if(comment.seconds===null){
  const text=comment.text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const explicit=[...text.matchAll(/\b(?:scene|plan|shot)\s*(\d+)\b/g)].map(match=>Number(match[1]));
  if(/\b(?:first|premier|premiere)\s+(?:scene|frame|shot|image|plan)\b/.test(text)&&t.scenes[0])explicit.push(t.scenes[0].scene);
  if(explicit.length){if(explicit.some(n=>!t.scenes.some(s=>s.scene===n)))throw new Error("Choose a scene that exists in this film.");return [...new Set(explicit)];}
  if(/\b(?:all|every|each|whole|entire|tous|toutes|chaque|ensemble|entier|entiere)\b/.test(text))return t.scenes.map(s=>s.scene);
  throw new Error("Choose At current time or name the scene to change. Say all scenes only for a video-wide correction.");
 }
 const frame=comment.seconds*t.fps,scene=t.scenes.find(s=>frame>=s.startFrame&&frame<s.endFrame);
 if(!scene)throw new Error("This time is in the ending. Choose a scene in the film to request a visual correction.");
 return [scene.scene];
}
export function filmCorrectionRevisions(comment:FilmComment,scenes:number[],previous:ImageRevisions,retries:Record<string,number>){
 // Text/music edits must not be silently misrepresented as generated picture edits.
 if(/\b(?:music|volume|audio|voice|subtitle|caption|musique|son|voix|sous.titre)\b/i.test(comment.text))throw new Error("This control corrects scene images and movement. Audio and subtitle corrections are not available here yet; your feedback is kept.");
 const revisions:ImageRevisions={};
 for(const scene of scenes){
  const old=previous[scene];let cast=old?.cast;
  if(cast&&/\b(?:style|kind|proportion\w*|cartoon|realistic|appearance|apparence|forme|visage)\b/i.test(comment.text)){
   const key=sha256(JSON.stringify({cast,correction:comment.text,scene,style:2})).slice(0,16);
   cast={...cast,styleContract:2,characters:cast.characters.map((person,i)=>({...person,id:`cast-${key}-${i+1}`,identity:person.identity.replace(/Longer oval face|Square face|Heart-shaped face/i,"Soft rounded face")}))} satisfies PreparedCast;
  }
  const note=[old?.note,`Correction requested after watching the animation (takes priority over earlier descriptions): ${comment.text}`].filter(Boolean).join("\n");
  revisions[scene]=ImageRevisionSchema.parse({...old,note,attempt:(retries[`scene-${scene}-start`]??0)+1,animationContract:2,instructionContract:3,...(cast?{cast}:{})});
 }
 return revisions;
}
