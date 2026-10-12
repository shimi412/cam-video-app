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
export async function controls(video: string, root: string, starts: number[], width: number, height: number, duration: number, options: { estimatedTiming?: boolean; captions?: Caption[]; requireAudibleVoice?: boolean } = {}) {
  const dir = path.join(root, "controls");
  await mkdir(dir, { recursive: true });
  const samples = starts.map((start, i) => Math.min(duration - .1, (start + (starts[i + 1] ?? duration)) / 2));
  const boundaries = starts.slice(1).flatMap((s) => [Math.max(0,s - .04),Math.min(duration - .04,s + .04)]);
  const safeArea = width === 1080 && height === 1920 ? { x: 100, y: 230, width: 840, height: 1268 } : { x: width * .1, y: height * .12, width: width * .76, height: height * .66 };
  const makeBoard = async (name: string, times: number[]) => {
    if (!times.length) return;
    const tileW = 240, tileH = Math.round(tileW * height / width);
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    for (const [i, time] of times.entries()) {
      const file = path.join(dir, `${name}-${i}.png`);
      await exec("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(time), "-i", video, "-frames:v", "1", "-vf", `scale=${tileW}:${tileH}`, file]);
      const safe = Buffer.from(`<svg width="${tileW}" height="${tileH}"><rect x="${safeArea.x * tileW / width}" y="${safeArea.y * tileH / height}" width="${safeArea.width * tileW / width}" height="${safeArea.height * tileH / height}" fill="none" stroke="#00A58C" stroke-width="2"/><rect width="110" height="22" fill="#000"/><text x="6" y="16" fill="#fff" font-size="13">${time.toFixed(2)} s</text></svg>`);
      tiles.push({ input: await sharp(file).composite([{ input: safe }]).png().toBuffer(), left: (i % 4)*tileW, top: Math.floor(i/4)*tileH });
    }
    await sharp({ create: { width: tileW * Math.min(4,times.length), height: tileH * Math.ceil(times.length/4), channels: 3, background: "#FFF4DC" } }).composite(tiles).png().toFile(path.join(dir, `${name}.png`));
  };
  await makeBoard("shots", samples);
  await makeBoard("transitions", boundaries);
  const captionBoards: string[] = [];
  for (let i = 0; i < (options.captions?.length ?? 0); i += 12) {
    const name = `captions-${1 + i / 12}`;
    await makeBoard(name, options.captions!.slice(i, i + 12).map((c) => (c.start + c.end) / 2));
    captionBoards.push(name);
  }
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height,r_frame_rate", "-of", "json", video]);
  const probe = JSON.parse(stdout) as { format: { duration: string }; streams: { codec_name: string; width?: number; height?: number; r_frame_rate?: string }[] };
  if (!probe.streams.some((s) => s.codec_name === "h264" && s.width === width && s.height === height && s.r_frame_rate === "30/1") || !probe.streams.some((s) => s.codec_name === "aac") || Math.abs(Number(probe.format.duration)-duration)>.15) throw new Error("Video export does not match the composition");
  let audio: { meanDb: number; peakDb: number } | null = null;
  if (options.requireAudibleVoice) {
    const { stderr } = await exec("ffmpeg", ["-hide_banner", "-i", video, "-vn", "-af", "volumedetect", "-f", "null", "-"]);
    const meanDb = Number(stderr.match(/mean_volume: ([\d.-]+) dB/)?.[1]);
    const peakDb = Number(stderr.match(/max_volume: ([\d.-]+) dB/)?.[1]);
    if (!Number.isFinite(meanDb) || meanDb < -45 || !Number.isFinite(peakDb)) throw new Error("Expected voice is missing or inaudible in the rendered film.");
    audio = { meanDb, peakDb };
  }
  await writeFile(path.join(dir, "report.json"), JSON.stringify({ checked: ["dimensions", "h264", "aac", "30fps", "duration", "caption-duration", "hyperframes-layout", ...(audio ? ["audible-voice"] : [])], estimatedTiming: options.estimatedTiming ?? true, visualApproval: false, captionBoards, audio, probe }, null, 2));
  return captionBoards;
}
