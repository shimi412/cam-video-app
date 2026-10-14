import { normalizedText } from "./text";
import type { ConceptTiming, SceneDirection } from "./types";

/** Text is an editorial layer, never lettering generated in the character image. */
export function validatePresenterText(shot: SceneDirection, narration: string) {
  if (shot.visualMode !== "presenter-text") return;
  const title = normalizedText(shot.overlay ?? "");
  if (!title || !` ${normalizedText(narration)} `.includes(` ${title} `)) throw new Error("Presenter text must be an exact excerpt of this narration.");
  if (shot.strike) throw new Error("Presenter text cannot be crossed out. Review the treatment of the claim.");
}

/** Real aligned word times drive emphasis; the entire title enters at phrase start. */
export function presenterWordCues(text: string, phrase: number, timing: ConceptTiming) {
  const interval = timing.phrases.find(p => p.phrase === phrase);
  if (!interval) throw new Error("Missing presenter phrase timing.");
  const spoken = timing.words.filter(w => w.start >= interval.start - .002 && w.end <= interval.end + .002);
  const tokens = text.trim().split(/\s+/);
  const start = spoken.findIndex((_, i) => tokens.every((word, j) => normalizedText(word) === normalizedText(spoken[i + j]?.word ?? "")));
  if (start < 0) throw new Error("Presenter text cannot be matched to the recording's word timings.");
  return tokens.map((text, i) => ({ text, start: spoken[start + i].start }));
}

export function presenterFontSize(text: string, width: number, height: number) {
  const availableWidth = width * .76 - 44, availableHeight = height * .25 - 36;
  let size = Math.min(78, Math.round(width * .067));
  while (size > 30 && Math.ceil(text.length * size * .62 / availableWidth) * size * 1.16 > availableHeight) size--;
  return size;
}
