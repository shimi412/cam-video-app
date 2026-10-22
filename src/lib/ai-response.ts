/** A received, billed response can fail without its billing outcome being unknown.
 * Keep only receipt metadata, never the prompt, partial JSON or reasoning. */
export type AIReceipt = {
  model: string;
  actualUsd: number;
  usage: { inputTokens: number; outputTokens: number; requestId: string };
};
export type AIResponseFailure = {
  kind: "ai-response-failure-v1";
  code: "incomplete" | "invalid-output";
  finishReason: string;
  receipt: AIReceipt;
  /** Bounded view of a cut answer (tool name, size, head), for diagnosis only. */
  preview?: {tool: string | null; argumentsChars: number; argumentsHead: string; contentHead: string};
};
export class AIResponseError extends Error {
  constructor(readonly failure: AIResponseFailure) {
    super(failure.code === "incomplete"
      ? "The assistant response was incomplete. It has not been automatically retried."
      : "The assistant response could not be validated. It has not been automatically retried.");
    this.name = "AIResponseError";
  }
}
