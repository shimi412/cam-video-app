import {feedbackStage} from "./review-stages";
import {z} from "zod";
import {Hash,sha256} from "./checkpoints";
export const FilmCommentSchema=z.object({id:z.uuid(),target:Hash,text:z.string().trim().min(1).max(2000),seconds:z.number().finite().min(0).nullable(),actor:z.string().min(1),at:z.string().datetime(),interpretation:z.string().max(800).optional(),stage:z.enum(["visual","finishing","mixed","unreviewed"]).optional()}).strict();
export type FilmComment=z.infer<typeof FilmCommentSchema>;
export const FilmFeedbackSchema=z.object({version:z.literal(1),comments:z.array(FilmCommentSchema).max(200)}).strict();
export function addFilmComment(book:z.infer<typeof FilmFeedbackSchema>,comment:FilmComment,duration:number){
 const parsed=FilmCommentSchema.parse(comment);
 if(!Number.isFinite(duration)||duration<=0||parsed.seconds!==null&&parsed.seconds>duration)throw new Error("Choose a time within the current preview.");
 const old=book.comments.find(c=>c.id===parsed.id);
 if(old){if(old.target!==parsed.target||old.text!==parsed.text||old.seconds!==parsed.seconds)throw new Error("This comment changed. Send it as a new comment.");return book;}
 return FilmFeedbackSchema.parse({...book,comments:[...book.comments,parsed]});
}
export function assertFilmFeedbackResolved(comments:FilmComment[],target:string){
 if(comments.some(c=>c.target===target&&(c.stage??feedbackStage(c.text))!=="finishing"))throw new Error("Your requested changes are still pending. Review them before approving this film.");
}

/** Deferred requests belong to the video and survive replacement visual targets. */
export function pendingFilmComments(comments:FilmComment[],target:string|undefined,finishing:{target:string;appliedComments:string[]}|null){
 return comments.filter(c=>!finishing?.appliedComments.includes(c.id)&&((c.stage??feedbackStage(c.text))==="finishing"||c.target===(finishing?.target??target)));
}

/** Replace a locked note atomically. Editing alone never deletes saved feedback. */
export function replaceFilmComment(book:z.infer<typeof FilmFeedbackSchema>,comment:FilmComment,duration:number,replaces:{id:string;hash:string},eligible:string[]){
 if(book.comments.some(c=>c.id===comment.id))return addFilmComment(book,comment,duration);
 const old=book.comments.find(c=>c.id===replaces.id);
 if(!old||!eligible.includes(old.id)||sha256(JSON.stringify({id:old.id,target:old.target,text:old.text,seconds:old.seconds}))!==replaces.hash)throw new Error("This feedback changed while you were editing. Your saved note is kept; reload before locking the edit.");
 const next=addFilmComment(book,comment,duration);
 return {...next,comments:next.comments.filter(c=>c.id!==old.id)};
}
