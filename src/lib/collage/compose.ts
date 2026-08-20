/**
 * Collage composer: turns a score + word timings + cut-out files into one
 * standalone HyperFrames composition (index.html + assets) and renders it
 * locally with the HyperFrames CLI (CPU, no API cost).
 *
 * One clip for the whole video (everything in the DOM at load, measurable),
 * one scene wrapper per sentence shown/hidden with autoAlpha, one paused GSAP
 * timeline registered on window.__timelines["cam"].
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AspectRatio, Recipe } from "../recipes";
import type { WordTiming } from "../providers/types";
import type { Score, ScoreEvent, Slot, Size } from "./score";

const exec = promisify(execFile);

export type ShotMedia = {
  voicePath: string;
  voiceSeconds: number;
  words: WordTiming[];
};

export type ComposeInput = {
  recipe: Recipe;
  aspectRatio: AspectRatio;
  score: Score;
  shots: ShotMedia[];
  /** element key → local PNG path (transparent background) */
  cutouts: Record<string, string>;
  /** Breathing room after each sentence (s). */
  tailSeconds: number;
};

type Box = { x: number; y: number; w: number; h: number };

const TRANSITION = 0.35;

function canvas(aspect: AspectRatio): { W: number; H: number } {
  if (aspect === "16:9") return { W: 1920, H: 1080 };
  if (aspect === "1:1") return { W: 1080, H: 1080 };
  return { W: 1080, H: 1920 };
}

/** Slot rectangles as fractions of the canvas; the lower third stays free for captions. */
function slotBox(slot: Slot, W: number, H: number): Box {
  const f: Record<Slot, [number, number, number, number]> = {
    top: [0.16, 0.06, 0.84, 0.38],
    center: [0.2, 0.24, 0.8, 0.6],
    left: [0.04, 0.36, 0.5, 0.68],
    right: [0.5, 0.36, 0.96, 0.68],
    "top-left": [0.04, 0.07, 0.48, 0.36],
    "top-right": [0.52, 0.07, 0.96, 0.36],
  };
  const [x1, y1, x2, y2] = f[slot];
  return { x: x1 * W, y: y1 * H, w: (x2 - x1) * W, h: (y2 - y1) * H };
}

function sizePx(size: Size, W: number, H: number): number {
  const base = Math.min(W, H * 0.56);
  // Cut-out canvases are square with the object filling ~60%: sizes are generous on purpose.
  return size === "l" ? base * 0.8 : size === "m" ? base * 0.6 : base * 0.42;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function norm(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, "");
}

/** Time (s, within the shot) of the anchor word; searches forward from `fromIndex`. */
function anchorTime(at: string, words: WordTiming[], fromIndex: number, fallback: number): { t: number; index: number } {
  const target = norm(at.split(/\s+/)[0] ?? at);
  for (let i = fromIndex; i < words.length; i++) {
    if (norm(words[i].word) === target) return { t: words[i].start, index: i };
  }
  for (let i = 0; i < words.length; i++) {
    if (norm(words[i].word) === target) return { t: words[i].start, index: i };
  }
  return { t: fallback, index: fromIndex };
}

