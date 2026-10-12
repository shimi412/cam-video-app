/**
 * Test of the "documentary paper collage" style block (Google Doc shared by
 * Shimon on 2026-09-09): 3 full-frame collage images on 3 sentences of Eyal's
 * script, Nano Banana Pro 2K, 9:16. Real fal.ai spend: 3 × $0.15.
 *   pnpm tsx --env-file=.env scripts/test-collage-frames.ts
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { falImage } from "../src/lib/providers/fal";

const exec = promisify(execFile);
const OUT = path.join(process.cwd(), "storage", "tests", "collage-frames");

const STYLE_BLOCK =
  "hand-cut documentary paper collage on aged newsprint and archival map surfaces, black and white halftone photograph cutouts with rough scissor-cut edges and offset accent strokes, torn paper edges, masking tape fragments, typewriter caption strips, rubber stamp marks, red string and brass pins where the story calls for connections, desaturated archival palette of tan, ink black, and halftone gray with ONE hot red signal accent and a restrained mustard yellow secondary, condensed bold headline lettering only where a label is specified, visible print grain and paper fiber, matte, flat even documentary lighting with soft cutout drop shadows. Vary the paper stock tone rather than repeating one flat shade: mix in lighter cream and bleached-newsprint scraps alongside the darker aged-tan and manila pieces within the same desaturated archival family, so the collage reads as assembled from many different real paper sources.";

const CLOSER =
  "Every element must appear physically hand-cut and layered from real paper, with visible cutout edges, halftone print texture, and soft shadow separation between layers. The composition stays clean, minimal, and editorial with generous negative space. NOT digital illustration, NOT cartoon, NOT 3D render, NOT glossy, no gradients, no clutter, no watermark, no logos, no text beyond the specified label. Premium documentary collage aesthetic, 9:16 vertical, ultra-detailed, 8K.";

const SCENES: Array<{ slug: string; narration: string; scene: string }> = [
  {
    slug: "01-lets-talk-about-this-lie",
    narration: "Let's talk about this lie. The Talmud permits pedophilia.",
    scene:
      "Vertical editorial collage. Hero element, about 70 percent of the visual weight, slightly off-center to the upper left: a torn social media post card cut from bleached newsprint, blank rounded rectangle with a round avatar placeholder and three blurred grey text lines, pinned to the background with a brass pin, struck through by one thick hot red marker cross. Supporting elements: a black and white halftone magnifying glass cutout entering from the lower right, its lens over the corner of the card; a short strip of masking tape holding the card's top edge; one small rubber stamp mark in hot red reading the label LIE, angled, on a scrap of manila paper at the lower left. Background: layered aged newsprint and a torn fragment of an antique engraved map, no readable place names. Generous cream negative space in the lower third.",
  },
  {
    slug: "02-handful-of-lines",
    narration: "Anti-Semites take a handful of lines from a 1,500-year-old legal text, strip them of context,",
    scene:
      "Vertical editorial collage. Hero element, about 70 percent of the visual weight, centered high: a thick ancient legal tome lying open, black and white halftone photograph cutout with rough scissor-cut edges, its dense columns of blurred illegible print, three narrow slivers of text physically cut out of the page leaving rectangular holes. Supporting elements: a pair of vintage scissors, halftone cutout, resting on the lower edge of the book; the three cut slivers of paper scattered below, each pinned with a brass pin and linked by a single line of hot red string leading down to a torn strip of manila paper; one typewriter caption strip on cream paper reading the label 1,500 YEARS, taped at an angle under the book. Background: aged tan archival paper with a torn bleached-newsprint scrap behind the book. Negative space at the very top and the lower third.",
  },
  {
    slug: "03-dont-platform-it",
    narration: "Don't platform it. Don't debate it like it's a legitimate question. Expose it.",
    scene:
      "Vertical editorial collage. Hero element, about 70 percent of the visual weight, centered, tilted: a vintage metal megaphone, black and white halftone photograph cutout with rough scissor-cut edges, mouth pointing to the upper right, crossed out by one thick hot red marker stroke from lower left to upper right. Supporting elements: a rubber stamp box in hot red reading the label EXPOSE IT, stamped hard on a torn scrap of bleached newsprint at the lower left, ink slightly uneven; a small halftone spotlight beam cutout in mustard yellow paper coming from the top right corner and landing on the megaphone; two fragments of masking tape at the megaphone's edges. Background: layered aged newsprint columns and a manila envelope scrap. Generous negative space in the lower third.",
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const files: string[] = [];
  let cost = 0;
  for (const s of SCENES) {
    const prompt = `${s.scene}\n\nStyle: ${STYLE_BLOCK}\n\n${CLOSER}`;
    await writeFile(path.join(OUT, `${s.slug}.prompt.txt`), `${s.narration}\n\n${prompt}\n`, "utf8");
    const r = await falImage.generateImage({ prompt, aspectRatio: "9:16" });
    cost += r.realCostUsd;
    const dest = path.join(OUT, `${s.slug}.jpg`);
    await copyFile(r.filePath, dest);
    files.push(dest);
    console.log(`${s.slug}: ${dest} ($${r.realCostUsd.toFixed(2)})`);
  }
  const sheet = path.join(OUT, "planche-3-images.jpg");
  await exec("ffmpeg", ["-y", "-loglevel", "error", ...files.flatMap((f) => ["-i", f]), "-filter_complex", "[0:v]scale=-1:1400[a];[1:v]scale=-1:1400[b];[2:v]scale=-1:1400[c];[a][b][c]hstack=inputs=3,pad=iw+40:ih+40:20:20:white", sheet]);
  console.log(`sheet: ${sheet}\ntotal fal.ai: $${cost.toFixed(2)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
