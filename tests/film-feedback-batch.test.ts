import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {selectFilmBatch,filmNoteHash,correctionNotesMatch,batchFinishingSettings,assertCompatibleFilmEdits} from '../src/lib/concept/film-feedback-batch';
import {FinishingSettings} from '../src/lib/concept/finishing-review';
import type {FilmCorrection} from '../src/lib/concept/film-correction';
const note=(text:string)=>({id:randomUUID(),target:'a'.repeat(64),text,seconds:2,actor:'test',at:new Date().toISOString()});
it('binds every note and timestamp to the batch, rejects missing or duplicate notes',()=>{
 const comments=[note('First'),note('Second')];
 expect(selectFilmBatch(comments,comments.map(c=>c.id))).toEqual(comments);
 expect(()=>selectFilmBatch(comments,[comments[0].id,comments[0].id])).toThrow();
 expect(()=>selectFilmBatch(comments,[randomUUID()])).toThrow();
 const correction={source:comments[0].target,comment:comments[0].id,commentHash:filmNoteHash(comments[0]),notes:comments.map(c=>({id:c.id,hash:filmNoteHash(c)})),scenes:[1,2],status:'quoted',revisions:{},completedInputs:{}} as FilmCorrection;
 expect(correctionNotesMatch(correction,comments)).toBe(true);
 expect(correctionNotesMatch(correction,comments.slice(0,1))).toBe(false);
 expect(correctionNotesMatch(correction,[comments[0],{...comments[1],seconds:8}])).toBe(false);
});
it('combines independent finishing changes into one render and refuses conflicting or unresolved notes',()=>{
 const base=FinishingSettings.parse({});
 const decision=(id:string,settings:Partial<FinishingSettings>)=>({id,stage:'finishing' as const,status:'planned' as const,message:'Ready',changes:[],finishing:{...base,...settings}});
 expect(batchFinishingSettings(base,{decisions:[decision('1',{musicLevel:'quiet'}),decision('2',{captionSize:'large'})]})).toMatchObject({musicLevel:'quiet',captionSize:'large'});
 expect(base.musicLevel).toBe('normal');
 expect(()=>batchFinishingSettings(base,{decisions:[decision('1',{musicLevel:'quiet'}),decision('2',{musicLevel:'off'})]})).toThrow(/conflicting/);
 expect(()=>batchFinishingSettings(base,{decisions:[{...decision('1',{}),status:'clarify',finishing:null}]})).toThrow();
});

it('does not silently overwrite conflicting visual edits from two notes',()=>{
 const decision=(id:string,textOnly:boolean)=>({id,stage:'visual' as const,status:'planned' as const,message:'Ready',finishing:null,changes:[{scene:2,edit:{textOnly},imageInstruction:null,characters:[]}]});
 expect(()=>assertCompatibleFilmEdits({decisions:[decision('1',true),decision('2',false)]})).toThrow(/conflicting/);
 expect(()=>assertCompatibleFilmEdits({decisions:[decision('1',true),decision('2',true)]})).not.toThrow();
});

it('keeps an exact untimed repeat scoped to its unique timed note without changing the originals',async()=>{
 const {scopeRepeatedFilmNotes}=await import('../src/lib/concept/film-feedback-batch');
 const timed=note('More movement in this shot'),repeat={...note(timed.text),seconds:null};
 const decision=(id:string,scenes:number[])=>({id,stage:'visual' as const,status:'planned' as const,message:'Animate this scene.',finishing:null,changes:scenes.map(scene=>({scene,edit:{motion:'Keep moving',textOnly:false,visualMode:'metaphor' as const},imageInstruction:null,characters:[]}))});
 const plan={decisions:[decision(timed.id,[5]),decision(repeat.id,[1,2,3,4,5,6,7,8,9])]};
 const result=scopeRepeatedFilmNotes(plan,[timed,repeat]);
 expect(result.decisions.map(d=>d.changes.map(c=>c.scene))).toEqual([[5],[5]]);
 expect(result.decisions.map(d=>d.id)).toEqual([timed.id,repeat.id]);
 expect(plan.decisions[1].changes).toHaveLength(9);expect(repeat.seconds).toBeNull();
 expect(scopeRepeatedFilmNotes(plan,[timed,{...repeat,text:'More movement throughout the entire film'}])).toEqual(plan);
 expect(()=>scopeRepeatedFilmNotes(plan,[timed,{...timed,id:randomUUID(),seconds:20},repeat])).toThrow(/several timestamps/);
});
