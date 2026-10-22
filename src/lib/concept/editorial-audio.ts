import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ConceptBoard, ConceptTiming } from "./types";
import { shiftTiming } from "./timing";

const exec = promisify(execFile);
export const AUDIO_RATE = 48000;
const frame = .01, fadeJoin = .015;
export const db = (amplitude: number) => 20 * Math.log10(Math.max(1e-12, amplitude));
export function rms(pcm: Float32Array, start = 0, end = pcm.length) {
  let sum = 0; end = Math.min(pcm.length, end); start = Math.max(0, start);
  for (let i = start; i < end; i++) sum += pcm[i] ** 2;
  return Math.sqrt(sum / Math.max(1, end - start));
}
export async function decodeAudio(file: string) {
  const { stdout } = await exec("ffmpeg", ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(AUDIO_RATE), "-f", "f32le", "pipe:1"], { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength));
}
export async function writeWave(file: string, pcm: Float32Array) {
  // IEEE float WAV keeps quiet fades above the 16-bit quantisation floor.
  const b = Buffer.alloc(44 + pcm.length * 4);
  b.write("RIFF", 0); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(AUDIO_RATE, 24); b.writeUInt32LE(AUDIO_RATE * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34); b.write("data", 36); b.writeUInt32LE(pcm.length * 4, 40);
  for (let i = 0; i < pcm.length; i++) b.writeFloatLE(pcm[i], 44 + i * 4);
  await writeFile(file, b);
}

export type AudioOptions = { sourceTailPolicy?: "strict"|"preserve-for-review"; musicLevel?: "off"|"quiet"|"normal"; breaths?: Record<number, number>; attack?: number; minimumSceneSeconds?: Record<number, number> };
/** Preserve existing word alignment, shifting it only by measured insertions.
 * Never redistribute words by letter count: that was specific to the old script. */
