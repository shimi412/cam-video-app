import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getRecipe } from "../src/lib/recipes";
import { planConcept } from "../src/lib/concept/storyboard";
import { finishingBoard } from "../src/lib/concept/finishing";
import { presenterWordCues, validatePresenterText } from "../src/lib/concept/presenter-text";
import { measuredPhraseTiming } from "../src/lib/concept/timing";
import { writeMontage } from "../src/lib/concept/montage";
import { generationPlan } from "../src/lib/concept/generation-plan";
import { resolveParams } from "../src/lib/brain";

const phrase="Context can change everything.";
const board=()=>planConcept(phrase,getRecipe("cam-clay")!,"9:16");
it("uses a direct presenter treatment for the context statement without an invented metaphor",()=>{
 const shot=board().shots[0];
 expect(shot.visualMode).toBe("presenter-text"); expect(shot.overlay).toBe(phrase); expect(shot.endScene).toBeNull();
 expect(shot.imagePrompt).toContain("upper 38 percent"); expect(shot.imagePrompt).toContain("No text, letters");
 expect(()=>validatePresenterText({...shot,overlay:"A different message"},phrase)).toThrow(/exact excerpt/);
 expect(()=>validatePresenterText({...shot,overlay:null},phrase)).toThrow();
});
it("binds typography emphasis to the supplied words and rejects an invented alignment",()=>{
 const timing=measuredPhraseTiming([phrase],[2.4]);
 expect(presenterWordCues(phrase,1,timing).map(w=>w.start)).toEqual(timing.words.map(w=>w.start));
 expect(presenterWordCues("change everything",1,timing).map(w=>w.start)).toEqual(timing.words.slice(2).map(w=>w.start));
 expect(()=>presenterWordCues("Context changes everything",1,timing)).toThrow(/matched/);
});
it("preserves intentional presenter typography through finishing and keeps an unrelated title hidden",()=>{
 const current=board(), finished=finishingBoard(current,{hideTitles:true,reason:"Keep only intentional typography",reviewedBy:"qa"});
 expect(finished.shots[0].overlay).toBe(phrase);
 current.shots[0].visualMode="metaphor";
 expect(finishingBoard(current,{hideTitles:true,reason:"Hide legacy title",reviewedBy:"qa"}).shots[0].overlay).toBeNull();
});
it("invalidates the production budget when the treatment changes without adding a paid typography operation",()=>{
 const original=board(), timing=measuredPhraseTiming([phrase],[2.4]), params=resolveParams(phrase,"auto").params;
 const refs=[{id:"narrator",url:"/locked.png",sha256:"a".repeat(64)}];
 const a=generationPlan(phrase,params,original,timing,refs);
 const changed=structuredClone(original);changed.shots[0].visualMode="metaphor";
 const b=generationPlan(phrase,params,changed,timing,refs);
 expect(a.fingerprint).not.toBe(b.fingerprint);expect(a.operations.map(o=>o.kind)).toEqual(["voice","alignment","image","video"]);
});
it("composes local typography on all three canvases without duplicating a full-sentence caption",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"cam-presenter-text-"));
 try{
  for(const aspect of ["9:16","1:1","16:9"] as const){
   const timing=measuredPhraseTiming([phrase],[2.4]);
   await writeMontage(root,board(),timing,aspect,{}, {brandEnding:false});
   const html=await readFile(path.join(root,"index.html"),"utf8");
   expect(html).toContain('id="presenter-title-0"');expect(html).not.toContain('id="caption-0"');
   for(const w of timing.words)expect(html).toContain(`duration:.16},${w.start})`);
   expect(html).toContain("everything.</span>");expect(html).toContain("window.__timelines");
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
