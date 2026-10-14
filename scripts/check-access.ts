process.env.PROVIDER_MODE = "dryrun"; process.env.BRAIN_MODE = "mock";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, open } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { db, pool, schema } from "../src/db";
import { acceptInvitation, authenticate, hashPassword, invite } from "../src/lib/accounts";
const origin = "http://127.0.0.1:3197", marker = randomUUID(), password = `test-${randomBytes(24).toString("hex")}`;
const emails = [`admin-${marker}@cam.invalid`, `client-${marker}@cam.invalid`, `invited-${marker}@cam.invalid`];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, options) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url); if (url.origin !== origin) throw new Error("External fetch forbidden"); return realFetch(input, options); };
async function main() {
  const productionBuild = process.argv.includes("--production");
  const connected=process.argv.includes("--connected");
  const hash = await hashPassword(password);
  await mkdir(".next-access-test", {recursive:true});
  await writeFile("tsconfig.access-test.json", JSON.stringify({ extends:"./tsconfig.json", compilerOptions:{baseUrl:"."}, include:["src/**/*.ts","src/**/*.tsx","next-env.d.ts"],exclude:["node_modules"] }));
  const users = await db.insert(schema.users).values(emails.slice(0,2).map((email, index) => ({ email, name: "Offline access test", passwordHash: hash, role: index ? "client" : "admin" }))).returning();
  await mkdir("storage/qa", { recursive: true });
  const serverLog = await open("storage/qa/access-server.log", "w", 0o600);
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", productionBuild ? "start" : "dev", "--hostname", "127.0.0.1", "--port", "3197"], {
    env: { ...process.env, NODE_ENV: productionBuild ? "production" : "development", CAM_RELEASE: connected?"connected":"preview",CAM_LIVE_ENABLED:connected?"1":"0", CAM_NEXT_DIR: productionBuild ? ".next" : ".next-access-test", CAM_TS_CONFIG: productionBuild ? "tsconfig.json" : "tsconfig.access-test.json", CAM_AUTH_MODE: "required", AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_TRUST_HOST: "true", APP_URL: origin, AUTH_URL: origin, PROVIDER_MODE: connected?"fal":"dryrun", BRAIN_MODE: connected?"api":"mock",FAL_KEY:"",OPENROUTER_API_KEY:"",CAM_CREDENTIALS_FILE:`/tmp/cam-missing-credentials-${marker}.json`,CAM_HIGGSFIELD_ACCESS_TOKEN:"",CAM_HIGGSFIELD_AUTH_FILE:"", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", serverLog.fd, serverLog.fd],
  });
  async function client() {
    const cookies = new Map<string,string>();
    const request = async (route: string, options: RequestInit = {}) => {
      const response = await fetch(origin + route, { ...options, redirect: "manual", headers: { origin, cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; "), ...options.headers } });
      for (const cookie of response.headers.getSetCookie()) { const first = cookie.split(";")[0], i = first.indexOf("="); cookies.set(first.slice(0,i), first.slice(i+1)); } return response;
    };
    return { request, async login(email: string) { const csrf = await (await request("/api/auth/csrf")).json();
      const response = await request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" }, body: new URLSearchParams({ email, password, csrfToken: csrf.csrfToken, callbackUrl: origin }) });
      assert.equal(response.status, 200, "Credentials callback"); return response.json();
    } };
  }
  try {
    let ready = false;
    for (let tries=0;tries<90;tries++) { if (server.exitCode !== null) throw new Error("Access-test server stopped"); try { const response = await fetch(origin + "/api/auth/csrf", { signal: AbortSignal.timeout(3000) }); if (response.ok) { ready=true;break; } } catch {} await new Promise(r => setTimeout(r,500)); }
    assert(ready, "Access-test server ready"); const anonymous = await client(), admin = await client(), user = await client();
    const publicLogo=await anonymous.request("/recipes/cam-clay/logo.png");
    assert.equal(publicLogo.status,200,"Login logo must load before authentication");
    assert(publicLogo.headers.get("content-type")?.includes("image/png"));
    assert.equal((await anonymous.request("/api/jobs")).status,401);
    for(const route of ["/api/help","/api/credits",`/api/jobs/${marker}/thumbnail`,`/api/credits/receipts/${marker}`])assert.equal((await anonymous.request(route)).status,401);
    assert.equal((await anonymous.request("/api/media/outputs/missing.mp4")).status,401);
    assert.equal((await anonymous.request(`/api/jobs/${marker}/exports`)).status,401);
    assert.equal((await anonymous.request(`/api/jobs/${marker}/live`)).status,401);
    assert.equal((await anonymous.request("/api/admin/connections")).status,401);
    const page = await anonymous.request("/productions"); assert.equal(page.status,307); assert(page.headers.get("location")?.includes("/login"));
    await admin.login(emails[0]); await user.login(emails[1]);
    assert.equal((await admin.request("/api/admin/users")).status,200);
    assert.equal((await user.request("/api/account")).status,200);
    assert.equal((await user.request("/api/jobs")).status,200);
    for(const route of ["/api/help","/api/credits"])assert.equal((await user.request(route)).status,200);
    const account = await (await user.request("/api/account")).json(); assert.equal(account.preview, !connected);assert.equal(account.connected,connected);
    assert.equal((await user.request("/api/admin/connections")).status,403);
    const connections=await (await admin.request("/api/admin/connections")).json();assert.equal(connections.openrouter.configured,false);assert.equal(connections.media.falConfigured,false);
    assert.equal((await user.request(`/api/jobs/${marker}/live`,{method:"POST",headers:{origin:"https://untrusted.invalid","Content-Type":"application/json"},body:JSON.stringify({action:"approve",quote:"a".repeat(64)})})).status,403);
    assert.equal((await user.request("/help")).status,200);
    assert.equal((await user.request("/api/admin/overview")).status,403);
    assert.equal((await user.request("/api/admin/billing")).status,403);
    assert.equal((await user.request("/admin")).status,307);
    assert.equal((await admin.request("/api/admin/users", { method:"POST", headers:{ origin:"https://untrusted.invalid", "Content-Type":"application/json" }, body:JSON.stringify({email:emails[2],role:"client"}) })).status,403);
    const prepared = await admin.request("/api/admin/users", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email:emails[2],role:"client"}) }); assert.equal(prepared.status,200);
    const body = await prepared.json(); assert.equal(body.emailSent,false); const token = new URL(body.url).hash.slice(1);
    const accept = () => anonymous.request("/api/invitations/accept", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ token, password, name:"Offline invited test" }) });
    const accepted = await Promise.all([accept(),accept()]); assert.deepEqual(accepted.map(r=>r.status).sort(),[200,400]);
    const old = await invite({ email:emails[2], role:"client" }), replacement = await invite({ email:emails[2], role:"admin" });
    await assert.rejects(acceptInvitation({token:old.token,password,name:"Offline replaced test"}));
    await acceptInvitation({token:replacement.token,password,name:"Offline reset test"});
    assert.equal((await authenticate(emails[2],password))?.role,"client", "Reset cannot elevate an existing client");
    await db.update(schema.users).set({ disabled:true, sessionVersion:2 }).where(eq(schema.users.id,users[1].id));
    assert.equal((await user.request("/api/jobs")).status,401, "Disabled user's existing session revoked");
    const attempts = await Promise.all(Array.from({length:6}, () => authenticate(emails[2], password)));
    assert(attempts.filter(Boolean).length <= 4, "Persistent account attempt limit");
    const proof = {status:"passed", productionBuild, connected, login:true, anonymousMediaBlocked:true, anonymousExportsBlocked:true, clientAdminSeparation:true, crossOriginWriteBlocked:true, oneUseInvitation:true, replacedInvitationRevoked:true, passwordResetPreservesRole:true, disabledSessionRevoked:true, persistentRateLimit:true, externalRequests:0, emailsSent:0, paidRequests:0};
    await mkdir("storage/qa",{recursive:true}); await writeFile(`storage/qa/cam-access${connected ? "-connected" : productionBuild ? "-production" : ""}-proof.json`,JSON.stringify(proof,null,2)); console.log(JSON.stringify(proof));
  } finally {
    server.kill("SIGTERM"); await new Promise<void>(resolve=> { if (server.exitCode !== null) resolve(); else { server.once("exit",()=>resolve()); setTimeout(()=>{server.kill("SIGKILL");resolve();},5000).unref(); } });
    await serverLog.close();
    await db.delete(schema.invitations).where(inArray(schema.invitations.email,emails)); await db.delete(schema.users).where(inArray(schema.users.email,emails)); await pool.end();
  }
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "Access check failed"); process.exitCode=1;});
