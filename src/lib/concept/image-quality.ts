import sharp from "sharp";
import { ImageQualitySchema, type ImageAspectRatio, type ImageQuality } from "./image-quality-types";

type Line = { delta: number; coverage: number; texture: number };
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

/** Flag only a conspicuous pair of seams around smooth opposite borders.
 * Empty headroom, a smooth gradient, or a single horizon are insufficient.
 * A deliberately framed illustration can still be flagged: this is evidence
 * for human review, never a trigger for another generation or an image edit.
 */
function paddedBoundaries(data: Buffer, width: number, height: number, axis: "horizontal" | "vertical"): [number, number] | undefined {
  const length = axis === "horizontal" ? height : width;
  const span = axis === "horizontal" ? width : height;
  if (length < 64 || span < 64) return;
  const pixel = (line: number, point: number, channel: number) => axis === "horizontal"
    ? data[(line * width + point) * 3 + channel]
    : data[(point * width + line) * 3 + channel];
  const lines: Line[] = [];
  for (let line = 0; line < length; line++) {
    let delta = 0, coverage = 0, texture = 0;
    for (let point = 0; point < span; point++) {
      let difference = 0;
      for (let channel = 0; channel < 3; channel++) {
        const value = pixel(line, point, channel);
        if (line) difference += Math.abs(value - pixel(line - 1, point, channel)) / 3;
        if (point) texture += Math.abs(value - pixel(line, point - 1, channel)) / 3 / (span - 1);
      }
      delta += difference / span;
      if (difference > 2) coverage++;
    }
    lines.push({ delta, coverage: coverage / span, texture });
  }
  const isSeam = (index: number) => {
    const edge = lines[index];
    const baseline = mean([...lines.slice(Math.max(1, index - 6), index - 2), ...lines.slice(index + 3, index + 7)].map(line => line.delta));
    return edge.delta >= 4 && edge.coverage >= .7 && edge.delta > Math.max(.5, baseline) * 6;
  };
  for (let first = Math.ceil(length * .08); first <= length * .35; first++) {
    if (!isSeam(first)) continue;
    for (let last = Math.ceil(length * .65); last <= length * .92; last++) {
      if (Math.abs(first - (length - last)) > length * .06 || !isSeam(last)) continue;
      const outer = [...lines.slice(1, first - 2), ...lines.slice(last + 3)];
      const inner = lines.slice(first + 3, last - 2);
      const borderEnergy = mean(outer.map(line => (line.delta + line.texture) / 2));
      const contentEnergy = mean(inner.map(line => (line.delta + line.texture) / 2));
      if (borderEnergy <= .8 && contentEnergy >= 1.5 && contentEnergy >= Math.max(.25, borderEnergy) * 4) {
        return [Number((first / length).toFixed(4)), Number((last / length).toFixed(4))];
      }
    }
  }
}

/** Inspect a bounded local thumbnail. Original pixels are never rewritten. */
export async function inspectImageQuality(bytes: Buffer, expectedAspectRatio?: ImageAspectRatio): Promise<ImageQuality> {
  const source = sharp(bytes, { limitInputPixels: 24_000_000 });
  const meta = await source.metadata();
  const width = meta.autoOrient.width, height = meta.autoOrient.height;
  if (!width || !height) throw new Error("Image dimensions are unavailable.");
  const issues: ImageQuality["issues"] = [];
  if (expectedAspectRatio) {
    const [w, h] = expectedAspectRatio.split(":").map(Number);
    // Pixel alignment / provider rounding of a few pixels is harmless. A
    // square image returned for a vertical production is not.
    if (Math.abs((width / height) / (w / h) - 1) > .025) issues.push({
      code: "wrong-aspect-ratio",
      message: `This image is ${width} × ${height}, which does not match the ${expectedAspectRatio} video format. Review its framing before approval.`,
    });
  }
  const { data, info } = await source.rotate().resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const axis of ["horizontal", "vertical"] as const) {
    const boundaries = paddedBoundaries(data, info.width, info.height, axis);
    if (boundaries) issues.push({ code: "suspected-padding", axis, boundaries,
      message: "Visible seams may separate added borders from the main image. Check that the scene fills the frame naturally before approval." });
  }
  return ImageQualitySchema.parse({ version: 1, width, height, ...(expectedAspectRatio ? { expectedAspectRatio } : {}), issues });
}
