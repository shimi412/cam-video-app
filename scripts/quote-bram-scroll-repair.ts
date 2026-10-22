import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { sceneRepairPlan } from "../src/lib/concept/scene-repair";
import { getRecipe } from "../src/lib/recipes";
import { lockedAssets } from "../src/lib/concept/assets";
import { priceCamPlan } from "../src/lib/providers/cam-pricing";

async function main() {
  const id = "2b0df353-688e-4d7c-b5aa-6a31cd4b2f21", base = path.join(process.cwd(), "storage/concepts", id, "live/finishing/claude-method-v3");
  await mkdir(base, { recursive: true });
  const packet = JSON.parse(await readFile(path.join(base, "source-packet.json"), "utf8"));
  const references = (await lockedAssets()).filter(a => a.id === "narrator").map(a => ({ id: a.id, url: a.url, sha256: a.sha256, characterSheet: a.characterSheet }));
  const plan = sceneRepairPlan(packet, 2, {
    metaphor: "Reading the whole passage means opening the entire scroll, instead of looking at a fragment.",
    scene: "Medium three-quarter side view of the locked clay narrator seated at a warm brown clay table. A single tightly closed cream clay scroll cylinder lies across the near side of the table. Only a short blank free edge lies flat under his LEFT hand. His RIGHT palm rests on top of the roll. The space on the table AWAY from his body is empty. Both hands and the complete tabletop are visible. His eyes are open, looking at the roll. Cap, striped shirt, separate brown trousers and suspenders, no overalls.",
    endScene: "Identical narrator, table, camera, light and scroll. A single continuous blank cream strip now lies flat across the full tabletop AWAY from his body. Its near edge is still held by his LEFT hand. The remaining cylinder is visibly thin and rests at the far end of the table, under his RIGHT hand. He leans forward to read, right index resting on the exposed strip, eyes open. Nothing hangs off the table. Keep the same striped shirt, suspenders, brown trousers and cap.",
    motion: "Continuous single take, static camera, no zoom. The LEFT hand pins the free near edge of the scroll flat against the table. The RIGHT hand pushes the cylinder AWAY from the narrator toward the far edge, rolling it forward while maintaining contact with the tabletop. The paper unwinds behind the moving cylinder, exposing a flat strip; the cylinder's diameter gradually DECREASES. The left hand stays fixed. He then places his right index on the exposed strip and follows it with open eyes. Complete the unrolling before the final half second, then hold. No reverse roll, levitation, spinning in place, extra fingers, looking at camera or cuts.",
    references: ["narrator"], overlay: null, strike: false, stateChange: true, actionSeconds: 5, breathBefore: .6,
  }, getRecipe("cam-clay")!, references);
  const prices = JSON.parse(await readFile("storage/qa/cam-bram-repair-prices.json", "utf8"));
  // Reuse the just-observed read-only pricing response. There are no media,
  // alignment or voice operations in this command and no budget approval.
  const quote = await priceCamPlan(plan, { fal: async (url) => {
    if (String(url).includes("/models/pricing?")) return prices;
    throw new Error("Only the verified pricing response is available.");
  }, higgsfield: async () => { throw new Error("No voice generation or cost request in a scene repair."); } }, Date.parse(prices.checkedAt));
  await writeFile(path.join(base, "scroll-repair-plan.json"), JSON.stringify(plan, null, 2));
  await writeFile(path.join(base, "scroll-repair-quote.json"), JSON.stringify({ ...quote, approved: false, priceSource: "fal authenticated pricing GET", priceCheckedAt: prices.checkedAt, automaticRetry: false }, null, 2));
  await writeFile(path.join(base, "../../repair-quote.json"), await readFile(path.join(base, "scroll-repair-quote.json")));
  console.log(JSON.stringify({ totalUsd: quote.caps.usd / 1e6, lines: quote.lines, approved: false }, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