/** Hand-drawn looking ellipse path around a box. */
function circlePath(b: Box, seed: number): string {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const rx = b.w * 0.58, ry = b.h * 0.56;
  const j = (k: number) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1) * 0.08 + 0.96;
  const k = 0.5523;
  return [
    `M ${cx + rx * j(1)} ${cy}`,
    `C ${cx + rx} ${cy + ry * k}, ${cx + rx * k} ${cy + ry * j(2)}, ${cx} ${cy + ry * j(3)}`,
    `C ${cx - rx * k} ${cy + ry}, ${cx - rx * j(4)} ${cy + ry * k}, ${cx - rx * j(5)} ${cy}`,
    `C ${cx - rx} ${cy - ry * k}, ${cx - rx * k} ${cy - ry * j(6)}, ${cx} ${cy - ry * j(7)}`,
    `C ${cx + rx * k} ${cy - ry}, ${cx + rx * j(8)} ${cy - ry * k}, ${cx + rx * 1.02} ${cy + ry * 0.12}`,
  ].join(" ");
}
function crossPath(b: Box): string {
  return `M ${b.x - b.w * 0.1} ${b.y - b.h * 0.05} C ${b.x + b.w * 0.4} ${b.y + b.h * 0.35}, ${b.x + b.w * 0.7} ${b.y + b.h * 0.7}, ${b.x + b.w * 1.1} ${b.y + b.h * 1.05}`;
}
function underlinePath(b: Box): string {
  const y = b.y + b.h * 1.02;
  return `M ${b.x - b.w * 0.05} ${y} C ${b.x + b.w * 0.3} ${y + 10}, ${b.x + b.w * 0.7} ${y - 8}, ${b.x + b.w * 1.05} ${y + 4}`;
}
function arrowPaths(from: Box, to: Box): { shaft: string; head: string } {
  const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
  const tx = to.x + to.w / 2, ty = to.y + to.h / 2;
  const dx = tx - fx, dy = ty - fy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const sx = fx + ux * Math.min(from.w, from.h) * 0.55, sy = fy + uy * Math.min(from.w, from.h) * 0.55;
  const ex = tx - ux * Math.min(to.w, to.h) * 0.6, ey = ty - uy * Math.min(to.w, to.h) * 0.6;
  const mx = (sx + ex) / 2 - uy * len * 0.18, my = (sy + ey) / 2 + ux * len * 0.18;
  const hx1 = ex - ux * 46 - uy * 30, hy1 = ey - uy * 46 + ux * 30;
  const hx2 = ex - ux * 46 + uy * 30, hy2 = ey - uy * 46 - ux * 30;
  return { shaft: `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`, head: `M ${hx1} ${hy1} L ${ex} ${ey} L ${hx2} ${hy2}` };
}

const ENTER_TWEENS: Record<string, { from: string; to: string; dur: number }> = {
  stamp: { from: "{ opacity: 0, scale: 1.35, rotation: -8 }", to: "{ opacity: 1, scale: 1, rotation: -3, ease: 'back.out(2.2)' }", dur: 0.32 },
  "slide-left": { from: "{ opacity: 0, x: -700, rotation: -12 }", to: "{ opacity: 1, x: 0, rotation: -4, ease: 'power3.out' }", dur: 0.45 },
  "slide-right": { from: "{ opacity: 0, x: 700, rotation: 12 }", to: "{ opacity: 1, x: 0, rotation: 4, ease: 'power3.out' }", dur: 0.45 },
  drop: { from: "{ opacity: 0, y: -900, scale: 1.3, rotation: -6 }", to: "{ opacity: 1, y: 0, scale: 1, rotation: -6, ease: 'power4.in' }", dur: 0.33 },
  pop: { from: "{ opacity: 0, scale: 0.2, rotation: 10 }", to: "{ opacity: 1, scale: 1, rotation: 4, ease: 'back.out(3)' }", dur: 0.3 },
  rise: { from: "{ opacity: 0, y: 380, rotation: 3 }", to: "{ opacity: 1, y: 0, rotation: 0, ease: 'power3.out' }", dur: 0.4 },
};

