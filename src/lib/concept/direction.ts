import type { SceneDirection } from "./types";

type Idea = Pick<SceneDirection, "scene" | "motion" | "metaphor"> & { cue: RegExp; endScene?: string; presenter?: boolean };

/** Local editorial vocabulary, not factual verification or a substitute for the
 * director. Only the supplied narration selects a subject; no new cast is made. */
const IDEAS: Idea[] = [
  { cue: /\b(?:Muslim|musulman\w*)\b.*\b(?:Jew|juif\w*)\b.*\b(?:Christian|chrétien\w*|chretien\w*)\b.*\b(?:hospital|hôpital|hopital)\b/iu,
    scene: "Wide three-quarter view into an uncluttered miniature hospital entrance. The locked clay narrator is an observer at the lower left beside the open doorway, one hand inviting the eye into the interior. Cream daylight through high windows and a warm wooden reception counter establish the place. Keep a continuous upper background; no other people or markings.",
    motion: "The narrator turns slightly toward the entrance, makes one inviting hand gesture and holds. The doorway, counter and lighting remain stable.",
    metaphor: "The hospital is the literal shared setting. No faith is assigned to the presenter." },
  { cue: /\b(?:hospitals?|hôpitaux|hopitaux)\b.*\b(?:universit\w*|neighbou?rhoods?|quartiers?)\b/iu,
    scene: "High three-quarter view across a small clay civic square with three distinct unlettered entrances: a reception window, a reading-room doorway and an apartment doorway. The locked narrator stands near the lower right edge looking across the square. Open diffuse daylight separates the cream facades from the brown paths. Keep continuous upper wall surfaces, with no extra people.",
    motion: "The narrator slowly guides an open hand across the three entrances from left to right, then rests it at the torso. Facades and camera remain still.",
    metaphor: "The three places mentioned in the line are visible as a shared civic environment." },
  { cue: /\b(?:doctors?|médecins?|medecins?|saving lives|soign\w*)\b/iu,
    scene: "Close over-the-shoulder view of the locked narrator looking at a neat miniature hospital worktop. A stethoscope, folded clean cloth and plain medical tray fill the foreground; the narrator's familiar cap and shoulder establish continuity at the left edge. Soft side daylight, shallow depth of field; instruments are the focus. No patient, medical procedure, new character or lettering.",
    motion: "The narrator points once toward the stethoscope, keeping fingers clear of the instruments, then holds. The instruments stay in place.",
    metaphor: "Concrete medical tools carry the subject of the spoken line. The recurring narrator observes the setting without being recast as a doctor." },
  { cue: /\b(?:judg\w*|juge|court|tribunal|prison|justice)\b/iu,
    scene: "Low three-quarter medium view of an empty miniature courtroom bench. A balanced brass-colored clay scale is clearly visible on the desk; the locked narrator stands to the side as a guide, looking toward the bench. Directional window light gives the wood depth, with an uncluttered wall above. No judge, defendant, prison bars, emblems or readable documents.",
    motion: "The narrator turns an open hand toward the empty bench and holds. The scale remains level and still; no verdict or punishment is reenacted.",
    metaphor: "A courtroom and scales directly establish the institution named in the narration without inventing likenesses or a reenactment." },
  { cue: /\b(?:vote|votes|parliament|businesses|parlement|entreprises?|citizens?|citoyens?)\b/iu,
    scene: "Wide elevated view of a clay civic forecourt joining an unlettered shopfront and public assembly entrance. The locked narrator stands in the foreground off-center, facing the buildings rather than the camera. Bright neutral daylight and long soft shadows distinguish this exterior from interior scenes. A continuous calm upper sky leaves room for a short local title; no crowds, flags or invented statistics.",
    motion: "The narrator takes one small step along the foreground path and gestures toward the two civic entrances, then settles. The facades remain stationary.",
    metaphor: "The places and activities named in the sentence determine the set. The illustration does not claim to document actual people or an event." },
  { cue: /\b(?:soldier|military|army|armée|armee|command\w*)\b/iu,
    scene: "Side-profile medium view of the locked narrator beside an empty clay service briefing desk. A blank folded map, simple headset and orderly chairs establish the workplace without weapons, uniforms, insignia or other people. Cool window light with warm reflected wood light. The narrator observes the desk rather than posing frontally.",
    motion: "The narrator follows the route on the blank map with one finger, then lifts the hand and pauses. The map stays folded in the same state.",
    metaphor: "A service briefing setting addresses the institutional context; no unapproved soldiers or religious identities are invented." },
  { cue: /\b(?:welcome|bienvenue)\b/iu,
    scene: "Establishing wide shot through a clay courtyard arch toward a sunlit street of warm stone buildings. The locked narrator is seen from behind at three-quarter angle near the lower edge, turning the head slightly toward the view. The architecture fills the vertical depth. No recognizable landmark, flags, crowds or lettering.",
    motion: "The narrator looks from the courtyard toward the street and makes a small welcoming gesture. One slow, short camera move forward; no cuts.",
    metaphor: "An establishing view opens the setting named by the narration without pretending to reproduce a specific documented location." },
  { cue: /\b(?:not.*joke|beginning of a joke|pas.*blague)\b/iu,
    scene: "Medium close-up of the locked narrator in three-quarter view, brows gently lifted and one palm slightly raised. A softly focused cream architectural wall fills the frame continuously, with side window light catching the clay texture. Reserve a quiet upper title area; no props or other characters.",
    motion: "The narrator gives a restrained head shake and lowers the raised palm, settling into a sincere expression. Static camera.",
    metaphor: "A reaction close-up delivers the tonal correction; a literal reenactment of a joke would distract from the line.", presenter: true },
  { cue: /\b(?:source|sources|evidence|proof|preuves?|vérifi\w*|verif\w*|check|facts?|faits?)\b/iu,
    scene: "Medium close-up from a three-quarter angle of the locked clay narrator holding a magnifying glass above an open blank book on a warm desk. The book and hands are fully visible, lit by a soft side window; the presenter looks at the page instead of the camera.",
    motion: "The narrator slowly moves the magnifying glass across one page, then pauses. The book remains open in the same state.",
    metaphor: "Examining the original source is shown as a concrete action rather than a generic talking pose." },
  { cue: /\b(?:read|lire|passage|context|contexte|quotes?|citations?|extract|extrait)\b/iu,
    scene: "Over-the-shoulder close-up of the locked clay narrator's finger following the full width of a blank page in an already open book. Both page margins and surrounding pages remain visible. Warm desk-lamp light gives the paper texture depth. No readable lettering or additional people.",
    motion: "The narrator slowly traces from the left margin to the right margin, then rests the hand beside the page. The book stays open and intact.",
    metaphor: "The complete passage stays visible as the guide examines it, directly illustrating reading in context without an artificial reveal." },
  { cue: /\b(?:spread|spreads|viral|share|shares|sharing|partag\w*|diffus\w*|réseaux|networks?|online)\b/iu,
    scene: "High oblique close-up of the locked narrator's hands beside a clay phone resting on a desk, its screen blank. One index finger hovers above the device without touching it; the edge of an open blank source book is visible nearby. Calm daylight and a clear tabletop make the pause readable.",
    motion: "The hovering finger withdraws slightly, and the narrator turns the hand toward the source book. Phone and book remain still.",
    metaphor: "Pausing before sharing is a visible decision tied to the device and source, with no symbolic chain invented." },
  { cue: /\b(?:lies?|false|fake|rumou?rs?|mensonges?|faux|fausse|rumeurs?|fabricat\w*)\b/iu,
    scene: "Three-quarter medium view of the locked clay narrator inspecting an already lifted theatrical cardboard facade, with its wooden supports clearly visible behind it. Warm side-lit workbench, no actual people or historical event depicted.",
    motion: "The narrator points once from the facade toward its visible supports and holds. Its position and shape remain unchanged.",
    metaphor: "The visibly constructed facade is used only for a direct fabrication claim, not as a stand-in for a community." },
  { cue: /\b(?:history|histor\w*|histoire|past|passé|centur\w*|siècles?|medieval|médiéval\w*)\b/iu,
    scene: "Medium high-angle view of the locked narrator beside a closed weathered clay archive box on a desk. Both hands and the hinged lid are fully visible. Warm raking light reveals the paper texture, without dates or invented historic details.",
    motion: "The left hand steadies the archive box. The right hand slowly opens the hinged lid away from the body and holds it upright; the box stays on the desk.",
    endScene: "The locked narrator at the same desk, same high camera and warm raking light; the archive box lid is now upright with the right hand holding it, while the left hand steadies the box. Blank papers inside are visible.",
    metaphor: "Opening an archive is a direct investigation action with distinct initial and final states." },
  { cue: /\b(?:reality|réalité|realite)\b/iu,
    scene: "Wide eye-level view across a tangible clay courtyard with a shared bench, an open reading doorway and a reception window in the background. The locked narrator touches the near bench lightly, turned three-quarter toward the space. Natural morning side light and grounded contact shadows emphasize a physical place. No additional people.",
    motion: "The narrator rests a hand briefly on the bench and looks across the courtyard, then holds. The camera and set remain still.",
    metaphor: "A concrete shared place supports the contrast with an abstract dream; it is an illustration, not evidence of a particular event." },
];

