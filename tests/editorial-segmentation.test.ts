import {expect,it} from "vitest";
import {conceptPhrases,editorialPhrases,normalizedText} from "../src/lib/concept/text";
import {resolveParams} from "../src/lib/brain";
import {planConcept} from "../src/lib/concept/storyboard";
import {getRecipe} from "../src/lib/recipes";
import {loadDirectorMemory} from "../src/lib/concept/director-memory";

const comparison="Meanwhile, Qatar has longstanding ties to the Muslim Brotherhood, an Islamist movement with extremist ideologies, and has poured billions into American universities, media, and lobbying far more than Israel.";
it("keeps the complete comparison for new jobs without changing legacy paid scene identities",()=>{
 expect(conceptPhrases(comparison)).toHaveLength(2);
 expect(conceptPhrases(comparison).at(-1)).toBe("Israel.");
 const {params}=resolveParams(comparison,"auto");
 expect(params.sceneNarrations).toEqual([comparison]);expect(params.shotCount).toBe(1);
 const recipe=getRecipe(params.templateSlug)!;
 const current=planConcept(comparison,recipe,params.aspectRatio,{},params.sceneNarrations);
 expect(current.shots).toHaveLength(1);expect(current.shots[0].narration).toBe(comparison);
 expect(planConcept(comparison,recipe,params.aspectRatio).shots).toHaveLength(2);
 expect(current.shots[0].imagePrompt).toContain("Physical props and national flags");
 expect(planConcept(comparison,recipe,params.aspectRatio).shots[0].imagePrompt).not.toContain("Physical props and national flags");
});
it("does not use word-count cuts even for the provisional disclosure",()=>{
 const text=Array.from({length:100},(_,i)=>`word${i}`).join(" ")+".";
 expect(editorialPhrases(text)).toEqual([text]);
 expect(editorialPhrases(`First clear idea.\n${comparison}\nClosing idea.`)).toEqual(["First clear idea.",comparison,"Closing idea."]);
});
it("rejects a persisted narration partition which loses or replaces script words",()=>{
 const {params}=resolveParams(comparison,"auto"),recipe=getRecipe(params.templateSlug)!;
 expect(()=>planConcept(comparison,recipe,params.aspectRatio,{},[comparison.replace("Israel.","")])).toThrow(/changed the script/);
 expect(normalizedText(editorialPhrases(comparison).join(" "))).toBe(normalizedText(comparison));
});
it("loads the comparison rule through the actual production director memory reader",async()=>{
 const memory=await loadDirectorMemory();
 expect(JSON.stringify(memory)).toContain("A narration comparison is one idea");
 expect(JSON.stringify(memory)).toContain("clay balance");
});
