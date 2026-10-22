// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryboardReview, type StoryboardView } from "../src/app/production/storyboard-review";

vi.mock("next/image", () => ({
 default: (props: Record<string, unknown>) => { const imageProps = { ...props }; delete imageProps.unoptimized; return createElement("img", imageProps); },
}));

type Props = ComponentProps<typeof StoryboardReview>;
type Comment = NonNullable<StoryboardView["panels"][number]["comment"]>;
const soldierRequest = "This case doesn't make sens with the sentence. You can show instead two soldiers in the same vibe of the main cartoon character being side by side on the field";
const comment = (status: Comment["status"], text = soldierRequest): Comment => ({
 text, status, actor: "test-user", at: "2026-10-15T12:55:38.993Z",
 message: status === "pending" ? "Comment saved. Apply the change to update this scene." :
  status === "applied" ? "Your change is applied." :
  status === "needs-character-sheet" ? "Create and approve the new characters’ sheets before updating this image." :
  "Updating this scene.",
});
function storyboard(): StoryboardView {
 return {
  target: "a".repeat(64), retrospective: false, status: "pending", note: null, rejectedScene: null,
  panels: [6, 7].map(scene => ({
   scene, narration: `Narration for scene ${scene}`, meaning: `Meaning ${scene}`, startScene: "A presenter in a room",
   endScene: null, motion: "A welcoming gesture", actionSeconds: 4,
   start: { url: `/scene-${scene}.png`, kind: "image", width: 720, height: 1280 }, end: null, existing: null,
   comment: scene === 6 ? comment("pending") : null,
  })),
 };
}
function deferred() {
 let resolve!: (value: unknown) => void;
 let reject!: (reason?: unknown) => void;
 const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
 return { promise, resolve, reject };
}

