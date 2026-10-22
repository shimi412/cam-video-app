/** Disposable, loopback-only database for offline acceptance tests. Never opens .pg-data. */
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {Client} from 'pg';
const require=createRequire(import.meta.url);
async function main(){
 const bins=await import(createRequire(require.resolve('embedded-postgres')).resolve('@embedded-postgres/darwin-arm64'));
 const dir=await mkdtemp(path.join(tmpdir(),'cam-qa-pg-')),port=55439;
 execFileSync(bins.initdb,['-D',dir,'-U','cam','-A','trust'],{stdio:'ignore'});
 execFileSync(bins.pg_ctl,['-D',dir,'-o',`-p ${port} -h 127.0.0.1`,'-l',path.join(dir,'postgres.log'),'start'],{stdio:'ignore'});
 const c=new Client({connectionString:`postgres://cam@127.0.0.1:${port}/postgres`});await c.connect();await c.query('CREATE DATABASE cam_video_app');await c.end();
 console.log(`QA database ready: postgres://cam@127.0.0.1:${port}/cam_video_app`);
 const keepAlive=setInterval(()=>{},60000);
 await new Promise<void>(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
 clearInterval(keepAlive);
 execFileSync(bins.pg_ctl,['-D',dir,'-m','fast','stop'],{stdio:'ignore'});await rm(dir,{recursive:true,force:true});
}
main().catch(e=>{console.error(e);process.exitCode=1;});
