import { z } from "zod";
import { Hash } from "./checkpoints";
import { GraphicLayerSchema, type ConceptBoard, type GraphicLayer } from "./types";
import { SceneMediaSchema } from "./preview-inputs";
import { GRAPHIC_STYLE_VERSION } from "./graphic-layers";

export const StoryboardPanelSchema = z.object({
  textOnly: z.boolean().optional(),
  scene: z.number().int().positive(), narration: z.string(), meaning: z.string(),
  startScene: z.string(), endScene: z.string().nullable(), motion: z.string(),
  actionSeconds: z.number().positive(),
  visualMode: z.enum(["metaphor", "presenter-text"]).optional(), strike: z.boolean().optional(), overlay: z.string().max(100).nullable().optional(),
  treatment: z.enum(["literal-action","infographic","metaphor","presenter-text"]).optional(), graphicLayers: z.array(GraphicLayerSchema).max(6).optional(),
  characterSheets: z.array(z.object({id:z.string(),role:z.string(),media:SceneMediaSchema})).optional(),
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
export function requireApprovedStoryboardPanel(sheet:z.infer<typeof StoryboardSheetSchema>,human:z.infer<typeof StoryboardDecisionSchema>,expected:{textOnly?:boolean;scene:number;startSha256:string;endSha256?:string;motion:string;visualMode?:"metaphor"|"presenter-text";overlay?:string|null;graphicLayers?:GraphicLayer[]}) {
  const panel=sheet.panels.find(p=>p.scene===expected.scene);
  if((panel?.textOnly??false)!==(expected.textOnly??false)||sheet.retrospective||human.target!==sheet.target||human.decision!=="approved"||panel?.start?.sha256!==expected.startSha256||panel?.end?.sha256!==expected.endSha256||panel?.motion!==expected.motion||(panel.visualMode??"metaphor")!==(expected.visualMode??"metaphor")||(panel.overlay??null)!==(expected.overlay??null)||JSON.stringify(panel.graphicLayers??[])!==JSON.stringify(expected.graphicLayers??[])) throw new Error("Human approval of this complete storyboard and these exact scene images is required before animation or publication.");
}
export function validateStoryboardAction(target: string, expected: string, decision: "approved" | "rejected", confirmed?: boolean, note = "") {
  if (target !== expected) throw new Error("The storyboard changed. Review the complete current version.");
  if (decision === "approved" && confirmed !== true) throw new Error("Confirm that you reviewed the complete storyboard and its meaning before animation.");
  if (decision === "rejected" && note.trim().length < 5) throw new Error("Describe what should change in the storyboard.");
}

export const StoryboardEditSchema = z.object({
  motion: z.string().trim().min(1).max(2000).optional(),
  textOnly: z.boolean().optional(),
  overlay: z.string().max(100).nullable().optional(),
  visualMode: z.enum(["metaphor","presenter-text"]).optional(),
  graphicLayers: z.array(GraphicLayerSchema).max(6).optional(),
}).strict();
export type StoryboardEdits = Record<string, z.infer<typeof StoryboardEditSchema>>;
export function applyStoryboardEdits(board: ConceptBoard, panels: StoryboardPanel[], edits: StoryboardEdits) {
  for (const panel of panels) {
    const edit = edits[panel.scene];
    if (!edit) continue;
    const checked = StoryboardEditSchema.parse(edit);
    Object.assign(panel, checked);
  }
  for(const shot of board.shots){
    if(edits[shot.index]){
      const edit=StoryboardEditSchema.parse(edits[shot.index]);Object.assign(shot,edit);
      if(edit.motion)shot.motionPrompt=`${edit.motion} Preserve the approved starting image, character identities, clay materials, composition and props. No lettering, new characters or sound. Keep the action within the approved shot duration.`;
    }
  }
}
export function storyboardReviewContent(panels: StoryboardPanel[], aspect: string) {
  const parsed = panels.map(panel=>StoryboardPanelSchema.parse(panel));
  return { version: 3, panels: parsed, format: aspect,
    ...(parsed.some(panel=>panel.graphicLayers?.length) ? { graphicStyle: GRAPHIC_STYLE_VERSION } : {}),
  };
}
