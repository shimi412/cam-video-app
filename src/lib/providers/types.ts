/**
 * Every external call the app makes goes through these interfaces.
 * Rule: no network call outside src/lib/providers/ — this is what makes
 * mock mode airtight and cost metering exhaustive.
 *
 * Each result carries realCostUsd so the metering layer can log it and
 * apply the client margin without knowing anything about the provider.
 */

export type MediaResult = {
  /** Path inside storage/ where the produced file was written. */
  filePath: string;
  /** What this call actually cost us, in USD (simulated in mock mode). */
  realCostUsd: number;
  /** Provider identifier for metering: "fal" | "mock" | ... */
  provider: string;
  /** Model identifier for metering, e.g. "nano-banana" | "wan-2.5-720p". */
  model: string;
  meta?: Record<string, unknown>;
};

export interface ImageGenProvider {
  generateImage(input: {
    prompt: string;
    aspectRatio: "16:9" | "9:16" | "1:1";
    /** Optional reference image path for character consistency. */
    referencePath?: string;
  }): Promise<MediaResult>;
}

export interface VideoGenProvider {
  generateClip(input: {
    prompt: string;
    /** Keyframe driving the clip (image-to-video). */
    keyframePath: string;
    /** Provider-side reference of the keyframe (upload URL or job id), when it has one. */
    keyframeRef?: string;
    durationSeconds: number;
    tier: "standard" | "premium";
    /** Output aspect ratio (mock uses it for the placeholder canvas; real models follow the keyframe). */
    aspectRatio?: "16:9" | "9:16" | "1:1";
  }): Promise<MediaResult>;
}

export interface TtsProvider {
  synthesize(input: {
    text: string;
    voiceId: string;
    language: "en" | "fr" | "he";
  }): Promise<MediaResult>;
}

/** Isolated collage element: generated on a plain background, then background-removed to a PNG with alpha. */
export interface CutoutProvider {
  generateCutout(input: { prompt: string }): Promise<MediaResult>;
}

export type WordTiming = { word: string; start: number; end: number };

/** Word-level timestamps of a voice file, to anchor visual events on words. */
export interface TranscribeProvider {
  transcribe(input: { audioPath: string; language: "en" | "fr" | "he" }): Promise<{ words: WordTiming[]; realCostUsd: number; provider: string; model: string }>;
}

export type ProviderSet = {
  image: ImageGenProvider;
  video: VideoGenProvider;
  tts: TtsProvider;
  cutout: CutoutProvider;
  transcribe: TranscribeProvider;
};
