/**
 * Renders one demo clip of the motion library (9:16 by default): one segment
 * per preset, real cut-outs from storage/cutouts, label on top, hero-center
 * layout, paper background. Local HyperFrames render, no API cost.
 *   pnpm tsx scripts/mockup-motions.ts [aspect] [outFile]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { layoutRoles, placeRole, safeZones } from "../src/lib/collage/layouts";
import { trimCutout } from "../src/lib/collage/assets";
import { MOTIONS, compileMotion } from "../src/lib/collage/motions";
import type { AspectRatio } from "../src/lib/recipes";

const exec = promisify(execFile);
const aspect = (process.argv[2] ?? "9:16") as AspectRatio;
const outFile = process.argv[3] ?? path.join(process.cwd(), "storage", "mockups", `motions-${aspect.replace(":", "x")}.mp4`);
const SEG = 1.6;

async function realCutouts(): Promise<string[]> {
  const dir = path.join(process.cwd(), "storage", "cutouts");
  const files = await readdir(dir);
  const real: string[] = [];
  for (const f of files) {
    if (!f.endsWith(".png") || f.endsWith("-trim.png")) continue;
    const s = await stat(path.join(dir, f));
    if (s.size > 200_000) real.push(path.join(dir, f));
  }
  return real.sort();
}

async function main() {
  const zones = safeZones(aspect);
  const { W, H } = zones;
  const dir = path.join(process.cwd(), "storage", "mockups", `motions-${aspect.replace(":", "x")}`);
  await mkdir(path.join(dir, "assets"), { recursive: true });
  const cutouts = await realCutouts();
  const styles: string[] = [];
  const dom: string[] = [];
  const tl: string[] = [];
  let ci = 0;

  const nextCutout = async () => {
    const t = await trimCutout(cutouts[ci++ % cutouts.length]);
    await copyFile(t.filePath, path.join(dir, "assets", path.basename(t.filePath)));
    return t;
  };

  for (const [i, m] of MOTIONS.entries()) {
    const start = i * SEG;
    const sid = `g${i}`;
    const cam = `#${sid}-cam`;
    const layout = m.kind === "camera" ? "hero-left-support-right" : "hero-center";
    const roles = layoutRoles(layout).slice(0, m.kind === "camera" ? 2 : 1);
    const imgs: string[] = [];
    for (const role of roles) {
      const t = await nextCutout();
      const box = placeRole(layout, role, zones, t.ratio)!;
      const id = `${sid}-${role}`;
      const ctx = { W, H, rotation: box.rotation, cam };
      styles.push(`#${id}{left:${box.x.toFixed(0)}px;top:${box.y.toFixed(0)}px;width:${box.w.toFixed(0)}px;height:${box.h.toFixed(0)}px;${m.css ?? ""}}`);
      imgs.push(`<img id="${id}" class="el" src="assets/${path.basename(t.filePath)}" alt="" />`);
      if (m.kind === "enter") {
        tl.push(...compileMotion(m, `#${id}`, start + 0.25, ctx));
      } else {
        // Visible from the start of the segment, already in place.
        tl.push(`tl.set("#${id}", { opacity: 1, rotation: ${box.rotation} }, ${start.toFixed(3)});`);
        if (m.kind === "exit") tl.push(...compileMotion(m, `#${id}`, start + 0.6, ctx));
        if (m.kind === "transform") tl.push(...compileMotion(m, `#${id}`, start + 0.45, ctx));
      }
    }
    if (m.kind === "camera") {
      const at = m.dur === 0 ? start + 0.05 : start + 0.5;
      tl.push(...compileMotion(m, cam, at, { W, H, rotation: 0, cam }, SEG - 0.1));
    }
    dom.push(`<div id="${sid}" class="seg"><div class="paper"></div><div id="${sid}-cam" class="cam">${imgs.join("")}</div><p class="label">${i + 1}/${MOTIONS.length} · ${m.kind.toUpperCase()} · ${m.id}</p><p class="desc">${m.description}</p></div>`);
    tl.push(`tl.set("#${sid}", { autoAlpha: 1 }, ${start.toFixed(3)});`);
    tl.push(`tl.set("#${sid}", { autoAlpha: 0 }, ${(start + SEG).toFixed(3)});`);
  }
  const total = (MOTIONS.length * SEG + 0.2).toFixed(2);

  const html = `<!doctype html><html><head><meta charset="UTF-8" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
body{margin:0;background:#000}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#000}
.clip{position:absolute;inset:0}
.seg{position:absolute;inset:0;opacity:0;visibility:hidden}
.paper{position:absolute;inset:0;background-color:#f3ead8;background-image:radial-gradient(circle at 20% 30%, rgba(120,90,40,0.06) 0, transparent 40%),radial-gradient(circle at 80% 70%, rgba(120,90,40,0.05) 0, transparent 45%);}
.cam{position:absolute;inset:0;transform-origin:50% 42%}
.el{position:absolute;display:block;object-fit:contain;opacity:0;transform-origin:50% 50%;filter:drop-shadow(6px 10px 8px rgba(40,30,10,0.28))}
.label{position:absolute;left:${zones.wordBand.x}px;top:${zones.wordBand.y}px;width:${zones.wordBand.w}px;margin:0;font-family:"JetBrains Mono",Menlo,monospace;font-size:${Math.round(W * 0.036)}px;color:#1a1a1a;font-weight:700}
.desc{position:absolute;left:${zones.caption.x}px;top:${zones.caption.y}px;width:${zones.caption.w}px;margin:0;font-family:Inter,"Helvetica Neue",Arial,sans-serif;font-size:${Math.round(W * 0.034)}px;line-height:1.3;color:#5a534b;text-align:center}
${styles.join("\n")}
</style></head><body>
<div id="root" data-composition-id="m" data-start="0" data-width="${W}" data-height="${H}" data-duration="${total}" data-fps="30">
<section id="film" class="clip" data-start="0" data-duration="${total}" data-track-index="1" data-layout-allow-overflow>
${dom.join("\n")}
</section></div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
${tl.join("\n")}
window.__timelines["m"]=tl;</script>
</body></html>`;
  await writeFile(path.join(dir, "index.html"), html, "utf8");
  console.log(`composition: ${MOTIONS.length} presets, ${total}s → rendering…`);
  await exec("npx", ["--yes", "hyperframes", "render", "--quality", "high", "--output", outFile], {
    cwd: dir,
    env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}` },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 20 * 60_000,
  });
  console.log("clip:", outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
