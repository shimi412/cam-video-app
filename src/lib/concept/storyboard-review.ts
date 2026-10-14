import { z } from "zod";
import { Hash } from "./checkpoints";
import { SceneMediaSchema } from "./preview-inputs";

export const StoryboardPanelSchema = z.object({
  scene: z.number().int().positive(), narration: z.string(), meaning: z.string(),
  startScene: z.string(), endScene: z.string().nullable(), motion: z.string(),
  actionSeconds: z.number().positive(),
  start: SceneMediaSchema.optional(), end: SceneMediaSchema.optional(), existing: SceneMediaSchema.optional(),
});
export type StoryboardPanel = z.infer<typeof StoryboardPanelSchema>;
export const StoryboardSheetSchema = z.object({
  version: z.literal(1), target: Hash, panels: z.array(StoryboardPanelSchema).min(1).max(36),
  retrospective: z.boolean().default(false),
});
export const StoryboardDecisionSchema = z.object({
  target: Hash, decision: z.enum(["approved", "rejected"]), actor: z.string().min(1),
  at: z.string().datetime(), note: z.string().max(2000), scene: z.number().int().positive().optional(),
});
export function requireApprovedStoryboardPanel(sheet:z.infer<typeof StoryboardSheetSchema>,human:z.infer<typeof StoryboardDecisionSchema>,expected:{scene:number;startSha256:string;endSha256?:string;motion:string}) {
  const panel=sheet.panels.find(p=>p.scene===expected.scene);
  if(sheet.retrospective||human.target!==sheet.target||human.decision!=="approved"||panel?.start?.sha256!==expected.startSha256||panel?.end?.sha256!==expected.endSha256||panel?.motion!==expected.motion) throw new Error("Human approval of this complete storyboard and these exact scene images is required before animation or publication.");
}
export function validateStoryboardAction(target: string, expected: string, decision: "approved" | "rejected", confirmed?: boolean, note = "") {
  if (target !== expected) throw new Error("The storyboard changed. Review the complete current version.");
  if (decision === "approved" && confirmed !== true) throw new Error("Confirm that you reviewed the complete storyboard and its meaning before animation.");
  if (decision === "rejected" && note.trim().length < 5) throw new Error("Describe what should change in the storyboard.");
}
