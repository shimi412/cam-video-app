/**
 * Text treatment library for on-screen keywords (collage engine).
 * Each style is pure CSS/HTML, deterministic (seeded), rendered by HyperFrames.
 * Fonts: macOS system fonts declared with @font-face local(); on the client
 * VPS the same families will be bundled as woff2 (TODO before deployment).
 *
 * Anti-repetition is enforced by the composer: never the same style twice in a
 * row, at most 3 uses of a style per video.
 */

export const TEXT_STYLES = [
  "marker-red",
  "marker-black",
  "ransom",
  "stamp",
  "label-tape",
  "headline-highlight",
  "circled",
  "typewriter-strip",
] as const;
export type TextStyleId = (typeof TEXT_STYLES)[number];

export const TEXT_STYLE_DESCRIPTIONS: Record<TextStyleId, string> = {
  "marker-red": "handwritten red marker, slightly rotated: the lie, alerts, the key accusation word",
  "marker-black": "handwritten black marker: neutral keywords, names of things",
  ransom: "cut-out newspaper letters (ransom note): the lie as something assembled, fabricated, anonymous",
  stamp: "red rubber stamp in a box: verdicts (LIE, FAKE, DEBUNKED, NOT NEW)",
  "label-tape": "typewriter label on a strip of tape: names, dates, sources, places (TALMUD, 1,500 YEARS)",
  "headline-highlight": "bold condensed headline with a highlighter sweep: numbers, big claims",
  circled: "marker word with a hand-drawn circle around it: the thing to look at",
  "typewriter-strip": "typewriter text on a torn paper strip: quotes, definitions, archival feel",
};