export function paceRecording(pcm: Float32Array, timing: ConceptTiming, board: {shots:{breathBefore?:number}[]}, options: AudioOptions = {}) {
  const sr = AUDIO_RATE, cuts: { at: number; seconds: number; levelDb: number }[] = [];
  const preservedGaps: { phrase: number; reason: string }[] = [];
  const lead = Math.max(0, (options.attack ?? .3) - timing.words[0].start);
  if (lead) cuts.push({ at: 0, seconds: lead, levelDb: -120 });
  for (let i = 1; i < timing.phrases.length; i++) {
    const previous = timing.phrases[i - 1], next = timing.phrases[i];
    const desired = options.breaths?.[i + 1] ?? board.shots[i].breathBefore ?? .4;
    if (!Number.isFinite(desired) || desired < .25 || desired > .8) throw new Error("A breath must be between 0.25 and 0.8 seconds.");
    const minimumScene = options.minimumSceneSeconds?.[i] ?? 0;
    if (!Number.isFinite(minimumScene) || minimumScene < 0 || minimumScene > 15) throw new Error("Invalid minimum action duration.");
    // An editorial action hold is separate from a breath: extend only the
    // measured inter-phrase gap, never speed up words to fit a transformation.
    const interval = next.start - (i === 1 ? 0 : previous.start) + (i === 1 ? lead : 0);
    const extra = Math.max(0, desired - (next.start - previous.end), minimumScene - interval);
    if (extra < .005) continue;
    const lo = Math.ceil((previous.end + fadeJoin) * sr), hi = Math.floor((next.start - fadeJoin) * sr);
    let best = -1, level = Infinity;
    for (let k = lo; k <= hi; k += Math.round(.005 * sr)) {
      const value = rms(pcm, k - Math.round(.01 * sr), k + Math.round(.01 * sr));
      if (value < level) { best = k; level = value; }
    }
    if (best < 0 || db(level) > -42) {
      // Breathing is optional polish. Connected speech must remain intact when
      // alignment leaves no safe splice, rather than blocking the entire film.
      // A required physical action hold cannot be silently discarded.
      if (minimumScene > interval + .005) throw new Error(`No safe quiet gap before phrase ${i + 1} for the required action hold. Review the timing before extending this scene.`);
      preservedGaps.push({ phrase: i + 1, reason: "Original speech preserved; no safe quiet splice for an optional breath." });
      continue;
    }
    cuts.push({ at: best / sr, seconds: Math.round(extra * sr) / sr, levelDb: db(level) });
  }
  let paced = new Float32Array(pcm.length + cuts.reduce((n, c) => n + Math.round(c.seconds * sr), 0));
  let source = 0, target = 0;
  for (const cut of cuts) {
    const at = Math.round(cut.at * sr), count = at - source;
    paced.set(pcm.subarray(source, at), target); target += count;
    // Both joins crossfade into the continuous room/score bed used in the mix.
    const fade = Math.min(Math.round(fadeJoin * sr), count);
    for (let j = 0; j < fade; j++) paced[target - fade + j] *= Math.cos((j / fade) * Math.PI / 2) ** 2;
    target += Math.round(cut.seconds * sr); source = at;
  }
  paced.set(pcm.subarray(source), target);
  let offset = 0;
  for (const c of cuts) {
    offset += Math.round(c.seconds * sr);
    const at = Math.round(c.at * sr) + offset;
    for (let j = 0; j < Math.round(fadeJoin * sr) && at + j < paced.length; j++) paced[at + j] *= Math.sin(j / (fadeJoin * sr) * Math.PI / 2) ** 2;
  }
  const shifted = shiftTiming(timing, cuts);
  shifted.duration = paced.length / sr;
  // Never fade through the last aligned word. An energetic source boundary is
  // reported for listening, not misrepresented as a restored missing phoneme.
  const lastWord = shifted.words.at(-1)!.end;
  const sourceTailDb = db(rms(pcm, pcm.length - Math.round(.02 * sr)));
  let tailPaddingSeconds = 0;
  // A word timestamp can include the recording's already quiet last samples.
  // Add silence to the derived track, never fade speech or invent a missing word.
  if (lastWord > shifted.duration + .001) throw new Error("Word timing extends beyond the recording. Review the saved alignment before finishing.");
  if (lastWord + .02 >= shifted.duration) {
    if (sourceTailDb > -50 && options.sourceTailPolicy !== "preserve-for-review") throw new Error("The recording has no tail after its last word. Review or replace the recording before finishing.");
    // Optional finishing must not destroy or regenerate recognized speech. In
    // review mode retain every original sample, add a silent mixing tail, and
    // carry the energetic boundary to the human finishing review. This does
    // not reconstruct a missing phoneme or assert that the ending is perfect.
    tailPaddingSeconds = .2;
    const padded = new Float32Array(paced.length + Math.round(tailPaddingSeconds * sr));
    padded.set(paced); paced = padded; shifted.duration = paced.length / sr;
  }
  const fadeStart = Math.max(lastWord + .02, shifted.duration - .08);
  for (let i = Math.round(fadeStart * sr); i < paced.length; i++) paced[i] *= Math.cos((i / sr - fadeStart) / (shifted.duration - fadeStart) * Math.PI / 2) ** 2;
  // Last activity followed by 150 ms below -50 dB is a conservative voice end.
  let voiceEnd = paced.length / sr;
  for (let k = paced.length - Math.round(.15 * sr); k >= Math.round(lastWord * sr); k -= Math.round(.01 * sr)) {
    if (db(rms(paced, k, k + Math.round(.15 * sr))) >= -50) break;
    voiceEnd = k / sr;
  }
  voiceEnd = Math.max(lastWord, voiceEnd);
  return { pcm: paced, timing: shifted, cuts, preservedGaps, voiceEnd, sourceTailDb, tailPaddingSeconds, sourceTailNeedsListening: sourceTailDb > -50, fadeStart };
}

