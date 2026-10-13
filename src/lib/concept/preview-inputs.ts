import { z } from "zod";

// Shared with the browser. A preview voice never resolves to a paid provider.
export const PreviewVoiceSchema = z.enum(["silent", "local-en", "local-fr", "local-he"]);
export type PreviewVoice = z.infer<typeof PreviewVoiceSchema>;
export const LOCAL_VOICES = {
  "local-en": { name: "Daniel", label: "English · Daniel (Mac test voice)" },
  "local-fr": { name: "Thomas", label: "French · Thomas (Mac test voice)" },
  "local-he": { name: "Carmit", label: "Hebrew · Carmit (Mac test voice)" },
} as const;

export const SceneMediaSchema = z.object({
  id: z.uuid(), kind: z.enum(["image", "video"]), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive(), height: z.number().int().positive(),
  duration: z.number().positive().optional(),
});
export type SceneMedia = z.infer<typeof SceneMediaSchema>;
export const mediaFile = (media: SceneMedia) => `${media.id}.${media.kind === "image" ? "png" : "mp4"}`;
export const sceneMediaUrl = (jobId: string, media: SceneMedia) => `/api/media/imports/${jobId}/${mediaFile(media)}`;
