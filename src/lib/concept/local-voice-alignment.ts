import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { alignVoice, alignmentHash, scriptHash, type VoiceAlignment } from "./voice-alignment";
import { sha256, readCheckpoint, saveCheckpoint } from "./checkpoints";
import type { AudioAsset } from "./media-transfers";

const exec = promisify(execFile);
const LocalTranscript = z.object({ transcription: z.array(z.object({
  text: z.string(), offsets: z.object({ from: z.number().nonnegative(), to: z.number().nonnegative() }),
})).min(1) });
const Receipt = z.object({ version: z.literal(1), key: z.string(), model: z.string(), result: LocalTranscript });
export type AlignmentRecoveryInput = {
  phrases: string[]; audio: AudioAsset; file: string; original: VoiceAlignment;
  directory: string; assertOwned: () => Promise<void>;
};

export function localWordAlignment(result: unknown, original: VoiceAlignment): VoiceAlignment {
  const parsed = LocalTranscript.parse(result);
  const words = parsed.transcription.filter(t => t.text.trim()).map(t => {
    if (t.text.trim().split(/\s+/).length !== 1) throw new Error("Local word-level timestamps are required.");
    return { word: t.text.trim(), start: t.offsets.from / 1000, end: t.offsets.to / 1000 };
  });
  return { ...original, source: "local-whisper", requestId: `local:${sha256(JSON.stringify(parsed))}`, words };
}

/** One local, unprompted transcription of the saved audio. No network, model
 * download, voice regeneration, script rewriting or fabricated word timings.
 * Cache raw evidence even on mismatch so Continue cannot repeatedly retry it.
 */
export async function recoverLocalVoiceAlignment(input: AlignmentRecoveryInput): Promise<VoiceAlignment> {
  await input.assertOwned();
  if (input.original.source !== "fal-whisper" || input.original.audioSha256 !== input.audio.sha256 || input.original.scriptSha256 !== scriptHash(input.phrases))
    throw new Error("Local alignment recovery requires the original recording and script.");
  if (sha256(await readFile(input.file)) !== input.audio.sha256) throw new Error("Saved recording changed before local alignment.");
  const key = sha256(JSON.stringify({ version: 1, original: alignmentHash(input.original), audio: input.audio.sha256 }));
  const directory = path.join(input.directory, "alignment-recovery", key), receiptFile = path.join(directory, "receipt.json");
  let receipt = await readCheckpoint(receiptFile, Receipt);
  if (!receipt) {
    const model = process.env.CAM_ALIGNMENT_WHISPER_MODEL ?? path.join(os.homedir(), ".cache/hyperframes/whisper/models/ggml-medium.bin");
    const binary = process.env.CAM_ALIGNMENT_WHISPER_BIN ?? path.join(os.homedir(), ".local/bin/whisper-cli");
    try {
      await access(model); await access(binary);
      await mkdir(directory, { recursive: true });
      const wav = path.join(directory, "voice-16k.wav"), output = path.join(directory, "transcript");
      try {
        await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", input.file, "-ac", "1", "-ar", "16000", wav], { timeout: 60_000 });
        await exec(binary, ["-m", model, "-l", "en", "-f", wav, "-ml", "1", "-sow", "-oj", "-of", output, "-np"], { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
        const result = LocalTranscript.parse(JSON.parse(await readFile(`${output}.json`, "utf8")));
        receipt = { version: 1, key, model: path.basename(model), result };
        await saveCheckpoint(receiptFile, receipt, input.assertOwned);
      } finally { await rm(wav, { force: true }); }
    } catch (cause) {
      throw new Error("Local narration check could not complete. The saved recording needs support review; no new voice was generated.", { cause });
    }
  }
  if (receipt.key !== key) throw new Error("Local alignment receipt belongs to another recording.");
  await input.assertOwned();
  if (sha256(await readFile(input.file)) !== input.audio.sha256) throw new Error("Saved recording changed during local alignment.");
  const alignment = localWordAlignment(receipt.result, input.original);
  try { alignVoice(input.phrases, input.audio, alignment, "live"); }
  catch (cause) { throw new Error("Narration still differs from the script after the local check. The saved recording needs support review; no new voice was generated.", { cause }); }
  return alignment;
}
