import { expect, it } from "vitest";
import { routeAI } from "../src/lib/ai-routing";
it("uses DeepSeek for brief everyday conversations", () => {
  for (const text of ["Bonjour", "Merci, c'est bon", "What is the next step?", "Raccourcis cette phrase"]) expect(routeAI({text}).tier).toBe("fast");
});
it("uses Claude for reasoning, scripts, documents and builds", () => {
  for (const text of ["Analyse ce raisonnement", "Compare these claims", "Rédige le script", "Build the storyboard"]) expect(routeAI({text}).tier).toBe("deep");
  expect(routeAI({text:"Continue",continuingDraft:true}).tier).toBe("deep");
  expect(routeAI({text:"What is this?",hasDocuments:true,mode:"fast"}).tier).toBe("deep");
  expect(routeAI({text:"ok",purpose:"build",mode:"fast"}).tier).toBe("deep");
});
it("honors deliberate thinking choices for text chat",()=>{
  expect(routeAI({text:"Bonjour",mode:"deep"}).tier).toBe("deep");
  expect(routeAI({text:"Compare these two short titles",mode:"fast"}).tier).toBe("fast");
});
