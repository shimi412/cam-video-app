import {expect,it} from "vitest";
import {completeSemanticEndpoint,completeUnstartedSemanticEndpoints} from "../src/lib/concept/semantic-endpoints";
import {resolveParams} from "../src/lib/brain";
import {physicalDirectionIssues} from "../src/lib/concept/physical-direction";
import {DirectionSchema} from "../src/lib/concept/types";
const direction=DirectionSchema.parse({scene:"A clay workshop with a stamp and blank tablets.",motion:"The monster presses a seal onto the tablet, lifts it to reveal the stamped mark, then holds the tablet toward camera.",references:["monster"],stateChange:true,endScene:null,actionSeconds:7,overlay:null,strike:false});
it("completes a missing final frame from the exact planned action without another analysis",()=>{
 const result=completeSemanticEndpoint(direction);
 expect(result.endScene).toContain(direction.motion);expect(result.endScene).toContain("One final still");
 expect(result.motion).toBe(direction.motion);expect(result.scene).toBe(direction.scene);expect(physicalDirectionIssues(result)).toEqual([]);
 expect(direction.endScene).toBeNull();expect(completeSemanticEndpoint(result)).toBe(result);
});
it("preserves supplied endpoints and stable scenes",()=>{
 const existing={...direction,endScene:"The tablet now bears the seal."};expect(completeSemanticEndpoint(existing)).toBe(existing);
 const still={...direction,stateChange:false,motion:"A small hand gesture."};expect(completeSemanticEndpoint(still)).toBe(still);
});
it("preserves legacy plans and narration, and counts only the required extra images",()=>{
 const {params}=resolveParams("Check the source before sharing this claim.","auto");params.sceneDirections={1:direction};
 expect(completeUnstartedSemanticEndpoints(params).params).toBe(params);
 params.editorialPlan={version:"semantic-ideas-v1",beats:[]};params.concept={imageCount:1,videoSeconds:7};
 const repaired=completeUnstartedSemanticEndpoints(params);
 expect(repaired.scenes).toEqual([1]);expect(repaired.params.concept?.imageCount).toBe(2);
 expect(repaired.params.sceneNarrations).toEqual(params.sceneNarrations);expect(repaired.params.editorialPlan).toBe(params.editorialPlan);
 expect(completeUnstartedSemanticEndpoints(repaired.params).scenes).toEqual([]);
});
it("covers coin pouring without weakening the physical-action gate",()=>{
 const shot={...direction,motion:"Monster tips the coin sack, pours a large pile onto the model building's base, then places a measuring stick between this new pile and the smaller tower beside it, final hold showing the clear size difference."};
 expect(physicalDirectionIssues(shot)).toHaveLength(1);
 expect(physicalDirectionIssues(completeSemanticEndpoint(shot))).toEqual([]);
});
