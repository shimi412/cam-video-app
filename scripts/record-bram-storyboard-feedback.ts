/** Record Shimi's explicit scene-3 rejection and expose the existing keyframes.
 * This is retrospective documentation, never a fabricated pre-production approval. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { pool, schema } from "../src/db";
import { acquireJobLock } from "../src/lib/job-lock";
import { saveCheckpoint, sha256 } from "../src/lib/concept/checkpoints";
import { StoryboardSheetSchema, StoryboardDecisionSchema } from "../src/lib/concept/storyboard-review";
import type { ReviewedSceneRepair } from "../src/lib/concept/scene-repair";
import type { RenderPacket } from "../src/lib/concept/production-flow";

async function main(){
 globalThis.fetch=async()=>{throw new Error("No network in storyboard feedback recording.");};
 const id="2b0df353-688e-4d7c-b5aa-6a31cd4b2f21",lock=await acquireJobLock(id);if(!lock)throw new Error("Production busy.");
 try{
  const base=path.join(process.cwd(),"storage/concepts",id,"live");
  const packet=JSON.parse(await readFile(path.join(base,"finishing/claude-method-v4/render-packet.json"),"utf8")) as RenderPacket;
  const session=JSON.parse(await readFile(path.join(base,"repairs/bram-method-20261014/session.json"),"utf8")) as {trials:Record<string,ReviewedSceneRepair>};
  const selected=["source-v1","scroll-v2","context-v1"];
  const panels=selected.map(name=>{
   const trial=session.trials[name],scene=trial.plan.repair.scene,shot=packet.board.shots.find(s=>s.index===scene)!;
   return {scene,narration:shot.narration,meaning:scene===3?"Rejected: revealing a dove conveys a surprise, but does not show how context changes the interpretation of the same evidence.":shot.metaphor??"Meaning awaiting human review.",startScene:shot.scene,endScene:shot.endScene,motion:shot.motion,actionSeconds:shot.actionSeconds??5,start:trial.media[`scene-${scene}-start`],end:trial.media[`scene-${scene}-end`]};
  });
  const target=sha256(JSON.stringify({job:id,source:packet.fingerprint,panels,retrospective:true}));
  const sheet=StoryboardSheetSchema.parse({version:1,target,panels,retrospective:true});
  const decision=StoryboardDecisionSchema.parse({target,decision:"rejected",actor:"Shimi, explicit chat feedback on 2026-10-14",at:new Date().toISOString(),scene:3,note:"Le dernier plan avec l’oiseau dans le placard ne veut rien dire. Le storyboard complet doit être validé par un humain avant de produire les animations."});
  await saveCheckpoint(path.join(base,"storyboard-review.json"),sheet,lock.assertOwned);
  await saveCheckpoint(path.join(base,"storyboard-reviews",`${target}.json`),decision,lock.assertOwned);
  const finishing=JSON.parse(await readFile(path.join(base,"finishing-review.json"),"utf8"));
  finishing.status="changes-requested";finishing.message="Scene 3 was rejected: the bird in the cupboard does not explain the narration. This film is kept for comparison, not approved for delivery. A revised complete storyboard needs human approval before any new animation.";
  await saveCheckpoint(path.join(base,"finishing-review.json"),finishing,lock.assertOwned);
  const [job]=await lock.db.select().from(schema.jobs).where(eq(schema.jobs.id,id));
  await lock.db.update(schema.jobs).set({params:{...job.params as object,editorialReview:"changes-requested"}}).where(eq(schema.jobs.id,id));
  console.log("Existing storyboard displayed; scene 3 rejection recorded. Film and provider requests unchanged. No generation.");
 }finally{await lock.release();await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
