import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConceptBoard, ConceptTiming } from "./types";
import type { AspectRatio } from "../recipes";
import { brandEnding } from "./brand-ending";
import type { EditorialAudio } from "./editorial-audio";
import { presenterFontSize, presenterWordCues, validatePresenterText } from "./presenter-text";
import { normalizedText } from "./text";
export type MontageMedia = { kind: "image" | "video"; file: string; heldSeconds: number; mediaStart?: number; playbackRate?: number; sourceAspect?: number };
export type MontageOptions = { brandEnding?: boolean; endingVariant?: "cream" | "last-frame"; endingTiming?: { start: number; end: number; voiceEnd: number }; audio?: EditorialAudio };

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function conceptCanvas(aspect: AspectRatio) {
  return aspect === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: aspect === "1:1" ? 1080 : 1920 };
}
export type Caption = { text: string; start: number; end: number; phrase: number };
export function captionGroups(timing: ConceptTiming): Caption[] {
  return timing.phrases.flatMap((phrase) => {
    const words = timing.words.filter((w) => w.start >= phrase.start - 0.002 && w.end <= phrase.end + 0.002);
    const groups: Caption[] = [];
    let current: Caption | null = null;
    for (const w of words) {
      if (current && `${current.text} ${w.word}`.length <= 60) { current.text += ` ${w.word}`; current.end = w.end; }
      else { current = { text: w.word, start: w.start, end: w.end, phrase: phrase.phrase }; groups.push(current); }
    }
    // Rebalance a short tail instead of flashing a single word such as "source.".
    if (groups.length > 1) {
      const last = groups.at(-1)!, previous = groups.at(-2)!;
      const previousWords = words.filter((w) => w.start >= previous.start && w.end <= previous.end);
      while (last.text.split(/\s+/).length < 3 && previousWords.length > 3) {
        const moved = previousWords.at(-1)!;
        if (`${moved.word} ${last.text}`.length > 60) break;
        previousWords.pop();
        previous.text = previousWords.map((w) => w.word).join(" ");
        previous.end = previousWords.at(-1)!.end;
        last.text = `${moved.word} ${last.text}`;
        last.start = moved.start;
      }
    }
    if (groups.length > 1 && groups.at(-1)!.end - groups.at(-1)!.start < 0.3) {
      const last = groups.pop()!;
      groups.at(-1)!.text += ` ${last.text}`;
      groups.at(-1)!.end = last.end;
    }
    return groups.map((g, i) => ({ ...g, end: i + 1 < groups.length ? groups[i + 1].start : Math.min(timing.duration, g.end + 0.25) }));
  });
}

