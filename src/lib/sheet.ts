/**
 * Production sheet (dry-run mode): the exact requests the pipeline WOULD
 * send to fal.ai, written down so they can be reproduced manually on
 * Higgsfield (Shimon's subscription) to judge real output quality before
 * wiring the fal.ai API.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type SheetEntry = {
  step: number;
  kind: "image" | "video" | "tts";
  /** Target model on fal.ai (what the real pipeline would call). */
  falModel: string;
  /** Equivalent on Higgsfield for manual reproduction. */
  higgsfieldEquivalent: string;
  prompt: string;
  /** Media URL of the reference/keyframe placeholder, when applicable. */
  referenceUrl?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  notes?: string;
};

export const MODEL_MAP = {
  image: {
    falModel: "fal-ai/nano-banana",
    higgsfieldEquivalent: "Nano Banana (2K)",
  },
  videoStandard: {
    falModel: "fal-ai/wan-25-preview/image-to-video",
    higgsfieldEquivalent: "Wan 2.5 (image-to-video)",
  },
  videoPremium: {
    falModel: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    higgsfieldEquivalent: "Kling 2.5 Pro (image-to-video)",
  },
  tts: {
    falModel: "fal-ai/minimax/speech-02-hd",
    higgsfieldEquivalent: "Speech / voice generation (posed English narrator)",
  },
} as const;

export function providerMode(): "mock" | "dryrun" | "fal" {
  const mode = process.env.PROVIDER_MODE;
  if (mode === "dryrun" || mode === "fal") return mode;
  // Backward compatibility with the original MOCK_MODE flag.
  return process.env.MOCK_MODE === "false" ? "fal" : "mock";
}

export function sheetToMarkdown(jobId: string, entries: SheetEntry[]): string {
  const lines: string[] = [
    `# Production sheet — job ${jobId}`,
    "",
    "Dry-run: these are the exact requests the pipeline would have sent to fal.ai.",
    "Reproduce them on Higgsfield to judge real quality, in step order.",
    "",
  ];
  for (const e of entries) {
    lines.push(
      `## Step ${e.step} — ${e.kind.toUpperCase()}`,
      "",
      `- fal.ai model: \`${e.falModel}\``,
      `- Higgsfield: ${e.higgsfieldEquivalent}`,
      ...(e.referenceUrl ? [`- Reference: ${e.referenceUrl}`] : []),
      ...(e.durationSeconds ? [`- Duration: ${e.durationSeconds}s`] : []),
      ...(e.aspectRatio ? [`- Aspect ratio: ${e.aspectRatio}`] : []),
      ...(e.notes ? [`- Notes: ${e.notes}`] : []),
      "",
      "```",
      e.prompt,
      "```",
      "",
    );
  }
  return lines.join("\n");
}

export async function saveSheet(jobId: string, entries: SheetEntry[]): Promise<string> {
  const dir = path.join(process.cwd(), "storage", "sheets");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${jobId}.json`), JSON.stringify(entries, null, 2), "utf8");
  const mdPath = path.join(dir, `${jobId}.md`);
  await writeFile(mdPath, sheetToMarkdown(jobId, entries), "utf8");
  return `/api/media/sheets/${jobId}.md`;
}
