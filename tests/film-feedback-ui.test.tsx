// @vitest-environment happy-dom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {FilmFeedback} from "../src/app/production/film-feedback";
it("captures the player time, keeps text after failure, and confirms only saved feedback",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.createElement("div"),root=createRoot(container),video=document.createElement("video");document.body.append(container);
 video.currentTime=18.2;video.pause=vi.fn();const onAction=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
 try{
 await act(async()=>root.render(createElement(FilmFeedback,{target:"a".repeat(64),comments:[],video:{current:video},disabled:false,onAction})));
 const button=(label:string)=>[...container.querySelectorAll("button")].find(b=>b.textContent?.startsWith(label))!;
 await act(async()=>button("At current time").click());expect(video.pause).toHaveBeenCalled();
 const input=container.querySelector("textarea")!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(input,"Slow the movement");input.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>button("Lock feedback").click());expect(input.value).toBe("Slow the movement");expect(container.querySelector('[role="alert"]')).not.toBeNull();
 await act(async()=>button("Lock feedback").click());
 expect(onAction.mock.calls[0][0]).toMatchObject({action:"film-comment",seconds:18.2,text:"Slow the movement"});
 expect(onAction.mock.calls[1][0].id).toBe(onAction.mock.calls[0][0].id);
 expect(container.querySelector('[role="status"]')?.textContent).toContain("Feedback locked");expect(input.value).toBe("");
 }finally{await act(async()=>root.unmount());container.remove();}
});
it("prices a saved correction through its own action and shows loading until it finishes",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.createElement("div"),root=createRoot(container);document.body.append(container);
 let finish!:()=>void;const onAction=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const target="a".repeat(64),id=crypto.randomUUID();
 try{
 await act(async()=>root.render(createElement(FilmFeedback,{target,comments:[{id,target,text:"Keep the same clay style",seconds:24.2,at:new Date().toISOString()}],video:{current:null},disabled:false,onAction})));
 const button=[...container.querySelectorAll("button")].find(b=>b.textContent==="Apply all changes")!;
 await act(async()=>button.click());expect(onAction).toHaveBeenCalledExactlyOnceWith({action:"film-apply-all",target,ids:[id]});
 expect(button.disabled).toBe(true);expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
 await act(async()=>finish());expect(container.textContent).toContain("Your feedback has been analyzed");
 }finally{await act(async()=>root.unmount());container.remove();}
});

it("applies two locked notes in one action and keeps them intact after a failure",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.createElement("div"),root=createRoot(container);document.body.append(container);
 const target="a".repeat(64),ids=[crypto.randomUUID(),crypto.randomUUID()];
 const comments=ids.map((id,i)=>({id,target,text:`Change scene ${i+1}`,seconds:i*5,at:new Date().toISOString(),stage:"unreviewed" as const}));
 const onAction=vi.fn().mockRejectedValue(new Error("Director unavailable; notes kept"));
 try{
 await act(async()=>root.render(createElement(FilmFeedback,{target,comments,video:{current:null},disabled:false,onAction})));
 const buttons=[...container.querySelectorAll("button")].filter(b=>b.textContent==="Apply all changes");expect(buttons).toHaveLength(1);
 expect(container.textContent).not.toContain("Apply changes");
 await act(async()=>buttons[0].click());expect(onAction).toHaveBeenCalledExactlyOnceWith({action:"film-apply-all",target,ids});
 expect(container.textContent).toContain("Change scene 1");expect(container.textContent).toContain("Change scene 2");expect(container.textContent).toContain("Director unavailable");
 }finally{await act(async()=>root.unmount());container.remove();}
});

it("requires an unfinished note to be locked and lets a saved note return to editing",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.createElement("div"),root=createRoot(container);document.body.append(container);
 const target="a".repeat(64),id=crypto.randomUUID(),onAction=vi.fn().mockResolvedValue({});
 const props={target,comments:[{id,target,text:"Change scene 1",seconds:4,at:new Date().toISOString(),stage:"unreviewed" as const}],video:{current:null},disabled:false,onAction};
 try{
 await act(async()=>root.render(createElement(FilmFeedback,props)));
 const button=(label:string)=>[...container.querySelectorAll("button")].find(b=>b.textContent===label)!;
 await act(async()=>button("Edit feedback").click());
 expect(onAction).not.toHaveBeenCalled();
 expect(container.querySelector("textarea")!.value).toBe("Change scene 1");expect(button("Apply all changes").disabled).toBe(true);
 await act(async()=>root.render(createElement(FilmFeedback,props)));
 await act(async()=>button("Lock feedback").click());
 expect(onAction.mock.calls[0][0]).toMatchObject({action:"film-comment",text:"Change scene 1",seconds:4,replaces:{id,hash:expect.stringMatching(/^[a-f0-9]{64}$/)}});
 expect(onAction.mock.calls.map(c=>c[0].action)).not.toContain("film-apply-all");
 }finally{await act(async()=>root.unmount());container.remove();}
});