/** Seeded pseudo-random in [0,1). */
export function seeded(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function textStylesCss(accent: string, ink: string, secondary: string): string {
  return `
      @font-face { font-family: "Marker Felt"; src: local("Marker Felt"), local("MarkerFelt-Wide"), local("MarkerFelt-Thin"); }
      @font-face { font-family: "DIN Condensed"; src: local("DIN Condensed"), local("DINCondensed-Bold"), local("DIN Condensed Bold"); }
      @font-face { font-family: "Copperplate"; src: local("Copperplate"), local("Copperplate-Bold"); }
      @font-face { font-family: "American Typewriter"; src: local("American Typewriter"), local("AmericanTypewriter-Bold"), local("AmericanTypewriter"); }
      @font-face { font-family: "Futura"; src: local("Futura"), local("Futura-Bold"), local("Futura-CondensedExtraBold"); }
      @font-face { font-family: "Georgia"; src: local("Georgia"), local("Georgia-Bold"); }
      @font-face { font-family: "Noteworthy"; src: local("Noteworthy"), local("Noteworthy-Bold"); }
      .kw { position: absolute; margin: 0; white-space: nowrap; opacity: 0; transform-origin: 50% 50%; display: inline-block; }
      .kw-marker { font-family: "Marker Felt", "Noteworthy", cursive; letter-spacing: 3px; line-height: 1; }
      .kw-marker.red { color: ${accent}; }
      .kw-marker.black { color: ${ink}; }
      .kw-ransom { font-weight: 700; line-height: 1; }
      .kw-ransom .ch { display: inline-block; padding: 0.04em 0.14em; margin: 0 0.035em; border-radius: 2px; box-shadow: 2px 3px 4px rgba(40,30,10,0.25); line-height: 1.05; }
      .kw-stamp { font-family: "Copperplate", "DIN Condensed", "Futura", sans-serif; font-weight: 700; color: ${accent}; border: 0.09em solid ${accent}; border-radius: 0.12em; padding: 0.08em 0.28em; letter-spacing: 0.06em; line-height: 1.05; opacity: 0; mix-blend-mode: multiply; text-transform: uppercase; }
      .kw-stamp::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(115deg, rgba(243,234,216,0) 0 7px, rgba(243,234,216,0.45) 7px 9px); pointer-events: none; }
      .kw-label { font-family: "American Typewriter", "Courier New", monospace; font-weight: 700; color: ${ink}; background: rgba(245,239,226,0.96); padding: 0.18em 0.6em; letter-spacing: 0.12em; text-transform: uppercase; line-height: 1.1; box-shadow: 2px 4px 6px rgba(40,30,10,0.28); clip-path: polygon(2% 0, 98% 3%, 100% 92%, 97% 100%, 3% 97%, 0 8%); }
      .kw-headline { font-family: "DIN Condensed", "Futura", Impact, "Arial Narrow", sans-serif; font-weight: 700; color: ${ink}; text-transform: uppercase; letter-spacing: 0.01em; line-height: 0.95; position: absolute; }
      .kw-headline .hl { position: absolute; left: -0.1em; right: -0.1em; top: 0.52em; height: 0.48em; background: ${accent}; opacity: 0.55; transform-origin: 0 50%; transform: scaleX(0); z-index: -1; display: block; }
      .kw-headline .txt { position: relative; display: inline-block; }
      .kw-circled { font-family: "Marker Felt", "Noteworthy", cursive; color: ${ink}; letter-spacing: 2px; line-height: 1; }
      .kw-typew { font-family: "American Typewriter", "Courier New", monospace; font-weight: 400; color: ${ink}; background: #f6f1e4; padding: 0.22em 0.7em; line-height: 1.15; letter-spacing: 0.02em; box-shadow: 3px 5px 6px rgba(40,30,10,0.25); clip-path: polygon(0 6%, 3% 0, 97% 2%, 100% 10%, 99% 94%, 96% 100%, 2% 98%, 1% 90%); }
      .kw-secondary { color: ${secondary} !important; }
  `;
}

export type RenderedKeyword = {
  /** Element HTML (with id). */
  html: string;
  /** GSAP entrance line(s) to push into the timeline at `at`. Use placeholders AT for time. */
  tweens: string[];
  /** Approximate rendered width/height in px (for layout bookkeeping). */
  width: number;
  height: number;
  rotation: number;
};

const RANSOM_FONTS = ["'DIN Condensed'", "Georgia", "Copperplate", "'American Typewriter'", "Futura", "'Marker Felt'"];
/** Paper chips behind ransom letters: [background, text color]. Contrasted on purpose so the cut-out reads. */
const RANSOM_CHIPS: Array<[string, string]> = [["#ffffff", "#1a1a1a"], ["#e8dfc8", "#1a1a1a"], ["#1a1a1a", "#f6f1e4"], ["#d83b1f", "#ffffff"], ["#f6f1e4", "#1a1a1a"], ["#cfd6d8", "#1a1a1a"]];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Renders a keyword element in a style. `fontPx` is the base size; `seed`
 * varies rotation, letter fonts and colors deterministically.
 */
export function renderKeyword(opts: {
  id: string;
  text: string;
  style: TextStyleId;
  fontPx: number;
  seed: number;
  accent: string;
  ink: string;
  secondary: string;
  /** Extra inline CSS (position) merged into the element's style attribute. */
  css?: string;
}): RenderedKeyword {
  const { id, text, style, fontPx, seed } = opts;
  const pos = opts.css ?? "";
  const rnd = seeded(seed);
  const t = text.toUpperCase();
  const rot = (rnd() - 0.5) * 12; // -6..6
  const approxW = t.length * fontPx * 0.62;
  const base = `id="${id}" class="kw`;
  switch (style) {
    case "marker-red":
    case "marker-black": {
      const cls = style === "marker-red" ? "red" : "black";
      const fs = Math.round(fontPx * 1.15);
      return {
        html: `<p ${base} kw-marker ${cls}" style="${pos}font-size:${fs}px">${esc(t)}</p>`,
        tweens: [`tl.fromTo("#${id}", { opacity: 0, scale: 0.3, rotation: ${(rot - 10).toFixed(1)} }, { opacity: 1, scale: 1, rotation: ${rot.toFixed(1)}, duration: 0.3, ease: "back.out(3)", immediateRender: false }, AT);`],
        width: approxW * 1.15, height: fs, rotation: rot,
      };
    }
    case "ransom": {
      const fs = Math.round(fontPx * 0.95);
      const chars = [...t].map((ch, i) => {
        if (ch === " ") return `<span class="ch" style="background:transparent;box-shadow:none;padding:0 0.2em"> </span>`;
        const font = RANSOM_FONTS[Math.floor(rnd() * RANSOM_FONTS.length)];
        const [paper, color] = RANSOM_CHIPS[Math.floor(rnd() * RANSOM_CHIPS.length)];
        const r = (rnd() - 0.5) * 16;
        const size = 0.8 + rnd() * 0.5;
        const dy = (rnd() - 0.5) * 0.3;
        return `<span class="ch" id="${id}-c${i}" style="font-family:${font};background:${paper};color:${color};font-size:${size.toFixed(2)}em;transform:rotate(${r.toFixed(1)}deg) translateY(${dy.toFixed(2)}em)">${esc(ch)}</span>`;
      });
      const n = [...t].filter((c) => c !== " ").length;
      return {
        html: `<p ${base} kw-ransom" style="${pos}font-size:${fs}px">${chars.join("")}</p>`,
        tweens: [
          `tl.set("#${id}", { opacity: 1, rotation: ${(rot * 0.4).toFixed(1)} }, AT);`,
          `tl.fromTo("#${id} .ch", { opacity: 0, y: -40, scale: 1.3 }, { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: "back.out(2)", stagger: ${(0.32 / Math.max(1, n)).toFixed(3)}, immediateRender: false }, AT);`,
        ],
        width: t.length * fs * 0.92, height: fs * 1.5, rotation: rot * 0.4,
      };
    }
    case "stamp": {
      const fs = Math.round(fontPx * 0.9);
      const r = -8 - rnd() * 10;
      return {
        html: `<p ${base} kw-stamp" style="${pos}font-size:${fs}px">${esc(t)}</p>`,
        tweens: [`tl.fromTo("#${id}", { opacity: 0, scale: 1.8, rotation: ${(r - 4).toFixed(1)} }, { opacity: 0.92, scale: 1, rotation: ${r.toFixed(1)}, duration: 0.22, ease: "power4.in", immediateRender: false }, AT);`],
        width: approxW * 1.1 + fs * 0.7, height: fs * 1.4, rotation: r,
      };
    }
    case "label-tape": {
      const fs = Math.round(fontPx * 0.62);
      const r = (rnd() - 0.5) * 6;
      return {
        html: `<p ${base} kw-label" style="${pos}font-size:${fs}px">${esc(t)}</p>`,
        tweens: [`tl.fromTo("#${id}", { opacity: 0, y: 30, rotation: ${(r + 3).toFixed(1)} }, { opacity: 1, y: 0, rotation: ${r.toFixed(1)}, duration: 0.28, ease: "power3.out", immediateRender: false }, AT);`],
        width: t.length * fs * 0.78 + fs * 1.4, height: fs * 1.6, rotation: r,
      };
    }
    case "headline-highlight": {
      const fs = Math.round(fontPx * 1.35);
      return {
        html: `<p ${base} kw-headline" style="${pos}font-size:${fs}px"><span class="txt">${esc(t)}<span class="hl" id="${id}-hl"></span></span></p>`,
        tweens: [
          `tl.fromTo("#${id}", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.2, ease: "power3.out", immediateRender: false }, AT);`,
          `tl.fromTo("#${id}-hl", { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power2.inOut", immediateRender: false }, AT + 0.18);`,
        ],
        width: t.length * fs * 0.48, height: fs, rotation: 0,
      };
    }
    case "circled": {
      const fs = Math.round(fontPx * 1.05);
      const w = t.length * fs * 0.62 + fs * 0.9, h = fs * 1.5;
      const path = `M ${w * 0.95} ${h * 0.5} C ${w * 1.02} ${h * 0.1}, ${w * 0.55} ${-h * 0.05}, ${w * 0.3} ${h * 0.08} C ${-w * 0.02} ${h * 0.22}, ${-w * 0.04} ${h * 0.75}, ${w * 0.28} ${h * 0.92} C ${w * 0.6} ${h * 1.08}, ${w * 1.0} ${h * 0.85}, ${w * 0.97} ${h * 0.45}`;
      return {
        html: `<p ${base} kw-circled" style="${pos}font-size:${fs}px;padding:${(fs * 0.25).toFixed(0)}px ${(fs * 0.45).toFixed(0)}px;position:absolute">${esc(t)}<svg style="position:absolute;left:0;top:0;width:${w.toFixed(0)}px;height:${h.toFixed(0)}px;overflow:visible" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}"><path id="${id}-ring" d="${path}" fill="none" stroke="${opts.accent}" stroke-width="${Math.max(6, fs * 0.09).toFixed(0)}" stroke-linecap="round"/></svg></p>`,
        tweens: [
          `tl.fromTo("#${id}", { opacity: 0, scale: 0.5, rotation: ${(rot - 6).toFixed(1)} }, { opacity: 1, scale: 1, rotation: ${rot.toFixed(1)}, duration: 0.25, ease: "back.out(2.5)", immediateRender: false }, AT);`,
          `draw("#${id}-ring", AT + 0.2, 0.45);`,
        ],
        width: w, height: h, rotation: rot,
      };
    }
    case "typewriter-strip": {
      const fs = Math.round(fontPx * 0.58);
      const r = (rnd() - 0.5) * 5;
      return {
        html: `<p ${base} kw-typew" style="${pos}font-size:${fs}px">${esc(text)}</p>`,
        tweens: [`tl.fromTo("#${id}", { opacity: 0, x: -60, rotation: ${r.toFixed(1)} }, { opacity: 1, x: 0, rotation: ${r.toFixed(1)}, duration: 0.3, ease: "power3.out", immediateRender: false }, AT);`],
        width: text.length * fs * 0.62 + fs * 1.6, height: fs * 1.7, rotation: r,
      };
    }
  }
}

/** Strokes that need the dash-offset setup (circled ring). */
export function keywordStrokeSelectors(id: string, style: TextStyleId): string[] {
  return style === "circled" ? [`#${id}-ring`] : [];
}