/** Original local score derived from the October marimba/pluck recipe. */
function score(duration: number, logoStart: number) {
  const out = new Float32Array(Math.ceil(duration * AUDIO_RATE));
  const melody = [220, 264, 330, 264, 352, 330, 264, 247.5];
  for (let i = 0; i < out.length; i++) {
    const t = i / AUDIO_RATE;
    // A quiet continuous low pad bridges all pauses, including the logo.
    let v = .045 * (Math.sin(2 * Math.PI * 110 * t) + .4 * Math.sin(2 * Math.PI * 165 * t));
    const lastBeat = Math.floor(Math.min(t, logoStart - .001) / .75);
    for (let beat = Math.max(0, lastBeat - 2); beat <= lastBeat; beat++) {
      const age = t - beat * .75;
      if (age < 0 || age > 1.5) continue;
      const f = melody[beat % melody.length];
      v += .1 * Math.sin(2 * Math.PI * f * age) * (1 - Math.exp(-age * 180)) * Math.exp(-age * 4.5);
    }
    const a = t - logoStart;
    if (a >= 0 && a < 1) v += .13 * Math.sin(2 * Math.PI * 55 * a) * (1 - Math.exp(-a * 120)) * Math.exp(-a * 7);
    // Smooth attack and 1.4 s resolution, last 100 ms below -60 dB.
    const envelope = Math.min(1, t / .4) * Math.pow(Math.min(1, Math.max(0, (duration - .12 - t) / 1.4)), 2);
    out[i] = v * envelope;
  }
  return out;
}

