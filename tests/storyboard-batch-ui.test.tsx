// @vitest-environment happy-dom
import {act,createElement,type ComponentProps} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {StoryboardBatchReview} from "../src/app/production/storyboard-batch-review";
vi.mock("next/image",()=>({default:(props:Record<string,unknown>)=>{const p={...props};delete p.unoptimized;return createElement("img",p);}}));
type Props=ComponentProps<typeof StoryboardBatchReview>;
let container:HTMLDivElement,root:Root,props:Props;
const comment=(text:string,status:"locked"|"regenerating"|"failed"="locked")=>({text,status,actor:"human",at:new Date().toISOString(),message:"Feedback locked."});
beforeEach(()=>{
 (globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 container=document.createElement("div");document.body.append(container);root=createRoot(container);
 props={sheet:{target:"a".repeat(64),retrospective:false,status:"pending",note:null,rejectedScene:null,panels:[2,8].map(scene=>({scene,narration:`Scene ${scene}`,meaning:"Meaning",startScene:"Clay",endScene:null,motion:"Gesture",actionSeconds:4,start:null,end:null,existing:null}))},active:true,disabled:false,onAction:vi.fn(async()=>true),onApproveRevision:vi.fn(async()=>true),onReview:vi.fn(async()=>true)};
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const render=()=>act(async()=>root.render(createElement(StoryboardBatchReview,props)));
const field=(key:string)=>container.querySelector<HTMLTextAreaElement>(`#feedback-${key}`)!;
const button=(text:string,scene?:number)=>[...(scene?container.querySelector(`[data-scene="${scene}"]`)!:container).querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
const type=async(key:string,text:string)=>act(async()=>{const el=field(key);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(el,text);el.dispatchEvent(new Event("input",{bubbles:true}));});
it("locks each note without applying, preserves the neighboring draft through polling and launches one batch",async()=>{
 await render();await type("2","Cooler lighting");await type("8","Use a wide view");
 await act(async()=>button("Lock feedback",2).click());
 expect(props.onAction).toHaveBeenLastCalledWith({action:"storyboard-lock",target:props.sheet.target,scene:2,text:"Cooler lighting"});
 props.sheet={...props.sheet,panels:props.sheet.panels.map(p=>p.scene===2?{...p,comment:comment("Cooler lighting")}:p)};await render();
 expect(field("2").disabled).toBe(true);expect(field("8").value).toBe("Use a wide view");expect(button("Apply all feedback (1)").disabled).toBe(true);
 await act(async()=>button("Lock feedback",8).click());
 props.sheet={...props.sheet,panels:props.sheet.panels.map(p=>p.scene===8?{...p,comment:comment("Use a wide view")}:p)};await render();
 await act(async()=>button("Apply all feedback (2)").click());
 expect(props.onAction).toHaveBeenLastCalledWith({action:"storyboard-batch-apply",target:props.sheet.target});expect(props.onApproveRevision).not.toHaveBeenCalled();
});
it("keeps paused feedback visible and editable rather than hiding all forms",async()=>{
 props.productionError="Image update failed";props.sheet.panels[0].comment=comment("Do not lose scene 2","regenerating");
 await render();expect(field("2").value).toBe("Do not lose scene 2");expect(button("Edit feedback",2).disabled).toBe(false);
 await act(async()=>button("Edit feedback",2).click());expect(field("2").disabled).toBe(false);expect(field("8")).not.toBeNull();
});
it("hides a batch price while any locked instruction is being edited",async()=>{
 props.sheet.panels[0].comment=comment("Cooler lighting");props.revisionPrice={scope:"batch",additionalAmountCents:100,expired:false};await render();
 expect(button("Approve price & apply all changes")).toBeDefined();await act(async()=>button("Edit feedback",2).click());
 expect(button("Approve price & apply all changes")).toBeUndefined();expect(props.onApproveRevision).not.toHaveBeenCalled();
});
it("locks global scope independently of individual feedback",async()=>{
 await render();await type("2","Keep this draft");await type("global","Scene 8 needs a blue background");await act(async()=>button("Lock feedback").click());
 expect(props.onAction).toHaveBeenCalledWith({action:"storyboard-global-lock",target:props.sheet.target,text:"Scene 8 needs a blue background",scenes:[8]});expect(field("2").value).toBe("Keep this draft");
});

it("shows the applied text-only result and a clear next step instead of an empty disabled apply button",async()=>{
 const panel=props.sheet.panels[1];
 panel.textOnly=true;panel.overlay=panel.narration;
 panel.start={url:"/old-character.png",kind:"image",width:720,height:1280};
 panel.end={url:"/old-end.png",kind:"image",width:720,height:1280};
 panel.comment={text:"Here I want a text animation only, i don't need the protagonist",status:"applied",actor:"human",at:new Date().toISOString(),message:"Converting scene…"};
 await render();
 expect(container.querySelector('img[src="/old-character.png"]')).toBeNull();
 expect(container.querySelector('img[src="/old-end.png"]')).toBeNull();
 expect(container.querySelectorAll('[aria-label="Animated narration text preview"]')).toHaveLength(1);
 expect(button("Apply all feedback")).toBeUndefined();
 expect(container.textContent).toContain("All feedback has been applied");
 expect(button("Edit feedback",8).disabled).toBe(false);
 await act(async()=>container.querySelector<HTMLInputElement>('[aria-label="Approve storyboard"]')!.click());
 expect(button("Approve storyboard & see video price").disabled).toBe(false);
 expect(props.onAction).not.toHaveBeenCalled();expect(props.onReview).not.toHaveBeenCalled();
});

it('exposes the required review after correction pricing without reopening initial storyboard editing',async()=>{
 props.active=false;props.reviewActive=true;props.quoteBeforeAnimation=false;
 await render();expect(container.textContent).toContain('Planned movement: Gesture');
 expect(button('Lock feedback',2)).toBeUndefined();
 expect(button('Approve changes & update film').disabled).toBe(true);
 await act(async()=>container.querySelector<HTMLInputElement>('[aria-label="Approve storyboard"]')!.click());
 expect(button('Approve changes & update film').disabled).toBe(false);
 await act(async()=>button('Approve changes & update film').click());expect(props.onReview).toHaveBeenCalledOnce();
 props.sheet={...props.sheet,target:'b'.repeat(64)};await render();
 expect(button('Approve changes & update film').disabled).toBe(true);
 expect(props.onAction).not.toHaveBeenCalled();
});
