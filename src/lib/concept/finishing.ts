import { z } from "zod";
import type { ConceptBoard } from "./types";

export const ClipEditSchema = z.object({
  mediaStart: z.number().min(0).max(60).default(0),
  mediaEnd: z.number().positive().max(60).optional(),
  playbackRate: z.number().min(.5).max(2).default(1),
  crop: z.number().min(1).max(1.15).default(1),
}).strict();
export type ClipEdit = z.infer<typeof ClipEditSchema>;

export const FinishingSchema = z.object({
  hideTitles: z.boolean(),
  reason: z.string().trim().min(1).max(1000),
  reviewedBy: z.string().trim().min(1).max(200),
  breaths: z.record(z.string(), z.number().min(.25).max(.8)).optional(),
  minimumSceneSeconds: z.record(z.string(), z.number().min(.25).max(15)).optional(),
  clips: z.record(z.string(), ClipEditSchema).optional(),
  musicLevel: z.enum(["off","quiet","normal"]).optional(),
  captions: z.boolean().optional(),
  captionSize: z.enum(["normal","large"]).optional(),
  captionCorrections: z.array(z.object({from:z.string().min(1),to:z.string().min(1)})).optional(),
  ending: z.enum(["cream", "last-frame"]).optional(),
  /** Claude's delivery review objections, recorded for the team; the client's approval released the film. */
  deliveryNotes: z.string().optional(),
}).strict();
export type Finishing = z.infer<typeof FinishingSchema>;

/** A local editorial revision is distinct from the immutable paid scene plan. */
export function finishingBoard(board: ConceptBoard, options?: Finishing): ConceptBoard {
  if (!options || !options.hideTitles) return board;
  FinishingSchema.parse(options);
  return { ...board, shots: board.shots.map((shot) => shot.visualMode === "presenter-text" ? shot : ({ ...shot, overlay: null, strike: false })) };
}
