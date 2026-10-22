// @vitest-environment happy-dom
import { act, createElement, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Production from "../src/app/production/[id]/page";
import type { StoryboardView } from "../src/app/production/storyboard-review";

const mocked = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/lib/client-http", () => ({ api: mocked.api, jsonBody: (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => { const imageProps = { ...props }; delete imageProps.unoptimized; return createElement("img", imageProps); } }));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => createElement("a", props) }));
vi.mock("../src/app/format-downloads", () => ({ FormatDownloads: () => null }));

type Comment = NonNullable<StoryboardView["panels"][number]["comment"]>;
type Action = { action: string; scene?: number; target?: string; text?: string; quote?: string; customerQuote?: string };
const soldierRequest = "You can show instead two soldiers in the same vibe of the main cartoon character being side by side on the field";
const comment = (status: Comment["status"], text: string): Comment => ({ status, text, actor: "test-user", at: "2026-10-15T12:55:38.993Z", message: status === "needs-character-sheet" ? "Create and approve the soldiers’ character sheets before updating this image." : status === "applied" ? "Your change is applied." : "A new image is needed for this change." });
function fixture() {
 const sheet: StoryboardView = { target: "a".repeat(64), retrospective: false, status: "pending", note: null, rejectedScene: null, panels: [6, 7].map(scene => ({ scene, narration: `Narration ${scene}`, meaning: `Meaning ${scene}`, startScene: "A presenter in a room", endScene: null, motion: "Welcome", actionSeconds: 4, start: { url: `/scene-${scene}.png`, kind: "image", width: 720, height: 1280 }, end: null, existing: null, comment: null })) };
 return {
  id: "test-production", script: "The script", title: "Test video", conversationId: "test-conversation", format: "9:16", scenes: sheet.panels.map(p => ({ index: p.scene, narration: p.narration })),
  storyboard: sheet, storyboardFirst: true, needsProductionBudget: false, availableForQuoteCents: 10000, wallet: { available: 10000, reserved: 400, balance: 10400 }, savedToLibrary: false,
  budgetBlocked: false, isAdmin: false, customerQuote: { id: "old-client-quote", amountCents: 400, expiresAt: Date.now() + 3600000 },
  quote: { id: "old-quote", scope: "storyboard", expiresAt: Date.now() + 3600000 }, approved: true, renewing: false, finished: false, busy: false, error: null as string | null,
  status: "awaiting-review", phase: "storyboard", costsPending: 0, requests: [], outputUrl: null,
  progress: { running: false, title: "Your storyboard", message: "Review your images.", canResume: false, canReplace: false },
  review: { stage: "storyboard", scene: null, target: sheet.target, media: null, audio: null },
  revisionQuote: null as { scene: number | null; scope?: "scene" | "global" | "batch"; scenes?: number[]; alreadyReservedCents: number; additionalAmountCents: number } | null,
 };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

describe("production page scene feedback integration", () => {
 let root: Root, container: HTMLDivElement, view: ReturnType<typeof fixture>, actions: Action[], post: (action: Action) => Promise<unknown>;
 beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  view = fixture(); actions = []; post = async () => ({ ok: true });
  mocked.api.mockReset().mockImplementation(async (url: string, options?: RequestInit) => {
   expect(url).toBe("/api/jobs/test-production/live");
   if (options?.method === "POST") { const action = JSON.parse(String(options.body)) as Action; actions.push(action); return post(action); }
   return structuredClone(view);
  });
 });
 afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
 const render = async () => { const params = Promise.resolve({ id: "test-production" }); await act(async () => root.render(createElement(Suspense, { fallback: "Loading" }, createElement(Production, { params })))); };
 const scene = (number: number) => container.querySelector<HTMLLIElement>(`li[data-scene="${number}"]`)!;
 const input = (number: number) => container.querySelector<HTMLTextAreaElement>(`#feedback-${number}`)!;
 const button = (number: number, title = "Lock feedback") => {
  const found = [...scene(number).querySelectorAll("button")].find(item => item.textContent === title); expect(found).toBeDefined(); return found!;
 };
 const type = async (number: number, value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input(number), value); input(number).dispatchEvent(new Event("input", { bubbles: true })); }); };
 const globalSection = () => container.querySelector<HTMLElement>('[aria-label="Whole video feedback"]')!;
 const globalInput = () => container.querySelector<HTMLTextAreaElement>("#feedback-global")!;
 const globalButton = (text = "Lock feedback") => { const found = [...globalSection().querySelectorAll("button")].find(button => button.textContent === text); expect(found).toBeDefined(); return found!; };
 const typeGlobal = async (value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(globalInput(), value); globalInput().dispatchEvent(new Event("input", { bubbles: true })); }); };
 const setScene = (status: Comment["status"], text: string, target = "b".repeat(64)) => {
  view.storyboard.target = target; view.review.target = target; view.storyboard.panels[0].comment = comment(status, text);
 };

 it("shows the saved semantic plan's revised image price without auto-authorizing generation",async()=>{
  Object.assign(view,{approved:false,storyboard:null,review:null,phase:"quote",status:"estimated",progress:{running:false,title:"Storyboard preparation",message:"Review the price",canResume:false,canReplace:false}});
  await render();
  expect(container.textContent).toContain("Storyboard preparation price");
  expect(actions).toEqual([]);
  const approve=[...container.querySelectorAll("button")].find(b=>b.textContent==="Approve price & prepare storyboard")!;
  expect(approve).toBeDefined();
  await act(async()=>approve.click());
  expect(actions).toEqual([{action:"approve",quote:"old-quote",customerQuote:"old-client-quote"}]);
 });

 it("shows replacement pricing immediately despite the existing production failure",async()=>{
  view.error="The original request failed.";view.status="pending";
  view.progress={running:false,title:"Scene 6 could not be completed",message:"Your completed scenes are saved.",canResume:false,canReplace:true};
  Object.assign(view,{review:null,recovery:{target:"c".repeat(64),scene:6,additionalUsd:null}});
  const request=deferred<unknown>();post=()=>request.promise;
  await render();
  const replacement=[...container.querySelectorAll("button")].find(b=>b.textContent==="Review replacement price")!;
  await act(async()=>replacement.click());
  expect(container.textContent).toContain("Preparing the replacement price");
  expect(replacement.textContent).toBe("Checking replacement price…");expect(replacement.disabled).toBe(true);
  view.renewing=true;view.quote.scope="production";view.quote.id="new-quote";
  await act(async()=>request.resolve({ok:true}));
  expect(container.textContent).toContain("Updated video quote");
  expect(container.textContent).not.toContain("Checking replacement price");
  expect(actions).toHaveLength(1);
 });
 it("shows a pricing failure locally instead of hiding it behind the old production error",async()=>{
  view.error="The original request failed.";view.status="pending";
  view.progress={running:false,title:"Scene 6 could not be completed",message:"Your completed scenes are saved.",canResume:false,canReplace:true};
  Object.assign(view,{review:null,recovery:{target:"c".repeat(64),scene:6,additionalUsd:null}});
  post=async()=>{throw new Error("raw provider failure");};
  await render();const replacement=[...container.querySelectorAll("button")].find(b=>b.textContent==="Review replacement price")!;
  await act(async()=>replacement.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("The replacement price could not be prepared");
  expect(container.textContent).not.toContain("raw provider failure");
  expect(replacement.disabled).toBe(false);
 });

 it("offers only a free replacement quote for the failed scene",async()=>{
  view.error="The original request failed.";view.status="pending";view.phase="scene-6-draft";
  view.progress={running:false,title:"Scene 6 could not be completed",message:"Your completed scenes are saved.",canResume:false,canReplace:true};
  Object.assign(view,{review:null,recovery:{target:"c".repeat(64),scene:6,additionalUsd:null}});
  await render();
  expect(container.textContent).not.toContain("Continue my video");
  const replace=[...container.querySelectorAll("button")].find(b=>b.textContent==="Review replacement price")!;
  expect(replace.disabled).toBe(false);
  await act(async()=>replace.click());
  expect(actions).toEqual([{action:"recovery-quote",target:"c".repeat(64)}]);
 });

 it("saves one exact note without generating or quoting", async () => {
  post = async action => { setScene("needs-character-sheet", action.text!); return { ok: true }; };
  await render(); await type(6, `  ${soldierRequest}  `); await type(7, "Keep this unsent note");
  await act(async () => button(6).click());
  expect(actions).toEqual([{ action: "storyboard-lock", scene: 6, target: "a".repeat(64), text: soldierRequest }]);
  expect(scene(6).textContent).toContain("Create and approve the soldiers’ character sheets");
  expect(scene(6).getAttribute("aria-busy")).toBe("false");
  expect(input(7).value).toBe("Keep this unsent note");
 });

 it.each(["Use cooler lighting",soldierRequest])("locks first, prices the batch only on demand, and waits for approval: %s", async change => {
  post=async action=>{
   if(action.action==="storyboard-lock")setScene("locked",action.text!);
   if(action.action==="storyboard-batch-apply"){
    setScene("revision-quoted",change);view.renewing=true;
    view.quote={id:"revision-quote",scope:"storyboard",expiresAt:Date.now()+3600000};
    view.customerQuote={id:"revision-client-quote",amountCents:500,expiresAt:Date.now()+3600000};
    view.revisionQuote={scope:"batch",scene:null,scenes:[6],alreadyReservedCents:400,additionalAmountCents:100};
   }
   if(action.action==="approve"){setScene("regenerating",change);view.renewing=false;view.busy=true;view.revisionQuote=null;}
   return {ok:true};
  };
  const batch=(label:string)=>[...container.querySelectorAll('button')].find(b=>b.textContent===label)!;
  await render();await type(6,change);await type(7,"Keep this draft");await act(async()=>button(6).click());
  expect(actions).toEqual([{action:"storyboard-lock",target:"a".repeat(64),scene:6,text:change}]);
  expect(input(7).value).toBe("Keep this draft");expect(batch("Apply all feedback (1)").disabled).toBe(true);
  await type(7,"");await act(async()=>batch("Apply all feedback (1)").click());
  expect(actions[1]).toEqual({action:"storyboard-batch-apply",target:"b".repeat(64)});
  expect(container.textContent).toContain("$1 USD additional");expect(scene(6).textContent).not.toContain("USD additional");
  await act(async()=>batch("Approve price & apply all changes").click());
  expect(actions[2]).toEqual({action:"approve",quote:"revision-quote",customerQuote:"revision-client-quote"});
  expect(scene(6).getAttribute("aria-busy")).toBe("true");expect(scene(7).getAttribute("aria-busy")).toBe("false");
 });

 it("ignores a stale polling response and skips new polls while applying a scene", async () => {
  vi.useFakeTimers(); const stale = deferred<ReturnType<typeof fixture>>(); const applying = deferred<unknown>(); let gets = 0;
  mocked.api.mockImplementation(async (url: string, options?: RequestInit) => {
   expect(url).toBe("/api/jobs/test-production/live");
   if (options?.method === "POST") { actions.push(JSON.parse(String(options.body))); return applying.promise; }
   gets++; return gets === 2 ? stale.promise : structuredClone(view);
  });
  await render(); await type(6, soldierRequest);
  await act(async () => { vi.advanceTimersByTime(3000); });
  expect(gets).toBe(2);
  await act(async () => button(6).click());
  await act(async () => { vi.advanceTimersByTime(6000); });
  expect(gets).toBe(2);
  setScene("needs-character-sheet", soldierRequest);
  await act(async () => applying.resolve({ ok: true }));
  expect(gets).toBe(3); expect(scene(6).textContent).toContain("soldiers’ character sheets");
  await act(async () => stale.resolve(fixture()));
  expect(scene(6).textContent).toContain("soldiers’ character sheets");
  expect(actions).toHaveLength(1);
 });

 it("reports a failed request inside its scene, keeps both drafts and enables another attempt", async () => {
  post = async () => { throw new Error("Internal provider failure"); };
  await render(); await type(6, "Use cooler lighting"); await type(7, "Keep my other note");
  await act(async () => button(6).click());
  expect(scene(6).querySelector("[role='alert']")?.textContent).toContain("feedback and previous image are kept");
  expect(scene(6).textContent).not.toContain("Internal provider failure");
  expect(scene(6).getAttribute("aria-busy")).toBe("false"); expect(button(6).disabled).toBe(false);
  expect(input(6).value).toBe("Use cooler lighting"); expect(input(7).value).toBe("Keep my other note");
  expect(actions).toHaveLength(1);
 });

 it("saves global feedback independently without overwriting scene drafts", async () => {
  post = async action => {
   view.storyboard.target = "c".repeat(64); view.review.target = view.storyboard.target;
   view.storyboard.globalComment = { ...comment("applied", action.text!), message: "The whole video now uses clay symbols.", scenes: [6, 7] };
   return { ok: true };
  };
  await render(); await type(6, "Keep this scene-specific camera change"); await typeGlobal("  Make every floating symbol look like clay  ");
  await act(async () => globalButton().click());
  expect(actions).toEqual([{ action: "storyboard-global-lock", target: "a".repeat(64), text: "Make every floating symbol look like clay", scenes:[6,7] }]);
  expect(globalSection().textContent).toContain("The whole video now uses clay symbols.");
  expect(input(6).value).toBe("Keep this scene-specific camera change");
  expect(view.storyboard.panels.every(panel => !panel.comment)).toBe(true);
 });

 it("quotes locked global feedback as one batch without overwriting individual drafts",async()=>{
  const text="Use cooler lighting across all scenes";
  post=async action=>{
   if(action.action==="storyboard-global-lock")view.storyboard.globalComment={...comment("locked",action.text!),scenes:[6,7]};
   if(action.action==="storyboard-batch-apply"){
    view.storyboard.globalComment={...comment("revision-quoted",text),scenes:[6,7]};view.renewing=true;
    view.quote={id:"global-quote",scope:"storyboard",expiresAt:Date.now()+3600000};
    view.customerQuote={id:"global-client-quote",amountCents:600,expiresAt:Date.now()+3600000};
    view.revisionQuote={scope:"batch",scene:null,scenes:[6,7],alreadyReservedCents:400,additionalAmountCents:200};
   }
   if(action.action==="approve"){view.storyboard.globalComment={...comment("regenerating",text),scenes:[6,7]};view.revisionQuote=null;view.renewing=false;view.busy=true;}
   return {ok:true};
  };
  const batch=(label:string)=>[...container.querySelectorAll('button')].find(b=>b.textContent===label)!;
  await render();await type(7,"Keep this draft");await typeGlobal(text);await act(async()=>globalButton().click());
  expect(actions).toEqual([{action:"storyboard-global-lock",target:"a".repeat(64),text,scenes:[6,7]}]);expect(input(7).value).toBe("Keep this draft");
  await type(7,"");await act(async()=>batch("Apply all feedback (1)").click());
  expect(container.textContent).toContain("$2 USD additional");for(const n of [6,7])expect(scene(n).textContent).not.toContain("USD additional");
  await act(async()=>batch("Approve price & apply all changes").click());expect(actions[2]).toEqual({action:"approve",quote:"global-quote",customerQuote:"global-client-quote"});
  for(const n of [6,7])expect(scene(n).getAttribute("aria-busy")).toBe("true");
 });

 it("keeps an unsuccessful global request editable with a global error and no false applied status", async () => {
  post = async () => { throw new Error("Internal global update error"); };
  await render(); await typeGlobal("Make every scene cooler"); await type(6, "Preserve this local note");
  await act(async () => globalButton().click());
  expect(globalSection().querySelector("[role='alert']")?.textContent).toContain("feedback and previous image are kept");
  expect(globalSection().textContent).not.toContain("Changes applied"); expect(globalInput().value).toBe("Make every scene cooler");
  expect(input(6).value).toBe("Preserve this local note"); expect(globalButton().disabled).toBe(false);
  for (const number of [6, 7]) expect(scene(number).querySelector("[role='alert']")).toBeNull();
  expect(actions).toHaveLength(1);
 });
 it("collapses the approved storyboard and focuses the quote, keeping a return path", async () => {
  post=async action=>{
   if(action.action==="review") {view.storyboard.status="approved";view.needsProductionBudget=true;}
   if(action.action==="quote")view.quote={...view.quote,scope:"production"};
   return {ok:true};
  };
  await render();
  const board=container.querySelector<HTMLDetailsElement>('details[aria-label="Your storyboard"]')!;
  expect(board.open).toBe(true);
  await act(async()=>container.querySelector<HTMLInputElement>('[aria-label="Approve storyboard"]')!.click());
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Approve storyboard & see video price')!.click());
  expect(board.open).toBe(false);
  const current=container.querySelector('[aria-label="Current production step"]')!;
  expect(document.activeElement).toBe(current);
  expect(current.textContent).toContain("Your video quote");
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Return to storyboard')!.click());
  expect(board.open).toBe(true);
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Return to current step')!.click());
  expect(board.open).toBe(false);expect(document.activeElement).toBe(current);
 });

 it("brings a newly ready complete preview into view once, without stealing focus on subsequent polls", async()=>{
  vi.useFakeTimers();view.storyboard.status="approved";view.review.stage="draft";
  const scroll=vi.fn();HTMLElement.prototype.scrollIntoView=scroll;
  await render();scroll.mockClear();
  view.review.stage="draft-film";view.review.target="d".repeat(64);
  await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Current production step');
  expect(container.textContent).toContain('Approve visuals & continue');
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Return to storyboard')!.click());
  scroll.mockClear();
  await act(async()=>{await vi.advanceTimersByTimeAsync(6000);});
  expect(scroll).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLDetailsElement>('details[aria-label="Your storyboard"]')!.open).toBe(true);
 });

 it("does not close the storyboard when approval fails",async()=>{
  post=async()=>{throw new Error('Approval failed');};await render();
  await act(async()=>container.querySelector<HTMLInputElement>('[aria-label="Approve storyboard"]')!.click());
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Approve storyboard & see video price')!.click());
  expect(container.querySelector<HTMLDetailsElement>('details[aria-label="Your storyboard"]')!.open).toBe(true);
  expect(actions).toHaveLength(1);
 });

 it("offers explicit continuation for an old single-scene draft without approving it or auto-resuming",async()=>{
  vi.useFakeTimers();Object.assign(view,{needsPreviewContinuation:true});view.storyboard.status="approved";view.review.stage="draft";
  await render();await act(async()=>{await vi.advanceTimersByTimeAsync(12000);});
  expect(actions).toHaveLength(0);
  expect(container.textContent).not.toContain('Approve draft & finish');
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Prepare the complete preview')!.click());
  expect(actions).toEqual([{action:'resume'}]);
 });

 it("presents a distinct finishing review without a premature download",async()=>{
  view.storyboard.status="approved";view.phase="finishing-film";view.review.stage="finishing-film";
  Object.assign(view,{finishing:{settings:{musicLevel:"normal",captions:true,captionSize:"normal",pace:"natural",ending:"cream",captionCorrections:[]},pending:false},filmComments:[]});
  await render();
  expect(container.querySelector('[aria-label="Your video journey"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Finishing settings"]')).not.toBeNull();
  expect(container.querySelector('a[download]')).toBeNull();
  const approve=[...container.querySelectorAll('button')].find(b=>b.textContent==='Approve final film & unlock download')!;
  expect(approve.disabled).toBe(true);
  expect(container.textContent).toContain('I watched this final version and approve its sound, editing and subtitles.');
  await act(async()=>container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(approve.disabled).toBe(false);
  await act(async()=>approve.click());
  expect(actions).toEqual([{action:"review",target:view.review.target,decision:"approved"}]);
 });

 it("requires applying changed finishing settings and sending typed feedback before final approval",async()=>{
  view.storyboard.status="approved";view.phase="finishing-film";view.review.stage="finishing-film";
  Object.assign(view,{finishing:{settings:{musicLevel:"normal",captions:true,captionSize:"normal",pace:"natural",ending:"cream",captionCorrections:[]},pending:false},filmComments:[]});
  await render();
  const approve=[...container.querySelectorAll('button')].find(b=>b.textContent==='Approve final film & unlock download')!;
  await act(async()=>container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(approve.disabled).toBe(false);
  const music=container.querySelector<HTMLSelectElement>('[aria-label="Finishing settings"] select')!;
  await act(async()=>{music.value='quiet';music.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(approve.disabled).toBe(true);
  expect(container.textContent).toContain('Apply your finishing settings');
  await act(async()=>{music.value='normal';music.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(approve.disabled).toBe(false);
  const feedback=container.querySelector<HTMLTextAreaElement>('[aria-label="Your video feedback"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(feedback,'Lower the music');feedback.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(approve.disabled).toBe(true);
  expect(container.textContent).toContain('Send or clear your feedback');
  expect(actions).toEqual([]);
 });

});
