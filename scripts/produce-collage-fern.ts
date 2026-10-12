/**
 * Paper-collage pipeline (method validated with Shimon on 2026-09-09):
 *   beats.json → voice + word timings per beat → collage frame (Nano Banana Pro 2K)
 *   → empty plate (Nano Banana Pro edit) → build-on assembly clip (Seedance 2.0 Fast,
 *   start = plate, end = frame) → HyperFrames montage (clips + voice + paper sound
 *   + captions) → local render + contact sheet.
 * Resumable: every generated asset is recorded in state.json and skipped on re-run.
 *   pnpm tsx --env-file=.env scripts/produce-collage-fern.ts [runId]
 */
import { fal } from "@fal-ai/client";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { falTts, falTranscribe, falImage } from "../src/lib/providers/fal";
import type { WordTiming } from "../src/lib/providers/types";
import { safeZones } from "../src/lib/collage/layouts";
import { captionsCss, maxCharsFor, planCaptions, renderCaptions } from "../src/lib/collage/captions";

const exec = promisify(execFile);
const ROOT = process.cwd();
const STYLE = (process.env.STYLE ?? "collage") as "collage" | "whiteboard";
const BEATS_FILE = path.join(ROOT, "storage", "tests", "collage-frames", STYLE === "whiteboard" ? "beats-whiteboard.json" : "beats.json");
/** Optional: reuse voices + timings from a previous run's state.json (same script). */
const REUSE_VOICES_FROM = process.env.REUSE_VOICES_FROM;
const runId = process.argv[2] ?? `fern-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
const RUN = path.join(ROOT, "storage", "runs", runId);
const STATE = path.join(RUN, "state.json");
const ENV = { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}` };

const PRICES = { image: 0.15, plate: 0.15, clipPerSecond: 0.2419, ttsPer1000: 0.1 };
const VOICE_LEAD = 0.35; // voice starts a little after the clip begins

const STYLE_BLOCK_COLLAGE =
  "hand-cut documentary paper collage on aged newsprint and archival map surfaces, black and white halftone photograph cutouts with rough scissor-cut edges and offset accent strokes, torn paper edges, masking tape fragments, typewriter caption strips, rubber stamp marks, red string and brass pins where the story calls for connections, desaturated archival palette of tan, ink black, and halftone gray with ONE hot red signal accent and a restrained mustard yellow secondary, condensed bold headline lettering only where a label is specified, visible print grain and paper fiber, matte, flat even documentary lighting with soft cutout drop shadows. Vary the paper stock tone rather than repeating one flat shade: mix in lighter cream and bleached-newsprint scraps alongside the darker aged-tan and manila pieces within the same desaturated archival family, so the collage reads as assembled from many different real paper sources.";
const CLOSER_COLLAGE =
  "Every element must appear physically hand-cut and layered from real paper, with visible cutout edges, halftone print texture, and soft shadow separation between layers. The composition stays clean, minimal, and editorial with generous negative space. NOT digital illustration, NOT cartoon, NOT 3D render, NOT glossy, no gradients, no clutter, no watermark, no logos, no human faces, no people, no text beyond the specified label. Premium documentary collage aesthetic, 9:16 vertical, ultra-detailed, 8K.";

const STYLE_BLOCK_WHITEBOARD =
  "real dry-erase whiteboard explainer: a clean white whiteboard filling the whole frame, hand-drawn illustrations in black dry-erase marker with slightly uneven line weight, small wobbles and visible marker texture, simple iconographic drawings, sparse hatching instead of fills, a few strokes of red marker as the single accent, faint marker smudges and light ghosting of erased marks, a thin aluminum board frame edge visible along one side, flat even photographic lighting of a real office whiteboard with a slight soft glare, matte.";
const CLOSER_WHITEBOARD =
  "Everything on the board must look genuinely hand-drawn with a dry-erase marker: uneven line weight, small wobbles, marker texture, no fills except sparse hatching. NOT digital vector illustration, NOT cartoon shading, NOT 3D, no gradients, no photographs, no clutter, no watermark, no logos, no human figures, no faces, no hands in this still image, no text beyond the specified handwritten label. Premium whiteboard explainer aesthetic, 9:16 vertical, ultra-detailed, 8K.";
