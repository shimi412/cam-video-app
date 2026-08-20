/**
 * Renders one static mockup per composition layout (9:16 by default) with real
 * cut-outs already in storage/cutouts, safe-zone guides, a handwritten word and
 * a caption. Output: a contact sheet to validate the composition library.
 *   pnpm tsx scripts/mockup-layouts.ts [aspect] [outDir]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { LAYOUTS, layoutRoles, placeRole, safeZones, wordAnchor } from "../src/lib/collage/layouts";
import { trimCutout } from "../src/lib/collage/assets";
import { PLATE_PLACEMENTS, PLATE_TYPES, placePlate } from "../src/lib/collage/backgrounds";
import { TEXT_STYLES, keywordStrokeSelectors, renderKeyword, textStylesCss } from "../src/lib/collage/textstyles";
import type { AspectRatio } from "../src/lib/recipes";

const exec = promisify(execFile);
const aspect = (process.argv[2] ?? "9:16") as AspectRatio;
const outDir = process.argv[3] ?? path.join(process.cwd(), "storage", "mockups", aspect.replace(":", "x"));
const WORDS = ["LIE", "TALMUD", "1,500 YEARS", "BLOOD LIBEL", "EXPOSE IT", "FABRICATION", "NOT NEW", "CENTURIES", "TWISTED", "KNOW IT"];
const CAPTION = "Here's how the lie works: antisemites take a handful of lines from a 1,500-year-old legal text.";

async function realCutouts(): Promise<string[]> {
  const dir = path.join(process.cwd(), "storage", "cutouts");
  const files = await readdir(dir);
  const real: string[] = [];
  for (const f of files) {
    if (!f.endsWith(".png")) continue;
    const s = await stat(path.join(dir, f));
    if (s.size > 200_000 && !f.endsWith("-trim.png")) real.push(path.join(dir, f)); // mock placeholders are tiny
  }
  return real;
}

async function main() {
  const zones = safeZones(aspect);
  const { W, H } = zones;
  const cutouts = await realCutouts();
  if (cutouts.length < 3) throw new Error("Need at least 3 real cut-outs in storage/cutouts");
  await mkdir(outDir, { recursive: true });
  const frames: string[] = [];
  let ci = 0;

  for (const [li, layout] of LAYOUTS.entries()) {
    const dir = path.join(outDir, layout);
    await mkdir(path.join(dir, "assets"), { recursive: true });
    const roles = layoutRoles(layout);
    const imgs: string[] = [];
    let hero = placeRole(layout, "hero", zones)!;
    for (const role of roles) {
      const trimmed = await trimCutout(cutouts[ci++ % cutouts.length]);
      const box = placeRole(layout, role, zones, trimmed.ratio)!;
      if (role === "hero") hero = box;
      const file = trimmed.filePath;
      const name = path.basename(file);
      await copyFile(file, path.join(dir, "assets", name));
      imgs.push(
        `<img class="el" src="assets/${name}" style="left:${box.x.toFixed(0)}px;top:${box.y.toFixed(0)}px;width:${box.w.toFixed(0)}px;height:${box.h.toFixed(0)}px;transform:rotate(${box.rotation}deg)" alt="" />`,
      );
    }
    const fs = Math.round(W * 0.085);
    const wa = wordAnchor(layout, hero, zones, fs, 0);
    const word = WORDS[li % WORDS.length];
    const style = TEXT_STYLES[li % TEXT_STYLES.length];
    const probe = renderKeyword({ id: "kw0", text: word, style, fontPx: fs, seed: li * 7 + 3, accent: "#d83b1f", ink: "#1a1a1a", secondary: "#3f7f8c" });
    const kwLeft = wa.align === "center" ? wa.x - probe.width / 2 : wa.align === "left" ? wa.x : wa.x - probe.width;
    const kwStyle = `left:${Math.max(16, Math.min(W - probe.width - 16, kwLeft)).toFixed(0)}px;top:${wa.y.toFixed(0)}px;`;
    const kw = renderKeyword({ id: "kw0", text: word, style, fontPx: fs, seed: li * 7 + 3, accent: "#d83b1f", ink: "#1a1a1a", secondary: "#3f7f8c", css: kwStyle });
    const kwHtml = kw.html;
    const kwTweens = kw.tweens.map((t) => t.replace(/AT \+ ([0-9.]+)/g, (_, d) => String(0.05 + Number(d))).replace(/AT/g, "0.05")).join("\n");
    const strokeSel = keywordStrokeSelectors("kw0", style);
    // Background plate: one type + one placement per mockup.
    const plateType = PLATE_TYPES[li % PLATE_TYPES.length];
    const placement = PLATE_PLACEMENTS[li % PLATE_PLACEMENTS.length];
    const plateFile = path.join(process.cwd(), "storage", "plates", `${plateType}.png`);
    const plateTrim = await trimCutout(plateFile);
    await copyFile(plateTrim.filePath, path.join(dir, "assets", path.basename(plateTrim.filePath)));
    const pb = placePlate(placement, zones, hero);
    const plateHtml = `<img class="plate" src="assets/${path.basename(plateTrim.filePath)}" style="left:${pb.x.toFixed(0)}px;top:${pb.y.toFixed(0)}px;width:${pb.w.toFixed(0)}px;height:${pb.h.toFixed(0)}px;transform:rotate(${pb.rotation}deg);opacity:${pb.opacity}" alt="" />`;
    const html = `<!doctype html><html><head><meta charset="UTF-8" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face { font-family: "Marker Felt"; src: local("Marker Felt"), local("MarkerFelt-Wide"); }
body{margin:0;background:#000}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#000}
.clip{position:absolute;inset:0}
.paper{position:absolute;inset:0;background-color:#f3ead8;background-image:radial-gradient(circle at 20% 30%, rgba(120,90,40,0.06) 0, transparent 40%),radial-gradient(circle at 80% 70%, rgba(120,90,40,0.05) 0, transparent 45%);}
.guide{position:absolute;border:2px dashed rgba(0,0,0,0.18);box-sizing:border-box}
.el{position:absolute;display:block;object-fit:contain;filter:drop-shadow(6px 10px 8px rgba(40,30,10,0.28))}
.plate{position:absolute;display:block;object-fit:fill;filter:drop-shadow(4px 8px 10px rgba(40,30,10,0.18))}
${textStylesCss("#d83b1f", "#1a1a1a", "#3f7f8c")}
.cap{position:absolute;left:${zones.caption.x.toFixed(0)}px;top:${zones.caption.y.toFixed(0)}px;width:${zones.caption.w.toFixed(0)}px;margin:0;text-align:center;font-family:Inter,"Helvetica Neue",Arial,sans-serif;font-weight:800;font-size:${Math.round(W * (aspect === "16:9" ? 0.028 : 0.05))}px;line-height:1.22;color:#141414}
.label{position:absolute;left:24px;top:24px;font-family:"JetBrains Mono",monospace;font-size:${Math.round(W * 0.03)}px;color:#777;margin:0}
</style></head><body>
<div id="root" data-composition-id="m" data-start="0" data-width="${W}" data-height="${H}" data-duration="1.3" data-fps="30">
<section id="s" class="clip" data-start="0" data-duration="1.3" data-track-index="1" data-layout-allow-overflow>
<div class="paper"></div>
${plateHtml}
<div class="guide" style="left:${zones.content.x}px;top:${zones.content.y}px;width:${zones.content.w}px;height:${zones.content.h}px"></div>
<div class="guide" style="left:${zones.wordBand.x}px;top:${zones.wordBand.y}px;width:${zones.wordBand.w}px;height:${zones.wordBand.h}px;border-color:rgba(216,59,31,0.18)"></div>
<div class="guide" style="left:${zones.caption.x}px;top:${zones.caption.y}px;width:${zones.caption.w}px;height:${zones.caption.h}px;border-color:rgba(0,0,0,0.1)"></div>
${imgs.join("\n")}
${kwHtml}
<p class="cap">${CAPTION}</p>
<p class="label">${layout} · ${style} · ${plateType}/${placement}</p>
</section></div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
${JSON.stringify(strokeSel)}.forEach((sel)=>{const el=document.querySelector(sel);const len=el?el.getTotalLength():100;gsap.set(sel,{strokeDasharray:len+" "+(len+20),strokeDashoffset:len+10});});
const draw=(sel,at,dur)=>{tl.to(sel,{strokeDashoffset:0,duration:dur,ease:"power2.inOut"},at);};
tl.to("#s",{x:0,duration:1.2},0);
${kwTweens}
window.__timelines["m"]=tl;</script>
</body></html>`;
    await writeFile(path.join(dir, "index.html"), html, "utf8");
    await exec("npx", ["--yes", "hyperframes", "snapshot", "--at", "1.1", "--output", "snap"], {
      cwd: dir,
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}` },
      maxBuffer: 16 * 1024 * 1024,
    });
    const snaps = (await readdir(path.join(dir, "snap"))).filter((f) => f.startsWith("frame-00"));
    if (snaps[0]) frames.push(path.join(dir, "snap", snaps[0]));
    console.log(`mockup ${layout}: ${snaps[0] ?? "no frame"}`);
  }

  // Contact sheet: 5 per row.
  const args: string[] = [];
  for (const f of frames) args.push("-i", f);
  const n = frames.length;
  const scale = frames.map((_, i) => `[${i}:v]scale=-1:${aspect === "16:9" ? 360 : 720}[v${i}]`).join(";");
  const rows: string[] = [];
  const perRow = 5;
  for (let r = 0; r * perRow < n; r++) {
    const idx = frames.slice(r * perRow, (r + 1) * perRow).map((_, i) => `[v${r * perRow + i}]`).join("");
    const count = Math.min(perRow, n - r * perRow);
    rows.push(`${idx}hstack=inputs=${count}[r${r}]`);
  }
  const vstack = rows.length > 1 ? `${rows.map((_, r) => `[r${r}]`).join("")}vstack=inputs=${rows.length}[out]` : `[r0]copy[out]`;
  const sheet = path.join(outDir, "planche-gabarits.jpg");
  await exec("ffmpeg", ["-y", "-loglevel", "error", ...args, "-filter_complex", `${scale};${rows.join(";")};${vstack}`, "-map", "[out]", sheet]);
  console.log("sheet:", sheet);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
