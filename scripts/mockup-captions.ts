/**
 * Caption library demo: plans the blocks of a whole script (mock timings),
 * renders one segment per block (karaoke progressing) and a contact sheet of
 * mid-block frames. Local render, no API cost.
 *   pnpm tsx scripts/mockup-captions.ts [aspect] [scriptFile]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeZones } from "../src/lib/collage/layouts";
import { captionsCss, maxCharsFor, planCaptions, renderCaptions } from "../src/lib/collage/captions";
import type { AspectRatio } from "../src/lib/recipes";

const exec = promisify(execFile);
const aspect = (process.argv[2] ?? "9:16") as AspectRatio;
const scriptFile = process.argv[3] ?? path.join(process.cwd(), "storage", "script-eyal.txt");
const SEG = 1.4;

async function main() {
  const zones = safeZones(aspect);
  const { W, H } = zones;
  const fontPx = Math.round(W * (aspect === "16:9" ? 0.026 : 0.046));
  const maxChars = maxCharsFor(zones.caption.w, fontPx);
  const script = (await readFile(scriptFile, "utf8")).trim();
  // Mock voice: 0.36 s per word, one shot for the whole script.
  const words = script.split(/\s+/);
  const timings = words.map((w, i) => ({ word: w, start: i * 0.36, end: i * 0.36 + 0.3 }));
  const plan = planCaptions(script, timings, words.length * 0.36, maxChars);
  console.log(`font ${fontPx}px, max ${maxChars} chars/line, ${plan.blocks.length} blocks`);
  for (const b of plan.blocks) console.log(` - ${b.lines.map((l) => l.map((w) => w.text).join(" ")).join(" / ")}${b.continues ? " …" : ""}`);

  // Re-time each block to its own segment for the demo (karaoke sweeps across the segment).
  const dom: string[] = [];
  const tl: string[] = [];
  plan.blocks.forEach((b, i) => {
    const start = i * SEG;
    const n = b.words.length;
    const demo = { blocks: [{ ...b, start: 0, end: SEG - 0.05, words: b.words.map((w, wi) => ({ ...w, start: 0.1 + (wi / n) * (SEG - 0.4), end: 0 })) }] };
    // Lines share the same word objects: rebuild them with the re-timed words.
    let k = 0;
    demo.blocks[0].lines = b.lines.map((l) => l.map(() => demo.blocks[0].words[k++]));
    const r = renderCaptions(demo, `b${i}`, start, { base: "#8a8178", active: "#141414" });
    dom.push(`<div id="seg${i}" class="seg"><div class="paper"></div><p class="label">block ${i + 1}/${plan.blocks.length} · ${b.lines.length} line${b.lines.length > 1 ? "s" : ""} · ${b.lines.map((l) => l.reduce((a, w) => a + w.text.length + 1, -1)).join("+")} chars${b.continues ? " · continues" : ""}</p>${r.html}</div>`);
    tl.push(`tl.set("#seg${i}", { autoAlpha: 1 }, ${start.toFixed(3)});`, `tl.set("#seg${i}", { autoAlpha: 0 }, ${(start + SEG).toFixed(3)});`, ...r.lines);
  });
  const total = (plan.blocks.length * SEG + 0.2).toFixed(2);
  const dir = path.join(process.cwd(), "storage", "mockups", `captions-${aspect.replace(":", "x")}`);
  await mkdir(dir, { recursive: true });
  const html = `<!doctype html><html><head><meta charset="UTF-8" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
body{margin:0;background:#000}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#000}
.clip{position:absolute;inset:0}
.seg{position:absolute;inset:0;opacity:0;visibility:hidden}
.paper{position:absolute;inset:0;background-color:#f3ead8;background-image:radial-gradient(circle at 20% 30%, rgba(120,90,40,0.06) 0, transparent 40%),radial-gradient(circle at 80% 70%, rgba(120,90,40,0.05) 0, transparent 45%);}
.label{position:absolute;left:${zones.wordBand.x}px;top:${zones.wordBand.y}px;width:${zones.wordBand.w}px;margin:0;font-family:"JetBrains Mono",Menlo,monospace;font-size:${Math.round(W * 0.03)}px;color:#777}
.zone{position:absolute;border:2px dashed rgba(0,0,0,0.12);box-sizing:border-box}
${captionsCss(zones.caption, fontPx, "#8a8178")}
</style></head><body>
<div id="root" data-composition-id="c" data-start="0" data-width="${W}" data-height="${H}" data-duration="${total}" data-fps="30">
<section id="film" class="clip" data-start="0" data-duration="${total}" data-track-index="1" data-layout-allow-overflow>
<div class="zone" style="left:${zones.caption.x}px;top:${zones.caption.y}px;width:${zones.caption.w}px;height:${zones.caption.h}px"></div>
${dom.join("\n")}
</section></div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
${tl.join("\n")}
window.__timelines["c"]=tl;</script>
</body></html>`;
  await writeFile(path.join(dir, "index.html"), html, "utf8");
  const out = path.join(dir, "captions.mp4");
  const env = { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}` };
  await exec("npx", ["--yes", "hyperframes", "render", "--quality", "high", "--output", out], { cwd: dir, env, maxBuffer: 16 * 1024 * 1024, timeout: 20 * 60_000 });
  // Contact sheet: one frame per block at 60% of the segment, cropped to the lower half.
  const fdir = path.join(dir, "frames");
  await mkdir(fdir, { recursive: true });
  for (let i = 0; i < plan.blocks.length; i++) {
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-ss", (i * SEG + SEG * 0.6).toFixed(2), "-i", out, "-frames:v", "1", "-vf", `crop=${W}:${Math.round(H * 0.45)}:0:${Math.round(H * 0.4)},scale=-1:300`, path.join(fdir, `f${String(i).padStart(2, "0")}.jpg`)]);
  }
  const frames = (await readdir(fdir)).filter((f) => f.startsWith("f")).sort();
  const cols = 4, rows = Math.ceil(frames.length / cols);
  const sheet = path.join(dir, "planche-sous-titres.jpg");
  await exec("ffmpeg", ["-y", "-loglevel", "error", "-pattern_type", "glob", "-i", path.join(fdir, "f*.jpg"), "-filter_complex", `tile=${cols}x${rows}:padding=6:color=white`, sheet]);
  console.log("clip:", out, "\nsheet:", sheet);
}

main().catch((e) => { console.error(e); process.exit(1); });
