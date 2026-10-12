/**
 * Motion library for the collage engine (Shimon's brief, 2026-08-20):
 * varied movements, entrances / exits / transformations / camera, and an
 * anti-repetition picker so no two consecutive events look alike.
 *
 * Every preset compiles to GSAP timeline lines (strings) placed at `at`
 * seconds on the single paused timeline of the composition. Elements start
 * hidden (opacity 0 in CSS); entrances use fromTo with immediateRender:false
 * so the DOM stays measurable at load and seeking stays deterministic.
 */

export type MotionKind = "enter" | "exit" | "transform" | "camera";
/** Energy of a movement; the director asks for an energy, the picker chooses the preset. */
export type Energy = "hard" | "soft";

export type MotionContext = {
  W: number;
  H: number;
  /** Final rotation of the element (deg), from its layout box. */
  rotation: number;
  /** Selector of the scene camera wrapper (for shakes / punches). */
  cam: string;
};

export type MotionPreset = {
  id: string;
  kind: MotionKind;
  energy: Energy;
  description: string;
  /** Seconds the movement takes. */
  dur: number;
  /** Extra CSS the element needs (e.g. transform-origin, perspective). */
  css?: string;
  /** GSAP lines; `sel` is the element selector, `at` the time (s). */
  lines: (sel: string, at: number, ctx: MotionContext) => string[];
};

const f = (n: number) => Number(n.toFixed(3));
const shake = (cam: string, at: number, px = 9, reps = 5) =>
  `tl.to("${cam}", { x: -${px}, duration: 0.05, yoyo: true, repeat: ${reps}, ease: "none" }, ${f(at)});`;

