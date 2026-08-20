/**
 * Collage production (whiteboard family): score → voice + word timings →
 * cut-out elements (cached by key) → HyperFrames composition → local render.
 * Called by the runner; metering and billing stay in the runner's closures.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ProductionParams } from "../brain";
import type { Recipe } from "../recipes";
import type { MediaResult, ProviderSet } from "../providers/types";
import { directScore, type Score } from "./score";
import { renderCollage, type ShotMedia } from "./compose";
import { sanitizeScene } from "../director";

const exec = promisify(execFile);
const STORAGE = path.join(process.cwd(), "storage");

export type Fallback = { shot: number; step: string; reason: string };

export type CollageResult = {
  outputPath: string;
  durationSeconds: number;
  score: Score;
  fallbacks: Fallback[];
};

async function mediaDuration(filePath: string): Promise<number> {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath]);
  const d = Number(stdout.trim());
  return Number.isFinite(d) && d > 0 ? d : 3;
}

export async function produceCollage(opts: {
  jobId: string;
  script: string;
  params: ProductionParams;
  recipe: Recipe;
  providers: ProviderSet;
  meter: (kind: "image" | "video" | "tts" | "render", r: MediaResult) => Promise<void>;
  setStep: (key: string, status: "pending" | "running" | "done" | "failed") => Promise<void>;
  tailSeconds: number;
}): Promise<CollageResult> {
  const { jobId, script, params, recipe, providers, meter, setStep, tailSeconds } = opts;
  const fallbacks: Fallback[] = [];

  // 1. Score (director brain): sentences + visual events + elements library.
  await setStep("storyboard", "running");
  const score = await directScore(script, recipe, params);
  await setStep("storyboard", "done");

  // 2. Voice per sentence + word timestamps.
  await setStep("voice", "running");
  const voices = await Promise.all(
    score.shots.map((s) => providers.tts.synthesize({ text: s.narration, voiceId: params.voiceId, language: params.language })),
  );
  for (const v of voices) await meter("tts", v);
  const shots: ShotMedia[] = await Promise.all(
    voices.map(async (v) => {
      const [voiceSeconds, tr] = await Promise.all([
        mediaDuration(v.filePath),
        providers.transcribe.transcribe({ audioPath: v.filePath, language: params.language }).catch(() => ({ words: [], realCostUsd: 0, provider: "none", model: "none" })),
      ]);
      return { voicePath: v.filePath, voiceSeconds, words: tr.words };
    }),
  );
  await setStep("voice", "done");

  // 3. Cut-out elements, one generation per unique key; a refused prompt is rewritten, then dropped.
  await setStep("keyframes", "running");
  const cutouts: Record<string, string> = {};
  await Promise.all(
    score.elements.map(async (el) => {
      const prompt = (scene: string) => `${recipe.collage!.cutoutPrompt} Object: ${scene}`;
      try {
        const r = await providers.cutout.generateCutout({ prompt: prompt(el.prompt) });
        await meter("image", r);
        cutouts[el.key] = r.filePath;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (/content_policy|flagged|safety/i.test(reason)) {
          const rewritten = await sanitizeScene(el.prompt, recipe);
          if (rewritten) {
            try {
              const r = await providers.cutout.generateCutout({ prompt: prompt(rewritten) });
              await meter("image", r);
              cutouts[el.key] = r.filePath;
              fallbacks.push({ shot: 0, step: `element:${el.key}`, reason: "prompt rewritten after content check" });
              return;
            } catch {
              /* drop below */
            }
          }
          fallbacks.push({ shot: 0, step: `element:${el.key}`, reason: "dropped after content check" });
          return;
        }
        throw err;
      }
    }),
  );
  await setStep("keyframes", "done");

  // 4. Composition + 5. render (HyperFrames, local CPU).
  await setStep("clips", "running");
  const projectDir = path.join(STORAGE, "hf", jobId);
  const outDir = path.join(STORAGE, "outputs");
  await mkdir(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${jobId}.mp4`);
  await setStep("clips", "done");
  await setStep("montage", "running");
  const { durationSeconds } = await renderCollage(
    projectDir,
    { recipe, aspectRatio: params.aspectRatio, score, shots, cutouts, tailSeconds },
    outputPath,
  );
  await meter("render", { filePath: outputPath, realCostUsd: 0.05, provider: "hyperframes", model: "local-cpu-collage-render" });
  await setStep("montage", "done");

  return { outputPath, durationSeconds, score, fallbacks };
}
