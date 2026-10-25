import { CharacterLibrary } from "@/components/character-library";
import { db, schema } from "@/db";
import { and, desc, sql } from "drizzle-orm";
import { isSimulation, providerMode } from "@/lib/providers/mode";
import { videoCharacters } from "@/lib/character-library";
import { readFile } from "node:fs/promises";
import path from "node:path";
export const dynamic = "force-dynamic";
export default async function LibraryPage(){
 const jobs=schema.jobs;
 const rows=await db.select({id:jobs.id,title:jobs.title,script:jobs.script,status:jobs.status,params:jobs.params}).from(jobs).where(and(
      sql`${jobs.deletedAt} IS NULL`,
  sql`${jobs.params}->>'executionMode' = ${providerMode()}`,
  isSimulation()?undefined:sql`${jobs.params}->>'live' = 'true'`,
  sql`${jobs.params}->>'templateSlug' = 'cam-clay'`
 )).orderBy(desc(jobs.createdAt),desc(jobs.id));
 const videos=await Promise.all(rows.map(async job=>{
  let shots:unknown;
  try{shots=JSON.parse(await readFile(path.join(process.cwd(),"storage/concepts",job.id,"live/state.json"),"utf8")).render?.board?.shots;}catch{/* No connected render saved yet. */}
  try{if(!shots)shots=JSON.parse(await readFile(path.join(process.cwd(),"storage/concepts",job.id,"storyboard.json"),"utf8")).shots;}catch{/* A draft can have only its saved preparation. */}
  return videoCharacters(job,shots);
 }));
 return <section className="space-y-6"><div><p className="kicker">Characters</p><h1 className="page-title">Characters by video</h1><p className="text-muted mt-2">Find the characters listed in each video&apos;s storyboard and their approved character sheets.</p></div><CharacterLibrary videos={videos}/></section>;
}
