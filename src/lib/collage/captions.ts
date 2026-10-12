/**
 * Caption library for the collage engine (Shimon's rules, 2026-08-20):
 * one grammatical sentence = one block, never two sentences mixed in a block,
 * at most two balanced lines per block, karaoke highlight word by word.
 *
 * A sentence that does not fit in two lines is split into two blocks at the
 * clause boundary (comma, semicolon, conjunction) closest to its middle. Word
 * timings come from the transcription; when the transcript word count differs
 * from the script (numbers, hyphenation) the words are mapped proportionally.
 */
import type { WordTiming } from "../providers/types";

export type CaptionWord = { text: string; start: number; end: number };
export type CaptionBlock = {
  /** Two lines max, each an array of word indexes into `words`. */
  lines: CaptionWord[][];
  words: CaptionWord[];
  start: number;
  end: number;
  /** True when the block is a clause of a longer sentence (continues in the next block). */
  continues: boolean;
};

const SENTENCE_END = /[.!?…]["')\]]?$/;
const CLAUSE_END = /[,;:]["')\]]?$/;
const CONJUNCTIONS = new Set(["and", "but", "or", "so", "because", "then", "while", "when", "that", "thats", "which", "who", "where", "to"]);
/** A line never ends on one of these (article, preposition, auxiliary): the phrase would be cut in half. */
const NO_LINE_END = new Set(["a", "an", "the", "of", "to", "for", "in", "on", "at", "by", "with", "from", "into", "as", "is", "are", "was", "were", "be", "been", "it's", "its", "their", "this", "that", "these", "those", "same", "very", "and", "or", "but", "not", "no", "how"]);

function norm(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Aligns script words to transcript timings. Exact-count case maps 1:1;
 * otherwise a greedy match on normalized tokens with proportional fallback.
 */
export function alignWords(scriptWords: string[], timings: WordTiming[], voiceSeconds: number): CaptionWord[] {
  const n = scriptWords.length;
  if (timings.length === 0) {
    return scriptWords.map((w, i) => ({ text: w, start: (i / n) * voiceSeconds, end: ((i + 1) / n) * voiceSeconds }));
  }
  if (timings.length === n) return scriptWords.map((w, i) => ({ text: w, start: timings[i].start, end: timings[i].end }));
  const out: CaptionWord[] = [];
  let ti = 0;
  for (let i = 0; i < n; i++) {
    const target = norm(scriptWords[i]);
    // Look ahead a few transcript words for a normalized match.
    let found = -1;
    for (let k = ti; k < Math.min(timings.length, ti + 4); k++) {
      const tw = norm(timings[k].word);
      if (tw && (tw === target || target.startsWith(tw) || tw.startsWith(target))) { found = k; break; }
    }
    if (found >= 0) {
      out.push({ text: scriptWords[i], start: timings[found].start, end: timings[found].end });
      ti = found + 1;
    } else {
      const k = Math.min(timings.length - 1, Math.floor((i / n) * timings.length));
      out.push({ text: scriptWords[i], start: timings[k].start, end: timings[k].end });
    }
  }
  // Monotonic starts.
  for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].start) out[i].start = out[i - 1].start;
  return out;
}

/** Splits words into sentences (a sentence ends on . ! ? …). */
export function splitSentences(words: CaptionWord[]): CaptionWord[][] {
  const sentences: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  for (const w of words) {
    cur.push(w);
    if (SENTENCE_END.test(w.text)) { sentences.push(cur); cur = []; }
  }
  if (cur.length) sentences.push(cur);
  return sentences;
}

const len = (ws: CaptionWord[]) => ws.reduce((a, w) => a + w.text.length, 0) + Math.max(0, ws.length - 1);

/**
 * Best split index for two lines (words before index go to line 1): only splits
 * where both lines fit are considered when any exists; then balance, prefer
 * clause boundaries, never end a line on an article or preposition.
 */
function balancedSplit(ws: CaptionWord[], maxChars: number): number {
  const total = len(ws);
  const score = (i: number) => {
    const a = len(ws.slice(0, i)), b = len(ws.slice(i));
    let sc = Math.abs(a - b);
    if (CLAUSE_END.test(ws[i - 1].text)) sc -= total * 0.35;
    else if (CONJUNCTIONS.has(norm(ws[i].text))) sc -= total * 0.2;
    if (i === 1 || i === ws.length - 1) sc += total * 0.3;
    if (NO_LINE_END.has(norm(ws[i - 1].text)) && !CLAUSE_END.test(ws[i - 1].text)) sc += total * 0.6;
    // Likely adjective before its noun (legal / text, ugly / history): keep them together.
    if (/(al|ic|ive|ous|ful|less|ing|ed|y)$/.test(norm(ws[i - 1].text)) && !CLAUSE_END.test(ws[i - 1].text) && ws[i - 1].text.length > 3) sc += total * 0.25;
    return sc;
  };
  let idx = [...Array(ws.length).keys()].slice(1);
  const feasible = idx.filter((i) => len(ws.slice(0, i)) <= maxChars && len(ws.slice(i)) <= maxChars);
  if (feasible.length) idx = feasible;
  let best = idx[0] ?? 1, bestScore = Infinity;
  for (const i of idx) { const sc = score(i); if (sc < bestScore) { bestScore = sc; best = i; } }
  return best;
}

/** Lays a word run on 1 or 2 lines within the budget, or null when it cannot fit. */
function layoutLines(seg: CaptionWord[], maxChars: number): CaptionWord[][] | null {
  if (len(seg) <= maxChars) return [seg];
  if (seg.length < 2) return null;
  const i = balancedSplit(seg, maxChars);
  const l1 = seg.slice(0, i), l2 = seg.slice(i);
  if (len(l1) <= maxChars && len(l2) <= maxChars) return [l1, l2];
  return null;
}

/**
 * Segments one sentence into the fewest blocks of at most two lines, cutting
 * at clause punctuation when possible, never after an article or preposition,
 * avoiding short orphan blocks (dynamic programming over word boundaries).
 */
function blocksForSentence(sentence: CaptionWord[], maxChars: number): CaptionBlock[] {
  const n = sentence.length;
  const best: number[] = new Array(n + 1).fill(Infinity);
  const prev: number[] = new Array(n + 1).fill(-1);
  const layouts: Array<CaptionWord[][] | null> = new Array(n + 1).fill(null);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    for (let i = 0; i < j; i++) {
      if (best[i] === Infinity) continue;
      const seg = sentence.slice(i, j);
      const lines = layoutLines(seg, maxChars);
      if (!lines) continue;
      let cost = 1; // one block
      if (j < n) {
        const lastW = seg[seg.length - 1].text;
        if (CLAUSE_END.test(lastW)) cost += 0;
        else if (CONJUNCTIONS.has(norm(sentence[j].text))) cost += 0.5;
        else cost += 1.2;
        if (NO_LINE_END.has(norm(lastW)) && !CLAUSE_END.test(lastW)) cost += 3;
      }
      if (len(seg) < maxChars * 0.6 && n > 4) cost += 2.2; // short orphan block
      if (best[i] + cost < best[j]) { best[j] = best[i] + cost; prev[j] = i; layouts[j] = lines; }
    }
  }
  if (best[n] === Infinity) {
    // A single word longer than the budget: fall back to one block per line.
    return [mkBlock([sentence], false)];
  }
  const blocks: CaptionBlock[] = [];
  let j = n;
  while (j > 0) { blocks.unshift(mkBlock(layouts[j]!, true)); j = prev[j]; }
  blocks[blocks.length - 1].continues = false;
  return blocks;
}

