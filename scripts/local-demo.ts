/** Dedicated local presentation. No deletion, credentials copied or provider call. */
import { spawn, execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { Client } from "pg";

const root = process.cwd(), origin = "http://127.0.0.1:3107";
const exampleId = "d12073dd-3f4b-4d0f-883e-57c609210e19";
const database = "postgres://cam:cam@127.0.0.1:5433/cam_local_demo";
// Explicitly override .env, inherited production settings and provider secrets.
const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: database, NODE_ENV: "development", CAM_LOCAL_DEMO: "1",
  CAM_AUTH_MODE: "local", CAM_RELEASE: "preview", PROVIDER_MODE: "dryrun", BRAIN_MODE: "mock",
  CAM_NEXT_DIR: ".next-demo", CAM_TS_CONFIG: "tsconfig.demo.json", APP_URL: origin, AUTH_URL: origin,
  FAL_KEY: "", ANTHROPIC_API_KEY: "", CAM_HIGGSFIELD_ACCESS_TOKEN: "",
  NEXT_TELEMETRY_DISABLED: "1", HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1",
  HYPERFRAMES_NO_AUTO_INSTALL: "1", HYPERFRAMES_SKIP_SKILLS: "1" };
Object.assign(process.env, env);
const run = (script: string, args: string[] = [], quiet = false) => execFileSync(process.execPath,
  [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(root, script), ...args],
  { cwd: root, env, stdio: quiet ? "ignore" : "inherit", timeout: 60_000 });

async function ready() {
  try {
    const response = await fetch(`${origin}/api/account`, { signal: AbortSignal.timeout(1500) });
    const body = await response.json();
    return response.ok && body.localDemo === true && body.preview === true && body.user?.local === true;
  } catch { return false; }
}
async function assertPortFree() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", () => reject(new Error("Le port 3107 est occupé par une autre application. Aucun processus n'a été arrêté.")));
    probe.listen(3107, "127.0.0.1", () => probe.close(() => resolve()));
  });
}
function openDemo() {
  if (!process.argv.includes("--no-open")) execFileSync("open", [`${origin}/productions`]);
  console.log(`Démonstration CAM : ${origin}/productions`);
}

async function prepare() {
  try { run("scripts/db.ts", ["status"], true); }
  catch { run("scripts/db.ts", ["start"]); }
  const admin = new Client({ connectionString: "postgres://cam:cam@127.0.0.1:5433/postgres" });
  await admin.connect();
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='cam_local_demo'")).rowCount) {
      await admin.query("CREATE DATABASE cam_local_demo");
    }
  } finally { await admin.end(); }
  run("scripts/migrate.ts"); run("scripts/seed.ts");
  const demo = new Client({ connectionString: database }); await demo.connect();
  try {
    if (!(await demo.query("SELECT 1 FROM jobs WHERE id=$1", [exampleId])).rowCount) {
      const source = new Client({ connectionString: "postgres://cam:cam@127.0.0.1:5433/cam_video_app" });
      await source.connect();
      try {
        const { rows: [job] } = await source.query("SELECT * FROM jobs WHERE id=$1 AND status='succeeded'", [exampleId]);
        if (!job || job.params.previewSource !== "existing" || job.params.templateSlug !== "cam-clay" || job.params.formatExports?.status !== "complete") {
          throw new Error("Le film CAM de présentation et ses trois formats doivent être préparés avant la démonstration.");
        }
        const { rows: [template] } = await demo.query("SELECT id FROM templates WHERE slug='cam-clay'");
        await demo.query(`INSERT INTO jobs(id,template_id,status,script,params,estimate_usd,billed_usd,output_path,created_at,confirmed_at,finished_at)
          VALUES($1,$2,'succeeded',$3,$4,$5,0,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
          [job.id,template.id,job.script,job.params,job.estimate_usd,job.output_path,job.created_at,job.confirmed_at,job.finished_at]);
      } finally { await source.end(); }
    }
  } finally { await demo.end(); }
  // Verify the actual video and each download, not only the copied database row.
  const { db, schema, pool } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const { exportView } = await import("../src/lib/format-exports");
  try {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, exampleId));
    const view = await exportView(job);
    if (view.state?.status !== "complete") throw new Error("Un fichier du film CAM est absent ou modifié. Préparer de nouveau ses trois formats avant la démonstration.");
  } finally { await pool.end(); }
  const config = JSON.parse(await readFile(path.join(root, "tsconfig.json"), "utf8"));
  config.include = ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next-demo/types/**/*.ts", ".next-demo/dev/types/**/*.ts"];
  config.exclude = ["node_modules", ".next", ".next-access-test"];
  await writeFile(path.join(root, "tsconfig.demo.json"), JSON.stringify(config, null, 2));
  console.log("Film CAM et trois téléchargements vérifiés. Dossiers de démonstration conservés. Génération payante désactivée.");
}

async function main() {
  if (process.platform !== "darwin") throw new Error("Ce lanceur de démonstration est prévu pour le Mac de Shimi.");
  if (!process.argv.includes("--prepare-only")) {
    if (await ready()) { openDemo(); return; }
    await assertPortFree();
  }
  await prepare();
  if (process.argv.includes("--prepare-only")) return;
  await mkdir(path.join(root, "storage/qa"), { recursive: true });
  const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3107"],
    { cwd: root, env, stdio: "inherit" });
  const stop = () => { if (server.exitCode === null) server.kill("SIGTERM"); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop); process.once("SIGHUP", stop);
  const finished = new Promise<number>((resolve, reject) => {
    server.once("error", reject); server.once("exit", (code) => resolve(code ?? 0));
  });
  try { for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) throw new Error("Le logiciel s'est arrêté au démarrage.");
    if (await ready()) {
      // Compile the presentation pages now, before the client walkthrough.
      for (const route of ["/productions", "/", "/conversations", "/campaigns", "/help"]) {
        const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error("Une page de démonstration ne répond pas. Relancer le raccourci.");
      }
      openDemo();
      console.log("Garder cette fenêtre ouverte pendant la présentation. Ctrl+C ferme uniquement cette démonstration.");
      process.exitCode = await finished; return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  stop(); await finished;
  throw new Error("La démonstration n'a pas démarré dans le délai prévu. Relancer le raccourci.");
  } finally { stop(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Démarrage impossible."); process.exitCode = 1; });