const STYLE_BLOCK = STYLE === "whiteboard" ? STYLE_BLOCK_WHITEBOARD : STYLE_BLOCK_COLLAGE;
const CLOSER = STYLE === "whiteboard" ? CLOSER_WHITEBOARD : CLOSER_COLLAGE;

type Beat = { narration: string; idea: string; label?: string; scene: string; assemblyOrder: string[] };
type BeatState = {
  voicePath?: string; voiceSeconds?: number; words?: WordTiming[];
  framePath?: string; platePath?: string; clipPath?: string; clipSeconds?: number; clipAudioPath?: string;
};
type State = { beats: BeatState[]; cost: Record<string, number>; log: string[] };

const state: State = { beats: [], cost: {}, log: [] };
async function save() { await writeFile(STATE, JSON.stringify(state, null, 2), "utf8"); }
function addCost(k: string, v: number) { state.cost[k] = Number(((state.cost[k] ?? 0) + v).toFixed(4)); }
function log(m: string) { const line = `${new Date().toISOString().slice(11, 19)} ${m}`; state.log.push(line); console.log(line); }

async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
}
async function retry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let t = 1; t <= tries; t++) {
    try { return await fn(); } catch (e) { lastErr = e; log(`retry ${t}/${tries} ${label}: ${e instanceof Error ? e.message.slice(0, 160) : e}`); }
  }
  throw lastErr;
}
/** fal storage upload; falls back to a data URI when the storage endpoint refuses (403 seen on 2026-09-09). */
let storageBlocked = false;
async function upload(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  if (!storageBlocked) {
    try {
      return await fal.storage.upload(new File([buffer], path.basename(filePath), { type: mime }));
    } catch (e) {
      storageBlocked = true;
      log(`fal storage refused (${e instanceof Error ? e.message : e}); switching to data URIs`);
    }
  }
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}
async function mediaDuration(p: string): Promise<number> {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", p]);
  return Number(stdout.trim());
}
const clampClip = (voiceSeconds: number) => Math.min(15, Math.max(4, Math.ceil(voiceSeconds + VOICE_LEAD + 0.9)));

