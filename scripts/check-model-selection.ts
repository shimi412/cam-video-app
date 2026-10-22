/** Isolate the controller/media rehearsal from customer data and budgets. */
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

async function main(){
 const url=new URL(process.env.DATABASE_URL??"postgres://cam:cam@localhost:5433/cam_video_app");
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname))throw new Error("Only a local test database is allowed.");
 const schema=`selection_${randomUUID().replaceAll("-","")}`;
 const admin=new Pool({connectionString:url.href});
 await admin.query(`CREATE SCHEMA ${schema}`);
 url.searchParams.set("options",`-c search_path=${schema}`);
 const test=new Pool({connectionString:url.href});
 try{
  for(const file of (await readdir("migrations")).filter(f=>f.endsWith(".sql")).sort())await test.query(await readFile(`migrations/${file}`,"utf8"));
  const result=await promisify(execFile)(process.execPath,[path.resolve("node_modules/tsx/dist/cli.mjs"),"scripts/check-connected-production.ts"],{env:{...process.env,DATABASE_URL:url.href},timeout:180000,maxBuffer:1024*1024});
  console.log(result.stdout);
 }finally{await test.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
