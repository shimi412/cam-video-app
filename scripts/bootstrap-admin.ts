import { mkdir, writeFile } from "node:fs/promises";
import { db, pool, schema } from "../src/db";
import { Email, invite } from "../src/lib/accounts";
async function main() {
  const email = Email.parse(process.argv[2]), origin = new URL(process.env.APP_URL ?? "http://127.0.0.1:3106");
  if ((await db.select({ id: schema.users.id }).from(schema.users).limit(1)).length) throw new Error("Use an existing administrator to manage invitations.");
  const invitation = await invite({ email, role:"admin" });
  await mkdir(".secrets",{recursive:true,mode:0o700});
  await writeFile(".secrets/bootstrap-invitation.txt", `${new URL("/accept-invitation",origin)}#${invitation.token}\n`,{mode:0o600,flag:"wx"});
  console.log("Administrator invitation saved privately to .secrets/bootstrap-invitation.txt (48 hours). No email sent.");
}
main().catch(()=>{console.error("Bootstrap unavailable. Check the email, APP_URL, existing accounts and private output file.");process.exitCode=1;}).finally(()=>pool.end());
