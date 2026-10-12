import { z } from "zod";

export const ShotSchema = z.object({
  narration: z.string().min(1),
  scene: z.string().min(1),
  motion: z.string().min(1),
  references: z.array(z.enum(["narrator", "monster", "effigy"])).min(1),
  endScene: z.string().nullable(),
  overlay: z.string().max(100).nullable(),
  strike: z.boolean(),
});
export const BoardSchema = z.object({ shots: z.array(ShotSchema).min(1).max(36) });
export type ConceptShot = z.infer<typeof ShotSchema> & { index: number; imagePrompt: string; motionPrompt: string; endImagePrompt: string | null; clipSeconds: number };
export type ConceptBoard = { source: "validated-example" | "offline-placeholder" | "api"; shots: ConceptShot[]; requiresReview: true };
export type ConceptTiming = {
  duration: number;
  estimated: boolean;
  words: { word: string; start: number; end: number }[];
  phrases: { phrase: number; text: string; start: number; end: number }[];
};
export type ConceptArtifact = { label: string; url: string };
