import { copyFile } from "node:fs/promises";
import path from "node:path";
import { lockedAssets } from "./assets";

export const CAM_ENDING_SECONDS = 3;

/** The original CAM mark, composited locally after speech, with a readable hold. */
export async function brandEnding(root: string, voiceDuration: number, width: number, height: number) {
  const logo = (await lockedAssets()).find((asset) => asset.id === "logo")!;
  const file = "assets/cam-logo.png";
  await copyFile(logo.filePath, path.join(root, file));
  const start = Math.max(0, voiceDuration - .35), end = voiceDuration + CAM_ENDING_SECONDS;
  const logoWidth = Math.min(960, Math.round(width * .76));
  const logoHeight = logoWidth * 630 / 1200;
  const left = Math.round(width * .48 - logoWidth / 2), top = Math.round(height * .46 - logoHeight / 2);
  const html = `<div id="cam-ending" class="clip" data-start="${start}" data-duration="${end - start}" data-track-index="5" style="inset:0;z-index:5">
<div id="cam-ending-background" style="position:absolute;inset:0;background:#F1E9DC"></div>
<div id="cam-ending-mark" style="position:absolute;left:${left}px;top:${top}px;width:${logoWidth}px;height:${logoHeight}px;mix-blend-mode:multiply">
<img src="${file}" alt="Combat Antisemitism Movement" style="display:block;width:100%;height:100%;object-fit:contain">
<div id="cam-ending-rule" style="position:absolute;left:0;top:${logoHeight + 22}px;width:100%;height:2px;background:#203C6D;transform-origin:left center"></div>
</div></div>`;
  const motion = `tl.fromTo("#cam-ending-background",{opacity:0},{opacity:1,duration:${voiceDuration - start},ease:"sine.inOut"},${start});
tl.fromTo("#cam-ending-mark",{opacity:0,y:18},{opacity:1,y:0,duration:.7,ease:"power2.out"},${voiceDuration + .1});
tl.fromTo("#cam-ending-rule",{scaleX:0},{scaleX:1,duration:.55,ease:"power2.inOut"},${voiceDuration + .6});`;
  return { html, motion, cue: { version: 1, start, voiceEnd: voiceDuration, end, addedSeconds: CAM_ENDING_SECONDS, file, sha256: logo.sha256 } };
}
