import { homedir } from "node:os";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const file = () => process.env.CAM_CREDENTIALS_FILE ?? path.join(homedir(), ".config/cam-video-app/credentials.json");
async function saved() {
  try { return z.object({ openrouter: z.string().optional() }).parse(JSON.parse(await readFile(/* turbopackIgnore: true */ file(),"utf8"))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}; throw new Error("The workspace credential file could not be read."); }
}
export async function openrouterKey() { return process.env.OPENROUTER_API_KEY || (await saved()).openrouter || null; }
export async function saveOpenrouterKey(key: string) {
  const value = z.string().trim().min(20).max(500).regex(/^[a-zA-Z0-9_-]+$/).parse(key);
  const location = file(), temporary = `${location}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(location), { recursive:true,mode:0o700 });
  await writeFile(temporary,JSON.stringify({...await saved(),openrouter:value}),{mode:0o600,flag:"wx"});
  await rename(temporary,location);
}
