import { expect, it } from "vitest";
import { paceRecording, AUDIO_RATE, rms, db } from "../src/lib/concept/editorial-audio";
import { planConcept } from "../src/lib/concept/storyboard";
import { getRecipe } from "../src/lib/recipes";
import { physicalDirectionIssues } from "../src/lib/concept/physical-direction";
import { generationPlan, materializeRequest } from "../src/lib/concept/generation-plan";
import { placeholderTiming } from "../src/lib/concept/timing";
import type { ProductionParams } from "../src/lib/brain";
import { sceneRepairPlan, applyReviewedSceneRepairs } from "../src/lib/concept/scene-repair";
import { sha256 } from "../src/lib/concept/checkpoints";
import type { RenderPacket } from "../src/lib/concept/production-flow";
import { fitSceneEdit } from "../src/lib/concept/imported-media";

const recipe = getRecipe("cam-clay")!;
it("rejects a transformation hidden by the logo even if it fits the complete video duration", () => {
  const excerpt = { mediaStart: 0, mediaEnd: 5, playbackRate: 1, crop: 1 };
  expect(fitSceneEdit(5, 6, true, excerpt).end).toBe(5);
  expect(() => fitSceneEdit(5, 3.4, true, excerpt)).toThrow(/before the next scene or logo/);
  expect(fitSceneEdit(5, 3.4, true).edit.playbackRate).toBeCloseTo(5 / 3.4);
  expect(() => fitSceneEdit(5, 2, true)).toThrow(/full transformation/);
});
it("blocks backwards/underspecified state changes before a request is materialized", () => {
  const board = planConcept("Read the full passage.", recipe, "9:16", { 1: {
    scene: "A fully unrolled scroll extends to the floor.", motion: "The narrator unrolls the scroll.", references: ["narrator"],
    endScene: null, overlay: null, strike: false, stateChange: true, actionSeconds: 3,
  } });
  expect(physicalDirectionIssues(board.shots[0])).toHaveLength(3);
  const plan = generationPlan("Read the full passage.", { aspectRatio: "9:16" } as ProductionParams, board, placeholderTiming(["Read the full passage."]), [{ id: "narrator", url: "https://example.com/ref.png", sha256: "a".repeat(64) , characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-14"}}]);
  const op = plan.operations.find((o) => o.kind === "video")!;
  expect(() => materializeRequest(op, { "output:scene-1-start": "https://example.com/start.png" })).toThrow(/physical action/);
  expect(board.shots[0].imagePrompt).not.toMatch(/monster|effigy/i);
});

it("keeps action duration independent of a short phrase and requires both images", () => {
  const board = planConcept("Read it.", recipe, "9:16", { 1: {
    scene: "Closed scroll on a table.", endScene: "Open strip on the table; thin roll at the far end.",
    motion: "The left hand pins the free edge. The right rolls the cylinder away as its diameter shrinks.",
    references: ["narrator"], overlay: null, strike: false, stateChange: true, actionSeconds: 5,
  } });
  const p = generationPlan("Read it.", { aspectRatio: "9:16" } as ProductionParams, board, placeholderTiming(["Read it."]), [{ id: "narrator", url: "https://example.com/ref.png", sha256: "a".repeat(64) , characterSheet:{status:"approved",sha256:"a".repeat(64),approvedAt:"2026-10-14"}}]);
  const clip = p.operations.find((o) => o.kind === "video")!;
  expect(clip.input.duration).toBe("5");
  expect(() => materializeRequest(clip, { "output:scene-1-start": "https://example.com/start.png" })).toThrow(/Unresolved/);
  const request = materializeRequest(clip, { "output:scene-1-start": "https://example.com/start.png", "output:scene-1-end": "https://example.com/end.png" });
  expect(request).toHaveProperty("end_image_url", "https://example.com/end.png");
});

const board = planConcept("First sentence. Last sentence.", recipe, "9:16");
const timing = { duration: 3, estimated: false, phrases: [{ phrase: 1, text: "First sentence.", start: .1, end: 1.2 }, { phrase: 2, text: "Last sentence.", start: 1.5, end: 2.7 }],
  words: [{ word: "First", start: .1, end: .6 }, { word: "sentence.", start: .6, end: 1.2 }, { word: "Last", start: 1.5, end: 2 }, { word: "sentence.", start: 2, end: 2.7 }] };
function recording() {
  return Float32Array.from({ length: AUDIO_RATE * 3 }, (_, i) => timing.words.some((w) => i / AUDIO_RATE >= w.start && i / AUDIO_RATE < w.end) ? .1 * Math.sin(i * 2 * Math.PI * 220 / AUDIO_RATE) : .00005 * Math.sin(i * .01));
}
it("inserts only missing breathing time, keeps spoken samples and shifts every timestamp exactly", () => {
  const source = recording(), original = source.slice();
  const result = paceRecording(source, timing, board, { breaths: { 2: .7 } });
  expect(source).toEqual(original);
  expect(result.timing.duration).toBeCloseTo(3.6);
  expect(result.timing.words[2].start).toBeCloseTo(2.1);
  expect(result.timing.words[0].start).toBeCloseTo(.3);
  expect(result.cuts[1].levelDb).toBeLessThan(-42);
  const sample = Math.round(.3 * AUDIO_RATE), shifted = Math.round(.5 * AUDIO_RATE);
  expect(result.pcm[shifted]).toBe(source[sample]);
  expect(db(rms(result.pcm, result.pcm.length - .01 * AUDIO_RATE))).toBeLessThan(-70);
});
it("preserves connected speech when an optional breath has no safe splice", () => {
  const source = new Float32Array(3 * AUDIO_RATE).fill(.1);
  const result = paceRecording(source, timing, board, {attack: 0});
  expect(result.cuts).toEqual([]);
  expect(result.preservedGaps.map(g=>g.phrase)).toEqual([2]);
  expect(result.timing.words).toEqual(timing.words);
  expect(result.pcm.slice(0, Math.floor(2.7 * AUDIO_RATE))).toEqual(source.slice(0, Math.floor(2.7 * AUDIO_RATE)));
  expect(() => paceRecording(source, timing, board, {minimumSceneSeconds:{1:4}})).toThrow(/required action hold/);
});
it.each([3, 2.98])("pads an already quiet recording boundary at %s instead of fading the last aligned word", (end) => {
  const noTail = { ...timing, words: timing.words.map((w, i) => i === 3 ? { ...w, end } : w) };
  const source=recording(),original=source.slice();
  const result=paceRecording(source,noTail,board,{attack:0,breaths:{2:.25}});
  expect(result.tailPaddingSeconds).toBe(.2);
  expect(result.pcm.slice(0,source.length)).toEqual(original);
  expect(result.timing.words).toEqual(noTail.words);
  expect(result.pcm.slice(source.length).every(n=>n===0)).toBe(true);
  expect(source).toEqual(original);
  expect(()=>paceRecording(new Float32Array(3*AUDIO_RATE).fill(.1),noTail,board)).toThrow(/no tail/);
  const invalid={...noTail,words:noTail.words.map((w,i)=>i===3?{...w,end:3.1}:w)};
  expect(()=>paceRecording(source,invalid,board)).toThrow(/beyond the recording/);
});

it("makes room for a complete physical action by extending a safe gap, preserving spoken samples", () => {
  const source = recording();
  const result = paceRecording(source, timing, board, { minimumSceneSeconds: { 1: 4 } });
  expect(result.timing.phrases[1].start).toBeCloseTo(4);
  expect(result.timing.words[2].start).toBeCloseTo(4);
  expect(result.timing.words[2].end - result.timing.words[2].start).toBeCloseTo(.5);
  expect(result.pcm[Math.round(4.2 * AUDIO_RATE)]).toBe(source[Math.round(1.7 * AUDIO_RATE)]);
  expect(result.cuts[1].levelDb).toBeLessThan(-42);
});

it("quotes only the replaced scene and cannot reuse the original approval fingerprint", () => {
  const content = { mode: "live" as const, jobId: "2b0df353-688e-4d7c-b5aa-6a31cd4b2f21", board, timing, aspectRatio: "9:16" as const,
    voiceFile: "/unused.wav", audioSha256: "a".repeat(64), alignmentSha256: "b".repeat(64), reviews: [],
    media: { "1": { id: "5462d54d-39a2-48a5-84c5-052c718f6ca5", kind: "video" as const, sha256: "c".repeat(64), width: 1080, height: 1920, duration: 5 } } };
  const packet: RenderPacket = { ...content, fingerprint: sha256(JSON.stringify(content)) };
  const before = JSON.stringify(packet);
  const plan = sceneRepairPlan(packet, 2, { scene: "Closed scroll.", endScene: "Fully open scroll on the tabletop.", motion: "The right hand unrolls the scroll away from the body.", references: ["narrator"], overlay: null, strike: false, actionSeconds: 5 }, recipe,
    [{ id: "narrator", url: "https://example.com/ref.png", sha256: "d".repeat(64) , characterSheet:{status:"approved",sha256:"d".repeat(64),approvedAt:"2026-10-14"}}]);
  expect(plan.operations.map(op => op.kind)).toEqual(["image", "image", "video"]);
  expect(plan.operations.every(op => op.scene === 2 && !op.dependsOn.includes("voice-alignment"))).toBe(true);
  expect(plan.timingBasis).toBe("reviewed-voice-alignment");
  expect(plan.paidGenerationAuthorized).toBe(false);
  expect(plan.fingerprint).not.toBe(packet.fingerprint);
  expect(JSON.stringify(packet)).toBe(before);
});

it("only assembles hash-reviewed replacements and preserves the original packet and narration", () => {
 const content = { mode: "live" as const, jobId: "2b0df353-688e-4d7c-b5aa-6a31cd4b2f21", board, timing, aspectRatio: "9:16" as const,
  voiceFile: "/unused.wav", audioSha256: "a".repeat(64), alignmentSha256: "b".repeat(64), reviews: [], media: {} };
 const packet: RenderPacket = { ...content, fingerprint: sha256(JSON.stringify(content)) }, before = JSON.stringify(packet);
 const plan = sceneRepairPlan(packet, 2, { scene:"Closed scroll.", endScene:"Open strip on the tabletop.", motion:"Right hand unrolls it away.", references:["narrator"], overlay:null, strike:false, actionSeconds:5 }, recipe, [{id:"narrator",url:"https://example.com/ref.png",sha256:"c".repeat(64), characterSheet:{status:"approved",sha256:"c".repeat(64),approvedAt:"2026-10-14"}}]);
 const image = {id:"5462d54d-39a2-48a5-84c5-052c718f6ca5",kind:"image" as const,sha256:"d".repeat(64),width:1080,height:1920};
 const media = {"scene-2-start":image,"scene-2-end":{...image,sha256:"e".repeat(64)},"scene-2-clip":{...image,kind:"video" as const,duration:5,sha256:"f".repeat(64)}};
 const reviews = Object.fromEntries(Object.entries(media).map(([id,m])=>[id,{decision:"approved" as const,sha256:m.sha256,note:"Inspected complete visual",at:"2026-10-14T12:00:00Z",reviewer:"Codex"}]));
 const repaired = applyReviewedSceneRepairs(packet,[{plan,media,reviews}],recipe);
 expect(repaired.voiceFile).toBe(packet.voiceFile); expect(repaired.audioSha256).toBe(packet.audioSha256);
 expect(repaired.timing).toBe(packet.timing);expect(repaired.board.shots[0]).toBe(packet.board.shots[0]);
 expect(repaired.fingerprint).toBe(applyReviewedSceneRepairs(packet,[{plan,media,reviews}],recipe).fingerprint);
 expect(JSON.stringify(packet)).toBe(before);
 expect(()=>applyReviewedSceneRepairs(packet,[{plan,media,reviews:{...reviews,"scene-2-clip":{...reviews["scene-2-clip"],sha256:"0".repeat(64)}}}],recipe)).toThrow(/matching visual review/);
 expect(()=>applyReviewedSceneRepairs(packet,[{plan,media,reviews:{...reviews,"scene-2-end":{...reviews["scene-2-end"],decision:"rejected"}}}],recipe)).toThrow(/matching visual review/);
});

it('preserves an energetic but fully aligned ending for finishing review when explicitly enabled',()=>{
 const source=new Float32Array(3*AUDIO_RATE).fill(.1),original=source.slice();
 const noTail={...timing,words:timing.words.map((w,i)=>i===3?{...w,end:3}:w)};
 const result=paceRecording(source,noTail,board,{attack:0,sourceTailPolicy:'preserve-for-review'});
 expect(result.pcm.slice(0,source.length)).toEqual(original);
 expect(result.tailPaddingSeconds).toBe(.2);
 expect(result.sourceTailNeedsListening).toBe(true);
 expect(result.timing.words).toEqual(noTail.words);
 expect(result.pcm.slice(source.length).every(n=>n===0)).toBe(true);
 const invalid={...noTail,words:noTail.words.map((w,i)=>i===3?{...w,end:3.1}:w)};
 expect(()=>paceRecording(source,invalid,board,{sourceTailPolicy:'preserve-for-review'})).toThrow('beyond the recording');
});
