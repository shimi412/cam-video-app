/** Attack single journey (Shimi, 2026-10-23) rehearsed end to end: real browser, controllers, database
 * and renderer; only paid boundaries are injected. Script -> one estimate (delay and price) -> complete
 * V1 produced with no human gate -> feedback on the complete version -> revision quote -> V2 -> finishing
 * note -> V3 -> approval -> download. Zero external call, zero paid call. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import http from 'node:http';
import {Pool} from 'pg';
import puppeteer,{type Browser} from 'puppeteer-core';
import sharp from 'sharp';
import {comicsFixture} from '../comics/runtime/fixture';
import {hash,validatePlan,assertChecks,estimatedMinutes} from '../src/lib/comics/model';
import type {ComicDependencies} from '../src/lib/comics/service';
const root=process.cwd(),origin='http://127.0.0.1:3122',actor='local',isolation=`comics_qa_${randomUUID().replaceAll('-','')}`;
const url=new URL(process.env.DATABASE_URL??'postgres://cam@127.0.0.1:55439/cam_video_app'),setup=new Pool({connectionString:url.href});url.searchParams.set('options',`-c search_path=${isolation}`);process.env.DATABASE_URL=url.href;process.env.PROVIDER_MODE='dryrun';
let externalCalls=0;globalThis.fetch=async()=>{externalCalls++;throw Error('External calls forbidden in comics rehearsal.');};
let server:ChildProcess|undefined,browser:Browser|undefined,id='',running=false,worker:ReturnType<typeof setInterval>|undefined;
const evidence=path.join(root,'storage/qa',isolation),calls=new Map<string,number>();
async function main(){await mkdir(evidence,{recursive:true});await setup.query(`CREATE SCHEMA ${isolation}`);
 const {recoveryDependencies}=await import('../src/lib/agent/recovery-supervisor');
 let recoveries=0;recoveryDependencies.diagnose=async input=>{recoveries++;assert(input.allowed.includes('retry-saved'));return {action:'retry-saved',reason:'Retry the local assembly using the completed saved clips.'};};
 const {deliveryReviewDependencies}=await import('../src/lib/agent/delivery-review');
 deliveryReviewDependencies.review=async input=>({mediaHash:input.mediaHash,ready:true,reason:'Offline injected Claude delivery decision for isolated QA.',corrections:[]});
 const {pool}=await import('../src/db'),{prepareComic,actComic,runComic}=await import('../src/lib/comics/service'),{getComic,comicDirectory}=await import('../src/lib/comics/store'),{publicComic}=await import('../src/lib/comics/model'),{buildComic}=await import('../src/lib/comics/render'),{priceComic}=await import('../src/lib/comics/pricing');
 try{
  assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name,isolation);
  for(const f of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(`migrations/${f}`,'utf8'));
  await pool.query("INSERT INTO credit_ledger(delta_usd,kind,note,wallet) VALUES(300,'topup','Isolated Attack rehearsal','customer')");await pool.query("INSERT INTO settings(key,value) VALUES('customer_pricing',$1)",[JSON.stringify({mode:'tiers-v2',multiplier:2,higgsfieldCreditUsd:.1})]);
  const f=await comicsFixture();let directions=0,finishings=0,builds=0,preflights=0;
  const deps:ComicDependencies={
   // Injected director: a "Remove this title" note is a local change (no new media), a "Redraw" note changes the scene (new image and clip), a sound note is deferred to finishing.
   direct:async(s,notes=[])=>{directions++;if(!notes.length)return {plan:f.plan,deferred:[]};const plan=structuredClone(s.plan!),deferred:string[]=[];for(const n of notes){if(/music|sound/i.test(n.text)){deferred.push(n.id);continue;}for(const target of n.targets){if(/^Redraw/.test(n.text))plan.panels[target-1].scene=`A calmer flat comic object for panel ${target}, after the client note.`;else plan.panels[target-1].title='';}}return {plan:validatePlan(s.script,plan,s.plan,notes.filter(n=>!deferred.includes(n.id)).flatMap(n=>n.targets)),deferred};},
   finishing:async(s,notes)=>{finishings++;return {settings:{...s.settings,music:'quiet'},applied:notes.map(n=>n.id),unresolved:[]};},
   price:priceComic,
   gateway:{cost:async r=>r.tool==='generate_video'?4:r.tool==='generate_audio'?1:2,media:async(s,r,allowance,save)=>{
    const previous=s.operations[r.key];if(previous){assert.equal(previous.fingerprint,hash(r));if(previous.state==='complete')return {file:previous.file!,requestId:previous.requestId!};}
    assert(Number.isFinite(allowance)&&allowance>0,`Every request runs under an approved allowance (${r.key}).`);
    const dir=comicDirectory(s.id);await mkdir(dir,{recursive:true});calls.set(r.key,(calls.get(r.key)??0)+1);
    const file=`${r.key}.${r.extension}`;s.operations[r.key]={fingerprint:hash(r),state:'accepted',requestId:`fixture-${r.key}`,quotedCredits:allowance,actualCredits:0,sentAt:Date.now()};await save();
    const panel=Number(r.key.split('-')[1]);
    if(r.tool==='generate_video')await cp(`storage/cam-attack-gazalighting/montage/assets/clips/case-${String(panel).padStart(2,'0')}.mp4`,path.join(dir,file));
    else if(r.tool==='generate_audio')await cp(f.voice,path.join(dir,file));
    else if(r.key.startsWith('sheet'))await sharp('comics/reference/storyboard-gazalighting.jpg').png().toFile(path.join(dir,file));
    else await sharp(`storage/cam-attack-gazalighting/montage/assets/stills/case-${String(panel).padStart(2,'0')}-debut.jpg`).resize(270,480).png().toFile(path.join(dir,file));
    Object.assign(s.operations[r.key],{state:'complete',file});await save();return {file,requestId:`fixture-${r.key}`};
   }},
   align:async(dir,source)=>{await mkdir(dir,{recursive:true});const voice=path.join(dir,'voice.wav');await cp(source,voice);return {voice,timing:{...f.timing,estimated:false},audioReview:{endingNeedsListening:false,tailPaddingSeconds:0}};},
   inspect:async()=>({sha:'reference-fixture',description:'Already approved reference media, injected for orchestration only.',sampledFrames:1,issues:[]}),
   preflight:async()=>{preflights++;},
   rework:async(_s,panel,reason)=>({scene:`Reworked panel ${panel} after: ${reason}`,action:'A slow calm movement over the objects.',preserve:'the main object'}),
   build:async s=>{builds++;if(builds===1)throw Error('Offline fixture local render interruption');return buildComic(s);},authorize:async<T,>(_id:string,work:()=>Promise<T>)=>work()
  };
  const cleared=Object.fromEntries((await readFile('.env','utf8').catch(()=>'' )).split('\n').map(l=>l.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1]).filter((k):k is string=>Boolean(k)).map(k=>[k,'']));
  const env:NodeJS.ProcessEnv={...cleared,PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_ENV:'development',DATABASE_URL:url.href,CAM_AUTH_MODE:'local',PROVIDER_MODE:'dryrun',BRAIN_MODE:'mock',CAM_RELEASE:'preview',CAM_LOCAL_DEMO:'1',CAM_NEXT_DIR:'.next-comics-qa',CAM_TS_CONFIG:'tsconfig.comics-qa.json',NEXT_TELEMETRY_DISABLED:'1'};
  const config=JSON.parse(await readFile('tsconfig.json','utf8'));config.include=['next-env.d.ts','src/**/*.ts','src/**/*.tsx','.next-comics-qa/dev/types/**/*.ts'];config.exclude=['node_modules','.next','.next-connected','.next-demo'];await writeFile('tsconfig.comics-qa.json',JSON.stringify(config));
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3122'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let log='';server.stdout?.on('data',d=>log+=String(d));server.stderr?.on('data',d=>log+=String(d));
  for(let i=0;i<120;i++){const ready=await new Promise<boolean>(resolve=>{const r=http.get(origin+'/login',r=>{r.resume();resolve(r.statusCode===200);});r.on('error',()=>resolve(false));});if(ready)break;if(i===119)throw Error(log);await new Promise(r=>setTimeout(r,500));}
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run']});const page=await browser.newPage();await page.setViewport({width:1280,height:900});page.setDefaultTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.setRequestInterception(true);page.on('request',req=>{void(async()=>{const u=new URL(req.url());if(u.origin!==origin){if(['data:','blob:'].includes(u.protocol))return req.continue();externalCalls++;return req.abort();}const reply=(v:unknown,status=200)=>req.respond({status,contentType:'application/json',body:JSON.stringify(v)});try{
   if(u.pathname==='/api/comics'){const v=await prepareComic(actor,JSON.parse(req.postData()!),deps);id=v!.id;return reply(v);}
   if(id&&u.pathname===`/api/comics/${id}`){return reply(req.method()==='GET'?publicComic(await getComic(id,actor)):await actComic(id,actor,JSON.parse(req.postData()!),deps));}
   return req.continue();
  }catch(e){console.error('Route failure:',e);return reply({error:e instanceof Error?e.message:String(e)},409);}})();});
  // Independent worker, not tied to page polling. Re-reads the durable state each cycle.
  const tick=async()=>{if(!id||running)return;running=true;try{await runComic(id,actor,deps);}finally{running=false;}};worker=setInterval(()=>void tick(),250);
  const text=async(t:string)=>{console.log('UI wait:',t);await page.waitForFunction(t=>document.body.innerText.includes(t)||document.body.innerText.includes('needs attention'),{},t);const s=id?await getComic(id,actor):null;if(s?.phase==='blocked')throw Error(s.error);};
  const click=async(t:string)=>{console.log('UI click:',t);await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent?.trim()===t&&!b.disabled),{},t);await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===t)?.click(),t);};
  const openDetails=()=>page.evaluate(()=>{for(const d of document.querySelectorAll('details'))d.open=true;});
  const body=()=>page.evaluate(()=>document.body.innerText);
  const settled=async()=>{let s=await getComic(id,actor);for(let i=0;i<2400&&s.queued;i++){await new Promise(r=>setTimeout(r,500));s=await getComic(id,actor);}if(s.phase==='blocked')throw Error(s.error);return s;};
  // 1. Script -> one estimate: delay from the panel count and the V1 price by the grid, nothing generated.
  await page.goto(origin+'/');await page.waitForSelector('a[href="/comics/new"]');await page.click('a[href="/comics/new"]');await text('Review estimate');await page.type('input[maxlength="80"]','Attack single journey rehearsal');await page.type('textarea',f.script);await click('Review estimate');await text('Approve & start production');
  assert.equal(calls.size,0);assert.equal(directions,1);let s=await getComic(id,actor);assert.equal(s.phase,'estimate');assert.equal(s.quote!.kind,'film');assert.equal(s.quote!.totalUsd,30);
  const estimate=await body();assert(estimate.includes(`about ${estimatedMinutes(9)} minutes`),'The estimate shows the delay.');assert(estimate.includes('$30'),'The estimate shows the V1 price.');assert(!/storyboard preparation|video price/i.test(estimate));
  await assert.rejects(()=>getComic(id,'another-user'));
  // 2. One approval, then the complete first version with no human gate. The browser leaves during production.
  await click('Approve & start production');await page.goto('about:blank');
  s=await settled();assert.equal(s.phase,'review');assert.equal(s.filmVersion,1);assert.equal(s.work,'video'===s.work?'video':s.work);assertChecks(s.checks!);assert.equal(s.checks!.duration>50,true);assert.equal(recoveries,1,'The interrupted local build was retried from the saved clips.');
  assert.deepEqual([...calls.keys()].filter(k=>k.startsWith('clip-')).length,9);assert.equal(s.plan!.panels.length,9);assert.equal(Object.keys(s.clips).length,9);
  await page.goto(`${origin}/comics/${id}`);await text('Version 1');assert.equal(await page.$('a[download]'),null);assert(!/Claude|Higgsfield|ElevenLabs|Nano Banana|Kling/.test(await body()));
  assert.equal(await page.evaluate(async u=>(await fetch(u)).status,`/api/comics/${id}/media/download`),403);
  await page.screenshot({path:path.join(evidence,'version-1.png'),fullPage:true});
  // 3. Feedback on the complete version: one local change (title) and one redraw (new image and clip), one additional price, V2 unattended.
  await openDetails();const lockPanel=async(n:number,note:string)=>{await page.type(`textarea[aria-label="Panel ${n} feedback"]`,note);await page.$eval(`textarea[aria-label="Panel ${n} feedback"]`,el=>el.parentElement!.parentElement!.querySelector('button')!.click());await page.waitForFunction(n=>{const el=document.querySelector(`textarea[aria-label="Panel ${n} feedback"]`);return (el as HTMLTextAreaElement|null)?.readOnly;},{},n);};
  await lockPanel(2,'Remove this title.');await lockPanel(8,'Redraw this panel with a calmer object.');assert.equal(directions,1);assert.equal((await getComic(id,actor)).notes.filter(n=>n.status==='locked').length,2);
  await page.reload();await text('Apply feedback');await click('Apply feedback');await text('Approve & produce version 2');assert.equal(directions,2);
  s=await getComic(id,actor);assert.equal(s.quote!.kind,'revision');assert.equal(s.quote!.additionalUsd,4,'2 + 4 credits, two inspections, direction: $1.60 x 2 rounded up.');assert.equal(s.quote!.totalUsd,34);assert((await body()).includes('$4 additional'));
  const before=new Map(calls);await click('Approve & produce version 2');await page.waitForSelector('[data-review-version="2"][data-review-phase="review"]');await text('Version 2');
  s=await getComic(id,actor);assert.equal(s.filmVersion,2);assert.equal(s.plan!.panels[1].title,'');assert.equal(s.plan!.panels[7].scene,'A calmer flat comic object for panel 8, after the client note.');assert.equal(s.plan!.panels[0].title,f.plan.panels[0].title);
  const added=[...calls.keys()].filter(k=>!before.has(k));assert.deepEqual(added.map(k=>k.replace(/-[0-9a-f]{8}$/,'')).sort(),['clip-8-1','image-8-1'],'Only the redrawn panel costs new media; the title change is local.');assert([...calls.values()].every(n=>n===1));
  assert(s.notes.every(n=>n.status==='applied'));
  // 4. A finishing instruction goes through the same feedback box and the finishing director: no media, V3 rebuilt quieter.
  await page.type('textarea[aria-label="Whole video feedback"]','Lower the music.');await click('Lock feedback');await click('Apply feedback');await text('Approve & produce version 3');assert.equal(finishings,1);
  s=await getComic(id,actor);assert.deepEqual(s.quote!.items,{});assert.equal(s.quote!.additionalUsd,2);assert.deepEqual(s.pendingSettings,{music:'quiet',captions:true});
  await click('Approve & produce version 3');await page.waitForSelector('[data-review-version="3"][data-review-phase="review"]');await text('Version 3');
  s=await getComic(id,actor);assert.equal(s.settings.music,'quiet');assert(s.notes.every(n=>n.status==='applied'));assert.equal(builds,4);assert([...calls.values()].every(n=>n===1));
  await page.screenshot({path:path.join(evidence,'version-3.png'),fullPage:true});
  // 5. Approve the version: settlement, download.
  await page.click('input[type="checkbox"]');await click('Approve this version & unlock download');await text('Download video');await click('Save to My videos');await text('Saved to My videos');
  const result=await page.evaluate(async()=>{const a=document.querySelector<HTMLAnchorElement>('a[download]')!;const r=await fetch(a.href);return {status:r.status,bytes:(await r.arrayBuffer()).byteLength};});assert.equal(result.status,200);assert(result.bytes>100000);
  s=await getComic(id,actor);assert.equal(s.phase,'complete');assert.equal(s.approvedQuotes.map(q=>q.totalUsd).join(','),'30,34,36');
  assert.equal((await pool.query("SELECT state,amount_cents FROM credit_holds WHERE job_id=$1",[id])).rows[0].amount_cents,3600);
  assert.equal(recoveries,1);assert.equal(preflights,1);assert.equal(externalCalls,0);assert.deepEqual(errors,[]);assert([...calls.values()].every(n=>n===1));
  await writeFile(path.join(evidence,'proof.json'),JSON.stringify({id,journey:'single',externalCalls,paidCalls:0,recoveries,directions,finishings,builds,versions:s.filmVersion,approvedPrices:s.approvedQuotes.map(q=>({kind:q.kind,totalUsd:q.totalUsd,additionalUsd:q.additionalUsd,additionalCostUsd:q.additionalCostUsd})),downloadBytes:result.bytes,media:s.media,mediaHash:s.mediaHash,fallbacks:s.fallbacks,checks:s.checks,browserClosedDuringProduction:true,operations:Object.fromEntries(calls)},null,2));console.log('PASS: Attack single journey in the browser, real comic montage, one estimate, V1/V2/V3 unattended, zero paid calls.');
 }finally{if(worker)clearInterval(worker);while(running)await new Promise(r=>setTimeout(r,250));await browser?.close();server?.kill('SIGTERM');await pool.end();await setup.query(`DROP SCHEMA ${isolation} CASCADE`);await setup.end();await rm('tsconfig.comics-qa.json',{force:true});}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
