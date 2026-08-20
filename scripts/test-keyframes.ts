/**
 * One-off: style proposals, one test keyframe per candidate style, to judge
 * real rendering before encoding the bibles into the recipes. $0.15 per image.
 *   pnpm tsx --env-file-if-exists=.env scripts/test-keyframes.ts [style ...]
 */
import { falImage } from "../src/lib/providers/fal";

const SHOT =
  "Scene to illustrate (from a debunk script): a handful of lines are cut out of a 1,500-year-old legal text, stripped of context, and twisted into a lie. " +
  "Concrete staging: a huge ancient open book at the center; scissors cutting out one thin strip of a line; from the cut strip a red stain/ink blot spreads, like a lie taking over.";

const FRAME = "Vertical 9:16 composition, subject centered in the upper two thirds, lower third of the frame left empty for subtitles.";

const FORBIDDEN =
  "No text, no letters, no numbers, no readable characters, no logos, no flags, no real people, no photorealism.";

const NARRATOR =
  "A dignified narrator character (thirties, short dark hair, dark jacket, neutral calm face, no religious or ethnic markers) stands to one side and points at the book.";

export const STYLES: Record<string, string> = {
  "cartoon-flat-vector": [
    "Flat vector explainer illustration, bold geometric shapes, no outlines, smooth gradients kept minimal, crisp edges, modern motion-design look (Kurzgesagt-like).",
    "Palette: deep indigo background, electric amber, coral red for the lie, soft cream.",
    NARRATOR, SHOT, FRAME, FORBIDDEN,
  ].join(" "),
  "cartoon-gouache-storybook": [
    "Painterly gouache storybook illustration, visible brush texture, soft edges, dramatic chiaroscuro lighting, cinematic mood, hand-painted feel.",
    "Palette: deep teal-black shadows, warm candle amber on the book, blood-orange red for the spreading stain, muted cream.",
    NARRATOR, SHOT, FRAME, FORBIDDEN,
  ].join(" "),
  "cartoon-ink-wash-noir": [
    "Graphic-novel ink and wash illustration, expressive black brush lines, grey ink washes, high contrast, heavy blacks, a single red accent color only for the stain.",
    "Serious, investigative mood, like a political graphic novel.",
    NARRATOR, SHOT, FRAME, FORBIDDEN,
  ].join(" "),
  "cartoon-clay-toy": [
    "Stylized 3D claymation / toy diorama look, soft rounded clay shapes, fingerprint texture, miniature set with tilt-shift depth of field, studio lighting, clearly handmade and non-realistic.",
    "Palette: navy felt backdrop, warm amber spotlight, matte red clay for the stain.",
    NARRATOR.replace("character", "clay character"), SHOT, FRAME, FORBIDDEN,
  ].join(" "),
  "cartoon-retro-midcentury": [
    "Mid-century modern limited-animation cartoon style (1950s UPA look), angular stylized shapes, textured print grain, off-register color blocks, elegant and graphic.",
    "Palette: mustard, charcoal, cream, one tomato red for the stain.",
    NARRATOR, SHOT, FRAME, FORBIDDEN,
  ].join(" "),
  "whiteboard-vox-collage": [
    "Paper cut-out collage explainer, documentary style, on a cream textured paper background.",
    "An engraved-style illustration of a thick ancient legal book (old engraving look, halftone dots) with one cut-out strip torn from its page lifted by an engraved black-and-white hand holding scissors; hand-drawn black marker annotations: a circle around the torn strip and an arrow pointing to a vermilion red ink splash.",
    "Palette: cream paper, black ink, one vermilion red accent, muted teal blue for the book cover. Halftone textures, torn paper edges, soft paper drop shadows.",
    FRAME,
    "No readable text (page text blurred and illegible), no letters, no photographs of real people, not photorealistic.",
  ].join(" "),
  "whiteboard-marker-board": [
    "Real whiteboard explainer: a clean white dry-erase board filling the frame, hand-drawn illustrations in black marker with slightly uneven strokes, a few strokes of red and blue marker, simple iconographic drawings: an old thick book, scissors cutting out a strip from its page, a hand-drawn arrow leading to a red scribbled blot, small marker smudges, a human hand holding a black marker entering from the lower right, flat photographic lighting of a real board.",
    FRAME,
    "No words, no letters, no numbers, no logos.",
  ].join(" "),
  "whiteboard-marker-board-word": [
    "Real whiteboard explainer: a clean white dry-erase board filling the frame, hand-drawn illustrations in black marker with slightly uneven strokes, a few strokes of red and blue marker, simple iconographic drawings: an old thick book, scissors cutting out a strip from its page, a hand-drawn arrow leading to a red scribbled blot, and next to the blot the single word LIE handwritten in red marker capitals, small marker smudges, a human hand holding a black marker entering from the lower right, flat photographic lighting of a real board.",
    FRAME,
    "No other words or letters anywhere, no logos.",
  ].join(" "),
};

async function main() {
  const wanted = process.argv.slice(2);
  const entries = Object.entries(STYLES).filter(([k]) => wanted.length === 0 || wanted.includes(k));
  const results = await Promise.all(
    entries.map(async ([key, prompt]) => {
      const r = await falImage.generateImage({ prompt, aspectRatio: "9:16" });
      return { key, filePath: r.filePath, cost: r.realCostUsd };
    }),
  );
  for (const r of results) console.log(`${r.key}\t${r.filePath}\t$${r.cost}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
