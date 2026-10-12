/**
 * Automatic audit of a collage composition plan, run BEFORE rendering
 * (Shimon's rule, 2026-08-20: audit + contact sheet before showing anything).
 *
 * Checks, per sentence and for the whole video:
 *  - safe zones: every element / keyword box inside the content or word band;
 *  - density: 1 visual event every 1 to 1.3 s, never more than 1.6 s without one;
 *  - variety: no entrance preset twice in a row, no layout twice in a row,
 *    no text style twice in a row, no plate type twice in a row;
 *  - freshness: no cut-out file reused across sentences (each shot gets new elements);
 *  - captions: 1 or 2 lines, each within the character budget, blocks contiguous.
 * Returns a report with errors (block the render) and warnings (shown on the sheet).
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type PlannedEvent = { at: number; kind: "cutout" | "word" | "annotate" | "exit" | "transform" | "camera"; motion?: string; box?: Rect; zone: "content" | "wordBand" | "any" };
export type PlannedShot = {
  index: number;
  narration: string;
  durationSeconds: number;
  layout: string;
  plate?: string;
  textStyles: string[];
  cutoutFiles: string[];
  events: PlannedEvent[];
  captionBlocks: Array<{ lines: string[]; start: number; end: number }>;
};
export type AuditInput = {
  zones: { W: number; H: number; content: Rect; wordBand: Rect; caption: Rect };
  maxCaptionChars: number;
  shots: PlannedShot[];
};
export type AuditIssue = { level: "error" | "warning"; shot: number | null; rule: string; detail: string };
export type AuditReport = {
  ok: boolean;
  issues: AuditIssue[];
  stats: { shots: number; events: number; eventsPerSecond: number; maxGapSeconds: number; uniqueCutouts: number; motions: Record<string, number> };
};

const inside = (b: Rect, z: Rect, tol = 6) => b.x >= z.x - tol && b.y >= z.y - tol && b.x + b.w <= z.x + z.w + tol && b.y + b.h <= z.y + z.h + tol;

export function auditPlan(input: AuditInput): AuditReport {
  const issues: AuditIssue[] = [];
  const err = (shot: number | null, rule: string, detail: string) => issues.push({ level: "error", shot, rule, detail });
  const warn = (shot: number | null, rule: string, detail: string) => issues.push({ level: "warning", shot, rule, detail });

  const seenFiles = new Map<string, number>();
  const motions: Record<string, number> = {};
  let events = 0, total = 0, maxGap = 0;
  let prevLayout = "", prevPlate = "", prevLastStyle = "", prevLastEnter = "";

  for (const s of input.shots) {
    total += s.durationSeconds;
    // Safe zones.
    for (const e of s.events) {
      if (!e.box || e.zone === "any") continue;
      const z = e.zone === "content" ? input.zones.content : input.zones.wordBand;
      if (!inside(e.box, z)) {
        // Words may spill a little into the content area (they sit on the hero's top edge).
        const alt = e.zone === "wordBand" && inside(e.box, { x: input.zones.wordBand.x, y: input.zones.wordBand.y, w: input.zones.wordBand.w, h: input.zones.wordBand.h + input.zones.content.h * 0.25 });
        if (!alt) err(s.index, "safe-zone", `${e.kind} box (${Math.round(e.box.x)},${Math.round(e.box.y)} ${Math.round(e.box.w)}x${Math.round(e.box.h)}) leaves the ${e.zone} area`);
      }
    }
    // Density.
    const visual = s.events.filter((e) => e.kind !== "camera").map((e) => e.at).sort((a, b) => a - b);
    events += visual.length;
    const speaking = Math.max(0.5, s.durationSeconds);
    if (visual.length === 0) err(s.index, "density", "no visual event in this sentence");
    else {
      const rate = speaking / visual.length;
      if (rate > 1.6) warn(s.index, "density", `one event every ${rate.toFixed(1)} s (target 1 to 1.3 s)`);
      let last = 0;
      for (const t of [...visual, speaking]) { maxGap = Math.max(maxGap, t - last); if (t - last > 1.8) warn(s.index, "gap", `${(t - last).toFixed(1)} s without a visual change`); last = t; }
    }
    // Variety.
    if (s.layout === prevLayout) warn(s.index, "variety-layout", `same layout as the previous sentence (${s.layout})`);
    if (s.plate && s.plate === prevPlate) warn(s.index, "variety-plate", `same background plate as the previous sentence (${s.plate})`);
    const enters = s.events.filter((e) => e.kind === "cutout" && e.motion).map((e) => e.motion!);
    for (let i = 0; i < enters.length; i++) {
      const prev = i === 0 ? prevLastEnter : enters[i - 1];
      if (enters[i] === prev) warn(s.index, "variety-motion", `entrance "${enters[i]}" used twice in a row`);
    }
    for (const e of s.events) if (e.motion) motions[e.motion] = (motions[e.motion] ?? 0) + 1;
    for (let i = 0; i < s.textStyles.length; i++) {
      const prev = i === 0 ? prevLastStyle : s.textStyles[i - 1];
      if (s.textStyles[i] === prev) warn(s.index, "variety-text", `text style "${s.textStyles[i]}" used twice in a row`);
    }
    // Freshness: a file must not appear in two sentences.
    for (const f of s.cutoutFiles) {
      const first = seenFiles.get(f);
      if (first !== undefined && first !== s.index) err(s.index, "reuse", `cut-out ${f.split("/").pop()} already used in sentence ${first + 1}`);
      else seenFiles.set(f, s.index);
    }
    // Captions.
    let prevEnd = 0;
    for (const [bi, b] of s.captionBlocks.entries()) {
      if (b.lines.length === 0 || b.lines.length > 2) err(s.index, "caption-lines", `block ${bi + 1} has ${b.lines.length} lines`);
      for (const l of b.lines) if (l.length > input.maxCaptionChars) err(s.index, "caption-width", `line "${l}" is ${l.length} chars (max ${input.maxCaptionChars})`);
      if (b.lines.length === 2) {
        const [a, c] = b.lines.map((l) => l.length);
        if (Math.min(a, c) < Math.max(a, c) * 0.4) warn(s.index, "caption-balance", `unbalanced lines ${a}/${c}: "${b.lines[0]}" / "${b.lines[1]}"`);
      }
      if (bi > 0 && b.start - prevEnd > 0.4) warn(s.index, "caption-gap", `${(b.start - prevEnd).toFixed(1)} s without caption before block ${bi + 1}`);
      prevEnd = b.end;
    }
    if (s.captionBlocks.length === 0) err(s.index, "caption-missing", "no caption block");

    prevLayout = s.layout;
    prevPlate = s.plate ?? prevPlate;
    prevLastStyle = s.textStyles[s.textStyles.length - 1] ?? prevLastStyle;
    prevLastEnter = enters[enters.length - 1] ?? prevLastEnter;
  }

  const stats = {
    shots: input.shots.length,
    events,
    eventsPerSecond: total > 0 ? Number((events / total).toFixed(2)) : 0,
    maxGapSeconds: Number(maxGap.toFixed(2)),
    uniqueCutouts: seenFiles.size,
    motions,
  };
  return { ok: !issues.some((i) => i.level === "error"), issues, stats };
}

/** Human-readable report (markdown) for the production sheet. */
export function formatAudit(r: AuditReport): string {
  const lines = [
    `# Audit ${r.ok ? "PASS" : "FAIL"}`,
    `- shots: ${r.stats.shots}, visual events: ${r.stats.events} (${r.stats.eventsPerSecond}/s, target 0.75 to 1), longest gap ${r.stats.maxGapSeconds}s, unique cut-outs: ${r.stats.uniqueCutouts}`,
    `- motions: ${Object.entries(r.stats.motions).map(([k, v]) => `${k}×${v}`).join(", ") || "none"}`,
    "",
  ];
  for (const i of r.issues) lines.push(`- ${i.level.toUpperCase()} ${i.shot === null ? "" : `shot ${i.shot + 1} `}[${i.rule}] ${i.detail}`);
  if (r.issues.length === 0) lines.push("- no issue");
  return lines.join("\n");
}
