import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import manifest from "./demo/manifest.json";
import { DEMO_DURATION, demoTiming } from "./existing";
import { escapeHtml, type Caption } from "./montage";
import { normalizedText } from "./text";

// The final October edit has 12 pictures over 14 spoken phrases (9-11 share a shot).
const edit = [
  [1, 0, false], [2, .4, false], [3, .2, true], [4, .3, false],
  [5, .8, false], [6, .2, false], [7, .3, false], [8, .1, false],
  [9, .3, false], [12, .2, false], [13, 0, true], [14, 0, false],
] as const;

export function existingShots() {
  return edit.map(([phrase, mediaStart, whole], i) => {
    const start = i === 0 ? 0 : demoTiming.phrases[phrase - 1].start;
    const end = i + 1 < edit.length ? demoTiming.phrases[edit[i + 1][0] - 1].start : DEMO_DURATION;
    const file = `assets/clips/case-${String(i + 1).padStart(2, "0")}.mp4`;
    const asset = manifest.assets.find((a) => a.file === file)!;
    const available = asset.duration! - mediaStart - .05;
    // Floor the rate so the last rendered frame is always inside the source.
    const rate = whole || available < end - start ? Math.floor(available / (end - start) * 1000) / 1000 : 1;
    if (rate < .5 || rate > 2) throw new Error(`Shot ${i + 1} cannot fit its voice without excessive speed change.`);
    return { shot: i + 1, phrase, start, end, file, mediaStart, rate, sourceDuration: asset.duration! };
  });
}

const groups = [
  '“The Talmud permits pedophilia.”', "Let's talk about this lie.",
  "First, it doesn't.", "This claim is a fabrication.", "And it's a dangerous one.",
  "It is one of the oldest anti-Semitic tropes.", "Here's how the lie works.",
  "Anti-Semites take a handful of lines", "from a 1,500-year-old legal text,",
  "strip them of context, mistranslate them,", "and twist their meaning",
  "to construct something they were never saying.", "This isn't new. It's the same blood libel",
  "that's been used to justify pogroms,", "and massacres for centuries.",
  "Accused Jews of harming children,", "then use that accusation as license for violence.",
  "So when you see this claim,", "know exactly what it is.",
  "A lie with a long, ugly history", "being repackaged for a new audience.",
  "Don't platform it.", "Don't debate it like it's a legitimate question.", "Expose it.",
];

export function existingCaptions(): Caption[] {
  let cursor = 0;
  const captions = groups.map((text) => {
    const count = text.split(/\s+/).length;
    const words = demoTiming.words.slice(cursor, cursor + count);
    if (normalizedText(words.map((w) => w.word).join(" ")) !== normalizedText(text)) throw new Error("Caption does not match the existing narration.");
    cursor += count;
    const start = words[0].start;
    const end = Math.min(demoTiming.words[cursor]?.start ?? demoTiming.duration, words.at(-1)!.end + .35);
    const phrase = demoTiming.phrases.findLast((p) => p.start <= start + .002)!.phrase;
    return { text, start, end, phrase };
  });
  if (cursor !== demoTiming.words.length) throw new Error("Some spoken words have no caption.");
  return captions;
}

/** Positions inherited from the reviewed edit; every spoken word is now captioned. */
export function existingCaptionPosition(shot: number) {
  const positions: Record<number, [number, number, number, number]> = {
    1: [100, 760, 840, 50], 3: [100, 250, 840, 50], 4: [100, 290, 840, 50],
    6: [100, 600, 840, 50], 9: [100, 300, 840, 50], 10: [390, 1265, 550, 42],
    12: [100, 740, 840, 50],
  };
  const [left, top, width, fontSize] = positions[shot] ?? [100, 1330, 840, 50];
  return { left, top, width, fontSize };
}

