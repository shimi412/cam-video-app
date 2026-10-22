/** Explicit deterministic test double. Never imported by production code. */
import type {FeedbackDirector} from '../../src/lib/concept/feedback-director';
import {applySceneComment,applyGlobalStoryboardComment,emptyStoryboardFeedback,localStoryboardChange} from '../../src/lib/concept/storyboard-feedback';
import {interpretFinishingFeedback} from '../../src/lib/concept/finishing-review';
import {feedbackStage} from '../../src/lib/concept/review-stages';
export const fixtureFeedbackDirector:FeedbackDirector=async input=>({decisions:input.notes.map(note=>{
 const stage=feedbackStage(note.text),message='Test director interpreted the request.';
 if(input.phase==='finishing')return {id:note.id,stage:'finishing' as const,status:'planned' as const,message,changes:[],finishing:interpretFinishingFeedback(note.text,input.settings!)};
 if(input.phase==='visual-film')return {id:note.id,stage,status:stage==='mixed'?'clarify' as const:'planned' as const,message,finishing:null,changes:stage==='visual'?note.scenes.map(scene=>({scene,edit:null,imageInstruction:note.text,characters:[]})):[]};
 const feedback=emptyStoryboardFeedback();
 const result=note.id==='global'?applyGlobalStoryboardComment(feedback,input.panels,note.text,'fixture',note.scenes):applySceneComment({...feedback,comments:{[note.scenes[0]]:{text:note.text,actor:'fixture',at:new Date().toISOString(),status:'locked',message:''}}},input.panels.find(p=>p.scene===note.scenes[0])!);
 const comment=note.id==='global'?result.globalComment!:result.comments[note.scenes[0]];
 return {id:note.id,stage:'visual' as const,status:comment.status==='applied'||comment.status==='needs-image-revision'?'planned' as const:'clarify' as const,message:comment.message,finishing:null,changes:comment.status==='applied'||comment.status==='needs-image-revision'?note.scenes.map(scene=>({scene,edit:comment.status==='applied'?localStoryboardChange(note.text,input.panels.find(p=>p.scene===scene)!).edit??{}:null,imageInstruction:comment.status==='needs-image-revision'?note.text:null,characters:[]})):[]};
})});