function platePrompt(b: Beat): string {
  const fg = b.assemblyOrder.slice(1).join(", ");
  if (STYLE === "whiteboard") {
    return `Edit this image: erase every drawing and every mark made with the marker (${b.assemblyOrder.join(", ")}) and leave ONLY the empty whiteboard exactly as it is: the same board, same aluminum frame edge, same lighting and glare, same faint smudges and ghosting. No drawings, no text, no letters, no new elements. The result is the same clean whiteboard, empty, ready to be drawn on.`;
  }
  return `Edit this image: remove every foreground element (${fg}) and leave ONLY the empty background plate exactly as it is: the same paper surfaces, same scraps, same lighting, same grain, same framing, same colors. Fill the uncovered areas with matching paper texture. No objects, no text, no labels, no new elements. The result is the same table surface, empty, ready for the collage to be assembled on it.`;
}
function animationPrompt(b: Beat, seconds: number): string {
  const build = Math.max(2.5, seconds - 1);
  const order = b.assemblyOrder.map((s, i) => `${i + 1}. ${s}`).join("; ");
  if (STYLE === "whiteboard") {
    return `Transform the provided images into a ${seconds}-second premium whiteboard explainer animation. The FIRST image is the empty whiteboard. The LAST image is the FINISHED drawing that the animation builds toward. Preserve the final drawing of the last image exactly. Do not redesign, reposition, resize, or replace any element.

Style: a real dry-erase whiteboard filmed straight on. A right hand in a plain dark sleeve holding a black dry-erase marker enters from the lower right edge and draws the illustration live, stroke by stroke, with natural hand speed and small pauses. Marker strokes appear exactly where the marker tip passes, never ahead of it, with real marker texture and slightly uneven line weight. The hand switches to a red marker only for the red accent.

CAMERA, STRICT: the camera stays completely locked for the entire clip. No zoom, no pan, no tilt, no rotation, no dolly, no handheld shake, no focus pulls, no reframing, no cuts, no transitions, no morphing. One continuous static shot.

0 TO ${build.toFixed(1)} SECONDS, LIVE DRAWING: the board opens EMPTY. The hand draws the elements in this order: ${order}. Hero outline first, then its details, then the supporting drawings, arrows and boxes, then the red accent, the label last. Nothing already drawn ever changes. By ${build.toFixed(1)} seconds the board exactly matches the last image and the hand leaves the frame at the lower right.

${build.toFixed(1)} TO ${seconds} SECONDS, HOLD: the finished drawing holds still on the board, no hand in frame, only the faint glare of the room light.

AUDIO: no music, no narration, no voices. Only the squeak and tap of a dry-erase marker on a whiteboard, a cap click, soft room tone. All subtle.

REPRESENTATION RULE: only a hand and forearm ever appear, never a face, never a body, never any person or child in the drawing. No text appears anywhere except the label already present in the last image. The finished clip must feel like a real whiteboard explainer drawn live, matching the last image exactly from ${build.toFixed(1)} seconds to the end.`;
  }
  return `Transform the provided images into a ${seconds}-second premium editorial documentary paper-collage animation. The FIRST image is the empty background plate. The LAST image is the FINISHED frame that the animation builds toward. Preserve the final composition of the last image exactly. Do not redesign, reposition, resize, or replace any element.

Style: hand-cut documentary paper collage in motion. Aged newsprint and archival surfaces, halftone photo cutouts, torn edges, tape, stamps, red string, typewriter strips. Every element moves as a physical paper piece; a piece may lift and turn in space as it lands (a light mix of flat and volume is fine). Visible cutout thickness, print grain, soft layered shadows. Stop-motion cadence, stepped easing, 2-3 frame holds, the hand-made "cutting on twos" feel. Never smooth CGI motion.

CAMERA, STRICT: the camera stays completely locked for the entire clip. No zoom, no pan, no tilt, no rotation, no orbit, no dolly, no tracking, no handheld shake, no focus pulls, no reframing, no cuts, no transitions, no morphing, no object replacement, no time skips. One continuous static shot.

0 TO ${build.toFixed(1)} SECONDS, BUILD-ON ASSEMBLY: the frame opens on the EMPTY background plate only, with every story element absent. Elements then enter one by one, back to front, in this order: ${order}. Background scraps settle first, cutouts slide or drop in with paper drag and a small settle, tape presses down, pins click in, red string draws itself from pin to pin, stamps slap on, labels land last. Each entrance lands with a tiny handcrafted bounce and casts a real layered shadow. No element moves again after it lands. By ${build.toFixed(1)} seconds the frame exactly matches the last image.

${build.toFixed(1)} TO ${seconds} SECONDS, LIVING PAPER POSTER: everything holds position. Only subtle life remains: paper corners lift a millimeter in a draft, halftone dots shimmer faintly, string tension quivers once, shadows breathe. Nothing changes location, nothing enters or exits.

AUDIO: no music, no narration, no voices. Only close-up paper ASMR and faint room tone: paper sliding, cardstock taps, tape press, pin click, string zip, stamp thud. All subtle.

No text appears anywhere except the label already present in the last image. No faces, no people, ever. The finished clip must feel like a real editorial paper collage assembling itself on a table, then holding as a living poster, matching the last image exactly from ${build.toFixed(1)} seconds to the end.`;
}