/** Re-layout each canvas; no automatic crop that could remove captions or faces. */
export async function writeMontage(root: string, board: ConceptBoard, timing: ConceptTiming, aspect: AspectRatio,
  media: Record<number, MontageMedia> = {},
  options: MontageOptions = {}) {
  const { width: w, height: h } = conceptCanvas(aspect);
  await mkdir(path.join(root, "assets"), { recursive: true });
  await copyFile(path.join(process.cwd(), "node_modules/gsap/dist/gsap.min.js"), path.join(root, "assets/gsap.min.js"));
  const left = Math.round(w * 0.1), safeWidth = Math.round(w * 0.76);
  const fontSize = Math.min(48, Math.round(w * 0.045));
  const captionTop = Math.round(Math.min(h * 0.67, h * .78 - fontSize * 2.5 - 28));
  const nodes: string[] = [];
  const textMotion: string[] = [];
  const ending = options.brandEnding === false ? null : await brandEnding(root, options.audio?.voiceEnd ?? options.endingTiming?.voiceEnd ?? timing.duration, w, h,
    { start: options.audio?.logoStart ?? options.endingTiming?.start, end: options.audio?.duration ?? options.endingTiming?.end, variant: options.endingVariant });
  const duration = ending?.cue.end ?? timing.duration;
  const cues = board.shots.map((shot, i) => {
    const start = i === 0 ? 0 : timing.phrases[i].start;
    const end = timing.phrases[i + 1]?.start ?? (ending ? duration : timing.duration);
    const asset = media[shot.index];
    if (asset?.kind === "video") nodes.push(`<video id="scene-${i}" class="clip scene imported" src="${asset.file}" muted playsinline data-start="${start}" data-duration="${end - start}" data-media-start="${asset.mediaStart ?? 0}" data-playback-rate="${asset.playbackRate ?? 1}" data-track-index="1" style="object-fit:${Math.abs((asset.sourceAspect ?? 0) - w / h) < .015 ? "cover" : "contain"}"></video>`);
    else if (asset) nodes.push(`<div id="scene-${i}" class="clip scene" data-start="${start}" data-duration="${end - start}" data-track-index="1"><img class="imported" src="${asset.file}" alt=""></div>`);
    else nodes.push(`<div id="scene-${i}" class="clip scene" data-start="${start}" data-duration="${end - start}" data-track-index="1"><div class="placeholder"><div class="book"></div><p class="shot-number">SHOT ${shot.index}</p><p class="notice">PLACEHOLDER VISUAL</p></div></div>`);
    if (shot.overlay && shot.visualMode === "presenter-text") {
      validatePresenterText(shot, shot.narration);
      const words = presenterWordCues(shot.overlay, shot.index, timing);
      const titleEnd = Math.min(end, ending?.cue.start ?? end);
      const enterAt = timing.phrases[i].start;
      nodes.push(`<div id="presenter-title-${i}" class="clip presenter-title" data-start="${start}" data-duration="${titleEnd - start}" data-track-index="10" style="font-size:${presenterFontSize(shot.overlay,w,h)}px">${words.map((word,j)=>`<span id="presenter-word-${i}-${j}">${escapeHtml(word.text)}</span>`).join(" ")}</div>`);
      // Reveal the complete headline near the beginning, never new words at the cut.
      words.forEach((word,j)=>{
        textMotion.push(`tl.fromTo("#presenter-word-${i}-${j}",{opacity:0,y:18},{opacity:1,y:0,duration:.28,ease:"power2.out"},${enterAt+Math.min(j*.06,.24)});`);
        textMotion.push(`tl.to("#presenter-word-${i}-${j}",{color:"#1766A6",duration:.16},${word.start});`);
      });
      textMotion.push(`tl.to("#presenter-title-${i}",{opacity:0,duration:.25,ease:"power1.inOut"},${Math.max(enterAt+.55,titleEnd-.25)});`);
    } else if (shot.overlay) nodes.push(`<div id="title-${i}" class="clip title ${shot.strike ? "struck" : ""}" data-start="${start}" data-duration="${end - start}" data-track-index="10">${escapeHtml(shot.overlay)}</div>`);
    // A static preview intentionally uses no invented image motion.
    return { shot: shot.index, start, end, hasEndFrame: Boolean(shot.endScene), media: asset ?? null };
  });
  const captions = captionGroups(timing).filter(cap => {
    const shot = board.shots.find(s => s.index === cap.phrase);
    return shot?.visualMode !== "presenter-text" || normalizedText(shot.overlay ?? "") !== normalizedText(shot.narration);
  });
  for (const [i, cap] of captions.entries()) {
    nodes.push(`<div id="caption-${i}" class="clip caption" data-start="${cap.start}" data-duration="${cap.end - cap.start}" data-track-index="20">${escapeHtml(cap.text)}</div>`);
  }
  nodes.push(`<audio id="voice" src="${options.audio?.voiceFile ?? "assets/narration.wav"}" data-start="0" data-duration="${timing.duration}" data-volume="${options.audio?.gain ?? 1}" data-track-index="30"></audio>`);
  if (options.audio) nodes.push(`<audio id="music-bed" src="${options.audio.bedFile}" data-start="0" data-duration="${duration}" data-volume="${options.audio.gain}" data-track-index="31"></audio>`);
  if (ending) nodes.push(ending.html);
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>CAM clay preview</title><script src="assets/gsap.min.js"></script><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#FFF4DC;color:#3B2416;font-family:sans-serif}
#root{position:relative;width:100%;height:100%;overflow:hidden;background:#FFF4DC}
.clip{position:absolute}.scene{inset:0;z-index:1}.title{z-index:10}.caption{z-index:20}.placeholder{position:absolute;left:${left}px;top:${h * 0.34}px;width:${safeWidth}px;height:${h * 0.26}px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px}
.imported{width:100%;height:100%;object-fit:contain}
.book{width:${Math.min(270,w * .2)}px;height:${h * .12}px;border:8px solid #3B2416;border-radius:16px;background:#F2B632;box-shadow:14px 14px 0 #E2CBA8;position:relative}
.book:after{content:"";position:absolute;top:0;bottom:0;left:50%;border-left:6px solid #3B2416}
.shot-number{font-size:34px;font-weight:800;margin:0}.notice{font-size:24px;letter-spacing:3px;margin:0}
.title{left:${left}px;top:${h * .15}px;width:${safeWidth}px;padding:14px 24px;border-radius:18px;background:#FFF4DC;color:#3B2416;font-size:${Math.min(72,w * .061)}px;font-weight:900;line-height:1.12;text-align:center;text-wrap:balance;overflow-wrap:anywhere}
.struck{text-decoration:line-through;text-decoration-color:#BC291F;text-decoration-thickness:9px}
.presenter-title{z-index:10;left:${left}px;top:${h*.12}px;width:${safeWidth}px;padding:18px 22px;color:#3B2416;background:rgba(255,244,220,.96);border-radius:20px;font-size:${Math.min(78,w*.067)}px;font-weight:900;line-height:1.16;text-align:center;text-wrap:balance;overflow-wrap:anywhere;text-transform:uppercase}
.presenter-title span{display:inline-block;max-width:100%}
.caption{left:${left}px;top:${captionTop}px;width:${safeWidth}px;padding:14px 24px;background:#3B2416;color:#FFF4DC;border-radius:18px;font-size:${fontSize}px;font-weight:700;line-height:1.25;text-align:center;text-wrap:balance;overflow-wrap:anywhere}
</style></head><body><div id="root" data-composition-id="main" data-width="${w}" data-height="${h}" data-start="0" data-duration="${duration}">${nodes.join("\n")}</div>
<script>const tl=gsap.timeline({paused:true});${textMotion.join("")}${ending?.motion ?? ""}tl.to({}, {duration:${duration}},0);window.__timelines["main"]=tl;</script></body></html>`;
  await writeFile(path.join(root, "index.html"), html);
  await writeFile(path.join(root, "cues.json"), JSON.stringify({ duration, narrationDuration: timing.duration, brandEnding: ending?.cue ?? null, montageOptions: options, shots: cues, captions, safeArea: { x: left, y: Math.round(h * .12), width: safeWidth, bottom: Math.floor(h * .78) } }, null, 2));
  return { cues, captions, duration, brandEnding: ending?.cue ?? null, width: w, height: h };
}
