import { z } from "zod";

// Browser-safe evidence, shared by saved media and storyboard cards. These
// checks find specific defects; a clear report is not creative approval.
export const ImageQualitySchema = z.object({
  version: z.literal(1),
  width: z.number().int().positive(), height: z.number().int().positive(),
  expectedAspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
  issues: z.array(z.object({
    code: z.enum(["wrong-aspect-ratio", "suspected-padding"]),
    message: z.string(),
    axis: z.enum(["horizontal", "vertical"]).optional(),
    boundaries: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  })),
});
export type ImageQuality = z.infer<typeof ImageQualitySchema>;
export type ImageAspectRatio = NonNullable<ImageQuality["expectedAspectRatio"]>;