async function main() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY missing");
  fal.config({ credentials: key });
  await mkdir(path.join(RUN, "assets"), { recursive: true });
  if (existsSync(STATE)) Object.assign(state, JSON.parse(await readFile(STATE, "utf8")));
  const data = JSON.parse(await readFile(BEATS_FILE, "utf8")) as { beats: Beat[] };
  const beats = data.beats;
  while (state.beats.length < beats.length) state.beats.push({});
  log(`run ${runId} (${STYLE}): ${beats.length} beats`);
  if (REUSE_VOICES_FROM) {
    const prev = JSON.parse(await readFile(path.join(ROOT, "storage", "runs", REUSE_VOICES_FROM, "state.json"), "utf8")) as State;
    beats.forEach((b, i) => {
      const pb = prev.beats[i];
      if (pb?.voicePath && !state.beats[i].voicePath) Object.assign(state.beats[i], { voicePath: pb.voicePath, voiceSeconds: pb.voiceSeconds, words: pb.words });
    });
    log(`voices reused from ${REUSE_VOICES_FROM} where the narration matches`);
  }

  // 1. Voice + word timings (parallel).
  await pool(beats, 6, async (b, i) => {
    const s = state.beats[i];
    if (s.voicePath && s.words) return;
    const v = await retry(`tts ${i + 1}`, () => falTts.synthesize({ text: b.narration, voiceId: "narrator-en-1", language: "en" }));
    addCost("tts", v.realCostUsd);
    const [dur, tr] = await Promise.all([mediaDuration(v.filePath), retry(`whisper ${i + 1}`, () => falTranscribe.transcribe({ audioPath: v.filePath, language: "en" }))]);
    s.voicePath = v.filePath; s.voiceSeconds = dur; s.words = tr.words;
    log(`voice ${i + 1}: ${dur.toFixed(2)} s, ${tr.words.length} words`);
    await save();
  });

  // 2. Frames (parallel).
  await pool(beats, 7, async (b, i) => {
    const s = state.beats[i];
    if (s.framePath) return;
    const prompt = `${b.scene}\n\nStyle: ${STYLE_BLOCK}\n\n${CLOSER}`;
    await writeFile(path.join(RUN, `beat-${String(i + 1).padStart(2, "0")}.frame.prompt.txt`), prompt, "utf8");
    const r = await retry(`frame ${i + 1}`, () => falImage.generateImage({ prompt, aspectRatio: "9:16" }));
    addCost("frames", r.realCostUsd);
    s.framePath = path.join(RUN, `beat-${String(i + 1).padStart(2, "0")}.frame.jpg`);
    await copyFile(r.filePath, s.framePath);
    log(`frame ${i + 1} ok`);
    await save();
  });

  // 3. Plates (parallel).
  await pool(beats, 7, async (b, i) => {
    const s = state.beats[i];
    if (s.platePath) return;
    const frameUrl = await upload(s.framePath!);
    const res = await retry(`plate ${i + 1}`, () => fal.subscribe("fal-ai/nano-banana-pro/edit", {
      input: { prompt: platePrompt(b), image_urls: [frameUrl], aspect_ratio: "9:16", resolution: "2K", output_format: "jpeg", num_images: 1 },
    }));
    const url = (res.data as { images: Array<{ url: string }> }).images[0].url;
    s.platePath = path.join(RUN, `beat-${String(i + 1).padStart(2, "0")}.plate.jpg`);
    await download(url, s.platePath);
    addCost("plates", PRICES.plate);
    log(`plate ${i + 1} ok`);
    await save();
  });

  // 4. Assembly clips (parallel).
  await pool(beats, 5, async (b, i) => {
    const s = state.beats[i];
    if (s.clipPath) return;
    const seconds = clampClip(s.voiceSeconds!);
    const [plateUrl, frameUrl] = await Promise.all([upload(s.platePath!), upload(s.framePath!)]);
    const prompt = animationPrompt(b, seconds);
    await writeFile(path.join(RUN, `beat-${String(i + 1).padStart(2, "0")}.clip.prompt.txt`), prompt, "utf8");
    const t0 = Date.now();
    const res = await retry(`clip ${i + 1}`, () => fal.subscribe("bytedance/seedance-2.0/fast/image-to-video", {
      input: { prompt, image_url: plateUrl, end_image_url: frameUrl, duration: String(seconds), resolution: "720p", aspect_ratio: "9:16", generate_audio: true },
    }));
    const url = (res.data as { video: { url: string } }).video.url;
    s.clipPath = path.join(RUN, `beat-${String(i + 1).padStart(2, "0")}.clip.mp4`);
    await download(url, s.clipPath);
    s.clipSeconds = await mediaDuration(s.clipPath);
    s.clipAudioPath = s.clipPath.replace(/\.mp4$/, ".wav");
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", s.clipPath, "-vn", "-ac", "2", "-ar", "48000", s.clipAudioPath]).catch(() => { s.clipAudioPath = undefined; });
    addCost("clips", seconds * PRICES.clipPerSecond);
    log(`clip ${i + 1}: ${seconds} s asked, ${s.clipSeconds?.toFixed(2)} s got, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await save();
  });

  // 5. Montage (HyperFrames).
  const zones = safeZones("9:16");
  const { W, H } = zones;
  const fontPx = Math.round(W * 0.046);
  // Captions sit lower than the library default so image labels (lower third of the collage) stay clear.
  zones.caption = { x: W * 0.08, y: H * 0.695, w: W * 0.84, h: H * 0.085 };
  const maxChars = maxCharsFor(zones.caption.w, fontPx);
  const dom: string[] = [], tl: string[] = [];
  let t = 0;
  const assets = path.join(RUN, "assets");
  for (const [i, b] of beats.entries()) {
    const s = state.beats[i];
    const L = Math.min(s.clipSeconds ?? clampClip(s.voiceSeconds!), Math.max(s.voiceSeconds! + VOICE_LEAD + 0.55, 3.2));
    const clipName = path.basename(s.clipPath!), voiceName = path.basename(s.voicePath!);
    await copyFile(s.clipPath!, path.join(assets, clipName));
    await copyFile(s.voicePath!, path.join(assets, voiceName));
    dom.push(`<video id="v${i}" class="clip" src="assets/${clipName}" data-start="${t.toFixed(3)}" data-duration="${L.toFixed(3)}" data-track-index="1" muted playsinline></video>`);
    if (s.clipAudioPath) {
      const an = path.basename(s.clipAudioPath);
      await copyFile(s.clipAudioPath, path.join(assets, an));
      dom.push(`<audio id="pa${i}" src="assets/${an}" data-start="${t.toFixed(3)}" data-duration="${L.toFixed(3)}" data-track-index="11" data-volume="0.35"></audio>`);
    }
    dom.push(`<audio id="va${i}" src="assets/${voiceName}" data-start="${(t + VOICE_LEAD).toFixed(3)}" data-duration="${s.voiceSeconds!.toFixed(3)}" data-track-index="10" data-volume="1"></audio>`);
    const plan = planCaptions(b.narration, s.words ?? [], s.voiceSeconds!, maxChars);
    const caps = renderCaptions(plan, `b${i}`, t + VOICE_LEAD, { base: "#8a8178", active: "#141414" });
    dom.push(`<div id="c${i}" class="clip caps" data-start="${t.toFixed(3)}" data-duration="${L.toFixed(3)}" data-track-index="2">${caps.html}</div>`);
    tl.push(...caps.lines);
    t += L;
  }
  const total = (t + 0.3).toFixed(3);
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>CAM collage</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
body{margin:0;background:#000}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#000}
.clip{position:absolute;inset:0}
video.clip{width:${W}px;height:${H}px;object-fit:cover;background:#f3ead8}
.caps{z-index:5}
${captionsCss(zones.caption, fontPx, "#8a8178")}
.cap{text-shadow:0 1px 0 rgba(255,255,255,0.65),0 0 18px rgba(243,234,216,0.9);}
</style></head><body>
<div id="root" data-composition-id="cam" data-start="0" data-width="${W}" data-height="${H}" data-duration="${total}" data-fps="30">
${dom.join("\n")}
</div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
${tl.join("\n")}
window.__timelines["cam"]=tl;</script></body></html>`;
  await writeFile(path.join(RUN, "index.html"), html, "utf8");
  log(`montage: ${beats.length} beats, ${total} s → rendering…`);
  const outputPath = path.join(RUN, `${runId}.mp4`);
  await exec("npx", ["--yes", "hyperframes", "render", "--quality", "high", "--output", outputPath], { cwd: RUN, env: ENV, maxBuffer: 32 * 1024 * 1024, timeout: 30 * 60_000 });
  // Contact sheet, 1 frame per second.
  const sheet = path.join(RUN, `${runId}-planche.jpg`);
  const n = Math.ceil(Number(total));
  const cols = 10, rows = Math.ceil(n / cols);
  await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", outputPath, "-vf", `fps=1,scale=-1:480,tile=${cols}x${rows}:padding=3:color=white`, "-frames:v", "1", sheet]);
  const total$ = Object.values(state.cost).reduce((a, b) => a + b, 0);
  log(`done: ${outputPath} · cost $${total$.toFixed(2)} (${Object.entries(state.cost).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")})`);
  await save();
  const desk = path.join(process.env.HOME!, "Desktop");
  const deskName = STYLE === "whiteboard" ? "CAM - video whiteboard v1" : "CAM - video collage v2 (Fern)";
  await copyFile(outputPath, path.join(desk, `${deskName}.mp4`));
  await copyFile(sheet, path.join(desk, `${deskName} planche.jpg`));
}

main().catch(async (e) => { log(`FAILED: ${e instanceof Error ? e.message : e}`); await save(); process.exit(1); });