export type EditorialAudio = { timing: ConceptTiming; voiceEnd: number; logoStart: number; duration: number; voiceFile: string; bedFile: string; gain: number; sourceTailNeedsListening: boolean; report: Record<string, unknown> };
export async function prepareEditorialAudio(root: string, board: ConceptBoard, timing: ConceptTiming, options: AudioOptions = {}): Promise<EditorialAudio> {
  const pcm = await decodeAudio(path.join(root, "assets/narration.wav"));
  const paced = paceRecording(pcm, timing, board, options);
  const finalHold = options.minimumSceneSeconds?.[board.shots.length] ?? 0;
  if (!Number.isFinite(finalHold) || finalHold < 0 || finalHold > 15) throw new Error("Invalid final action duration.");
  const logoStart = Math.max(paced.voiceEnd + .8, paced.timing.phrases.at(-1)!.start + finalHold), duration = Math.ceil((logoStart + 2.6) * 30) / 30;
  const rawVoice = path.join(root, "assets/narration-paced.wav"), rawBed = path.join(root, "assets/score-raw.wav"), carvedBed = path.join(root, "assets/score.wav");
  await writeWave(rawVoice, paced.pcm); await writeWave(rawBed, score(duration, logoStart));
  const mixedVoice = path.join(root, "assets/narration-mix.wav");
  // A simple gain cannot reach programme loudness when isolated peaks already
  // approach 0 dBFS. R128 normalization controls true peaks on this derived
  // mixing track; the original and the paced recording remain separately saved.
  await exec("ffmpeg", ["-y", "-v", "error", "-i", rawVoice, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", String(AUDIO_RATE), "-c:a", "pcm_f32le", mixedVoice]);
  const voicePcm = await decodeAudio(mixedVoice);
  // Render-time equivalent of voiceover carving: reserve speech's 1–3 kHz band
  // and duck smoothly against the actual paced recording, with a slow release.
  await exec("ffmpeg", ["-y", "-v", "error", "-i", rawBed, "-i", mixedVoice, "-filter_complex",
    "[0:a]equalizer=f=1000:t=q:w=1:g=-7,equalizer=f=1600:t=q:w=1:g=-14,equalizer=f=2500:t=q:w=1:g=-7[bed];[1:a]apad[side];[bed][side]sidechaincompress=threshold=0.015:ratio=4:attack=35:release=350:makeup=1:link=average[out]",
    "-map", "[out]", "-t", String(duration), "-c:a", "pcm_f32le", carvedBed]);
  const bed = await decodeAudio(carvedBed);
  let voiceEnergy = 0, bedEnergy = 0, n = 0;
  for (const word of paced.timing.words) for (let i = Math.round(word.start * AUDIO_RATE); i < Math.min(voicePcm.length, Math.round(word.end * AUDIO_RATE)); i++) {
    voiceEnergy += voicePcm[i] ** 2; bedEnergy += bed[i] ** 2; n++;
  }
  const bedGain = Math.sqrt(voiceEnergy / n) * .1 / Math.max(1e-9, Math.sqrt(bedEnergy / n)); // -20 dB under speech
  for (let i = 0; i < bed.length; i++) bed[i] *= bedGain * (options.musicLevel==="off"?0:options.musicLevel==="quiet"?.4:1);
  await writeWave(carvedBed, bed);
  const mix = new Float32Array(bed.length);
  for (let i = 0; i < mix.length; i++) mix[i] = bed[i] + (voicePcm[i] ?? 0);
  const mixFile = path.join(root, "assets/mix-reference.wav"); await writeWave(mixFile, mix);
  // The renderer duplicates mono tracks into left/right channels. Measure that
  // actual playback layout: mono LUFS would underestimate stereo energy by 3 dB.
  const loudness = await measureLoudness(mixFile, true);
  const gainDb = Math.min(-14 - loudness.integratedLufs, -1.2 - loudness.truePeakDb);
  const gain = Math.pow(10, gainDb / 20);
  const report = { version: 1, cuts: paced.cuts, preservedGaps: paced.preservedGaps, sourceTailDb: paced.sourceTailDb, tailPaddingSeconds: paced.tailPaddingSeconds, sourceTailNeedsListening: paced.sourceTailNeedsListening,
    voiceEnd: paced.voiceEnd, voiceFadeStart: paced.fadeStart, logoStart, holdSeconds: .8, duration, musicUnderVoiceDb: options.musicLevel==="off"?null:options.musicLevel==="quiet"?-28:-20, musicLevel:options.musicLevel??"normal",
    gainDb, originalLoudness: loudness, finalExpectedLufs: loudness.integratedLufs + gainDb,
    wordCompleteness: "requires-listening", paidRequests: 0 };
  await writeFile(path.join(root, "audio-finishing.json"), JSON.stringify(report, null, 2));
  return { timing: paced.timing, voiceEnd: paced.voiceEnd, logoStart, duration, voiceFile: "assets/narration-mix.wav", bedFile: "assets/score.wav", gain, sourceTailNeedsListening: paced.sourceTailNeedsListening, report };
}

export async function measureLoudness(file: string, renderDualMono = false) {
  const { stderr } = await exec("ffmpeg", ["-hide_banner", "-i", file, "-vn", "-af", `${renderDualMono ? "pan=stereo|c0=c0|c1=c0," : ""}ebur128=peak=true`, "-f", "null", "-"], { maxBuffer: 8 * 1024 * 1024 });
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const integratedLufs = Number(summary.match(/I:\s*([\d.-]+) LUFS/)?.[1]), truePeakDb = Number(summary.match(/Peak:\s*([\d.-]+) dBFS/)?.[1]);
  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDb)) throw new Error("Could not measure final audio loudness.");
  return { integratedLufs, truePeakDb };
}

/** A syllable attack is not an edit when the same step exists in the locally
 * prepared source mix, at the same aligned word and with the same magnitude. */
export function sourceSpeechStep(jump:{at:number;deltaDb:number}, timing:ConceptTiming, reference:Float32Array) {
  if (!timing.words.some(w=>jump.at>=w.start&&jump.at<w.end)) return false;
  const at=Math.round(jump.at*AUDIO_RATE),window=Math.round(frame*AUDIO_RATE);
  if(at<window||at+window>reference.length)return false;
  const delta=db(rms(reference,at,at+window))-db(rms(reference,at-window,at));
  return Math.sign(delta)===Math.sign(jump.deltaDb)&&Math.abs(delta-jump.deltaDb)<=3;
}

/** AAC tails can fall by many dB after a fade has already reached silence.
 * Keep checking audible cuts; changes entirely below -60 dBFS are not cuts. */
