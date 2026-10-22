import {expect,it,vi} from "vitest";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {lockedAssets} from "../src/lib/concept/assets";
import {characterSheetBlockers} from "../src/lib/concept/character-sheet-policy";
import {generationPlan,materializeRequest} from "../src/lib/concept/generation-plan";
import {resolveParams} from "../src/lib/brain";
import {planConcept} from "../src/lib/concept/storyboard";
import {placeholderTiming} from "../src/lib/concept/timing";
import {getRecipe} from "../src/lib/recipes";
import {priceCamPlan} from "../src/lib/providers/cam-pricing";
import {videoCharacters} from "../src/lib/character-library";
async function fixture(ids:string[]){
 const script="Check the source before sharing.",{params}=resolveParams(script,"auto");
 const board=planConcept(script,getRecipe("cam-clay")!,params.aspectRatio);
 Object.assign(board.shots[0],{references:ids,endImagePrompt:"The same presenter after the action.",endScene:"Final pose"});
 const refs=await lockedAssets();
 return {refs,plan:generationPlan(script,params,board,placeholderTiming([script]),refs)};
}
it("loads the exact human-approved sheet bytes instead of the portrait",async()=>{
 const refs=await lockedAssets();
 for(const id of ["narrator","effigy"]){const ref=refs.find(r=>r.id===id)!;
  expect(ref.url).toBe(`/recipes/cam-clay/${id}-sheet.png`);
  expect(createHash("sha256").update(await readFile(ref.filePath)).digest("hex")).toBe(ref.characterSheet?.sha256);
 }
 expect(refs.find(r=>r.id==="monster")?.characterSheet).toBeUndefined();
});
it("binds each cast member's sheet to both images and the approved images to animation",async()=>{
 const {refs,plan}=await fixture(["narrator","effigy"]);
 const urls=Object.fromEntries(refs.map(r=>[`reference:${r.id}`,`https://example.com${r.url}`]));
 const start=materializeRequest(plan.operations.find(o=>o.id==="scene-1-start")!,urls);
 expect((start as Record<string,unknown>).image_urls).toEqual([urls["reference:narrator"],urls["reference:effigy"]]);
 const end=materializeRequest(plan.operations.find(o=>o.id==="scene-1-end")!,{...urls,"output:scene-1-start":"https://example.com/approved-start.png"});
 expect((end as Record<string,unknown>).image_urls).toEqual(["https://example.com/approved-start.png",urls["reference:narrator"],urls["reference:effigy"]]);
 const clip=materializeRequest(plan.operations.find(o=>o.id==="scene-1-clip")!,{"output:scene-1-start":"https://example.com/approved-start.png","output:scene-1-end":"https://example.com/approved-end.png"});
 expect((clip as Record<string,unknown>).start_image_url).toBe("https://example.com/approved-start.png");expect((clip as Record<string,unknown>).end_image_url).toBe("https://example.com/approved-end.png");
});
it("blocks pending, missing and changed sheets before pricing, upload or voice generation",async()=>{
 const {plan,refs}=await fixture(["narrator","monster"]);const provider=vi.fn();
 await expect(priceCamPlan(plan,{fal:provider,higgsfield:provider})).rejects.toThrow(/monster.*character sheet/);
 expect(provider).not.toHaveBeenCalled();
 for(const op of plan.operations)expect(()=>materializeRequest(op,{})).toThrow(/character sheet/);
 const narrator=refs.find(r=>r.id==="narrator")!;
 expect(characterSheetBlockers([{index:1,references:["narrator"]}],[{...narrator,sha256:"0".repeat(64)}])).toHaveLength(1);
 expect(characterSheetBlockers([{index:1,references:["new-character"]}],refs)).toHaveLength(1);
});
it("groups only recorded characters by video without assigning the full catalogue",()=>{
 const base={id:"video-1",title:"Check sources",script:"A short script",status:"succeeded",params:{preparation:{shots:[{index:1,references:["narrator"]},{index:2,references:["narrator","effigy"]}]}}};
 const result=videoCharacters(base);
 expect(result.characters.map(c=>c.id)).toEqual(["narrator","effigy"]);
 expect(result.characters[0].scenes).toEqual([1,2]);
 expect(videoCharacters({...base,params:{}}).characters).toEqual([]);
 expect(videoCharacters(base,[{index:3,references:["monster"]}]).characters[0]).toMatchObject({id:"monster",approved:false,sheetUrl:null});
});
it("prepares one pending catalogue sheet and reuses its exact output in every semantic scene",async()=>{
 const {params}=resolveParams("Check the source. Show the fabrication.","auto");
 params.editorialPlan={version:"semantic-ideas-v1",beats:[]};
 const board=planConcept("Check the source. Show the fabrication.",getRecipe("cam-clay")!,params.aspectRatio);
 for(const shot of board.shots)Object.assign(shot,{references:["monster"],motion:"He gestures calmly.",stateChange:false,endScene:null,endImagePrompt:null});
 const refs=await lockedAssets(),plan=generationPlan("Check the source. Show the fabrication.",params,board,placeholderTiming(board.shots.map(s=>s.narration)),refs);
 const sheets=plan.operations.filter(o=>o.id.startsWith("cast-"));expect(sheets).toHaveLength(1);
 const sheet=sheets[0];expect(sheet.bindings.image_urls).toEqual(["reference:monster"]);
 expect(sheet.input.prompt).toContain("EXACT character");
 for(const shot of board.shots){const image=plan.operations.find(o=>o.id===`scene-${shot.index}-start`)!;
  expect(image.dependsOn).toContain(sheet.id);expect(image.bindings.image_urls).toEqual([`output:${sheet.id}`]);
  expect(()=>materializeRequest(image,{"reference:monster":"https://example.com/portrait.png"})).toThrow("Unresolved media binding");
 }
 const provider=vi.fn(async()=>({prices:[{endpoint_id:"fal-ai/nano-banana-pro/edit",unit_price:.15,unit:"images",currency:"USD"}]}));
 const quote=await priceCamPlan(plan,{fal:provider,higgsfield:vi.fn()},Date.now(),{scope:"storyboard"});
 expect(quote.lines).toHaveLength(board.shots.length+1);expect(quote.caps.usd).toBe((board.shots.length+1)*150000);
 expect(refs.find(r=>r.id==="monster")?.characterSheet).toBeUndefined();
});