// ---------------------------------------------------------------------------
// ENTRANCES (12)
// ---------------------------------------------------------------------------
const ENTERS: MotionPreset[] = [
  {
    id: "stamp", kind: "enter", energy: "hard", dur: 0.3,
    description: "hard stamp from above, lands with a tiny recoil: cards, documents, verdicts",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, scale: 1.4, rotation: ${f(c.rotation - 6)} }, { opacity: 1, scale: 1, rotation: ${f(c.rotation)}, duration: 0.3, ease: "back.out(2.4)", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "slide-left", kind: "enter", energy: "soft", dur: 0.45,
    description: "slides in from the left edge, settles with a slight overshoot",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, x: -${f(c.W * 0.7)}, rotation: ${f(c.rotation - 9)} }, { opacity: 1, x: 0, rotation: ${f(c.rotation)}, duration: 0.45, ease: "power3.out", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "slide-right", kind: "enter", energy: "soft", dur: 0.45,
    description: "slides in from the right edge",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, x: ${f(c.W * 0.7)}, rotation: ${f(c.rotation + 9)} }, { opacity: 1, x: 0, rotation: ${f(c.rotation)}, duration: 0.45, ease: "power3.out", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "drop", kind: "enter", energy: "hard", dur: 0.36,
    description: "falls from above and lands hard, camera shakes: weight, impact, evidence dropped on the table",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, y: -${f(c.H * 0.5)}, scale: 1.25, rotation: ${f(c.rotation - 5)} }, { opacity: 1, y: 0, scale: 1, rotation: ${f(c.rotation)}, duration: 0.3, ease: "power4.in", immediateRender: false }, ${f(at)});`,
      shake(c.cam, at + 0.3),
    ],
  },
  {
    id: "pop", kind: "enter", energy: "hard", dur: 0.3,
    description: "pops in with a bounce from tiny: small props, reactions, punctuation",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, scale: 0.15, rotation: ${f(c.rotation + 12)} }, { opacity: 1, scale: 1, rotation: ${f(c.rotation)}, duration: 0.3, ease: "back.out(3)", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "rise", kind: "enter", energy: "soft", dur: 0.42,
    description: "rises from below, like lifted out of a drawer",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, y: ${f(c.H * 0.22)}, rotation: ${f(c.rotation + 3)} }, { opacity: 1, y: 0, rotation: ${f(c.rotation)}, duration: 0.42, ease: "power3.out", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "swing", kind: "enter", energy: "soft", dur: 0.5,
    description: "swings in like hinged on its top-left corner, elastic settle: signs, labels, tags",
    css: "transform-origin: 8% 6%;",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, rotation: ${f(c.rotation - 70)}, scale: 0.9 }, { opacity: 1, rotation: ${f(c.rotation)}, scale: 1, duration: 0.5, ease: "elastic.out(1, 0.55)", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "unfold", kind: "enter", energy: "soft", dur: 0.4,
    description: "unfolds vertically like a folded paper opened: letters, maps, documents",
    css: "transform-origin: 50% 0%;",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, scaleY: 0.05, rotation: ${f(c.rotation)} }, { opacity: 1, scaleY: 1, duration: 0.4, ease: "power2.out", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "flip", kind: "enter", energy: "hard", dur: 0.42,
    description: "flips in around its vertical axis like a card turned face up: reveals, the other side of a claim",
    css: "backface-visibility: hidden;",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, rotationY: -100, rotation: ${f(c.rotation)}, transformPerspective: 3000 }, { opacity: 1, rotationY: 0, duration: 0.42, ease: "power2.out", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "wipe", kind: "enter", energy: "soft", dur: 0.38,
    description: "revealed by a wipe from left to right like torn paper pulled aside",
    lines: (s, at, c) => [
      `tl.set("${s}", { opacity: 1, rotation: ${f(c.rotation)} }, ${f(at)});`,
      `tl.fromTo("${s}", { clipPath: "polygon(0 -10%, 0 -10%, -6% 110%, -6% 110%)" }, { clipPath: "polygon(0 -10%, 106% -10%, 100% 110%, -6% 110%)", duration: 0.38, ease: "power2.inOut", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "toss", kind: "enter", energy: "hard", dur: 0.48,
    description: "tossed onto the table from the bottom-right in an arc, spins and lands: casual evidence, things thrown in",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, x: ${f(c.W * 0.45)}, y: ${f(c.H * 0.3)}, rotation: ${f(c.rotation + 60)}, scale: 0.7 }, { opacity: 1, x: 0, y: 0, rotation: ${f(c.rotation)}, scale: 1, duration: 0.48, ease: "power2.out", immediateRender: false }, ${f(at)});`,
    ],
  },
  {
    id: "focus", kind: "enter", energy: "soft", dur: 0.5,
    description: "comes into focus from blur, slightly larger: memories, archives, 'look closer'",
    lines: (s, at, c) => [
      `tl.fromTo("${s}", { opacity: 0, scale: 1.12, filter: "blur(18px)", rotation: ${f(c.rotation)} }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.5, ease: "power2.out", immediateRender: false }, ${f(at)});`,
    ],
  },
];

// ---------------------------------------------------------------------------
// EXITS (6)
// ---------------------------------------------------------------------------
const EXITS: MotionPreset[] = [
  {
    id: "out-left", kind: "exit", energy: "soft", dur: 0.35,
    description: "swept out to the left",
    lines: (s, at, c) => [`tl.to("${s}", { opacity: 0, x: -${f(c.W * 0.6)}, rotation: ${f(c.rotation - 8)}, duration: 0.35, ease: "power3.in" }, ${f(at)});`],
  },
  {
    id: "out-right", kind: "exit", energy: "soft", dur: 0.35,
    description: "swept out to the right",
    lines: (s, at, c) => [`tl.to("${s}", { opacity: 0, x: ${f(c.W * 0.6)}, rotation: ${f(c.rotation + 8)}, duration: 0.35, ease: "power3.in" }, ${f(at)});`],
  },
  {
    id: "fall", kind: "exit", energy: "hard", dur: 0.4,
    description: "falls off the bottom of the frame, tumbling: discarded, debunked",
    lines: (s, at, c) => [`tl.to("${s}", { opacity: 0, y: ${f(c.H * 0.5)}, rotation: ${f(c.rotation + 35)}, duration: 0.4, ease: "power3.in" }, ${f(at)});`],
  },
  {
    id: "shrink", kind: "exit", energy: "soft", dur: 0.3,
    description: "shrinks to a point and disappears",
    lines: (s, at, c) => [`tl.to("${s}", { opacity: 0, scale: 0.1, rotation: ${f(c.rotation + 15)}, duration: 0.3, ease: "power3.in" }, ${f(at)});`],
  },
  {
    id: "lift", kind: "exit", energy: "soft", dur: 0.35,
    description: "lifted up and out of the frame, like picked up",
    lines: (s, at, c) => [`tl.to("${s}", { opacity: 0, y: -${f(c.H * 0.35)}, scale: 1.08, duration: 0.35, ease: "power2.in" }, ${f(at)});`],
  },
  {
    id: "crumple", kind: "exit", energy: "hard", dur: 0.36,
    description: "crumpled: squashed and twisted, then gone (the lie thrown away)",
    lines: (s, at, c) => [
      `tl.to("${s}", { scaleX: 0.55, scaleY: 0.7, rotation: ${f(c.rotation + 40)}, duration: 0.2, ease: "power3.in" }, ${f(at)});`,
      `tl.to("${s}", { opacity: 0, scale: 0.05, y: 60, duration: 0.16, ease: "power2.in" }, ${f(at + 0.2)});`,
    ],
  },
];

// ---------------------------------------------------------------------------
// TRANSFORMATIONS on a visible element (7)
// ---------------------------------------------------------------------------
const TRANSFORMS: MotionPreset[] = [
  {
    id: "wobble", kind: "transform", energy: "soft", dur: 0.6,
    description: "wobbles left-right a few times: doubt, instability",
    lines: (s, at, c) => [`tl.to("${s}", { rotation: ${f(c.rotation + 4)}, duration: 0.1, yoyo: true, repeat: 5, ease: "sine.inOut" }, ${f(at)});`],
  },
  {
    id: "pulse", kind: "transform", energy: "soft", dur: 0.36,
    description: "quick pulse up and back: 'this one', emphasis on a named element",
    lines: (s, at) => [`tl.to("${s}", { scale: 1.1, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.inOut" }, ${f(at)});`],
  },
  {
    id: "grow", kind: "transform", energy: "hard", dur: 0.4,
    description: "grows and stays bigger: the claim inflated, made to look larger than it is",
    lines: (s, at) => [`tl.to("${s}", { scale: 1.28, duration: 0.4, ease: "back.out(1.8)" }, ${f(at)});`],
  },
  {
    id: "tilt", kind: "transform", energy: "soft", dur: 0.35,
    description: "tilts to a new angle and stays: something pushed, twisted",
    lines: (s, at, c) => [`tl.to("${s}", { rotation: ${f(c.rotation - 14)}, x: -18, duration: 0.35, ease: "power2.inOut" }, ${f(at)});`],
  },
  {
    id: "jolt", kind: "transform", energy: "hard", dur: 0.3,
    description: "gets hit: jumps sideways and shakes, camera shakes too",
    lines: (s, at, c) => [
      `tl.to("${s}", { x: 26, rotation: ${f(c.rotation + 6)}, duration: 0.06, yoyo: true, repeat: 3, ease: "none" }, ${f(at)});`,
      shake(c.cam, at, 7, 3),
    ],
  },
  {
    id: "dim", kind: "transform", energy: "soft", dur: 0.4,
    description: "fades to a ghost (40%): out of the picture, secondary now",
    lines: (s, at) => [`tl.to("${s}", { opacity: 0.4, scale: 0.94, duration: 0.4, ease: "power2.out" }, ${f(at)});`],
  },
  {
    id: "flip-over", kind: "transform", energy: "hard", dur: 0.45,
    description: "turns over around its vertical axis (shows its back, then front again): the other side of the story",
    lines: (s, at) => [`tl.to("${s}", { rotationY: 360, transformPerspective: 4000, duration: 0.5, ease: "power2.inOut" }, ${f(at)});`],
  },
];