export function audibleLevelStep(before:number,after:number) {
  return Math.max(before,after)>-60 && Math.abs(after-before)>20;
}

/** Measures decoded final AAC, never the timeline's claimed faders. */
export async function checkEditorialAudio(video: string, root: string, timing: ConceptTiming, transitions: number[]) {
  const pcm = await decodeAudio(video), sr = AUDIO_RATE, duration = pcm.length / sr;
  const reference = await decodeAudio(path.join(root,"assets/mix-reference.wav"));
  const loudness = await measureLoudness(video);
  const levels = Array.from({ length: Math.floor(pcm.length / (sr * frame)) }, (_, i) => db(rms(pcm, i * sr * frame, (i + 1) * sr * frame)));
  const jumps = levels.flatMap((v, i) => i && audibleLevelStep(levels[i-1],v) ? [{ at: i * frame, deltaDb: v - levels[i - 1] }] : []);
  const speechAttack = (t: number) => timing.words.some((w) => Math.abs(t - w.start) < .08);
  const sourceSpeechJumps=jumps.filter(j=>sourceSpeechStep(j,timing,reference));
  const unexplainedJumps = jumps.filter((j) => j.at > .05 && j.at < duration - .3 && !speechAttack(j.at)&&!sourceSpeechStep(j,timing,reference));
  let run = 0, longestSilence = 0;
  for (let i = 0; i < levels.length - 30; i++) { run = levels[i] < -90 ? run + frame : 0; longestSilence = Math.max(run, longestSilence); }
  const tailDb = db(rms(pcm, Math.max(0, pcm.length - sr * .1)));
  const settings=JSON.parse(await readFile(path.join(root,"audio-finishing.json"),"utf8"));
  const failures = [
    ...(settings.musicLevel!=="off" && longestSilence > .1001 ? ["Digital silence exceeds 100 ms before the final fade"] : []),
    ...(unexplainedJumps.length ? ["An unexplained audio step exceeds 20 dB"] : []),
    ...(tailDb > -60 ? ["Final 100 ms have not faded below -60 dB"] : []),
    ...(loudness.truePeakDb > -1 ? ["True peak exceeds -1 dBTP"] : []),
    ...(Math.abs(loudness.integratedLufs + 14) > 2 ? ["Integrated loudness is outside -14 ±2 LUFS"] : []),
  ];
  const directory = path.join(root, "controls"); await mkdir(directory, { recursive: true });
  const report = { ...loudness, tailDb, longestSilence, unexplainedJumps, sourceSpeechJumps, failures, passed: failures.length === 0,
    wordCompleteness: "pending-human-listening", sourceTail: JSON.parse(await readFile(path.join(root, "audio-finishing.json"), "utf8")).sourceTailNeedsListening };
  await writeFile(path.join(directory, "audio-report.json"), JSON.stringify(report, null, 2));
  for (const [name, start] of [["waveform", 0], ["waveform-ending", Math.max(0, duration - 4)]] as const) await exec("ffmpeg", ["-y", "-v", "error", "-ss", String(start), "-i", video, "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=1600x320:colors=0x203C6D", "-frames:v", "1", path.join(directory, `${name}.png`)]);
  const excerpts = [...new Set([...transitions, duration - 2])].map((t) => Math.max(0, Math.min(duration - 4, t - 2)));
  const filters = excerpts.map((t, i) => `[0:a]atrim=start=${t}:duration=4,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=3.85:d=0.15[a${i}]`).join(";") + `;${excerpts.map((_, i) => `[a${i}]`).join("")}concat=n=${excerpts.length}:v=0:a=1[out]`;
  await exec("ffmpeg", ["-y", "-v", "error", "-i", video, "-filter_complex", filters, "-map", "[out]", path.join(directory, "transition-listening.wav")]);
  if (failures.length) throw new Error(`Audio finishing check failed: ${failures.join("; ")}. See controls/audio-report.json.`);
  return report;
}