function excerpt(narration: string) {
  const words = narration.trim().split(/\s+/);
  let title = "";
  for (const word of words) { if (`${title} ${word}`.trim().length > 84 || title.split(/\s+/).length >= 10) break; title = `${title} ${word}`.trim(); }
  return title || null;
}
const NEUTRAL_VIEWS = [
  "Three-quarter medium close-up, attentive expression, soft side window light, presenter looking slightly past the lens.",
  "Side-angle waist-up view, one open palm, soft reflected daylight, gaze toward the quiet graphic area.",
  "Eye-level close-up, a thoughtful expression and subtle rim light from a nearby window, hands below the face.",
];

export function suggestDirection(narration: string, index = 0): SceneDirection {
  const explicitContext = /^context can change everything[.!?]?$/i.test(narration.trim());
  const idea = explicitContext ? undefined : IDEAS.find(item => item.cue.test(narration));
  const presenter = !idea || idea.presenter === true;
  return {
    scene: idea?.scene ?? `The locked clay narrator in a continuous warm cream miniature interior. ${NEUTRAL_VIEWS[index % NEUTRAL_VIEWS.length]} Keep the upper 38 percent quiet for locally composed typography. Neutral staging for an abstract line; do not invent a factual event, prop analogy or new cast.`,
    motion: `Continuous single take. ${idea?.motion ?? "The narrator makes one restrained open-hand gesture near the torso and holds a thoughtful final pose. Static camera, no zoom."} No cuts.`,
    references: ["narrator"], endScene: idea?.endScene ?? null, overlay: presenter ? excerpt(narration) : null, strike: false,
    visualMode: presenter ? "presenter-text" : "metaphor", treatment: presenter ? "presenter-text" : "literal-action",
    metaphor: idea?.metaphor ?? "A short exact excerpt carries this abstract statement; a purposeful reaction shot adds tone without a forced visual analogy.",
    graphicLayers:[],
    stateChange: Boolean(idea?.endScene), actionSeconds: idea?.endScene ? 5 : 4, breathBefore: .4,
  };
}

/** Same deterministic image needs serve the launch disclosure and the director.
 * User-supplied scene directions remain authoritative in planConcept. */
export function prepareStoryboardDirections(narrations: string[]): Record<string, SceneDirection> {
  return Object.fromEntries(narrations.map((narration, index) => [index + 1, suggestDirection(narration, index)]));
}
