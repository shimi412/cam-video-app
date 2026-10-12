/**
 * Step 1 of the paper-collage pipeline: the director splits the script into
 * beats and writes one full-frame collage scene per beat (structure of the
 * "documentary paper collage" engine shared on 2026-09-09). No media cost,
 * one Claude call. Output: storage/tests/collage-frames/beats.json + a table.
 *   pnpm tsx --env-file=.env scripts/collage-beats.ts [script.txt]
 */
import { generateObject } from "ai";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { DEFAULT_CHAT_MODEL } from "../src/lib/brain-llm";

const OUT = path.join(process.cwd(), "storage", "tests", "collage-frames");
const STYLE = (process.env.STYLE ?? "collage") as "collage" | "whiteboard";
const scriptFile = process.argv[2] ?? path.join(process.cwd(), "storage", "script-eyal.txt");

export const BeatsSchema = z.object({
  recurring: z
    .array(z.object({ key: z.string(), wording: z.string().describe("The exact wording reused every time this element appears (recurring subject law).") }))
    .describe("Elements that return across beats, each with its fixed wording."),
  beats: z.array(
    z.object({
      narration: z.string().describe("Verbatim words of the script covered by this beat, in order, nothing added or removed."),
      idea: z.string().describe("The one visual idea of the beat, 3-8 words."),
      label: z.string().optional().describe("Optional single on-screen label, 1-4 words, UPPERCASE (a date, a name, a number, a verdict). Omit when no label."),
      scene: z
        .string()
        .describe(
          "The SCENE paragraph, natural prose, 80-140 words: 'Vertical editorial collage.' then ONE hero element (about 70 percent of the visual weight, position in frame), 2-3 supporting elements maximum with their positions and how they attach (pin, tape, red string), the background papers for this beat (vary the paper stock beat to beat), where the negative space sits (the lower third stays free for captions), and the label on its paper strip or stamp if any.",
        ),
      assemblyOrder: z.array(z.string()).min(3).max(8).describe("Elements in the order they land during the build-on animation, back to front, narrative order (background scraps first, hero, supports, tape, string, label last)."),
    }),
  ).min(10).max(15),
});
export type Beats = z.infer<typeof BeatsSchema>;

const SYSTEM_COLLAGE = `You are an Elite Documentary Writer, Editorial Art Director and Paper Collage Engineer. You work for a non-profit that debunks antisemitic disinformation. You receive a finished narration script (do not rewrite it) and produce the BEAT BREAKDOWN and one collage SCENE per beat, for a vertical 9:16 social video.

BEAT RULES
- 12 to 14 beats. Each beat covers 5 to 14 words of the narration, verbatim, in order; all beats together reproduce the script exactly.
- Cut at sentence ends first; a long sentence may be cut at a comma or clause boundary; never cut inside a noun phrase. A very short sentence may be joined with its neighbour when they share one idea.
- Every beat carries ONE visual idea only. Visualize the idea, not the words.

SCENE RULES (documentary paper collage, hand-cut, editorial)
- One hero element (about 70 percent of visual weight), 2-3 supporting elements maximum, generous negative space. The lower third of the frame stays free (captions live there); heroes sit in the upper two thirds, slightly off-center, allowed to bleed past a frame edge.
- Visual vocabulary: halftone photograph cutouts of OBJECTS and PLACES (books, documents, torn pages, scissors, newspaper columns, maps, timelines, envelopes, megaphones, magnifying glasses, chains, seals, stamps, spotlight beams), masking tape, brass pins, red string, typewriter strips, rubber stamps, torn paper edges. Backgrounds made of layered aged newsprint, archival map fragments, manila envelopes, ledger paper, bleached newsprint scraps; vary the paper stock beat to beat.
- ONE hot red signal accent per beat (a marker cross, a strikethrough, a red string, a red stamp, a torn red strip), one restrained mustard yellow secondary at most.
- The lie and the hate are always ABSTRACT: a torn red strip, a red stamp, a red scribble, a struck-through post card, cut-out lines, a twisted paper strip. Never a depiction of the accusation itself.
- REPRESENTATION LAW, hard rule: no human face anywhere, not even in background newspaper photos (describe newspaper columns as text-only, or photos as landscapes/buildings). Never any child or minor, not even symbolically as a person: the vulnerable are objects (a small flame cutout, a seed packet, a sheltered circle, a pair of small paper doors). No named real person.
- Text: at most ONE label per beat, 1-4 words, on a typewriter strip, a torn label, or a rubber stamp. Everything else has blurred, illegible print. Say explicitly "no other text".
- Recurring subject law: an element that returns (the book, the post card, the red strip) is described with identical wording each time; list those wordings in "recurring".
- Continuity of the film: the same table, the same archival world; but never the same hero composition twice in a row, and never the same background paper twice in a row.
- Write the scene as one natural prose paragraph starting with "Vertical editorial collage." Do NOT include the style block or the closer; the engine appends them.`;

