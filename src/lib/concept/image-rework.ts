import { z } from "zod";
import { requestBrainObject } from "../providers/brain";
/** Shimi, 2026-10-22: a provider's refusal of a storyboard composition (content filter, refused
 * parameters) is never shown to the client and never sent back as a request to rephrase. The
 * director receives the exact refusal and the refused instruction, keeps the narration meaning
 * and the client's note, and proposes a composition the generator accepts. The software then
 * resubmits inside the same approved batch, at most twice per scene, and journals each rework. */
export const ReworkedInstruction = z.object({ instruction: z.string().trim().min(20).max(2000), rationale: z.string().trim().max(400) }).strict();
export type ReworkInput = { narration: string; clientNote: string; refusedInstruction: string; reason: string; attempt: number };
export async function reworkRefusedImageInstruction(input: ReworkInput, request: typeof requestBrainObject = requestBrainObject) {
  return request({
    schema: ReworkedInstruction, requireClaude: true, skill: "cam-feedback",
    system: "You are the CAM clay director. An image provider refused a storyboard composition. Rewrite the visual instruction so the generator accepts it while keeping the narration's meaning, the clay world, the same characters, the continuity and the client's note. Remove anything that could read as violence, an effigy, burning, weapons, real people, hate symbols, gore or sexual content; prefer symbolic objects, props, gestures and staging. The client never sees this exchange: never ask for more feedback and never mention the refusal inside the instruction. Return only the new instruction and a one-sentence rationale.",
    prompt: JSON.stringify({ narration: input.narration, clientNote: input.clientNote, refusedInstruction: input.refusedInstruction, providerReason: input.reason, attempt: input.attempt }),
    maxOutputTokens: 1500, minimumOutputTokens: 400,
  });
}
