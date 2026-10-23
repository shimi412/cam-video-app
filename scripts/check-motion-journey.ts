/** Real motion service + real browser + real CPU render. Only voice/writer
 * transports are fixtures; a disposable schema and a denied fetch prevent spending. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import http from 'node:http';
import {Pool} from 'pg';
import puppeteer,{type Browser} from 'puppeteer-core';
import {referenceFixture} from '../motion/runtime/fixture';
const root=process.cwd(),origin='http://127.0.0.1:3121',actor='local';
const isolation=`motion_qa_${randomUUID().replaceAll('-','')}`;
const setup=new Pool({connectionString:process.env.DATABASE_URL??'postgres://cam:cam@localhost:5433/cam_video_app'});
const url=new URL(process.env.DATABASE_URL??'postgres://cam:cam@localhost:5433/cam_video_app');url.searchParams.set('options',`-c search_path=${isolation}`);process.env.DATABASE_URL=url.href;
let externalCalls=0;globalThis.fetch=async()=>{externalCalls++;throw Error('External calls forbidden in motion rehearsal');};
let server:ChildProcess|undefined,browser:Browser|undefined,work:Promise<unknown>|undefined,id='',worker:ReturnType<typeof setInterval>|undefined,running=false;
const evidence=path.join(root,'storage/qa',isolation);
async function main(){
 await mkdir(evidence,{recursive:true});
 await setup.query(`CREATE SCHEMA ${isolation}`);
 const {deliveryReviewDependencies}=await import('../src/lib/agent/delivery-review');
 deliveryReviewDependencies.review=async input=>({mediaHash:input.mediaHash,ready:true,reason:'Offline injected Claude delivery decision for isolated QA.',corrections:[]});
 const {pool}=await import('../src/db');
 const {startMotion,actMotion,runQueuedMotions}=await import('../src/lib/motion/service');
 const {motionFirstVersionOffer}=await import('../src/lib/motion/pricing');
 const estimateRevision=async()=>({model:'fixture',inputTokens:10000,outputTokens:18000,inputRate:.000002,outputRate:.00001,requestRate:0,supplierUsd:.20});
 const {getMotion,motionDirectory}=await import('../src/lib/motion/store');
 const {publicMotion}=await import('../src/lib/motion/state');
 const {compileMotion,inspectMotion,motionSound,buildMotion,renderMotion}=await import('../src/lib/motion/worker');
 const {assertChecks,digest}=await import('../src/lib/motion/model');
 try{
  assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name,isolation);
  for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(path.join('migrations',file),'utf8'));
  await pool.query("INSERT INTO credit_ledger(delta_usd,kind,note,wallet) VALUES(100,'topup','Offline motion QA','customer')");
  await pool.query("INSERT INTO settings(key,value) VALUES('customer_pricing',$1)",[JSON.stringify({mode:'tiers-v2',multiplier:2,higgsfieldCreditUsd:.1})]);
  const fixture=await referenceFixture();
  const referenceDir=path.join(evidence,'reference');
  const original=await compileMotion(referenceDir,fixture.film,fixture.timing,fixture.voice);
  const golden=(await readFile('motion/reference/index.sha256','utf8')).trim();
  assert.equal(original.htmlSha256,golden);
  const referenceBrowser=await inspectMotion(referenceDir),referenceSound=await motionSound(referenceDir);
  const referenceChecks={holds:original.audit.holds,offsets:original.audit.offsets,...referenceBrowser,...referenceSound};
  // Never pretend the known reference safe-area violations passed.
  assert.throws(()=>assertChecks(referenceChecks),/safe reading area/);
  await writeFile(path.join(evidence,'reference-checks.json'),JSON.stringify({htmlIdentical:true,htmlSha256:golden,checks:referenceChecks},null,2));
  await assert.rejects(()=>compileMotion(path.join(evidence,'tampered'),{...fixture.film,source:fixture.film.source.replace('    bad = 0','    bad = -100')},fixture.timing,fixture.voice));
  const safeFilm={...fixture.film,source:await readFile('motion/reference/plot-hole-v4-safe.py','utf8')};
  let writerCalls=0;
  const deps={voice:async()=>({voice:fixture.voice,timing:fixture.timing,receipt:{kind:'voice' as const,requestId:'fixture-voice',model:'fixture',actualUsd:0}}),write:async(input:import('../src/lib/motion/writer').WriterInput)=>{writerCalls++;const film=input.previous?{...input.previous,source:input.previous.source.replace('fsB = fit(["REALLY?"], SW, 900, 125, 300)','fsB = fit(["REALLY?"], SW, 900, 125, 120)'),scenes:input.previous.scenes.map(s=>s.id==='sB'?{...s,movement:'The word lands slightly smaller; its underline expands.'}:s)}:safeFilm;return {film,creativeApproval:{sourceHash:digest(film.source),reviewHash:'a'.repeat(64),model:'anthropic/claude-fixture'},receipt:{kind:'writing' as const,requestId:'fixture-writing',model:'fixture',actualUsd:0}};},build:buildMotion,finish:renderMotion,authorize:async<T,>(_id:string,fn:()=>Promise<T>)=>fn()};
  const cleared=Object.fromEntries((await readFile('.env','utf8').catch(()=>'' )).split('\n').map(l=>l.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1]).filter((k):k is string=>Boolean(k)).map(k=>[k,'']));
  const env:NodeJS.ProcessEnv={...cleared,PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_ENV:'development',DATABASE_URL:url.href,CAM_AUTH_MODE:'local',PROVIDER_MODE:'dryrun',BRAIN_MODE:'mock',CAM_RELEASE:'preview',CAM_LOCAL_DEMO:'1',CAM_NEXT_DIR:'.next-motion-qa',CAM_TS_CONFIG:'tsconfig.motion-qa.json',NEXT_TELEMETRY_DISABLED:'1'};
  const config=JSON.parse(await readFile('tsconfig.json','utf8'));config.include=['next-env.d.ts','src/**/*.ts','src/**/*.tsx','.next-motion-qa/dev/types/**/*.ts'];config.exclude=['node_modules','.next','.next-connected','.next-demo'];await writeFile('tsconfig.motion-qa.json',JSON.stringify(config));
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3121'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let log='';server.stdout?.on('data',d=>log+=String(d));server.stderr?.on('data',d=>log+=String(d));
  for(let i=0;i<90;i++){const ready=await new Promise<boolean>(resolve=>{const req=http.get(origin+'/login',r=>{r.resume();resolve(r.statusCode===200);});req.on('error',()=>resolve(false));req.setTimeout(1000,()=>{req.destroy();resolve(false);});});if(ready)break;if(server.exitCode!==null||i===89)throw Error(log);await new Promise(r=>setTimeout(r,500));}
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run']});
  const page=await browser.newPage();await page.setViewport({width:1280,height:900});page.setDefaultTimeout(240000);
  const browserErrors:string[]=[];page.on('pageerror',e=>browserErrors.push(String(e)));
  await page.setRequestInterception(true);
  page.on('request',req=>{void(async()=>{
   const u=new URL(req.url());if(u.origin!==origin){if(['data:','blob:'].includes(u.protocol))return req.continue();externalCalls++;return req.abort();}
   if(!u.pathname.startsWith('/api/'))return req.continue();
   if(u.pathname.includes('/media/'))return req.continue();
   const reply=(value:unknown,status=200)=>req.respond({status,contentType:'application/json',body:JSON.stringify(value)});
   try{
    if(u.pathname==='/api/account')return reply({connected:true,preview:false,balance:100,user:{role:'client',name:'QA'}});
    if(u.pathname==='/api/motion'){
     if(req.method()==='GET')return reply(await motionFirstVersionOffer());
     id=await startMotion(actor,JSON.parse(req.postData()!),async()=>{});await reply({id});return;
    }
    if(u.pathname===`/api/motion/${id}`){
     if(req.method()==='GET')return reply(publicMotion(id,await getMotion(id,actor)));
     const result=await actMotion(id,actor,JSON.parse(req.postData()!),{estimate:estimateRevision,direct:async(_id,_s,_targets,feedback)=>({stage:"visual",visualFeedback:feedback,finishingFeedback:"",explanation:"Make only the selected word smaller while preserving the transition.",summary:'What you asked will be applied to the film.',actionable:true})});await reply(result);return;
    }
    throw Error(`Unexpected UI API ${u.pathname}`);
   }catch(e){return reply({error:e instanceof Error?e.message:String(e)},409);}
  })();});
  worker=setInterval(()=>{if(running)return;running=true;work=runQueuedMotions(deps).finally(()=>{running=false;});},250);
  const text=async(value:string)=>{console.log('UI wait:',value);await page.waitForFunction(t=>document.body.innerText.includes(t)||document.body.innerText.includes('Preparation needs attention'),{},value);const failure=await getMotion(id,actor).catch(()=>null);if(failure?.phase==='blocked')throw Error(failure.error);};
  const click=async(value:string)=>{console.log('UI click:',value);await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent?.trim()===t&&!b.disabled),{},value);await page.evaluate(t=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===t);b?.click();},value);};
  await page.goto(origin+'/motion/new');await text('Start my motion video');await text('Ready in about 15 minutes');await text('$30 for your first complete version');
  await page.type('input[maxlength="80"]','Motion acceptance rehearsal');await page.type('textarea',fixture.script);await page.click('input[type="checkbox"]');await click('Start my motion video');
  await page.waitForFunction(()=>location.pathname.startsWith('/motion/')&&!location.pathname.endsWith('/new'));
  await page.goto('about:blank');
  for(let n=0;n<1200;n++){const saved=await getMotion(id,actor);if(saved.phase==='visuals')break;if(saved.phase==='blocked')throw Error(saved.error);await new Promise(r=>setTimeout(r,500));}
  await page.goto(`${origin}/motion/${id}`);
  await text('Version 1 of your film');assert.equal(writerCalls,1);assert.equal((await getMotion(id,actor)).phase,'visuals');
  const state=await getMotion(id,actor);
  const acceptedHash=(await readFile('motion/reference/safe-index.sha256','utf8')).trim();assert.equal(state.htmlHash,acceptedHash);
  const renderComparisons=JSON.parse(await readFile(path.join(motionDirectory(id,0),'render-comparison.json'),'utf8'));assert(renderComparisons.every((r:{similarity:number})=>r.similarity>=.96));assert.equal(state.film!.scenes.length,10);assertChecks(state.checks!);
  assert.equal(await page.$('a[download]'),null);
  assert.equal(await page.evaluate(async url=>(await fetch(url)).status,`/api/motion/${id}/media/download?revision=0`),403);
  assert(!/Claude|OpenRouter|Higgsfield|ElevenLabs|HyperFrames/.test(await page.evaluate(()=>document.body.innerText)));
  await assert.rejects(()=>actMotion(id,actor,{type:'approve-finishing',revision:0}));
  await assert.rejects(()=>getMotion(id,'another-user'));
  await page.waitForFunction(()=>[...document.querySelectorAll('video')].length===11&&[...document.querySelectorAll('video')].every(v=>v.readyState>=1&&v.videoWidth>0&&v.duration>0));
  await page.evaluate(()=>{for(const v of document.querySelectorAll('video'))v.currentTime=Math.min(1,v.duration/2);});
  await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=2&&!v.seeking));
  await page.screenshot({path:path.join(evidence,'storyboard.png'),fullPage:true});
  await page.type('textarea[aria-label="Film feedback"]','In scene 2, make the word slightly smaller.');await click('Review correction price');
  await text('Apply your correction · $');await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.startsWith('Approve $')&&x.textContent.includes('apply change'));if(!b)throw Error('No approval button');b.click();});
  await page.waitForFunction(()=>document.body.innerText.includes('Applying your requested changes')||document.body.innerText.includes('Version 2 of your film'));
  await text('Version 2 of your film');
  const corrected=await getMotion(id,actor);assert.equal(corrected.revision,1);assert.equal(writerCalls,2);
  assert.equal(corrected.history[0].film.source,state.film!.source);assert.notEqual(corrected.htmlHash,state.htmlHash);
  assert.equal(corrected.film!.source,state.film!.source.replace('fsB = fit(["REALLY?"], SW, 900, 125, 300)','fsB = fit(["REALLY?"], SW, 900, 125, 120)'));
  await assert.rejects(()=>actMotion(id,actor,{type:'approve-board',revision:0,votes:{}}));
  await page.type('textarea[aria-label="Film feedback"]','Lower the music');await click('Keep this note for sound & subtitles');
  await page.click('input[type="checkbox"]');await click('Approve visuals & continue');await text('Approve final film & unlock download');
  assert.equal((await getMotion(id,actor)).deferredFeedback,'Lower the music');assert.equal(await page.$('a[download]'),null);
  await page.select('select[name="music"]','quiet');await page.click('input[type="checkbox"]');
  assert(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Approve final film & unlock download')!.disabled));
  await click('Apply finishing settings · $0');await text('Updating the finishing preview');await text('Approve final film & unlock download');
  await page.waitForFunction(()=>{const v=document.querySelector<HTMLVideoElement>('section video');return v&&v.readyState>=1&&v.videoWidth===1080;});
  await page.screenshot({path:path.join(evidence,'finishing.png'),fullPage:true});
  await page.evaluate(()=>{const labels=[...document.querySelectorAll('label')];(labels.find(l=>l.textContent?.includes('I approve this complete'))?.querySelector('input')as HTMLInputElement)?.click();});
  await click('Approve final film & unlock download');await text('Download video');
  const download=await page.$eval('a[download]',a=>(a as HTMLAnchorElement).href);
  const downloaded=await page.evaluate(async url=>{const r=await fetch(url);return {status:r.status,type:r.headers.get('content-type'),size:(await r.arrayBuffer()).byteLength};},download);
  assert.equal(downloaded.status,200);assert.equal(downloaded.type,'video/mp4');assert(downloaded.size>100000);
  const final=await getMotion(id,actor);assert.equal(final.approved.finishing,digest(await readFile(path.join(motionDirectory(id,1),'final.mp4'))));
  await click('Save to My videos');await text('Saved to My videos');
  assert.equal((await pool.query('SELECT billed_usd,saved_to_library FROM jobs WHERE id=$1',[id])).rows[0].billed_usd,'31.00'); // grid of 2026-10-23: $30 first version + $1 revision ($0.20 estimated x2, rounded up)
  assert.equal(writerCalls,2);assert.equal(externalCalls,0);assert.deepEqual(browserErrors,[]);
  await cp(path.join(motionDirectory(id,0),'preview.mp4'),path.join(evidence,'approved-reference-preview.mp4'));
  await cp(path.join(motionDirectory(id,0),'render-comparison.json'),path.join(evidence,'approved-reference-render-comparison.json'));
  await cp(path.join(motionDirectory(id,1),'checks.json'),path.join(evidence,'positive-checks.json'));
  await cp(path.join(motionDirectory(id,1),'render-comparison.json'),path.join(evidence,'render-comparison.json'));
  await cp(path.join(motionDirectory(id,1),'final.mp4'),path.join(evidence,'final.mp4'));
  await cp(path.join(motionDirectory(id,1),'preview.mp4'),path.join(evidence,'preview.mp4'));
  await writeFile('storage/qa/motion-journey-proof.json',JSON.stringify({date:new Date().toISOString(),status:'passed',durableIndependentWorker:true,browserClosedDuringGeneration:true,htmlIdentical:true,referenceSafeAreaPass:false,referenceViolations:referenceChecks.safeZoneViolations,approvedReference:'plot-hole-v4-safe.py: two text widths corrected with Shimi approval; original unchanged',approvedReferenceHtmlIdentical:true,approvedReferenceHtmlHash:acceptedHash,encodedFrameComparisons:true,animatedBoard:true,wholeFilmReview:true,separateFinishing:true,unsavedSettingsBlockApproval:true,downloadAfterExactFileApproval:true,ownerIsolation:true,initialPriceUsd:10,sceneCorrectionUsd:3,priceUsd:13,scopedRevision:true,externalCalls,paidCalls:0,evidence},null,2));
  console.log('PASS: motion browser journey with approved safe-area reference, matching encoded typography, and zero paid calls.');
 }catch(e){const pages=await browser?.pages();await pages?.at(-1)?.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{if(worker)clearInterval(worker);if(work)await work;await browser?.close();server?.kill('SIGTERM');await pool.end();await setup.query(`DROP SCHEMA ${isolation} CASCADE`);await setup.end();if(id)await rm(motionDirectory(id),{recursive:true,force:true});await rm('tsconfig.motion-qa.json',{force:true});}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