// ---------------------------------------------------------------------------
// CAMERA on the scene wrapper (6)
// ---------------------------------------------------------------------------
const CAMERAS: MotionPreset[] = [
  {
    id: "push-in", kind: "camera", energy: "soft", dur: 0,
    description: "slow push-in over the whole sentence (default breathing)",
    lines: (s, at) => [`tl.fromTo("${s}", { scale: 1 }, { scale: 1.07, duration: DUR, ease: "none", immediateRender: false }, ${f(at)});`],
  },
  {
    id: "pull-back", kind: "camera", energy: "soft", dur: 0,
    description: "slow pull-back over the sentence: revealing the whole picture",
    lines: (s, at) => [`tl.fromTo("${s}", { scale: 1.09 }, { scale: 1, duration: DUR, ease: "none", immediateRender: false }, ${f(at)});`],
  },
  {
    id: "pan-left", kind: "camera", energy: "soft", dur: 0,
    description: "slow drift to the left with a light push-in",
    lines: (s, at, c) => [`tl.fromTo("${s}", { x: ${f(c.W * 0.02)}, scale: 1.04 }, { x: -${f(c.W * 0.02)}, scale: 1.07, duration: DUR, ease: "none", immediateRender: false }, ${f(at)});`],
  },
  {
    id: "pan-right", kind: "camera", energy: "soft", dur: 0,
    description: "slow drift to the right with a light push-in",
    lines: (s, at, c) => [`tl.fromTo("${s}", { x: -${f(c.W * 0.02)}, scale: 1.04 }, { x: ${f(c.W * 0.02)}, scale: 1.07, duration: DUR, ease: "none", immediateRender: false }, ${f(at)});`],
  },
  {
    id: "punch", kind: "camera", energy: "hard", dur: 0.5,
    description: "quick punch-in on a word (zoom 1 → 1.16, then holds): the key word of the sentence",
    lines: (s, at) => [`tl.to("${s}", { scale: 1.16, duration: 0.5, ease: "power4.out" }, ${f(at)});`],
  },
  {
    id: "shake", kind: "camera", energy: "hard", dur: 0.3,
    description: "camera shake alone: impact without a new element",
    lines: (s, at) => [shake(s, at, 10, 5)],
  },
];