const SYSTEM_WHITEBOARD = `You are an Elite Explainer Writer and Whiteboard Art Director. You work for a non-profit that debunks antisemitic disinformation. You receive a finished narration script (do not rewrite it) and produce the BEAT BREAKDOWN and one WHITEBOARD DRAWING SCENE per beat, for a vertical 9:16 social video drawn live on a real dry-erase whiteboard.

BEAT RULES
- 12 to 14 beats. Each beat covers 5 to 14 words of the narration, verbatim, in order; all beats together reproduce the script exactly.
- Cut at sentence ends first; a long sentence may be cut at a comma or clause boundary; never cut inside a noun phrase. A very short sentence may be joined with its neighbour when they share one idea.
- Every beat carries ONE visual idea only. Visualize the idea, not the words.

SCENE RULES (real whiteboard, black dry-erase marker, hand-drawn)
- One hero drawing (about 70 percent of the visual weight), 2-3 supporting drawings maximum (icons, arrows, boxes, underlines, a numbered list of 2-3 ticks, a simple diagram), generous white space. The lower third of the board stays empty (captions live there); the hero sits in the upper two thirds, slightly off-center.
- Visual vocabulary: simple iconographic marker drawings of OBJECTS and DIAGRAMS: a closed book, an open book with lines, a torn page, scissors, a speech bubble struck through, a megaphone, a magnifying glass, a chain, a timeline with ticks, a map outline, an envelope, a document with lines, a big cross, arrows, boxes, brackets, a spiral, a knot. Strokes are uneven, confident, a few wobbles, sparse hatching for shading, no fills.
- ONE red marker accent per beat (a red cross, a red circle, a red underline, a red arrow, a red scribble). Everything else is black marker.
- The lie and the hate are always ABSTRACT: a struck-through speech bubble, a red cross, a scribbled-out line, a twisted arrow. Never a depiction of the accusation.
- REPRESENTATION LAW, hard rule: no human figures at all, not even stick figures, no faces, no children in any form. The vulnerable are abstract: a small house, a small flame, a shielded circle. No named real person.
- Text: at most ONE handwritten label per beat, 1-3 words, marker capitals, underlined or boxed. Say explicitly "no other text or letters on the board".
- Recurring subject law: an element that returns (the book, the speech bubble, the cross) is described with identical wording each time; list those wordings in "recurring".
- Continuity: the same board, the same marker; never the same hero drawing twice in a row.
- assemblyOrder = the DRAWING ORDER, stroke groups from first to last (hero outline, hero details, supports, arrows, red accent, label last).
- Write the scene as one natural prose paragraph starting with "Vertical whiteboard drawing." Do NOT include the style block or the closer; the engine appends them.`;

const SYSTEM = STYLE === "whiteboard" ? SYSTEM_WHITEBOARD : SYSTEM_COLLAGE;
const OUT_FILE = STYLE === "whiteboard" ? "beats-whiteboard" : "beats";

async function main() {
  const script = (await readFile(scriptFile, "utf8")).trim();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const anthropic = createAnthropic({ apiKey });
  const { object } = await generateObject({
    model: anthropic(DEFAULT_CHAT_MODEL),
    schema: BeatsSchema,
    system: SYSTEM,
    prompt: `SCRIPT (reproduce verbatim across the beats):\n"""\n${script}\n"""\n\nProduce the recurring elements, then the beats with their scenes and assembly order.`,
    maxRetries: 2,
  });
  // Verbatim check.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
  const joined = norm(object.beats.map((b) => b.narration).join(" "));
  const ok = joined === norm(script);
  await writeFile(path.join(OUT, `${OUT_FILE}.json`), JSON.stringify({ script, verbatim: ok, ...object }, null, 2), "utf8");
  const lines: string[] = [];
  lines.push(`# Beats (${object.beats.length}) · verbatim: ${ok ? "OK" : "DRIFT"}`, "");
  lines.push("## Recurring", ...object.recurring.map((r) => `- **${r.key}**: ${r.wording}`), "");
  object.beats.forEach((b, i) => {
    lines.push(`## ${i + 1}. « ${b.narration} »`, `- Idée : ${b.idea}${b.label ? ` · Label : ${b.label}` : " · pas de label"}`, `- Scène : ${b.scene}`, `- Assemblage : ${b.assemblyOrder.join(" → ")}`, "");
  });
  const md = lines.join("\n");
  await writeFile(path.join(OUT, `${OUT_FILE}.md`), md, "utf8");
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
