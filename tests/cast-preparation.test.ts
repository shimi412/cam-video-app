import { expect, it } from "vitest";
import { prepareCast, characterSheetPrompt } from "../src/lib/concept/cast-preparation";
import { applyImageRevisions } from "../src/lib/concept/storyboard-feedback";
import { generationPlan, materializeRequest, ImageRequestSchema } from "../src/lib/concept/generation-plan";
import { planConcept } from "../src/lib/concept/storyboard";
import { placeholderTiming } from "../src/lib/concept/timing";
import { resolveParams } from "../src/lib/brain";
import { getRecipe } from "../src/lib/recipes";
import { storyboardReviewContent } from "../src/lib/concept/storyboard-review";
import { sha256 } from "../src/lib/concept/checkpoints";

const note="This case doesn't make sens with the sentence. You can show instead two soldiers in the same vibe of the main cartoon character being side by side on the field";
it("counts the requested soldiers without treating the presenter style reference as a third character",()=>{
 const cast=prepareCast(note,6);
 expect(cast.characters.map(c=>c.role)).toEqual(["soldier","soldier"]);
 expect(new Set(cast.characters.map(c=>c.identity)).size).toBe(2);
 expect(prepareCast(note,6)).toEqual(cast);
 expect(prepareCast(note,7).characters[0].id).not.toBe(cast.characters[0].id);
 expect(characterSheetPrompt(cast,0)).toContain("three equal panels");
 expect(characterSheetPrompt(cast,0)).toContain("style");
 expect(cast.styleContract).toBe(2);
 for(let i=0;i<cast.characters.length;i++){
  expect(characterSheetPrompt(cast,i)).toContain("head-to-body ratio");
  expect(characterSheetPrompt(cast,i)).toContain("same stylization for every member");
 }
 expect(()=>prepareCast("Add a crowd",1)).toThrow(/Describe/);
 expect(()=>prepareCast("Show soldiers",1)).toThrow(/how many/);
 expect(()=>prepareCast("Show 30 soldiers",1)).toThrow(/one to four/);
});

it("preserves saved legacy sheets instead of silently regenerating them under a new style contract",()=>{
 const saved={brief:note,characters:[{id:"cast-ef1bd43567b59745-1",role:"soldier",identity:"Rounded face, short dark wavy clay hair, broad eyebrows"}]};
 const prompt=characterSheetPrompt(saved,0);
 expect(prompt).not.toContain("same stylization for every member");
 expect(prompt).toContain(saved.characters[0].identity);
 expect(prepareCast(note,6).characters[0].id).not.toBe(saved.characters[0].id);
});

it("binds both new sheets before the scene while preserving every other scene's operation identity",()=>{
 const script="Check the source. Read the full passage.",params=resolveParams(script,"auto").params;
 const recipe=getRecipe("cam-clay")!,board=planConcept(script,recipe,params.aspectRatio),timing=placeholderTiming(board.shots.map(s=>s.narration));
 const references=[{id:"narrator",url:"/sheet.png",sha256:"a".repeat(64),characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-15"}}];
 const before=generationPlan(script,params,board,timing,references),cast=prepareCast(note,1);
 applyImageRevisions(board,{1:{note,attempt:1,cast}});
 const after=generationPlan(script,params,board,timing,references),start=after.operations.find(op=>op.id==="scene-1-start")!;
 expect(after.operations.filter(op=>op.id.startsWith("cast-"))).toHaveLength(2);
 expect(start.dependsOn).toEqual(cast.characters.map(c=>c.id));
 expect(start.bindings.image_urls).toEqual(["reference:narrator",...cast.characters.map(c=>`output:${c.id}`)]);
 expect(()=>materializeRequest(start,{"reference:narrator":"https://example.invalid/style.png"})).toThrow(/Unresolved/);
 const payload=ImageRequestSchema.parse(materializeRequest(start,{"reference:narrator":"https://example.invalid/style.png",...Object.fromEntries(cast.characters.map((c,i)=>[`output:${c.id}`,`https://example.invalid/soldier-${i}.png`]))}));
 expect(payload.image_urls).toHaveLength(3);expect(payload.aspect_ratio).toBe(params.aspectRatio);
 expect(payload.prompt).not.toContain("never add any new person");
 for(const original of before.operations.filter(op=>op.scene!==1))expect(after.operations.find(op=>op.id===original.id)).toEqual(original);
 expect(board.shots[0].graphicLayers).toEqual([]);
});

it("binds the exact generated character sheet bytes to human storyboard approval",()=>{
 const media={id:"00000000-0000-4000-8000-000000000001",kind:"image" as const,sha256:"a".repeat(64),width:1600,height:900};
 const panel={scene:1,narration:"Two people.",meaning:"Two distinct characters",startScene:"Standing together",endScene:null,motion:"Small gestures",actionSeconds:5,start:media,characterSheets:[{id:prepareCast("Show two soldiers",1).characters[0].id,role:"soldier",media}]};
 const first=sha256(JSON.stringify(storyboardReviewContent([panel],"9:16")));
 const changed={...panel,characterSheets:[{...panel.characterSheets[0],media:{...media,sha256:"b".repeat(64)}}]};
 expect(sha256(JSON.stringify(storyboardReviewContent([changed],"9:16")))).not.toBe(first);
});

it("keeps creation feedback out of new animation requests without rewriting paid legacy inputs",()=>{
 const script="Check the source. Read the full passage.",params=resolveParams(script,"auto").params;
 const recipe=getRecipe("cam-clay")!,original=planConcept(script,recipe,params.aspectRatio);
 const cast=prepareCast(note,1),revision={note:"A carpet is already under the bare feet during prayer time",attempt:2,cast};
 const old=structuredClone(original),corrected=structuredClone(original);
 applyImageRevisions(old,{1:revision});
 applyImageRevisions(corrected,{1:{...revision,animationContract:2}});
 expect(old.shots[0].motionPrompt).toContain(revision.note);
 expect(corrected.shots[0].imagePrompt).toBe(old.shots[0].imagePrompt);
 expect(corrected.shots[0].motionPrompt).not.toContain(revision.note);
 expect(corrected.shots[0].motionPrompt).not.toContain(cast.brief);
 expect(corrected.shots[0].motionPrompt).not.toContain("character sheets");
 expect(corrected.shots[0].motionPrompt).toContain("head-to-body ratio");
 expect(corrected.shots[0].motionPrompt).toContain("Keep the initial poses");
 expect(corrected.shots[1]).toEqual(original.shots[1]);
 const resumed=structuredClone(original);applyImageRevisions(resumed,{1:revision});
 expect(resumed).toEqual(old);
});