export function buildCollageHtml(input: ComposeInput): { html: string; durationSeconds: number } {
  const { recipe, aspectRatio, score, shots, cutouts, tailSeconds } = input;
  const { W, H } = canvas(aspectRatio);
  const collage = recipe.collage!;
  const fontPx = (f: number) => Math.round(W * f);

  // Timeline of shots.
  const starts: number[] = [];
  let t = 0;
  for (const s of shots) {
    starts.push(t);
    t += s.voiceSeconds + tailSeconds;
  }
  const total = Number((t + 0.2).toFixed(2));

  const styles: string[] = [];
  const dom: string[] = [];
  const tl: string[] = [];
  const strokeSelectors: string[] = [];
  const hiddenSelectors: string[] = [];

  score.shots.forEach((shot, si) => {
    const media = shots[si];
    const start = starts[si];
    const end = start + media.voiceSeconds + tailSeconds;
    const sid = `s${si}`;
    const boxes: Record<string, Box> = {};
    const els: string[] = [];
    const svgPaths: string[] = [];
    let wordIndex = 0;
    let lastT = -1;
    let eventN = 0;
    const usedSlots = new Set<Slot>();
    const CONFLICTS: Record<Slot, Slot[]> = {
      center: ["left", "right", "top"],
      left: ["center"],
      right: ["center"],
      top: ["top-left", "top-right", "center"],
      "top-left": ["top"],
      "top-right": ["top"],
    };
    const slotFree = (sl: Slot) => !usedSlots.has(sl) && !CONFLICTS[sl].some((c) => usedSlots.has(c));
    const wordBoxes: Box[] = [];

    const nextTime = (at: string) => {
      // The first event of a sentence always fires with its first word.
      const a = eventN === 0 ? { t: 0.02, index: 0 } : anchorTime(at, media.words, wordIndex, Math.min(media.voiceSeconds - 0.4, eventN * 1.2));
      wordIndex = Math.min(media.words.length - 1, a.index);
      let tt = Math.max(0.02, a.t);
      if (tt <= lastT + 0.22) tt = lastT + 0.22; // keep events readable
      tt = Math.min(tt, Math.max(0.05, media.voiceSeconds - 0.25));
      lastT = tt;
      eventN++;
      return start + tt;
    };

    for (const ev of shot.events as ScoreEvent[]) {
      if (ev.kind === "cutout") {
        const file = cutouts[ev.key];
        if (!file) continue;
        let slot = ev.slot;
        if (!slotFree(slot)) slot = (["top-left", "top-right", "left", "right", "top", "center"] as Slot[]).find(slotFree) ?? slot;
        usedSlots.add(slot);
        const sb = slotBox(slot, W, H);
        const w = Math.min(sizePx(ev.size, W, H), sb.w);
        const box: Box = { x: sb.x + (sb.w - w) / 2, y: sb.y + (sb.h - w) / 2, w, h: w };
        boxes[ev.key] = box;
        const id = `${sid}-el-${ev.key}-${eventN}`;
        styles.push(`#${id}{left:${box.x.toFixed(0)}px;top:${box.y.toFixed(0)}px;width:${w.toFixed(0)}px;height:${w.toFixed(0)}px;}`);
        els.push(`<img id="${id}" class="el" src="assets/${path.basename(file)}" alt="" />`);
        hiddenSelectors.push(`#${id}`);
        const at = nextTime(ev.at);
        const tw = ENTER_TWEENS[ev.enter] ?? ENTER_TWEENS.stamp;
        tl.push(`tl.fromTo("#${id}", ${tw.from}, { ...${tw.to}, duration: ${tw.dur}, immediateRender: false }, ${at.toFixed(3)});`);
        if (ev.impact || ev.enter === "drop") {
          tl.push(`tl.to("#${sid}-cam", { x: -9, duration: 0.05, yoyo: true, repeat: 5, ease: "none" }, ${(at + tw.dur).toFixed(3)});`);
        }
      } else if (ev.kind === "word") {
        const id = `${sid}-w-${eventN}`;
        const nearBox = ev.near ? boxes[ev.near] : undefined;
        const sb = nearBox ?? slotBox(ev.slot ?? "top", W, H);
        const fs = fontPx(ev.text.length > 10 ? 0.085 : 0.12);
        const approxW = Math.min(W - 40, ev.text.length * fs * 0.62);
        const x = Math.max(20, Math.min(W - approxW - 20, sb.x + sb.w * 0.1));
        let y = Math.max(20, nearBox ? sb.y - fs * 1.15 : sb.y + sb.h * 0.1);
        // Stack handwritten words instead of overlapping the previous ones of this sentence.
        const overlaps = (b: Box) => !(x + approxW < b.x || b.x + b.w < x || y + fs < b.y || b.y + b.h < y);
        for (let guard = 0; guard < 6 && wordBoxes.some(overlaps); guard++) y += fs * 1.15;
        wordBoxes.push({ x, y, w: approxW, h: fs });
        styles.push(`#${id}{left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;font-size:${fs}px;color:${collage.handColor};}`);
        els.push(`<p id="${id}" class="hand">${esc(ev.text.toUpperCase())}</p>`);
        hiddenSelectors.push(`#${id}`);
        const at = nextTime(ev.at);
        tl.push(`tl.fromTo("#${id}", { opacity: 0, scale: 0.3, rotation: -14 }, { opacity: 1, scale: 1, rotation: -7, duration: 0.3, ease: "back.out(3)", immediateRender: false }, ${at.toFixed(3)});`);
      } else if (ev.kind === "annotate") {
        const target = boxes[ev.target];
        if (!target) continue;
        const id = `${sid}-a-${eventN}`;
        const at = nextTime(ev.at);
        const color = ev.type === "cross" ? collage.accent : collage.ink;
        const width = ev.type === "cross" ? 22 : 11;
        if (ev.type === "arrow") {
          const from = ev.from ? boxes[ev.from] : undefined;
          if (!from) continue;
          const a = arrowPaths(from, target);
          svgPaths.push(`<path id="${id}" d="${a.shaft}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`);
          svgPaths.push(`<path id="${id}h" d="${a.head}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`);
          strokeSelectors.push(`#${id}`, `#${id}h`);
          tl.push(`draw("#${id}", ${at.toFixed(3)}, 0.3); draw("#${id}h", ${(at + 0.28).toFixed(3)}, 0.14);`);
        } else {
          const d = ev.type === "circle" ? circlePath(target, si + eventN) : ev.type === "cross" ? crossPath(target) : underlinePath(target);
          svgPaths.push(`<path id="${id}" d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-opacity="0.92"/>`);
          strokeSelectors.push(`#${id}`);
          tl.push(`draw("#${id}", ${at.toFixed(3)}, ${ev.type === "circle" ? 0.5 : 0.35});`);
        }
      }
    }

    // Captions: the sentence (script words, verbatim) in the lower third, words turn dark as spoken.
    // Timings come from the transcription; when its word count differs (hyphenation, numbers), map proportionally.
    const scriptWords = shot.narration.split(/\s+/).filter(Boolean);
    const capWords = scriptWords.map((w, wi) => {
      if (media.words.length === 0) return { word: w, start: (wi / Math.max(1, scriptWords.length)) * media.voiceSeconds, end: 0 };
      const ti = media.words.length === scriptWords.length ? wi : Math.min(media.words.length - 1, Math.floor((wi / scriptWords.length) * media.words.length));
      return { word: w, start: media.words[ti].start, end: media.words[ti].end };
    });
    const capSpans = capWords.map((w, wi) => `<span id="${sid}-cw-${wi}" class="cw">${esc(w.word)}</span>`).join(" ");
    capWords.forEach((w, wi) => {
      tl.push(`tl.set("#${sid}-cw-${wi}", { color: "${collage.captionActive}" }, ${(start + Math.max(0.01, w.start)).toFixed(3)});`);
    });

    dom.push(`
      <div id="${sid}" class="scene">
        <div class="paper"></div>
        <div id="${sid}-cam" class="cam">
          ${els.join("\n          ")}
          <svg class="ink" viewBox="0 0 ${W} ${H}">${svgPaths.join("")}</svg>
        </div>
        <p id="${sid}-cap" class="cap">${capSpans}</p>
      </div>`);
    // Scene visibility + entrance slide + camera push-in.
    tl.push(`tl.fromTo("#${sid}", { autoAlpha: 0, x: ${si === 0 ? 0 : W} }, { autoAlpha: 1, x: 0, duration: ${si === 0 ? 0.01 : TRANSITION}, ease: "power3.out", immediateRender: false }, ${Math.max(0, start - (si === 0 ? 0 : TRANSITION * 0.6)).toFixed(3)});`);
    tl.push(`tl.fromTo("#${sid}-cam", { scale: 1 }, { scale: 1.07, duration: ${(end - start).toFixed(3)}, ease: "none", immediateRender: false }, ${start.toFixed(3)});`);
    // Captions: fade in after the slide, fade out before the next sentence slides in.
    tl.push(`tl.fromTo("#${sid}-cap", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: "power2.out", immediateRender: false }, ${(start + (si === 0 ? 0 : 0.08)).toFixed(3)});`);
    if (si < score.shots.length - 1) {
      tl.push(`tl.to("#${sid}-cap", { autoAlpha: 0, duration: 0.12, ease: "power2.in" }, ${(end - TRANSITION * 0.4 - 0.14).toFixed(3)});`);
      tl.push(`tl.to("#${sid}", { autoAlpha: 0, x: ${-W}, duration: ${TRANSITION}, ease: "power3.in" }, ${(end - TRANSITION * 0.4).toFixed(3)});`);
    }
  });

  const audio = shots
    .map((s, i) => `<audio id="voice-${i}" src="assets/${path.basename(s.voicePath)}" data-start="${starts[i].toFixed(3)}" data-duration="${s.voiceSeconds.toFixed(3)}" data-track-index="${10 + (i % 2)}" data-volume="1"></audio>`)
    .join("\n      ");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>CAM collage</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Marker Felt"; src: local("Marker Felt"), local("MarkerFelt-Wide"), local("MarkerFelt-Thin"); }
      @font-face { font-family: "Bradley Hand"; src: local("Bradley Hand"), local("BradleyHandITCTT-Bold"); }
      body { margin: 0; background: #000; }
      #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      .clip { position: absolute; inset: 0; }
      .scene { position: absolute; inset: 0; opacity: 0; visibility: hidden; }
      .paper { position: absolute; inset: 0; ${collage.backgroundCss} }
      .cam { position: absolute; inset: 0; transform-origin: 50% 42%; }
      .el { position: absolute; display: block; object-fit: contain; opacity: 0; transform-origin: 50% 50%; filter: drop-shadow(6px 10px 8px rgba(40, 30, 10, 0.28)); }
      svg.ink { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: visible; pointer-events: none; }
      .hand { position: absolute; display: block; margin: 0; white-space: nowrap; opacity: 0; transform-origin: 50% 50%; font-family: "Marker Felt", "Bradley Hand", cursive; letter-spacing: 4px; }
      .cap { position: absolute; opacity: 0; visibility: hidden; left: ${Math.round(W * 0.07)}px; width: ${Math.round(W * 0.86)}px; top: ${Math.round(H * 0.74)}px; margin: 0; text-align: center; font-family: Inter, "Helvetica Neue", Arial, sans-serif; font-weight: 800; font-size: ${fontPx(aspectRatio === "16:9" ? 0.03 : 0.052)}px; line-height: 1.25; color: ${collage.captionBase}; }
      .cw { display: inline-block; }
      ${styles.join("\n      ")}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="cam" data-start="0" data-width="${W}" data-height="${H}" data-duration="${total}" data-fps="30">
      <section id="film" class="clip" data-start="0" data-duration="${total}" data-track-index="1" data-layout-allow-overflow>
        ${dom.join("\n")}
      </section>
      ${audio}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      // Marker strokes start fully "undrawn" (dash offset past the path, no visible caps) and draw on at their word.
      ${JSON.stringify(strokeSelectors)}.forEach((sel) => {
        const el = document.querySelector(sel);
        const len = el ? el.getTotalLength() : 100;
        gsap.set(sel, { strokeDasharray: len + " " + (len + 20), strokeDashoffset: len + 10 });
      });
      const draw = (sel, at, dur) => {
        tl.to(sel, { strokeDashoffset: 0, duration: dur, ease: "power2.inOut" }, at);
      };
      ${tl.join("\n      ")}
      window.__timelines["cam"] = tl;
    </script>
  </body>
</html>
`;
  return { html, durationSeconds: total };
}

/** Writes the project (index.html + assets) and renders it with the HyperFrames CLI. */
export async function renderCollage(projectDir: string, input: ComposeInput, outputPath: string): Promise<{ durationSeconds: number }> {
  const assetsDir = path.join(projectDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  for (const file of Object.values(input.cutouts)) await copyFile(file, path.join(assetsDir, path.basename(file)));
  for (const s of input.shots) await copyFile(s.voicePath, path.join(assetsDir, path.basename(s.voicePath)));
  const { html, durationSeconds } = buildCollageHtml(input);
  await writeFile(path.join(projectDir, "index.html"), html, "utf8");
  await exec("npx", ["--yes", "hyperframes", "render", "--quality", "high", "--output", outputPath], {
    cwd: projectDir,
    env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}` },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 20 * 60_000,
  });
  return { durationSeconds };
}