export const MOTIONS: MotionPreset[] = [...ENTERS, ...EXITS, ...TRANSFORMS, ...CAMERAS];
export const MOTION_IDS = MOTIONS.map((m) => m.id);
export type MotionId = (typeof MOTION_IDS)[number];

const BY_ID = new Map(MOTIONS.map((m) => [m.id, m]));
export function motion(id: string): MotionPreset | undefined {
  return BY_ID.get(id);
}
export function motionsOf(kind: MotionKind): MotionPreset[] {
  return MOTIONS.filter((m) => m.kind === kind);
}

/** One-line catalogue for the director prompt. */
export function motionCatalogue(kind: MotionKind): string {
  return motionsOf(kind).map((m) => `"${m.id}" (${m.energy}): ${m.description}`).join("\n");
}

/**
 * Anti-repetition picker, one per video.
 * Rules: never the same preset twice in a row within a kind; never the same
 * preset for two consecutive events of a sentence; a preset is used at most
 * `maxUses` times per video (3 by default) before it is retired; when the
 * director's request is unavailable, the least-used preset of the same kind
 * and energy is chosen.
 */
export class MotionPicker {
  private uses = new Map<string, number>();
  private lastByKind = new Map<MotionKind, string>();
  private lastEventId = "";
  private seq = 0;

  constructor(private maxUses = 3, private seed = 1) {}

  private rnd(): number {
    this.seq++;
    const x = Math.sin(this.seed * 12.9898 + this.seq * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /** Called at the start of each sentence: consecutive-event memory resets, video-level memory stays. */
  newSentence(): void {
    this.lastEventId = "";
  }

  pick(kind: MotionKind, wanted?: string, energy?: Energy): MotionPreset {
    const pool = motionsOf(kind);
    const ok = (m: MotionPreset) =>
      (this.uses.get(m.id) ?? 0) < this.maxUses && m.id !== this.lastByKind.get(kind) && m.id !== this.lastEventId;
    let chosen: MotionPreset | undefined;
    const w = wanted ? BY_ID.get(wanted) : undefined;
    if (w && w.kind === kind && ok(w)) chosen = w;
    if (!chosen) {
      const wantedEnergy = energy ?? w?.energy;
      let candidates = pool.filter(ok);
      if (candidates.length === 0) candidates = pool.filter((m) => m.id !== this.lastByKind.get(kind));
      if (candidates.length === 0) candidates = pool;
      const sameEnergy = wantedEnergy ? candidates.filter((m) => m.energy === wantedEnergy) : [];
      if (sameEnergy.length) candidates = sameEnergy;
      const min = Math.min(...candidates.map((m) => this.uses.get(m.id) ?? 0));
      const least = candidates.filter((m) => (this.uses.get(m.id) ?? 0) === min);
      chosen = least[Math.floor(this.rnd() * least.length)] ?? candidates[0];
    }
    this.uses.set(chosen.id, (this.uses.get(chosen.id) ?? 0) + 1);
    this.lastByKind.set(kind, chosen.id);
    this.lastEventId = chosen.id;
    return chosen;
  }

  /** Usage report (for the audit). */
  report(): Record<string, number> {
    return Object.fromEntries([...this.uses.entries()].sort((a, b) => b[1] - a[1]));
  }
}

/**
 * Compiles a preset into timeline lines. `sentenceDur` replaces the DUR token
 * of camera presets that span the whole sentence.
 */
export function compileMotion(m: MotionPreset, sel: string, at: number, ctx: MotionContext, sentenceDur = 3): string[] {
  return m.lines(sel, at, ctx).map((l) => l.replace(/DUR/g, sentenceDur.toFixed(3)));
}