function mkBlock(lines: CaptionWord[][], continues: boolean): CaptionBlock {
  const words = lines.flat();
  return { lines, words, start: words[0].start, end: words[words.length - 1].end, continues };
}

export type CaptionPlan = { blocks: CaptionBlock[] };

/**
 * Plans the caption blocks of one shot's narration (verbatim script words).
 * `voiceSeconds` closes the last block; blocks are contiguous in time so the
 * screen is never without its sentence while the voice speaks.
 */
export function planCaptions(narration: string, timings: WordTiming[], voiceSeconds: number, maxChars: number): CaptionPlan {
  const scriptWords = narration.split(/\s+/).filter(Boolean);
  const words = alignWords(scriptWords, timings, voiceSeconds);
  const sentences = splitSentences(words);
  const blocks: CaptionBlock[] = [];
  sentences.forEach((s) => blocks.push(...blocksForSentence(s, maxChars)));
  // Contiguous timing: a block shows from its first word until the next block's first word.
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].start = i === 0 ? 0 : Math.max(blocks[i].start - 0.05, blocks[i - 1].start + 0.3);
    blocks[i].end = i < blocks.length - 1 ? blocks[i + 1].start - 0.05 : voiceSeconds;
  }
  return { blocks };
}

/** Characters per line that fit a caption zone width at a font size (Inter 800, uppercase-free). */
export function maxCharsFor(zoneWidthPx: number, fontPx: number): number {
  return Math.max(16, Math.floor(zoneWidthPx / (fontPx * 0.56)));
}

export type RenderedCaptions = { html: string; lines: string[] };

/**
 * Renders the blocks of one shot: one <p> per block (two <span class="line">),
 * shown/hidden on the timeline, each word colored when spoken.
 * `offset` is the shot's start time on the global timeline.
 */
export function renderCaptions(plan: CaptionPlan, sid: string, offset: number, colors: { base: string; active: string }): RenderedCaptions {
  const html: string[] = [];
  const lines: string[] = [];
  plan.blocks.forEach((b, bi) => {
    const id = `${sid}-cap${bi}`;
    let wi = 0;
    const lineHtml = b.lines
      .map((l) => `<span class="line">${l.map((w) => `<span id="${id}-w${wi++}" class="cw">${esc(w.text)}</span>`).join(" ")}</span>`)
      .join("");
    html.push(`<p id="${id}" class="cap">${lineHtml}</p>`);
    const start = offset + b.start, end = offset + b.end;
    lines.push(`tl.fromTo("#${id}", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.16, ease: "power2.out", immediateRender: false }, ${start.toFixed(3)});`);
    lines.push(`tl.to("#${id}", { autoAlpha: 0, duration: 0.1, ease: "power2.in" }, ${Math.max(start + 0.2, end - 0.1).toFixed(3)});`);
    b.words.forEach((w, i) => {
      lines.push(`tl.set("#${id}-w${i}", { color: "${colors.active}" }, ${(offset + Math.max(0.01, w.start)).toFixed(3)});`);
    });
    void colors.base;
  });
  return { html: html.join("\n"), lines };
}

/** CSS for the caption block inside the caption safe zone. */
export function captionsCss(zone: { x: number; y: number; w: number; h: number }, fontPx: number, base: string): string {
  return `
      .cap { position: absolute; opacity: 0; visibility: hidden; left: ${zone.x.toFixed(0)}px; width: ${zone.w.toFixed(0)}px; top: ${zone.y.toFixed(0)}px; height: ${zone.h.toFixed(0)}px; margin: 0; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; text-align: center; font-family: Inter, "Helvetica Neue", Arial, sans-serif; font-weight: 800; font-size: ${fontPx}px; line-height: 1.22; color: ${base}; }
      .cap .line { display: block; white-space: nowrap; }
      .cw { display: inline-block; }`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
