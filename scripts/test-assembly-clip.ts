/**
 * Test of the "build-on assembly" animation (Google Doc, 2026-09-09) on one
 * collage frame: (1) empty background plate via Nano Banana Pro edit of the
 * frame, (2) Seedance 2.0 Fast image-to-video with start = plate, end = frame,
 * 5 s, 720p, 9:16, paper ASMR audio. Real fal.ai spend: ~$0.15 + ~$1.21.
 *   pnpm tsx --env-file=.env scripts/test-assembly-clip.ts [frame.jpg]
 */
import { fal } from "@fal-ai/client";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);
const OUT = path.join(process.cwd(), "storage", "tests", "collage-frames");
const frame = process.argv[2] ?? path.join(OUT, "02-handful-of-lines.jpg");
const slug = path.basename(frame, ".jpg");

const PLATE_PROMPT =
  "Edit this image: remove every foreground element (the book, the scissors, the paper slivers, the pins, the red string, the tape, the typewriter strip, the torn manila strip at the bottom) and leave ONLY the empty background plate exactly as it is: the same aged tan archival paper, the same bleached-newsprint scrap and stamp marks, same lighting, same grain, same framing, same colors. Fill the uncovered areas with matching aged paper texture. No objects, no text, no new elements. The result is the same table surface, empty, ready for the collage to be assembled on it.";

const ANIMATION_PROMPT = `Transform the provided images into a 5-second premium editorial documentary paper-collage animation. The FIRST image is the empty background plate. The LAST image is the FINISHED frame that the animation builds toward. Preserve the final composition of the last image exactly. Do not redesign, reposition, resize, or replace any element.

Style: hand-cut documentary paper collage in motion. Aged newsprint and archival surfaces, halftone photo cutouts, torn edges, tape, stamps, red string, typewriter strips. Every element moves as a rigid physical paper piece. Visible cutout thickness, print grain, soft layered shadows. Stop-motion cadence, stepped easing, 2-3 frame holds, the hand-made "cutting on twos" feel. Never smooth CGI motion.

CAMERA, STRICT: the camera stays completely locked for the entire clip. No zoom, no pan, no tilt, no rotation, no orbit, no dolly, no tracking, no handheld shake, no focus pulls, no reframing, no cuts, no transitions, no morphing, no object replacement, no time skips. One continuous static shot.

0 TO 4 SECONDS, BUILD-ON ASSEMBLY: the frame opens on the EMPTY background plate only, with every story element absent. Elements then enter one by one, back to front, in narrative order: the bleached newsprint scrap settles first, then the open halftone book slides in from the top with paper drag and a small settle, the tape presses down on its corners, the scissors drop onto the lower edge of the book with a 2-frame stamp settle, the two cut paper slivers drop below and get pinned with brass pins, the red string draws itself from pin to pin down to the torn manila strip that slides in at the bottom, and the typewriter strip "1,500 YEARS" slaps on last. Each entrance lands with a tiny handcrafted bounce and casts a real layered shadow. No element moves again after it lands. By 4 seconds the frame exactly matches the last image.

4 TO 5 SECONDS, LIVING PAPER POSTER: everything holds position. Only subtle life remains: paper corners lift a millimeter in a draft, halftone dots shimmer faintly, string tension quivers once, shadows breathe. Nothing changes location, nothing scales, nothing rotates significantly, nothing enters or exits.

AUDIO: no music, no narration, no voices. Only close-up paper ASMR and faint room tone: paper sliding, cardstock taps, tape press, scissors clink, pin click, string zip, stamp thud. All subtle.

No text appears anywhere except the existing typewriter strip of the last image. No faces, no people. The finished clip must feel like a real editorial paper collage assembling itself on a table, then holding as a living poster, matching the last image exactly from 4 seconds to the end.`;

async function upload(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const file = new File([buffer], path.basename(filePath), { type: "image/jpeg" });
  return fal.storage.upload(file);
}

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY missing");
  fal.config({ credentials: key });
  await mkdir(OUT, { recursive: true });
  const frameUrl = await upload(frame);

  // 1. Empty plate.
  console.log("plate: generating…");
  const plateRes = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
    input: { prompt: PLATE_PROMPT, image_urls: [frameUrl], aspect_ratio: "9:16", resolution: "2K", output_format: "jpeg", num_images: 1 },
  });
  const plateUrl = (plateRes.data as { images: Array<{ url: string }> }).images[0].url;
  const platePath = path.join(OUT, `${slug}-plate.jpg`);
  await download(plateUrl, platePath);
  console.log("plate:", platePath, "($0.15)");

  // 2. Assembly clip, start = plate, end = frame.
  console.log("clip: generating (Seedance 2.0 Fast, 5 s, 720p)…");
  const t0 = Date.now();
  const clipRes = await fal.subscribe("bytedance/seedance-2.0/fast/image-to-video", {
    input: {
      prompt: ANIMATION_PROMPT,
      image_url: plateUrl,
      end_image_url: frameUrl,
      duration: "5",
      resolution: "720p",
      aspect_ratio: "9:16",
      generate_audio: true,
    },
    logs: true,
    onQueueUpdate: (u) => { if (u.status === "IN_PROGRESS") u.logs?.forEach((l) => console.log("  ", l.message)); },
  });
  const videoUrl = (clipRes.data as { video: { url: string } }).video.url;
  const clipPath = path.join(OUT, `${slug}-assembly.mp4`);
  await download(videoUrl, clipPath);
  console.log(`clip: ${clipPath} (~$1.21, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  await writeFile(path.join(OUT, `${slug}-assembly.prompt.txt`), `${PLATE_PROMPT}\n\n----\n\n${ANIMATION_PROMPT}\n`, "utf8");
  await exec("cp", [clipPath, path.join(process.env.HOME!, "Desktop", "CAM - test assemblage collage (Seedance).mp4")]);
  await exec("cp", [platePath, path.join(process.env.HOME!, "Desktop", "CAM - test assemblage plaque vide.jpg")]);
}

main().catch((e) => { console.error(e); process.exit(1); });
