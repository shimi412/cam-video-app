import { randomBytes } from "node:crypto";
import { open } from "node:fs/promises";

async function main() {
  const domain = process.argv[2]?.toLowerCase();
  if (!domain || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error();
  // Exclusive creation avoids rotating working credentials or overwriting configuration.
  const file = await open(".env.deploy", "wx", 0o600);
  try { await file.writeFile(`CAM_DOMAIN=${domain}\nCAM_DB_PASSWORD=${randomBytes(32).toString("hex")}\nCAM_AUTH_SECRET=${randomBytes(48).toString("hex")}\n`); }
  finally { await file.close(); }
  console.log("Private .env.deploy created. No service started and no provider credentials configured.");
}
main().catch(() => { console.error("Provide the dedicated CAM domain. The command will not replace an existing .env.deploy file."); process.exitCode = 1; });
