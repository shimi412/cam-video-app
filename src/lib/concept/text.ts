import eyal from "./eyal-phrases.json";

/** Preserve editorial line breaks; segment prose without rewriting its words. */
export function conceptPhrases(script: string): string[] {
  if (normalizedText(script) === normalizedText(eyal.join(" "))) return [...eyal];
  const lines = script.trim().split(/\n+/).map((line) => line.replace(/^\s*\d+[.)]\s+/, "").trim()).filter(Boolean);
  const sentences = lines.length > 1 ? lines : Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(lines[0] ?? ""), (s) => s.segment.trim());
  return sentences.filter(Boolean).flatMap((sentence) => {
    const words = sentence.split(/\s+/);
    // Keep estimated narration within Kling's 15s ceiling without speeding speech up.
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += 28) chunks.push(words.slice(i, i + 28).join(" "));
    return chunks;
  });
}

export function normalizedText(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']/gu, " ").toLowerCase().replace(/\s+/g, " ").trim();
}

export function estimatedSpeechSeconds(text: string): number {
  return Math.max(1.2, text.split(/\s+/).filter(Boolean).length / 2.5);
}