export async function writeExistingMontage(root: string) {
  await copyFile(path.join(process.cwd(), "node_modules/gsap/dist/gsap.min.js"), path.join(root, "assets/gsap.min.js"));
  const cues = existingShots(), captions = existingCaptions();
  const nodes: string[] = [], moves: string[] = [];
  const div = (id: string, start: number, end: number, track: number, style: string, html: string) => {
    nodes.push(`<div id="${id}" class="clip" data-start="${start}" data-duration="${end - start}" data-track-index="${track}" style="position:absolute;${style}">${html}</div>`);
  };
  for (const s of cues) nodes.push(`<video id="shot-${s.shot}" class="clip" src="${s.file}" muted playsinline data-start="${s.start}" data-duration="${s.end - s.start}" data-media-start="${s.mediaStart}" data-playback-rate="${s.rate}" data-track-index="1" style="position:absolute;inset:0;width:1080px;height:1920px;object-fit:contain"></video>`);
  const s2 = cues[1];
  div("poster", s2.start, s2.end, 2, "left:600px;top:186px;width:400px;height:330px;display:flex;justify-content:center;align-items:center;mix-blend-mode:multiply", '<img src="assets/affiche-archive.png" style="height:322px;filter:sepia(.25) contrast(1.05)">');
  const title = "left:100px;width:840px;text-align:center;color:#FFF4DC;font:900 96px/.98 Mont;text-shadow:0 7px 0 #3B2416,0 12px 22px #0006;text-wrap:balance;";
  const dark = "color:#3B2416;-webkit-text-stroke:5px #FFF4DC;paint-order:stroke fill;";
  const words = demoTiming.words;
  const wordTime = (word: string, after = 0) => {
    const match = words.find((w) => w.start >= after - .002 && normalizedText(w.word) === normalizedText(word));
    if (!match) throw new Error(`Missing voice anchor: ${word}`);
    return match.start;
  };
  div("quote", words[0].start, cues[0].end, 10, `top:330px;${title}`, '“THE TALMUD<br>PERMITS PEDOPHILIA.”');
  const strike = wordTime("Let's");
  div("strike", strike, cues[0].end, 12, "left:110px;top:520px;width:820px;height:16px;background:#E5392B;border-radius:8px;transform-origin:left center", "");
  moves.push(`tl.fromTo("#strike",{scaleX:0},{scaleX:1,duration:.35,ease:"power3.inOut"},${strike})`);
  div("how", cues[4].start, cues[4].end, 10, `top:300px;${title}${dark}`, "HERE’S HOW<br>THE LIE WORKS.");
  const cross = wordTime("know", cues[9].start);
  div("cross", cross, cues[9].end, 10, "left:440px;top:230px;width:500px;height:547px", '<svg width="500" height="547" viewBox="0 0 900 820"><path d="M70 80L830 740M830 80L70 740" stroke="#E5392B" stroke-width="58" stroke-linecap="round" fill="none"/></svg>');
  const d1 = wordTime("Don't", demoTiming.phrases[13].start), d2 = wordTime("Don't", d1 + .1), d3 = wordTime("Expose", d2);
  div("outro1", d1, d2, 10, `top:330px;${title}${dark}`, "DON’T<br>PLATFORM IT.");
  div("outro2", d2, d3, 10, `top:330px;${title}${dark}`, "DON’T<br>DEBATE IT.");
  div("outro3", d3, DEMO_DURATION, 10, `top:300px;${title}font-size:150px;color:#F2B632;-webkit-text-stroke:6px #3B2416;paint-order:stroke fill`, "EXPOSE<br>IT.");
  for (const [i, cap] of captions.entries()) {
    const shot = cues.findLast((s) => s.start <= cap.start + .002)!;
    const p = existingCaptionPosition(shot.shot);
    div(`caption-${i}`, cap.start, cap.end, 20, `left:${p.left}px;top:${p.top}px;width:${p.width}px;padding:10px 18px;background:#3B2416F2;color:white;border-radius:14px;font:800 ${p.fontSize}px/1.32 Mont;text-align:center;text-wrap:balance;`, escapeHtml(cap.text));
  }
  nodes.push(`<audio id="voice" src="assets/narration.wav" data-start="0" data-duration="${demoTiming.duration}" data-volume="1" data-track-index="40"></audio>`);
  await writeFile(path.join(root, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CAM Clay · existing media</title><script src="assets/gsap.min.js"></script><style>@font-face{font-family:Mont;src:url("assets/fonts/montserrat.ttf");font-weight:100 900}*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#1d140d}#root{position:relative;width:100%;height:100%;overflow:hidden}</style></head><body><div id="root" data-composition-id="main" data-width="1080" data-height="1920" data-start="0" data-duration="${DEMO_DURATION}">${nodes.join("\n")}</div><script>const tl=gsap.timeline({paused:true});${moves.join(";\n")};tl.to("#root",{opacity:1,duration:${DEMO_DURATION},ease:"none"},0);window.__timelines["main"]=tl;</script></body></html>`);
  await writeFile(path.join(root, "cues.json"), JSON.stringify({ duration: DEMO_DURATION, shots: cues, captions, safeArea: { x: 100, y: 230, right: 940, bottom: 1498 } }, null, 2));
  return { cues, captions, width: 1080, height: 1920 };
}
