import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { validateStoryboardAction, requireApprovedStoryboardPanel, StoryboardSheetSchema } from "../src/lib/concept/storyboard-review";
import { flowReviewTarget } from "../src/lib/concept/production-flow";

it("requires a separate explicit storyboard confirmation, not a budget or per-image approval",()=>{
 const target="a".repeat(64);
 expect(()=>validateStoryboardAction(target,target,"approved")).toThrow(/complete storyboard/);
 expect(()=>validateStoryboardAction(target,target,"approved",false)).toThrow(/complete storyboard/);
 expect(()=>validateStoryboardAction(target,"b".repeat(64),"approved",true)).toThrow(/changed/);
 expect(()=>validateStoryboardAction(target,target,"approved",true)).not.toThrow();
 expect(()=>validateStoryboardAction(target,target,"rejected",false,"")).toThrow(/Describe/);
 expect(()=>validateStoryboardAction(target,target,"rejected",false,"Scene 3 has no relation to the narration.")).not.toThrow();
});
it("invalidates whole-story approval when a picture, order, meaning or narration changes",()=>{
 const job=randomUUID();
 const panels=[{scene:1,narration:"Check the source",meaning:"Restore the full quotation",start:"a",end:"b"},{scene:2,narration:"Read the passage",meaning:"Read beyond the fragment",start:"c",end:"d"}];
 const target=(value:unknown)=>flowReviewTarget("simulation",job,"storyboard",value),original=target(panels);
 for(const changed of [[...panels].reverse(),[{...panels[0],start:"new image"},panels[1]],[{...panels[0],meaning:"Unrelated reveal"},panels[1]],[{...panels[0],narration:"Another sentence"},panels[1]]])expect(target(changed)).not.toBe(original);
});
it("blocks repair scripts from borrowing an approval for different images or retrospectively approved footage",()=>{
 const media={id:randomUUID(),kind:"image" as const,sha256:"a".repeat(64),width:1080,height:1920};
 const sheet=StoryboardSheetSchema.parse({version:1,target:"b".repeat(64),panels:[{scene:1,narration:"Context changes meaning",meaning:"The complete message corrects the cropped reading",startScene:"Partial message",endScene:null,motion:"Reveal the complete message",actionSeconds:5,start:media}]});
 const decision={target:sheet.target,decision:"approved" as const,actor:"qa-human-fixture",at:new Date().toISOString(),note:"Reviewed complete storyboard"};
 const expected={scene:1,startSha256:media.sha256,motion:sheet.panels[0].motion};
 expect(()=>requireApprovedStoryboardPanel(sheet,decision,expected)).not.toThrow();
 expect(()=>requireApprovedStoryboardPanel(sheet,decision,{...expected,startSha256:"c".repeat(64)})).toThrow(/exact scene images/);
 expect(()=>requireApprovedStoryboardPanel(sheet,decision,{...expected,motion:"Another action"})).toThrow();
 expect(()=>requireApprovedStoryboardPanel(sheet,decision,{...expected,visualMode:"presenter-text",overlay:"Context changes meaning"})).toThrow();
 expect(()=>requireApprovedStoryboardPanel({...sheet,retrospective:true},decision,expected)).toThrow();
 expect(()=>requireApprovedStoryboardPanel(sheet,{...decision,decision:"rejected"},expected)).toThrow();
});
