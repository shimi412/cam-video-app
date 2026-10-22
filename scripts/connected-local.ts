import {supervise} from "./runtime-supervisor";
/** Authenticated local CAM. Startup resumes only explicitly authorized durable work; legacy paused jobs stay paused. */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";

async function main() {
  const root = process.cwd(), origin = "http://127.0.0.1:3108";
  try { process.loadEnvFile(path.join(root, ".env")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const configDir = path.join(homedir(), ".config/cam-video-app"), file = path.join(configDir, "runtime.json");
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  let config: { authSecret: string; higgsfieldAuthFile?: string };
  try { config = JSON.parse(await readFile(file, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("The private CAM configuration is unreadable.");
    config = { authSecret: randomBytes(48).toString("base64url") };
    await writeFile(file, JSON.stringify(config), { mode: 0o600, flag: "wx" });
  }
  if (!config.authSecret || config.authSecret.length < 32) throw new Error("The CAM session secret is missing from the private configuration.");
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", CAM_LOCAL_DEMO: "0",
    AUTH_SECRET: config.authSecret, CAM_AUTH_MODE: "required", CAM_RELEASE: "connected", CAM_LIVE_ENABLED: "1",
    PROVIDER_MODE: "fal", BRAIN_MODE: "api", APP_URL: origin, AUTH_URL: origin, AUTH_TRUST_HOST: "true",
    CAM_HIGGSFIELD_AUTH_FILE: config.higgsfieldAuthFile ?? process.env.CAM_HIGGSFIELD_AUTH_FILE,
    CAM_NEXT_DIR: ".next-connected", CAM_TS_CONFIG: "tsconfig.connected.json",
    NEXT_TELEMETRY_DISABLED: "1", HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_NO_AUTO_INSTALL: "1", HYPERFRAMES_SKIP_SKILLS: "1" };
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", () => reject(new Error("Port 3108 is already in use. Open the running CAM window.")));
    probe.listen(3108, "127.0.0.1", () => probe.close(() => resolve()));
  });
  const run = (script: string, args: string[] = [], quiet = false) => execFileSync(process.execPath,
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(root, script), ...args],
    { cwd: root, env, stdio: quiet ? "ignore" : "inherit", timeout: 60_000 });
  try { run("scripts/db.ts", ["status"], true); } catch { run("scripts/db.ts", ["start"]); }
  run("scripts/migrate.ts");
  const tsconfig = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8"));
  tsconfig.include = ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next-connected/types/**/*.ts", ".next-connected/dev/types/**/*.ts"];
  tsconfig.exclude = ["node_modules", ".next", ".next-demo", ".next-access-test"];
  await writeFile(path.join(root, "tsconfig.connected.json"), JSON.stringify(tsconfig, null, 2));
  const runtime=supervise([
    {name:"CAM web",command:process.execPath,args:[path.join(root,"node_modules/next/dist/bin/next"),"dev","--hostname","127.0.0.1","--port","3108"]},
    {name:"CAM production worker",command:process.execPath,args:["--import","tsx",path.join(root,"scripts/production-worker.ts")]}
  ],{cwd:root,env});
  process.once("SIGINT",runtime.stop);process.once("SIGTERM",runtime.stop);process.once("SIGHUP",runtime.stop);
  console.log(`Connected CAM: ${origin}. Sign-in required. Generation starts only through the app's explicit actions.`);
  if(process.argv.includes("--open")){
    for(let attempt=0;attempt<90;attempt++){
      try{const response=await fetch(`${origin}/login`,{signal:AbortSignal.timeout(1000)});if(response.ok){execFileSync("open",[origin]);break;}}catch{/* The listener may still be starting. */}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  }
  await runtime.done;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "CAM could not start."); process.exitCode = 1; });
