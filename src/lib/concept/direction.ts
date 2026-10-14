import type { z } from "zod";
import type { DirectionSchema } from "./types";

type Direction = z.infer<typeof DirectionSchema>;
// These are editorial suggestions, not semantic understanding or factual claims.
// Unknown subjects deliberately get a neutral presenter, never a fabricated event.
const ACTIONS = [
  { cue: /\b(source|sources|evidence|proof|preuves?|vérifi\w*|verif\w*|check|facts?|faits?)\b/iu,
    scene: "The locked clay narrator holds a magnifying glass above an open blank book on a warm clay desk. Medium close-up, the book and hands fully visible.",
    motion: "The narrator slowly moves the magnifying glass across one page, then pauses." },
  { cue: /\b(context|contexte|quote|quotes|citation|citations|extract|extrait)\b/iu,
    scene: "The locked clay narrator holds a detached blank paper strip just above its matching gap in an open clay book. Over-the-shoulder view; keep the whole page visible.",
    motion: "The narrator places the strip back into its matching gap in the page." },
  { cue: /\b(spread|spreads|viral|share|shares|sharing|partag\w*|diffus\w*|réseaux|networks?|online)\b/iu,
    scene: "The locked clay narrator stands beside three small clay phones arranged on a desk. A plain paper card rests in front of the first phone. Blank screens, medium wide view.",
    motion: "The paper card slides slowly from the first phone to the second while the narrator watches." },
  { cue: /\b(lies?|false|fake|rumou?rs?|mensonges?|faux|fausse|rumeurs?|fabricat\w*)\b/iu,
    scene: "The locked clay narrator lifts the edge of a plain theatrical cardboard facade, revealing the simple wooden supports behind it. Warm clay stage, three-quarter medium view. An abstract metaphor, no real people or historical event depicted.",
    motion: "The narrator lifts one edge of the facade to expose its supports, then holds it still." },
  { cue: /\b(history|histor\w*|histoire|past|passé|centur\w*|siècles?|medieval|médiéval\w*)\b/iu,
    scene: "The locked clay narrator stands beside a closed weathered clay archive box on a warm desk. Medium view with empty space above. No dates or invented historical details.",
    motion: "The narrator gently opens the archive box lid and pauses." },
  { cue: /\b(people|communities|community|together|personnes|communautés?|ensemble|solidarit\w*)\b/iu,
    scene: "The locked clay narrator stands beside three small warm clay lamps on a desk, sheltered by a curved clay screen. Wide calm composition. Symbolic objects only.",
    motion: "The narrator slowly brings the curved screen closer around the three lamps." },
  { cue: /\b(question|questions|why|how|pourquoi|comment|understand|comprendre)\b/iu,
    scene: "The locked clay narrator faces an empty presentation board on a warm clay stage, one open hand below it. Medium view with generous space above.",
    motion: "The narrator makes one slow open-handed gesture towards the blank board and holds." },
] as const;

export function suggestDirection(narration: string): Direction {
  if (/^context can change everything[.!?]?$/i.test(narration.trim())) return {
    visualMode: "presenter-text", metaphor: "The presenter delivers the statement directly; animated words above him carry the idea without a forced analogy.",
    scene: "The locked clay narrator faces the viewer, waist-up in the lower half of a warm cream miniature studio. Keep the upper 38 percent quiet and empty for typography added locally. Calm, attentive expression, cap, striped shirt, suspenders and brown trousers. No props or lettering.",
    motion: "Continuous single take. Natural breathing and a restrained open-palm gesture near the torso. Keep both hands and gaze in frame. Static camera, no zoom, no cuts. Hold the calm final pose.",
    references: ["narrator"], endScene: null, overlay: narration, strike: false, stateChange: false, actionSeconds: 5, breathBefore: .4,
  };
  const action = ACTIONS.find((item) => item.cue.test(narration));
  return {
    scene: action?.scene ?? "The locked clay narrator faces the viewer on a warm clay stage, beside a blank presentation board. Calm medium shot with clear space above for an editorial title. Neutral staging; adapt it to the meaning of this sentence.",
    motion: `Continuous single take. ${action?.motion ?? "The narrator makes one restrained open-handed gesture towards the viewer."} Static camera, no camera movement, no zoom, no cuts.`,
    references: ["narrator"], endScene: null, overlay: null, strike: false,
  };
}
