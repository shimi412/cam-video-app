import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ConceptTiming } from "./types";
import type { Caption } from "./montage";

const exec = promisify(execFile);
export function validateTiming(timing: ConceptTiming, captions: Caption[]) {
  if (!Number.isFinite(timing.duration) || timing.duration <= 0 || timing.words.length === 0) throw new Error("Missing narration timing");
  for (const [i, w] of timing.words.entries()) {
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end <= w.start || w.end > timing.duration || (i > 0 && w.start < timing.words[i - 1].end - 0.002)) throw new Error("Invalid word timing");
  }
  if (captions.some((c) => c.end - c.start < 0.3 || c.end > timing.duration)) throw new Error("Caption flashes for less than 0.3 seconds");
}

/** One frame per shot, plus both sides of every cut, with the safe area visible. */
export async function controls(video: string, root: string, starts: number[], width: number, height: number, duration: number) {
  const dir = path.join(root, "controls");
  await mkdir(dir, { recursive: true });
  const samples = starts.map((start, i) => Math.min(duration - .1, (start + (starts[i + 1] ?? duration)) / 2));
  const boundaries = starts.slice(1).flatMap((s) => [Math.max(0,s - .04),Math.min(duration - .04,s + .04)]);
  const makeBoard = async (name: string, times: number[]) => {
    if (!times.length) return;
    const tileW = 240, tileH = Math.round(tileW * height / width);
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    for (const [i, time] of times.entries()) {
      const file = path.join(dir, `${name}-${i}.png`);
      await exec("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(time), "-i", video, "-frames:v", "1", "-vf", `scale=${tileW}:${tileH}`, file]);
      const safe = Buffer.from(`<svg width="${tileW}" height="${tileH}"><rect x="${tileW*.1}" y="${tileH*.12}" width="${tileW*.76}" height="${tileH*.66}" fill="none" stroke="#00A58C" stroke-width="2"/><rect width="110" height="22" fill="#000"/><text x="6" y="16" fill="#fff" font-size="13">${time.toFixed(2)} s</text></svg>`);
      tiles.push({ input: await sharp(file).composite([{ input: safe }]).png().toBuffer(), left: (i % 4)*tileW, top: Math.floor(i/4)*tileH });
    }
    await sharp({ create: { width: tileW * Math.min(4,times.length), height: tileH * Math.ceil(times.length/4), channels: 3, background: "#FFF4DC" } }).composite(tiles).png().toFile(path.join(dir, `${name}.png`));
  };
  await makeBoard("shots", samples);
  await makeBoard("transitions", boundaries);
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height,r_frame_rate", "-of", "json", video]);
  const probe = JSON.parse(stdout) as { format: { duration: string }; streams: { codec_name: string; width?: number; height?: number; r_frame_rate?: string }[] };
  if (!probe.streams.some((s) => s.codec_name === "h264" && s.width === width && s.height === height && s.r_frame_rate === "30/1") || !probe.streams.some((s) => s.codec_name === "aac") || Math.abs(Number(probe.format.duration)-duration)>.15) throw new Error("Video export does not match the composition");
  await writeFile(path.join(dir, "report.json"), JSON.stringify({ checked: ["dimensions", "h264", "aac", "30fps", "duration", "caption-duration", "hyperframes-layout"], estimatedTiming: true, visualApproval: false, probe }, null, 2));
}
