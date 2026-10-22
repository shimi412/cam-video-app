import {expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {rm,readFile,readdir} from 'node:fs/promises';
import {directFeedback,validateFeedbackPlan,applyDirectedStoryboard,type FeedbackContext,type FeedbackPlan} from '../src/lib/concept/feedback-director';
import {emptyStoryboardFeedback,recordSceneComment} from '../src/lib/concept/storyboard-feedback';
import type {requestBrainObject} from '../src/lib/providers/brain';
const panel=(scene:number,narration:string)=>({scene,narration,meaning:'Read the context',startScene:'Clay guide beside a globe',endScene:null,motion:'Still camera',actionSeconds:3,graphicLayers:[{kind:'symbol' as const,symbol:'globe' as const,position:'top-center' as const}]});
const context=():FeedbackContext=>({jobId:randomUUID(),target:'a'.repeat(64),phase:'storyboard',script:"Context matters. Don't be a victim of propaganda.",panels:[panel(3,'Context matters.'),panel(8,"Don't be a victim of propaganda.")],notes:[{id:'scene:3',text:'Enlève les pastilles flotantes',scenes:[3]},{id:'scene:8',text:'Je vreux juste une animation de texte ici, pas besoin du personnage',scenes:[8]}],history:{}});
const answer=():FeedbackPlan=>({decisions:[{id:'scene:3',stage:'visual',status:'planned',message:'Remove the floating layers, preserving the image.',finishing:null,changes:[{scene:3,edit:{graphicLayers:[]},imageInstruction:null,characters:[]}]},{id:'scene:8',stage:'visual',status:'planned',message:'Animate the original sentence without a character.',finishing:null,changes:[{scene:8,edit:{textOnly:true,visualMode:'presenter-text',overlay:"Don't be a victim of propaganda.",graphicLayers:[]},imageInstruction:null,characters:[]}]}]});
it('calls the supervising reasoning model with full context once, persists and replays its typed plan',async()=>{
 const input=context(),request=vi.fn(async(input:Parameters<typeof requestBrainObject>[0])=>{expect(input.requireClaude).toBe(true);return answer();});
 try{
  const plan=await directFeedback(input,async()=>{},request as typeof requestBrainObject);
  await directFeedback(input,async()=>{},request as typeof requestBrainObject);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toMatchObject({requireClaude:true});
  const sent=request.mock.calls[0][0] as unknown as {system:string;prompt:string};
  expect(JSON.parse(sent.prompt)).toEqual({...input,batch:{noteIds:input.notes.map(n=>n.id),rule:'Return exactly one decision per id in noteIds and none for any other scene; history entries marked applied are finished.'}});expect(sent.system).toContain('Never turn an instruction into visible text');
  let feedback=emptyStoryboardFeedback();for(const n of input.notes)feedback=recordSceneComment(feedback,n.scenes[0],n.text,'test');
  const result=applyDirectedStoryboard(feedback,plan);
  expect(result.images).toEqual({});expect(result.feedback.edits[3]).toEqual({graphicLayers:[]});
  expect(result.feedback.edits[8]).toMatchObject({textOnly:true,overlay:input.panels[1].narration});
  expect(result.feedback.comments[8].text).toBe(input.notes[1].text);
  const dir=`storage/concepts/${input.jobId}/live/director`;expect(JSON.parse(await readFile(`${dir}/${(await readdir(dir))[0]}`,'utf8'))).toEqual(plan);
 }finally{await rm(`storage/concepts/${input.jobId}`,{recursive:true,force:true});}
});
it('fails closed when the director is unavailable instead of falling back to keyword rules',async()=>{
 const input=context(),request=vi.fn(async()=>null);
 await expect(directFeedback(input,async()=>{},request as typeof requestBrainObject)).rejects.toThrow('director is unavailable');
 expect(request).toHaveBeenCalledTimes(1);
});
it('rejects turning the client instruction into visible text',()=>{
 const input=context(),plan=answer();plan.decisions[1].changes[0].edit!.overlay=input.notes[1].text;
 expect(()=>validateFeedbackPlan(input,plan)).toThrow('never from feedback');
});
it('rejects invented copy, changed scope, dropped notes and automatic badges',()=>{
 const input=context();let plan=answer();plan.decisions[1].changes[0].edit!.overlay='A completely different claim';expect(()=>validateFeedbackPlan(input,plan)).toThrow('Visible text');
 plan=answer();plan.decisions[0].changes[0].scene=8;expect(()=>validateFeedbackPlan(input,plan)).toThrow('scope');
 plan=answer();plan.decisions.pop();expect(()=>validateFeedbackPlan(input,plan)).toThrow('omitted');
 plan=answer();plan.decisions[1].changes[0].edit={graphicLayers:input.panels[0].graphicLayers};expect(()=>validateFeedbackPlan(input,plan)).toThrow('explicit client');
});
it('prices only interpreted image instructions and prepares distinct requested cast identities',()=>{
 const input=context(),plan=answer();plan.decisions[0].changes[0]={scene:3,edit:null,imageInstruction:'Show two clay soldiers beside the globe. Preserve the set and lighting.',characters:[{role:'soldier',identity:'Rounded face and short black clay hair'},{role:'soldier',identity:'Rounded face and short brown clay hair'}]};
 let feedback=emptyStoryboardFeedback();for(const n of input.notes)feedback=recordSceneComment(feedback,n.scenes[0],n.text,'test');
 const result=applyDirectedStoryboard(feedback,validateFeedbackPlan(input,plan));
 expect(result.images[3].instruction).toContain('Show two clay soldiers');expect(result.images[3].cast?.characters).toHaveLength(2);
 expect(result.images[8]).toBeUndefined();expect(result.feedback.comments[3].status).toBe('needs-image-revision');
});
it('keeps unsupported requests unresolved without executable operations',()=>{
 const input=context(),plan=answer();plan.decisions[0]={...plan.decisions[0],status:'clarify',message:'This changes the saved narration partition; a new editorial plan is needed.',changes:[]};
 let feedback=emptyStoryboardFeedback();for(const n of input.notes)feedback=recordSceneComment(feedback,n.scenes[0],n.text,'test');
 const result=applyDirectedStoryboard(feedback,validateFeedbackPlan(input,plan));expect(result.feedback.comments[3].status).toBe('needs-action-plan');expect(result.images).toEqual({});
});

it('accepts a priced motion revision only during film review',()=>{
 const input=context();input.phase='visual-film';input.notes=[{id:'move',text:'This scene is static; make it move.',scenes:[3]}];
 const plan:FeedbackPlan={decisions:[{id:'move',stage:'visual',status:'planned',message:'Price a new animated clip, keep the image.',finishing:null,changes:[{scene:3,edit:{motion:'The guide turns the globe continuously as the camera slowly moves closer.',textOnly:false,visualMode:'metaphor'},imageInstruction:null,characters:[]}]}]};
 expect(validateFeedbackPlan(input,plan).decisions[0].changes[0].edit?.motion).toContain('turns the globe');
 expect(()=>validateFeedbackPlan({...input,phase:'storyboard'},plan)).toThrow(/Motion revisions/);
});

it('repairs duplicate scope before checking redundant animation flags from a received model answer',()=>{
 const input=context();input.phase='visual-film';
 input.notes=[{id:'timed',text:'Make this shot move',scenes:[3],seconds:13},{id:'duplicate',text:'Make this shot move',scenes:[3,8],seconds:null}];
 const decision={id:'timed',stage:'visual',status:'planned',message:'Animate the approved frame.',finishing:null,changes:[{scene:3,edit:{motion:'Turn the globe continuously.',visualMode:'presenter-text'},imageInstruction:null,characters:[]}]};
 const value={decisions:[decision,{...decision,id:'duplicate',changes:[...decision.changes,{scene:8,edit:{motion:'Invented expansion',textOnly:true},imageInstruction:null,characters:[]}]}]};
 const plan=validateFeedbackPlan(input,value);
 expect(plan.decisions.map(d=>d.changes.map(c=>c.scene))).toEqual([[3],[3]]);
 expect(plan.decisions[0].changes[0].edit).toEqual({motion:'Turn the globe continuously.',textOnly:false,visualMode:'metaphor'});
 expect(value.decisions[1].changes).toHaveLength(2);
 value.decisions[0].changes[0].edit=Object.assign(value.decisions[0].changes[0].edit,{textOnly:true});
 expect(()=>validateFeedbackPlan(input,value)).toThrow(/Motion revisions/);
});

it('reuses the received semantic answer after persisting derived annotations, but analyzes a changed instruction',async()=>{
 const input=context();input.history={comments:[{id:'note',text:'Keep the original wording',stage:'mixed',interpretation:null,actor:'human'}]};
 const request=vi.fn(async()=>answer());
 try{
  await directFeedback(input,async()=>{},request as typeof requestBrainObject,async()=>null);
  input.history={comments:[{id:'note',text:'Keep the original wording',stage:'visual',interpretation:'Now understood',actor:'human'}]};
  await directFeedback(input,async()=>{},request as typeof requestBrainObject,async()=>null);
  expect(request).toHaveBeenCalledTimes(1);
  input.notes[0].text='Remove all floating badges';
  await directFeedback(input,async()=>{},request as typeof requestBrainObject,async()=>null);
  expect(request).toHaveBeenCalledTimes(2);
 }finally{await rm(`storage/concepts/${input.jobId}`,{recursive:true,force:true});}
});
