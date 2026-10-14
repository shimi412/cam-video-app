import { copyFile } from "node:fs/promises";
import path from "node:path";
import { lockedAssets } from "./assets";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const CAM_ENDING_SECONDS = 3;

/** The original CAM mark, composited locally after speech, with a readable hold. */
export async function brandEnding(root: string, voiceDuration: number, width: number, height: number, options: { start?: number; end?: number; variant?: "cream" | "last-frame" } = {}) {
  const logo = (await lockedAssets()).find((asset) => asset.id === "logo")!;
  const file = "assets/cam-logo.png";
  await copyFile(logo.filePath, path.join(root, file));
  const start = options.start ?? voiceDuration + .8, end = options.end ?? start + 2.6;
  const logoWidth = Math.min(960, Math.round(width * .76));
  const logoHeight = logoWidth * 630 / 1200;
  const left = Math.round(width * .48 - logoWidth / 2), top = Math.round(height * .46 - logoHeight / 2);
  let texture = "";
  if (options.variant !== "last-frame") {
    const scene = path.join(root, "assets/scene-1.mp4");
    try { await access(scene); texture = "assets/ending-texture.png"; } catch { /* Text-only previews have no scene texture. */ }
    if (texture) await promisify(execFile)("ffmpeg", ["-y", "-v", "error", "-i", scene, "-frames:v", "1", "-vf", `crop=iw*.08:ih*.12:0:ih*.84,scale=${width}:${height},boxblur=20`, path.join(root, texture)]);
  }
  // The three polygons are the original October CAM vector geometry. The
  // lettering is clipped from the pinned original logo, never re-typeset.
  const mark = options.variant === "last-frame" ? `<img src="${file}" alt="Combat Antisemitism Movement" style="display:block;width:100%;height:100%;object-fit:contain">`
    : `<svg viewBox="0 0 1200 630" width="100%" height="100%" role="img" aria-label="Combat Antisemitism Movement"><defs><clipPath id="cam-lettering-clip"><rect x="530" y="0" width="670" height="630"/></clipPath></defs>
<polygon id="cam-piece-0" fill="#203C6D" points="242.5,95 325.3,238.5 280.6,238.5 242.5,172.5 204.4,238.5 95,238.5 72.5,199.5 182.2,199.5"/>
<polygon id="cam-piece-1" fill="#4084C5" points="391.3,239.5 436.3,239.5 381.6,334.8 441.4,439 276,439 298.5,400.5 374.2,400.5 336.3,334.8"/>
<polygon id="cam-piece-2" fill="#4B9FDF" points="126.3,295 149.3,334.9 111.8,400 186.5,400 241.3,494.9 218.6,533.8 164.4,439.5 42.9,439.5"/>
<image id="cam-lettering" href="${file}" width="1200" height="630" clip-path="url(#cam-lettering-clip)"/></svg>`;
  const html = `<div id="cam-ending" class="clip" data-start="${start}" data-duration="${end - start}" data-track-index="5" style="inset:0;z-index:5">
<div id="cam-ending-background" style="position:absolute;inset:0;background:${options.variant === "last-frame" ? "rgba(241,233,220,.88);backdrop-filter:blur(22px)" : "#F1E9DC"}">${texture ? `<img src="${texture}" alt="" style="width:100%;height:100%;object-fit:cover;opacity:.16">` : ""}</div>
<div id="cam-ending-mark" style="position:absolute;left:${left}px;top:${top}px;width:${logoWidth}px;height:${logoHeight}px;mix-blend-mode:multiply">
${mark}
<div id="cam-ending-rule" style="position:absolute;left:0;top:${logoHeight + 22}px;width:100%;height:2px;background:#203C6D;transform-origin:left center"></div>
</div></div>`;
  const motion = `tl.fromTo("#cam-ending-background",{opacity:0},{opacity:1,duration:.55,ease:"sine.inOut"},${start});
tl.fromTo("#cam-ending-mark",{opacity:0,y:12,scale:1.025},{opacity:1,y:0,scale:1,duration:.7,ease:"sine.out"},${start + .25});
tl.fromTo("#cam-ending-rule",{scaleX:0},{scaleX:1,duration:.55,ease:"power2.inOut"},${start + .8});
${options.variant === "last-frame" ? "" : [0, 1, 2].map((i) => `tl.fromTo("#cam-piece-${i}",{opacity:0,x:${i === 1 ? 12 : i === 2 ? -12 : 0},y:${i === 0 ? -14 : 7},scale:1.03,transformOrigin:"50% 50%"},{opacity:1,x:0,y:0,scale:1,duration:.65,ease:"sine.out"},${start + .28 + i * .09});`).join("\n")}`;
  return { html, motion, cue: { version: 2, variant: options.variant ?? "cream", start, voiceEnd: voiceDuration, end, addedSeconds: end - voiceDuration, file, sha256: logo.sha256 } };
}
