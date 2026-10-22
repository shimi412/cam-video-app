import {expect,it} from "vitest";
import {normalizeDirectorScene} from "../src/lib/concept/ai-direction";
import {productionError} from "../src/lib/production-error";
import {DirectionSchema} from "../src/lib/concept/types";
const base={scene:"Presenter facing the camera.",motion:"A calm gesture.",references:["narrator"],endScene:null,overlay:"Check the source.",strike:false,visualMode:"presenter-text",metaphor:"A direct explanation.",stateChange:false,actionSeconds:1,breathBefore:.4};
it("repairs short actions locally without editing narration or the input",()=>{
 expect(normalizeDirectorScene(base,"Check the source.").actionSeconds).toBe(3);
 expect(normalizeDirectorScene({...base,stateChange:true},"Check the source.").actionSeconds).toBe(4);
 expect(base.actionSeconds).toBe(1);
 expect(()=>normalizeDirectorScene({...base,actionSeconds:20},"Check the source.")).toThrow();
});
it("keeps long titles within 100 characters at a word boundary using only spoken words",()=>{
 const text="A country where people live together, vote, run businesses, serve in parliament and share hospitals, universities and neighborhoods.";
 const result=normalizeDirectorScene({...base,overlay:text},text);
 expect(result.overlay!.length).toBeLessThanOrEqual(100);expect(text.startsWith(result.overlay!)).toBe(true);
 expect(result.overlay).not.toMatch(/\s$/);
});
it("does not expose validation details or model names in public errors",()=>{
 const parsed=DirectionSchema.safeParse({...base,actionSeconds:1});
 expect(parsed.success).toBe(false);
 if(!parsed.success)expect(productionError(parsed.error)).not.toMatch(/actionSeconds|too_small|Zod/);
 expect(productionError(new Error("OpenRouter Claude request failed"))).not.toMatch(/OpenRouter|Claude/);
 expect(productionError(new Error("already sent and unconfirmed"))).toContain("not been sent again");
});
