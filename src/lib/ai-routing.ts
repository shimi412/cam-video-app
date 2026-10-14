export type ThinkingMode = "auto" | "fast" | "deep";
export const FAST_MODEL = "deepseek/deepseek-v4.1-flash";
export const DEEP_MODEL = "anthropic/claude-sonnet-5";
/** Route before inference: no paid classifier and no hidden second generation.
 * Rich documents and production design always need the stronger model. */
export function routeAI(input: { text: string; mode?: ThinkingMode; purpose?: "chat" | "build"; hasDocuments?: boolean; historyCharacters?: number; continuingDraft?: boolean }) {
  const text = input.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (input.purpose === "build") return { tier:"deep" as const,reason:"Production planning" };
  if (input.hasDocuments) return { tier:"deep" as const,reason:"Reference document analysis" };
  if (input.mode === "deep") return { tier:"deep" as const,reason:"Detailed thinking requested" };
  if (input.mode === "fast") return { tier:"fast" as const,reason:"Quick reply requested" };
  if (input.continuingDraft || input.text.length > 1000 || (input.historyCharacters ?? 0) > 20000 || /\b(analy[sz]\w*|analys\w*|compare|comparer|strategy|strat[ée]gi\w*|research|recherche|evidence|sources?|verify|v[ée]rifi\w*|argument\w*|script|storyboard|campaign|campagne|build|code|architecture|sc[ée]nario|narration|r[ée]dige\w*|write|[ée]cris|concevoir|reflech\w*|reflexion\w*|raisonn\w*|reason\w*|contradict\w*|r[ée]fut\w*)\b/iu.test(text)) {
    return { tier:"deep" as const,reason:"Analysis or content creation" };
  }
  return { tier:"fast" as const,reason:"Simple conversation" };
}
