import { z } from "zod";
import type { ConceptBoard } from "./types";

export const FinishingSchema = z.object({
  hideTitles: z.literal(true),
  reason: z.string().trim().min(1).max(1000),
  reviewedBy: z.string().trim().min(1).max(200),
}).strict();
export type Finishing = z.infer<typeof FinishingSchema>;

/** A local editorial revision is distinct from the immutable paid scene plan. */
export function finishingBoard(board: ConceptBoard, options?: Finishing): ConceptBoard {
  if (!options) return board;
  FinishingSchema.parse(options);
  return { ...board, shots: board.shots.map((shot) => ({ ...shot, overlay: null, strike: false })) };
}
