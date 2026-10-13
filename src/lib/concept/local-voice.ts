import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { LOCAL_VOICES, type PreviewVoice } from "./preview-inputs";
import { isSimulation } from "../providers/mode";
import { measuredPhraseTiming } from "./timing";
import type { ConceptTiming } from "./types";
import { captionGroups } from "./montage";
import { validateTiming } from "./controls";

const exec = promisify(execFile);
export async function availableLocalVoices(): Promise<Exclude<PreviewVoice, "silent">[]> {
  if (process.platform !== "darwin" || !isSimulation()) return [];
  try {
    const { stdout } = await exec("/usr/bin/say", ["-v", "?"], { timeout: 5000 });
    return (Object.keys(LOCAL_VOICES) as Exclude<PreviewVoice, "silent">[])
      .filter((key) => stdout.split("\n").some((line) => line.startsWith(`${LOCAL_VOICES[key].name} `)));
  } catch { return []; }
}

/** Local OS speech only. No model download, remote fallback or cloned identity. */
export async function localNarration(root: string, phrases: string[], voice: Exclude<PreviewVoice, "silent">,
  checkpoint?: { directory: string; assertOwned: () => Promise<void> }) {
  if (!isSimulation() || !(await availableLocalVoices()).includes(voice)) throw new Error("This local test voice is unavailable. Choose silent preview or an installed Mac voice.");
  // macOS interprets these as speech commands. Refuse rather than silently alter the script.
  if (phrases.some((p) => p.includes("[[") || p.includes("]]"))) throw new Error("Remove macOS speech commands ([[…]]) before using a local test voice.");
  const key = createHash("sha256").update(JSON.stringify({ version: 1, voice, name: LOCAL_VOICES[voice].name, rate: 150, phrases })).digest("hex");
  const cache = checkpoint ? path.join(checkpoint.directory, "voices", key) : null;
  if (cache) {
    try {
      const receipt = JSON.parse(await readFile(path.join(cache, "receipt.json"), "utf8")) as { timing: ConceptTiming; sha256: string };
      const wav = await readFile(path.join(cache, "narration.wav"));
      if (createHash("sha256").update(wav).digest("hex") !== receipt.sha256) throw new Error("Voice cache changed");
      validateTiming(receipt.timing, captionGroups(receipt.timing));
      if (JSON.stringify(receipt.timing.phrases.map((p) => p.text)) !== JSON.stringify(phrases)) throw new Error("Voice cache script changed");
      await writeFile(path.join(root, "assets/narration.wav"), wav);
      return receipt.timing;
    } catch { /* Missing/corrupt checkpoint: regenerate locally, never remotely. */ }
  }
  const dir = path.join(root, "voice-parts");
  await mkdir(dir, { recursive: true });
  const durations: number[] = [];
  for (const [i, phrase] of phrases.entries()) {
    const text = path.join(dir, `${i}.txt`), audio = path.join(dir, `${i}.aiff`), wav = path.join(dir, `${i}.wav`);
    await writeFile(text, phrase);
    await exec("/usr/bin/say", ["-v", LOCAL_VOICES[voice].name, "-r", "150", "-f", text, "-o", audio], { timeout: 60_000 });
    // Trim only the edges, preserving all pauses inside the spoken phrase.
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", audio, "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", wav], { timeout: 30_000 });
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], { timeout: 10_000 });
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration < .1 || duration > 45) throw new Error(`Local voice failed on scene ${i + 1}.`);
    durations.push(duration);
  }
  const timing = measuredPhraseTiming(phrases, durations);
  // Relative, generated filenames only. Exactly the same pauses as the timing model.
  for (const [file, duration] of [["lead", .4], ["gap", .35], ["tail", .65]] as const) {
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(duration), "-c:a", "pcm_s16le", path.join(dir, `${file}.wav`)], { timeout: 10_000 });
  }
  const sequence = ["lead", ...phrases.flatMap((_, i) => [String(i), "gap"]), "tail"];
  await writeFile(path.join(dir, "concat.txt"), sequence.map((name) => `file '${name}.wav'`).join("\n"));
  await exec("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "1", "-i", path.join(dir, "concat.txt"), "-c:a", "pcm_s16le", path.join(root, "assets/narration.wav")], { timeout: 30_000 });
  if (cache && checkpoint) {
    await checkpoint.assertOwned();
    await mkdir(cache, { recursive: true });
    const wav = await readFile(path.join(root, "assets/narration.wav")), suffix = randomUUID();
    const wavTemp = path.join(cache, `${suffix}.wav`), receiptTemp = path.join(cache, `${suffix}.json`);
    await writeFile(wavTemp, wav);
    await writeFile(receiptTemp, JSON.stringify({ timing, sha256: createHash("sha256").update(wav).digest("hex") }));
    await checkpoint.assertOwned();
    await rename(wavTemp, path.join(cache, "narration.wav"));
    await rename(receiptTemp, path.join(cache, "receipt.json"));
  }
  return timing;
}