describe("storyboard scene feedback interactions", () => {
 let container: HTMLDivElement;
 let root: Root;
 let props: Props;
 beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  props = { sheet: storyboard(), active: true, disabled: false, conversationId: "conversation", onReview: vi.fn(async () => true), onFeedback: vi.fn(async () => true) };
 });
 afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
 const render = async () => { await act(async () => root.render(createElement(StoryboardReview, props))); };
 const scene = (number: number) => {
  const element = container.querySelector<HTMLLIElement>(`li[data-scene="${number}"]`);
  expect(element).not.toBeNull(); return element!;
 };
 const input = (number: number) => container.querySelector<HTMLTextAreaElement>(`#comment-${number}`)!;
 const button = (number: number, text = "Apply change") => {
  const element = [...scene(number).querySelectorAll("button")].find(item => item.textContent === text);
  expect(element).toBeDefined(); return element!;
 };
 const type = async (number: number, value: string) => {
  await act(async () => {
   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input(number), value);
   input(number).dispatchEvent(new Event("input", { bubbles: true }));
  });
 };
 const globalSection = () => container.querySelector<HTMLElement>('section[aria-label="Whole video feedback"]')!;
 const globalInput = () => container.querySelector<HTMLTextAreaElement>("#video-feedback")!;
 const globalButton = (text = "Apply storyboard feedback") => { const found = [...globalSection().querySelectorAll("button")].find(button => button.textContent === text); expect(found).toBeDefined(); return found!; };
 const typeGlobal = async (value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(globalInput(), value); globalInput().dispatchEvent(new Event("input", { bubbles: true })); }); };

 it("applies the latest text once, immediately loading only that scene and preventing double clicks", async () => {
  const request = deferred(); const feedback = vi.fn(() => request.promise); props.onFeedback = feedback;
  await render(); await type(6, `  ${soldierRequest}  `); await type(7, "Keep this unfinished note");
  expect(container.textContent).not.toContain("Save comment");
  const apply = button(6);
  await act(async () => { apply.click(); apply.click(); });
  expect(feedback.mock.calls).toEqual([["storyboard-apply", 6, soldierRequest]]);
  expect(scene(6).getAttribute("aria-busy")).toBe("true");
  expect(scene(6).querySelector("[class*='grayscale']")).not.toBeNull();
  expect(scene(6).querySelector("[class*='animate-spin']")).not.toBeNull();
  expect(scene(6).querySelector("[role='status']")?.textContent).toMatch(/updat|prepar|appl|working/i);
  expect(input(6).disabled).toBe(true);
  expect(scene(7).getAttribute("aria-busy")).not.toBe("true");
  expect(input(7).value).toBe("Keep this unfinished note");
  await act(async () => request.resolve(true));
  props = { ...props, sheet: { ...props.sheet, target: "b".repeat(64), panels: props.sheet.panels.map(p => p.scene === 6 ? { ...p, comment: comment("needs-character-sheet") } : p) } };
  await render();
  expect(scene(6).getAttribute("aria-busy")).not.toBe("true");
  expect(scene(6).textContent).toContain("Create and approve the new characters’ sheets");
  expect(scene(6).querySelector("[class*='animate-spin']")).toBeNull();
  expect(input(7).value).toBe("Keep this unfinished note");
 });

 it.each(["false", "exception"])("shows a scene-local error and preserves the note after a %s result", async failure => {
  const request = deferred(); props.onFeedback = vi.fn(() => request.promise);
  await render(); await type(6, "Use cooler lighting");
  await act(async () => button(6).click());
  await act(async () => { if (failure === "false") request.resolve(false); else request.reject(new Error("Connection lost")); });
  expect(scene(6).getAttribute("aria-busy")).not.toBe("true");
  expect(scene(6).querySelector("[role='alert']")?.textContent).toBeTruthy();
  expect(scene(6).querySelector("[class*='animate-spin']")).toBeNull();
  expect(input(6).value).toBe("Use cooler lighting");
  expect(button(6).disabled).toBe(false);
  expect(scene(7).querySelector("[role='alert']")).toBeNull();
 });

 it("keeps regeneration loading while the server is running, then exposes interruption beside that scene", async () => {
  props = { ...props, generationRunning: true, sheet: { ...props.sheet, panels: props.sheet.panels.map(p => p.scene === 6 ? { ...p, comment: comment("regenerating") } : p) } };
  await render();
  expect(scene(6).getAttribute("aria-busy")).toBe("true");
  expect(scene(7).getAttribute("aria-busy")).not.toBe("true");
  props = { ...props, generationRunning: false, productionError: "The scene update stopped. Please try again." };
  await render();
  expect(scene(6).getAttribute("aria-busy")).not.toBe("true");
  expect(scene(6).querySelector("[role='alert']")?.textContent).toMatch(/update stopped/i);
  expect(scene(6).querySelector("[class*='animate-spin']")).toBeNull();
  expect(scene(7).querySelector("[role='alert']")).toBeNull();
 });

 it("reveals the updated composition and preserves other drafts when review identity changes", async () => {
  const request = deferred(); props.onFeedback = vi.fn(() => request.promise);
  await render(); await type(6, 'Replace the title with "Together"'); await type(7, "Keep this draft");
  await act(async () => button(6).click());
  props = { ...props, sheet: { ...props.sheet, target: "c".repeat(64), panels: props.sheet.panels.map(p => p.scene === 6 ? { ...p, overlay: "Together", comment: comment("applied", 'Replace the title with "Together"') } : p) } };
  await act(async () => { root.render(createElement(StoryboardReview, props)); request.resolve(true); });
  expect(scene(6).getAttribute("aria-busy")).not.toBe("true");
  expect(scene(6).textContent).toContain("Together");
  expect(scene(6).textContent).toContain("Your change is applied.");
  expect(input(7).value).toBe("Keep this draft");
 });

 it("shows an image change price beside the selected scene and waits for explicit approval before regeneration", async () => {
  const request = deferred(); const approve = vi.fn(() => request.promise);
  props = { ...props, onApproveRevision: approve, revisionPrice: { scene: 6, additionalAmountCents: 100, totalAmountCents: 500, expired: false },
   sheet: { ...props.sheet, panels: props.sheet.panels.map(p => p.scene === 6 ? { ...p, comment: comment("revision-quoted", "Use cooler lighting") } : p) } };
  await render();
  expect(approve).not.toHaveBeenCalled();
  expect(scene(6).textContent).toContain("$1 USD additional");
  expect(scene(7).textContent).not.toContain("additional");
  await act(async () => button(6, "Approve price & update image").click());
  expect(approve).toHaveBeenCalledTimes(1);
  expect(props.onFeedback).not.toHaveBeenCalled();
  expect(scene(6).getAttribute("aria-busy")).toBe("true");
  props = { ...props, revisionPrice: null, generationRunning: true, sheet: { ...props.sheet, panels: props.sheet.panels.map(p => p.scene === 6 ? { ...p, comment: comment("regenerating", "Use cooler lighting") } : p) } };
  await act(async () => { root.render(createElement(StoryboardReview, props)); request.resolve(true); });
  expect(scene(6).getAttribute("aria-busy")).toBe("true");
  expect(scene(7).getAttribute("aria-busy")).not.toBe("true");
  props = { ...props, generationRunning: false, sheet: { ...props.sheet, target: "d".repeat(64), panels: props.sheet.panels.map(p => p.scene === 6 ? { ...p, start: { ...p.start!, url: "/scene-6-revised.png" }, comment: comment("applied", "Use cooler lighting") } : p) } };
  await render();
  expect(scene(6).getAttribute("aria-busy")).not.toBe("true");
  expect(scene(6).querySelector("img")?.getAttribute("src")).toBe("/scene-6-revised.png");
  expect(scene(7).querySelector("img")?.getAttribute("src")).toBe("/scene-7.png");
 });

 it("applies global feedback once with all scenes loading, independently of scene drafts", async () => {
  const request = deferred(); const applyGlobal = vi.fn(() => request.promise); props.onGlobalFeedback = applyGlobal;
  await render(); await type(6, "Keep this local change"); await type(7, "Keep this second local note"); await typeGlobal("  Make every floating symbol look like clay  ");
  const apply = globalButton(); await act(async () => { apply.click(); apply.click(); });
  expect(applyGlobal.mock.calls).toEqual([["storyboard-global-apply", "Make every floating symbol look like clay", undefined]]);
  expect(props.onFeedback).not.toHaveBeenCalled();
  expect(globalSection().getAttribute("aria-busy")).toBe("true");
  expect(globalSection().querySelector("[class*='animate-spin']")).not.toBeNull();
  for (const number of [6, 7]) { expect(scene(number).getAttribute("aria-busy")).toBe("true"); expect(scene(number).querySelector("[class*='grayscale']")).not.toBeNull(); }
  props = { ...props, sheet: { ...props.sheet, target: "e".repeat(64), globalComment: { ...comment("applied", "Make every floating symbol look like clay"), message: "All floating symbols now use clay styling.", scenes: [6, 7] } } };
  await act(async () => { root.render(createElement(StoryboardReview, props)); request.resolve(true); });
  expect(globalSection().getAttribute("aria-busy")).toBe("false");
  expect(globalSection().textContent).toContain("All floating symbols now use clay styling.");
  expect(globalButton("Changes applied").disabled).toBe(true);
  expect(input(6).value).toBe("Keep this local change"); expect(input(7).value).toBe("Keep this second local note");
 });

 it("preserves an unsent global draft while applying a scene-only change", async () => {
  props.onGlobalFeedback = vi.fn(async () => true);
  await render(); await typeGlobal("Keep this overall direction"); await type(6, "Use cooler lighting");
  await act(async () => button(6).click());
  expect(props.onFeedback).toHaveBeenCalledWith("storyboard-apply", 6, "Use cooler lighting");
  expect(props.onGlobalFeedback).not.toHaveBeenCalled();
  props = { ...props, sheet: { ...props.sheet, target: "f".repeat(64), panels: props.sheet.panels.map(p => p.scene === 6 ? { ...p, comment: comment("applied", "Use cooler lighting") } : p) } };
  await render(); expect(globalInput().value).toBe("Keep this overall direction");
 });

 it("keeps a failed global request and its error in the global form without claiming any change applied", async () => {
  const request = deferred(); props.onGlobalFeedback = vi.fn(() => request.promise);
  await render(); await typeGlobal("Give all scenes cooler lighting"); await type(7, "Do not lose this scene note");
  await act(async () => globalButton().click());
  await act(async () => request.resolve(false));
  expect(globalSection().getAttribute("aria-busy")).toBe("false");
  expect(globalSection().querySelector("[role='alert']")?.textContent).toContain("could not be applied");
  expect(globalSection().textContent).not.toContain("Changes applied");
  expect(globalInput().value).toBe("Give all scenes cooler lighting"); expect(input(7).value).toBe("Do not lose this scene note");
  for (const number of [6, 7]) { expect(scene(number).getAttribute("aria-busy")).toBe("false"); expect(scene(number).querySelector("[role='alert']")).toBeNull(); }
 });

 it("keeps the global quote in the global form and shows only affected scenes loading after approval", async () => {
  const request = deferred(); const approve = vi.fn(() => request.promise);
  props = { ...props, onGlobalFeedback: vi.fn(async () => true), onApproveRevision: approve,
   revisionPrice: { scope: "global", scene: null, scenes: [6], additionalAmountCents: 100, totalAmountCents: 500, expired: false },
   sheet: { ...props.sheet, globalComment: { ...comment("revision-quoted", "Use cooler lighting across the film"), scenes: [6] } } };
  await render();
  expect(globalSection().textContent).toMatch(/Update 1 scenes? · \$1 USD additional/);
  for (const number of [6, 7]) expect(scene(number).textContent).not.toContain("USD additional");
  expect(approve).not.toHaveBeenCalled();
  await act(async () => globalButton("Approve price & update images").click());
  expect(approve).toHaveBeenCalledTimes(1);
  props = { ...props, revisionPrice: null, generationRunning: true, sheet: { ...props.sheet, globalComment: { ...comment("regenerating", "Use cooler lighting across the film"), scenes: [6] } } };
  await act(async () => { root.render(createElement(StoryboardReview, props)); request.resolve(true); });
  expect(globalSection().getAttribute("aria-busy")).toBe("true"); expect(scene(6).getAttribute("aria-busy")).toBe("true"); expect(scene(7).getAttribute("aria-busy")).toBe("false");
  props = { ...props, generationRunning: false, productionError: "The update stopped." }; await render();
  expect(globalSection().getAttribute("aria-busy")).toBe("false"); expect(globalSection().querySelector("[role='alert']")?.textContent).toContain("update stopped");
 });

 it.each(["scene", "global"] as const)("cannot approve a stale %s quote after the matching feedback is edited", async scope => {
  const quotedText = "Use cooler lighting"; const approve = vi.fn(async () => true);
  props = { ...props, onGlobalFeedback: vi.fn(async () => true), onApproveRevision: approve,
   revisionPrice: { scope, scene: scope === "scene" ? 6 : null, scenes: [6, 7], additionalAmountCents: 100, totalAmountCents: 500, expired: false },
   sheet: { ...props.sheet, ...(scope === "global" ? { globalComment: { ...comment("revision-quoted", quotedText), scenes: [6, 7] } } : { panels: props.sheet.panels.map(p => p.scene === 6 ? { ...p, comment: comment("revision-quoted", quotedText) } : p) }) } };
  await render();
  const section = () => scope === "global" ? globalSection() : scene(6);
  const approvalButton = () => [...section().querySelectorAll("button")].find(button => button.textContent?.startsWith("Approve price"));
  expect(approvalButton()?.disabled).toBe(false);
  if (scope === "global") await typeGlobal("Use warm lighting instead"); else await type(6, "Use warm lighting instead");
  expect(approvalButton()).toBeUndefined();
  expect(section().textContent).toContain("Apply your edited feedback to refresh this price.");
  expect(section().textContent).not.toContain("USD additional");
  expect(approve).not.toHaveBeenCalled();
  if (scope === "global") await typeGlobal(`  ${quotedText}  `); else await type(6, `  ${quotedText}  `);
  expect(approvalButton()?.disabled).toBe(false);
  expect(section().textContent).toContain("$1 USD additional");
  expect(approve).not.toHaveBeenCalled();
 });

 it.each(["scene", "global"] as const)("keeps the %s update spinner mounted from queued through running until completion or failure", async scope => {
  props = { ...props, generationRunning: false, onGlobalFeedback: vi.fn(async () => true) };
  const updateStatus = (status: Comment["status"]) => {
   props = { ...props, sheet: { ...props.sheet,
    ...(scope === "global" ? { globalComment: { ...comment(status, "Use cooler lighting"), scenes: [6] } } : { panels: props.sheet.panels.map(p => p.scene === 6 ? { ...p, comment: comment(status, "Use cooler lighting") } : p) }) } };
  };
  const section = () => scope === "global" ? globalSection() : scene(6);
  const spinner = () => section().querySelector("[class*='animate-spin']");
  updateStatus("regenerating"); await render();
  const queuedSpinner = spinner();
  expect(queuedSpinner).not.toBeNull(); expect(section().getAttribute("aria-busy")).toBe("true"); expect(section().textContent).toContain("queued");
  expect(scene(6).getAttribute("aria-busy")).toBe("true"); expect(scene(7).getAttribute("aria-busy")).toBe("false");
  props = { ...props, generationRunning: true }; await render();
  expect(spinner()).toBe(queuedSpinner); expect(section().getAttribute("aria-busy")).toBe("true"); expect(section().textContent).toContain("Updating");
  props = { ...props, generationRunning: false }; await render();
  expect(spinner()).toBe(queuedSpinner); expect(section().getAttribute("aria-busy")).toBe("true"); expect(scene(6).getAttribute("aria-busy")).toBe("true");
  updateStatus("applied"); await render();
  expect(spinner()).toBeNull(); expect(section().getAttribute("aria-busy")).toBe("false"); expect(scene(6).getAttribute("aria-busy")).toBe("false");
  updateStatus("regenerating"); await render();
  expect(spinner()).not.toBeNull();
  props = { ...props, productionError: "Worker stopped before starting the update." }; await render();
  expect(spinner()).toBeNull(); expect(section().getAttribute("aria-busy")).toBe("false"); expect(scene(6).getAttribute("aria-busy")).toBe("false");
  expect(section().querySelector("[role='alert']")?.textContent).toMatch(/update stopped/i);
 });
 it("offers a shared storyboard field while preserving per-scene notes and shows only the named scene busy", async()=>{
  const request=deferred();props.onGlobalFeedback=vi.fn(()=>request.promise);
  await render();await type(7,"Keep this scene note");await typeGlobal("Scene 6: use a balance to illustrate the comparison");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Include scene 6"]')!.checked).toBe(true);
  expect(container.querySelector<HTMLInputElement>('[aria-label="Include scene 7"]')!.checked).toBe(false);
  await act(async()=>globalButton().click());
  expect(props.onGlobalFeedback).toHaveBeenCalledWith("storyboard-global-apply","Scene 6: use a balance to illustrate the comparison",undefined);
  expect(scene(6).getAttribute("aria-busy")).toBe("true");expect(scene(7).getAttribute("aria-busy")).toBe("false");
  await act(async()=>request.resolve(true));expect(input(7).value).toBe("Keep this scene note");
 });
 it("sends explicit selected scenes and invalidates a quote when the selection changes", async()=>{
  props={...props,onGlobalFeedback:vi.fn(async()=>true),onApproveRevision:vi.fn(async()=>true),revisionPrice:{scope:"global",scene:null,scenes:[6,7],additionalAmountCents:100,totalAmountCents:500,expired:false},sheet:{...props.sheet,globalComment:{...comment("revision-quoted","Use cooler lighting"),scenes:[6,7]}}};
  await render();await act(async()=>container.querySelector<HTMLInputElement>('[aria-label="Include scene 7"]')!.click());
  expect(globalSection().textContent).not.toContain("USD additional");
  expect(globalSection().textContent).toContain("refresh this price");
  await act(async()=>globalButton().click());
  expect(props.onGlobalFeedback).toHaveBeenCalledWith("storyboard-global-apply","Use cooler lighting",[6]);
  expect(props.onApproveRevision).not.toHaveBeenCalled();
 });

 it("shows the text-only composition without loading the rejected character image",async()=>{
  props.sheet.panels[0]={...props.sheet.panels[0],textOnly:true,overlay:"Read the source",visualMode:"presenter-text",graphicLayers:[]};
  await render();
  expect(scene(6).querySelector('img')).toBeNull();
  expect(scene(6).textContent).toContain("Read the source");
  expect(scene(6).querySelector('[aria-label="Animated narration text preview"]')).not.toBeNull();
  expect(scene(7).querySelector('img')).not.toBeNull();
 });

});
