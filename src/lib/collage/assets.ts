/**
 * Cut-out post-processing: trim the transparent margins left by the square
 * generation canvas so elements fill their boxes, and report their real aspect.
 */
import sharp from "sharp";

export type TrimmedCutout = { filePath: string; width: number; height: number; ratio: number };

/** Trims transparent margins in place (writes a -trim.png next to the file) and returns its dimensions. */
export async function trimCutout(filePath: string): Promise<TrimmedCutout> {
  const out = filePath.replace(/\.png$/i, "") + "-trim.png";
  try {
    const img = sharp(filePath).ensureAlpha().trim({ threshold: 12 });
    const { width = 0, height = 0 } = await img.png().toFile(out);
    if (width < 8 || height < 8) throw new Error("trim produced an empty image");
    return { filePath: out, width, height, ratio: width / height };
  } catch {
    const meta = await sharp(filePath).metadata();
    const width = meta.width ?? 1024, height = meta.height ?? 1024;
    return { filePath, width, height, ratio: width / height };
  }
}
