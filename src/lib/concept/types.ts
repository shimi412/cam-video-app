import { z } from "zod";

export const DirectionSchema = z.object({
  scene: z.string().trim().min(1).max(3000),
  motion: z.string().trim().min(1).max(2000),
  references: z.array(z.enum(["narrator", "monster", "effigy"])).min(1).max(3).refine((refs) => new Set(refs).size === refs.length),
  endScene: z.string().trim().min(1).max(3000).nullable(),
  overlay: z.string().max(100).nullable(),
  strike: z.boolean(),
  visualMode: z.enum(["metaphor", "presenter-text"]).optional(),
  // Optional on historical packets; required in newly requested AI directions.
  metaphor: z.string().trim().min(1).max(500).optional(),
  stateChange: z.boolean().optional(),
  actionSeconds: z.number().min(3).max(15).optional(),
  breathBefore: z.number().min(0.25).max(0.8).optional(),
}).strict();
export type SceneDirection = z.infer<typeof DirectionSchema>;
export const ShotSchema = DirectionSchema.extend({ narration: z.string().min(1) });
export const BoardSchema = z.object({ shots: z.array(ShotSchema).min(1).max(36) });
export type ConceptShot = z.infer<typeof ShotSchema> & { index: number; imagePrompt: string; motionPrompt: string; endImagePrompt: string | null; clipSeconds: number };
export type ConceptBoard = { source: "validated-example" | "offline-placeholder" | "offline-draft" | "edited-draft" | "api"; shots: ConceptShot[]; requiresReview: true };
export type ConceptTiming = {
  duration: number;
  estimated: boolean;
  words: { word: string; start: number; end: number }[];
  phrases: { phrase: number; text: string; start: number; end: number }[];
};
export type ConceptArtifact = { label: string; url: string };
