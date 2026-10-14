import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { db, pool, schema } from "../src/db";
import { Email, invite } from "../src/lib/accounts";
async function main() {
  const email = Email.parse(process.argv[2]), origin = new URL(process.env.APP_URL ?? "http://127.0.0.1:3106");
  if ((await db.select({ id: schema.users.id }).from(schema.users).limit(1)).length) throw new Error("Use an existing administrator to manage invitations.");
  const destination = process.env.CAM_BOOTSTRAP_FILE ?? ".secrets/bootstrap-invitation.txt";
  await mkdir(path.dirname(destination),{recursive:true,mode:0o700});
  const file = await open(destination, "wx", 0o600);
  try {
    const invitation = await invite({ email, role:"admin" });
    await file.writeFile(`${new URL("/accept-invitation",origin)}#${invitation.token}\n`);
  } catch (error) { await rm(destination, { force:true }); throw error; }
  finally { await file.close(); }
  console.log("Administrator invitation saved to the private output file (48 hours). No email sent.");
}
main().catch(()=>{console.error("Bootstrap unavailable. Check the email, APP_URL, existing accounts and private output file.");process.exitCode=1;}).finally(()=>pool.end());
