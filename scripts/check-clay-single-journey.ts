/** Clay single journey (Shimi, 2026-10-23), rehearsed end to end: real browser, real creation and production
 * pages, real controller, worker, wallet (tiers-v2 grid) and local montage. Only director/provider responses are
 * fixtures. A disposable database schema, no credentials in the UI server and denied external fetches prevent
 * spending. Proves: one estimate, one approval, V1 produced with no human gate (browser and web server closed),
 * whole-version feedback, a revision price on the additional cost only, V2 produced unattended, approval, download.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile,spawn,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {Pool} from 'pg';
import sharp from 'sharp';
import puppeteer,{type Browser} from 'puppeteer-core';
import type {JsonRequest,McpCall} from '../src/lib/concept/provider-transports';
import type {AssetTransport} from '../src/lib/concept/media-transfers';

const root=process.cwd(),origin='http://127.0.0.1:3119',actor='browser-qa';
const isolation=`journey_${randomUUID().replaceAll('-','')}`;
const setup=new Pool({connectionString:process.env.DATABASE_URL??'postgres://cam:cam@localhost:5433/cam_video_app'});
const dbUrl=new URL(process.env.DATABASE_URL??'postgres://cam:cam@localhost:5433/cam_video_app');
dbUrl.searchParams.set('options',`-c search_path=${isolation}`);
process.env.DATABASE_URL=dbUrl.href;
Object.assign(process.env,{PROVIDER_MODE:'fal',BRAIN_MODE:'mock',CAM_AUTH_MODE:'required',CAM_RELEASE:'connected',CAM_LIVE_ENABLED:'1',AUTH_SECRET:'offline-browser-fixture-secret-never-used-in-production',HYPERFRAMES_NO_TELEMETRY:'1',HYPERFRAMES_NO_UPDATE_CHECK:'1',HYPERFRAMES_NO_AUTO_INSTALL:'1',HYPERFRAMES_SKIP_SKILLS:'1'});
let externalCalls=0;
globalThis.fetch=async()=>{externalCalls++;throw new Error('External network forbidden in browser rehearsal');};
const workspace=path.join(root,'storage/qa',isolation),jobs:string[]=[],actions:string[]=[],browserErrors:string[]=[];
let server:ChildProcess|undefined,browser:Browser|undefined,worker:Promise<void>|undefined;
let backgroundTimer:ReturnType<typeof setInterval>|undefined;
let submissions=0,jobId='',providerFailure='';
async function main(){
 await setup.query(`CREATE SCHEMA ${isolation}`);
 const {recoveryDependencies}=await import('../src/lib/agent/recovery-supervisor');
 let recoveries=0;recoveryDependencies.diagnose=async input=>{recoveries++;assert(input.allowed.includes('retry-saved'));return {action:'retry-saved',reason:'Retry the existing saved connection after this temporary fixture outage.'};};
 const {deliveryReviewDependencies}=await import('../src/lib/agent/delivery-review');
 deliveryReviewDependencies.review=async input=>({mediaHash:input.mediaHash,ready:true,reason:'Offline injected Claude delivery decision for isolated QA.',corrections:[]});
 const {db,pool,schema}=await import('../src/db');
 const {eq}=await import('drizzle-orm');
 try{
  assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name,isolation);
  for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(`migrations/${file}`,'utf8'));
  await pool.query("INSERT INTO settings(key,value) VALUES('customer_pricing',$1)",[JSON.stringify({mode:'tiers-v2',multiplier:2,higgsfieldCreditUsd:.01})]);
  await pool.query("INSERT INTO credit_ledger(delta_usd,kind,note,wallet) VALUES(1000,'topup','Disposable browser fixture','customer')");
  const {resolveParams}=await import('../src/lib/brain');
  const {getRecipe}=await import('../src/lib/recipes');
  const {planConcept}=await import('../src/lib/concept/storyboard');
  const {localNarration}=await import('../src/lib/concept/local-voice');
  const {updateLiveProduction,runLiveProduction,liveView,LiveAction}=await import('../src/lib/concept/live-production');
  const {productionView}=await import('../src/lib/concept/production-view');
  const {priceCamPlan}=await import('../src/lib/providers/cam-pricing');
  const {IMAGE_ENDPOINT,VIDEO_ENDPOINT}=await import('../src/lib/concept/generation-plan');
  const {ALIGNMENT_ENDPOINT}=await import('../src/lib/concept/transcription');
  const {KLING_STANDARD,KLING_TURBO}=await import('../src/lib/concept/model-selection');
  const {customerQuote,creditHold}=await import('../src/lib/customer-wallet');
  const {clayBudgets}=await import('../src/lib/concept/clay-budgets');
  const {estimatedMinutes,supplierCostUsd}=await import('../src/lib/concept/single-journey');
  const {revisionPriceCents}=await import('../src/lib/customer-price');
  const {queueExports,runQueuedExports,exportView}=await import('../src/lib/format-exports');
  const {sha256}=await import('../src/lib/concept/checkpoints');
  const script='Check the original source. Read the full passage for context. Share only after checking.';
  const provisional=resolveParams(script,'auto',{aspectRatio:'16:9'}).params,recipe=getRecipe(provisional.templateSlug)!;
  const {directSemanticConcept}=await import('../src/lib/concept/ai-direction');
  // The real planner/parser is exercised; only its model response is injected.
  const semanticNarrations=['Check the original source. Read the full passage for context.','Share only after checking.'];
  const fixtureBoard=planConcept(script,recipe,provisional.aspectRatio,{},semanticNarrations);
  const params=await directSemanticConcept(script,provisional,recipe,async input=>input.schema.parse({scenes:fixtureBoard.shots.map((shot,i)=>{
    const {index,scene,motion,references,endScene,overlay,strike}=shot;
    return {index,scene,motion,references,endScene,overlay,strike,visualMode:'metaphor',metaphor:'Explain source checking',stateChange:Boolean(endScene),motionComplexity:'simple',actionSeconds:4,breathBefore:.3,narration:semanticNarrations[i],idea:i===0?'Check the source and context together':'Then decide whether to share',boundaryReason:i===0?'One investigation idea across two sentences':'Change from investigating to sharing',continuityKey:'checking'};
  })}));
  assert.equal(provisional.sceneNarrations?.length,3);assert.equal(params.sceneNarrations?.length,2);
  params.productionMethod='whimsical-v1';
  const board=planConcept(script,recipe,params.aspectRatio,{},params.sceneNarrations);
  assert(board.shots.length>=2,'Exercise a complete multi-scene preview');
  params.sceneDirections=Object.fromEntries(board.shots.map((shot,i)=>{
   const {scene,motion,references,endScene,overlay,strike,actionSeconds}=shot;
   return [shot.index,{scene,motion,references,endScene,overlay:i===0?overlay:shot.narration,strike:i===0?strike:false,actionSeconds,visualMode:i===0?'metaphor':'presenter-text',stateChange:Boolean(endScene),metaphor:'Local calibration fixture'}];
  }));
  await mkdir(path.join(workspace,'assets'),{recursive:true});
  process.env.PROVIDER_MODE='dryrun';
  const timing=await localNarration(workspace,board.shots.map(s=>s.narration),'local-en',{directory:path.join(workspace,'voice-cache'),assertOwned:async()=>{}});
  process.env.PROVIDER_MODE='fal';
  const wav=await readFile(path.join(workspace,'assets/narration.wav'));
  const png=await sharp({create:{width:960,height:540,channels:3,background:'#284a63'}}).composite([{input:Buffer.from('<svg width="960" height="540"><text x="480" y="250" fill="white" font-size="48" text-anchor="middle">OFFLINE CLIENT JOURNEY</text><text x="480" y="320" fill="white" font-size="28" text-anchor="middle">Local test voice · no paid generation</text></svg>')}]).png().toBuffer();
  await writeFile(path.join(workspace,'image.png'),png);
  await promisify(execFile)('ffmpeg',['-y','-loglevel','error','-loop','1','-i',path.join(workspace,'image.png'),'-t','10','-r','30','-an','-c:v','libx264','-pix_fmt','yuv420p',path.join(workspace,'clip.mp4')]);
  const video=await readFile(path.join(workspace,'clip.mp4')),requests=new Map<string,string>();
  const fal:JsonRequest=async(url,init)=>{
   if(url.includes('/models/pricing'))return {prices:[{endpoint_id:IMAGE_ENDPOINT,unit_price:.15,unit:'images',currency:'USD'},...[VIDEO_ENDPOINT,KLING_STANDARD,KLING_TURBO].map(endpoint_id=>({endpoint_id,unit_price:.14,unit:'seconds',currency:'USD'})),{endpoint_id:ALIGNMENT_ENDPOINT,unit_price:.0008,unit:'compute seconds',currency:'USD'}]};
   if(url.includes('billing-events'))throw new Error('Fixture receipts unavailable');
   if(init.method==='POST'){const id=randomUUID(),kind=url.includes('whisper')?'alignment':url.includes('nano-banana')?'image':'video';requests.set(id,kind);submissions++;return {request_id:id};}
   const id=url.match(/requests\/([^/]+)/)?.[1];assert(id&&requests.has(id));
   if(url.endsWith('/status'))return {status:'COMPLETED',request_id:id};
   const kind=requests.get(id);
   if(kind==='alignment')return {text:script,chunks:timing.words.map(w=>({text:w.word,timestamp:[w.start,w.end]}))};
   return kind==='image'?{images:[{url:`https://v3.fal.media/${id}.png`}]}:{video:{url:`https://v3.fal.media/${id}.mp4`}};
  };
  const higgsfield:McpCall=async(name,args)=>{
   const p=args.params as Record<string,unknown>;
   if(name==='generate_video'&&p.get_cost)return {structuredContent:{cost:{credits:p.draft?20:40}}};
   if(name==='generate_audio'&&p.get_cost)return {structuredContent:{cost:{credits:.15,credits_exact:.15}}};
   if(name==='generate_audio'){submissions++;return {structuredContent:{results:[{id:'offline-voice',type:'audio',model:'text2speech_v2'}]}};}
   if(name==='media_import_url')return {structuredContent:{media_id:'offline-reference'}};
   if(name==='jobs_wait')return {structuredContent:{jobs:[{job_id:'offline-voice',index:0,status:'completed',type:'audio',model:'text2speech_v2',result_url:'https://cdn.higgsfield.ai/fixture.wav'}]}};
   throw new Error(`Unexpected fixture request ${name}`);
  };
  const assets:AssetTransport={mode:'live',upload:async bytes=>({url:`https://v3.fal.media/${sha256(bytes)}`,expiresAt:Date.now()+86400000}),download:async url=>new Response(new Uint8Array(url.endsWith('.wav')?wav:url.endsWith('.png')?png:video))};
  const {directFeedback}=await import('../src/lib/concept/feedback-director');
  // The real director parser and validator run on an injected model answer: the version phase reads picture and finishing notes together.
  const fixtureDirector:import('../src/lib/concept/feedback-director').FeedbackDirector=async (input,owned)=>directFeedback(input,owned,async request=>{assert.equal(input.phase,'version');return request.schema.parse({decisions:input.notes.map(note=>{
   if(note.text==='Keep this shot moving continuously')return {id:note.id,stage:'visual',status:'planned',message:'This shot is animated continuously; its still, the other scenes and the narration are kept.',finishing:null,changes:note.scenes.map(scene=>({scene,edit:{motion:'The guide turns the globe continuously while the camera slowly moves closer.',visualMode:'presenter-text'},imageInstruction:null,characters:[]}))};
   if(note.text==='Lower the music')return {id:note.id,stage:'finishing',status:'planned',message:'The music will be quieter under the narration.',changes:[],finishing:{...input.settings,musicLevel:'quiet'}};
   throw Error('Unexpected fixture feedback');
  })});},async()=>null);
  let failConnection=true;const dependencies={providers:async()=>{if(failConnection){failConnection=false;throw Error('Offline fixture connection interruption before any submission');}return {fal,higgsfield,close:async()=>{}};},assets:()=>assets,budgetScope:isolation.replaceAll('_','-')};
  const price:Parameters<typeof updateLiveProduction>[3]=(plan,options)=>priceCamPlan(plan,{fal,higgsfield},Date.now(),{...options,higgsfieldCreditUsd:.01});
  const getJob=async()=>{const [job]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,jobId));assert(job);return job;};
  const advance=()=>{if(worker)return;worker=runLiveProduction(jobId,{...dependencies,quote:price},{background:true}).then(async()=>{await runQueuedExports();const v=await liveView(jobId);if(v.error&&!v.automaticRecovery)throw new Error(v.error);}).catch(e=>{providerFailure=String(e);console.error('Fixture worker:',providerFailure);}).finally(()=>{worker=undefined;});};
  backgroundTimer=setInterval(()=>{if(jobId)advance();},1000);
  // Next only serves the real UI and authenticated-local media in this isolated
  // instance. All browser API actions are intercepted below and never forwarded.
  const clearedEnv=Object.fromEntries((await readFile('.env','utf8').catch(()=>'' )).split('\n').map(line=>line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1]).filter((key):key is string=>Boolean(key)).map(key=>[key,'']));
  const env:NodeJS.ProcessEnv={...clearedEnv,PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_ENV:'development',DATABASE_URL:dbUrl.href,CAM_AUTH_MODE:'local',PROVIDER_MODE:'dryrun',BRAIN_MODE:'mock',CAM_RELEASE:'preview',CAM_LOCAL_DEMO:'1',CAM_NEXT_DIR:'.next-journey-qa',CAM_TS_CONFIG:'tsconfig.journey-qa.json',NEXT_TELEMETRY_DISABLED:'1'};
  const tsconfig=JSON.parse(await readFile('tsconfig.json','utf8'));tsconfig.include=['next-env.d.ts','src/**/*.ts','src/**/*.tsx','.next-journey-qa/dev/types/**/*.ts'];tsconfig.exclude=['node_modules','.next','.next-connected','.next-demo'];await writeFile('tsconfig.journey-qa.json',JSON.stringify(tsconfig));
  const startServer=async()=>{
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...(process.env.CAM_QA_WEBPACK==='1'?['--webpack']:[]),'--hostname','127.0.0.1','--port','3119'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let log='';server.stdout?.on('data',d=>{log+=String(d);});server.stderr?.on('data',d=>{log+=String(d);});
  for(let i=0;i<90;i++){const ready=await new Promise<boolean>(resolve=>{const req=http.get(`${origin}/login`,res=>{res.resume();resolve(res.statusCode===200);});req.on('error',()=>resolve(false));req.setTimeout(1000,()=>{req.destroy();resolve(false);});});if(ready)break;if(server.exitCode!==null)throw new Error(log);await new Promise(r=>setTimeout(r,500));if(i===89)throw new Error(log);}
  };
  await startServer();
  const startBrowser=async()=>puppeteer.launch({executablePath:process.env.CAM_TEST_CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run']});
  browser=await startBrowser();
  const attachPage=async()=>{
  const page=await browser!.newPage();await page.setViewport({width:1280,height:900});page.setDefaultTimeout(60000);
  page.on('pageerror',e=>browserErrors.push(String(e)));
  await page.setRequestInterception(true);
  page.on('request',req=>{void (async()=>{
   const url=new URL(req.url());
   if(url.origin!==origin){if(['data:','blob:'].includes(url.protocol))return req.continue();externalCalls++;return req.abort();}
   if(!url.pathname.startsWith('/api/'))return req.continue();
   if(url.pathname.startsWith('/api/media/'))return req.continue();
   const reply=(value:unknown,status=200)=>req.respond({status,contentType:'application/json',body:JSON.stringify(value)});
   try{
    const input=req.postData()?JSON.parse(req.postData()!):{};
    if(url.pathname==='/api/account')return reply({connected:true,pricingReady:true,pricingMode:'tiers-v2',preview:false,balance:1000,user:{role:'client',name:'QA'}});
    if(url.pathname==='/api/templates')return reply([{slug:recipe.slug,name:recipe.name,status:'active',description:'Clay video',recipe:{family:'concept'}}]);
    if(url.pathname==='/api/examples/cam-clay')return reply({available:false});
    if(url.pathname==='/api/conversations')return reply([]);
    if(url.pathname==='/api/productions/preparation')throw new Error('The single journey never asks for a preparation allowance');
    if(url.pathname==='/api/productions'){
     // Mirrors the Start route after its analysis: the job is saved with its journey, quoted for the complete version, and ONE estimate is returned.
     assert.equal(input.script,script);assert.equal(input.mode,'auto');assert.deepEqual(input.overrides,{aspectRatio:'16:9'});assert.equal(input.storyboardLaunchToken,undefined,'No preparation ticket in the single journey');
     jobId=input.requestId;jobs.push(jobId);const conversationId=randomUUID();
     await db.insert(schema.conversations).values({id:conversationId,title:'Disposable single journey'});
     await db.insert(schema.jobs).values({id:jobId,conversationId,script,title:input.title,params:{...params,live:true,executionMode:'fal',journey:'single-v1'},status:'estimated'});
     await updateLiveProduction(jobId,{action:'quote'},actor,price);
     const view=await liveView(jobId);assert.equal(view.quote?.scope,'production');assert.equal(view.journey,'single-v1');
     const customer=await customerQuote(jobId,view.quote!,{allowanceUsd:clayBudgets().firstVersionAllowanceUsd});assert(customer);
     const sceneCount=planConcept(script,recipe,params.aspectRatio,params.sceneDirections,params.sceneNarrations).shots.length;
     return reply({jobId,journey:'single-v1',approved:false,estimate:{quote:view.quote!.id,customerQuote:customer.id,amountCents:customer.amountCents,expiresAt:view.quote!.expiresAt,minutes:estimatedMinutes(sceneCount),sceneCount,availableCents:100000}});
    }
    assert(url.pathname.startsWith(`/api/jobs/${jobId}`),`Unexpected endpoint ${url.pathname}`);
    if(url.pathname.endsWith('/live')){
     if(req.method()==='GET')return reply(await productionView(await getJob()));
     const action=LiveAction.parse(input);actions.push(action.action);
     const result=await updateLiveProduction(jobId,action,actor,price,fixtureDirector);return reply({ok:true},result.advance?202:200);
    }
    if(url.pathname.endsWith('/exports')){
     if(req.method()==='POST'){await queueExports(jobId);return reply({ok:true},202);}
     return reply(await exportView(await getJob()));
    }
    if(req.method()==='PATCH'){assert.equal(input.savedToLibrary,true);await db.update(schema.jobs).set({savedToLibrary:true}).where(eq(schema.jobs.id,jobId));return reply({ok:true});}
    return reply({...await getJob(),live:true});
   }catch(error){console.error('Browser API:',String(error));await writeFile(path.join(workspace,'api-error.txt'),String(error));return reply({error:String(error)},409);}
  })().catch(error=>{browserErrors.push(String(error));void req.abort().catch(()=>{});});});
  return page;};
  let page=await attachPage();
  const click=async(label:string)=>{console.log('UI click:',label);await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent?.trim()===t&&!b.disabled),{},label);await page.evaluate(t=>{[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===t)!.click();},label);};
  const clickStarting=async(prefix:string)=>{console.log('UI click:',prefix);await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>Boolean(b.textContent?.trim().startsWith(t))&&!b.disabled),{},prefix);await page.evaluate(t=>{[...document.querySelectorAll('button')].find(b=>b.textContent?.trim().startsWith(t))!.click();},prefix);};
  const text=async(value:string)=>{
   console.log('UI wait:',value);
   const deadline=Date.now()+180000;
   while(Date.now()<deadline){
    if(providerFailure)throw new Error(providerFailure);
    if(await page.evaluate(t=>document.body.innerText.includes(t),value))return;
    await new Promise(resolve=>setTimeout(resolve,250));
   }
   throw new Error(`UI did not reach: ${value}`);
  };
  const absent=async(value:string)=>assert(!(await page.evaluate(t=>document.body.innerText.includes(t),value)),`Must not show: ${value}`);
  // 1. Creation: script, format, Get my estimate. No preparation allowance, no storyboard price.
  await page.goto(origin,{waitUntil:'networkidle0'});await text('Create a video');
  const homeText=await page.$eval('body',el=>el.textContent??'');
  assert(!/Have an idea\?|\bManual\b|\bQuality tier\b|preparation allowance/i.test(homeText),'Creation exposes only script, format and one estimate');
  await page.type('input[placeholder="Give your video a short name"]','Single journey');
  await page.select('select','16:9');await page.type('textarea[placeholder="Paste the narration for your film…"]',script);
  await click('Get my estimate');await text('Your video estimate');
  const expectedMinutes=estimatedMinutes(board.shots.length);
  await text(`about ${expectedMinutes} minutes`);await text('$30 USD');
  assert.equal(submissions,0,'The estimate costs no media');
  const estimateState=await liveView(jobId);assert.equal(estimateState.approved,false);assert.equal(estimateState.quote?.scope,'production');
  // 2. One approval: wallet reservation, worker launched. The page moves to the production view.
  await click('Approve & start my video');await text('Version 1 in production');
  const hold=await creditHold(jobId);assert(hold&&hold.state==='reserved'&&hold.amountCents===3000,'The V1 price is held on the wallet');
  const approvedQuote=(await liveView(jobId)).quote!;assert((await liveView(jobId)).approved);
  await page.screenshot({path:path.join(workspace,'production-started.png'),fullPage:true});
  // 3. Close the browser and the web server: the whole V1 is produced with no human gate.
  await browser.close();browser=undefined;
  const stoppedServer=server!;const exited=new Promise<void>(resolve=>stoppedServer.once('exit',()=>resolve()));stoppedServer.kill('SIGTERM');await exited;server=undefined;
  const backgroundDeadline=Date.now()+300000;
  while((await liveView(jobId)).review?.stage!=='finishing-film'){
   if(providerFailure)throw new Error(providerFailure);
   const v=await liveView(jobId);
   assert(!v.review||v.review.stage!=='storyboard'||v.status==='pending','No storyboard gate');assert.notEqual(v.review?.stage,'draft-film','No visual gate');assert.equal(v.needsProductionBudget,false,'No budget gate');
   if(Date.now()>backgroundDeadline)throw new Error(`Unattended V1 did not finish: ${JSON.stringify({phase:v.phase,status:v.status,error:v.error})}`);
   await new Promise(r=>setTimeout(r,500));
  }
  assert(!actions.includes('review'),'No human review before V1');
  const v1=await liveView(jobId);assert.equal(v1.filmVersion,1);assert.equal(v1.finishing?.settings.musicLevel,'normal');assert.equal(v1.finishing?.settings.captions,true);
  const v1Submissions=submissions;assert([...requests.values()].includes('image')&&[...requests.values()].includes('alignment')&&[...requests.values()].includes('video'),'Images, alignment and a clip were produced');
  const liveRoot=path.join('storage/concepts',jobId,'live');
  const v1Finishing=JSON.parse(await readFile(path.join(liveRoot,'finishing.json'),'utf8'));
  // 4. The client reviews the complete V1 and asks for two changes together (motion and music).
  await startServer();browser=await startBrowser();page=await attachPage();
  await page.goto(`${origin}/production/${jobId}`,{waitUntil:'networkidle0'});
  await text('Version 1 of your film');await absent('Approve storyboard');await absent('Approve visuals');await absent('Approve budget');await absent('Apply settings & update preview');
  await page.waitForFunction(()=>{const v=document.querySelector('[aria-label="Current production step"] video');return v&&(v as HTMLVideoElement).readyState>=1&&!(v as HTMLVideoElement).error;});
  const lockNote=async(note:string,seconds:number|null)=>{
   await page.waitForFunction(()=>{const t=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your video feedback"]');return t&&!t.disabled&&!t.value;});
   if(seconds!==null){await page.$eval('[aria-label="Current production step"] video',(v,t)=>{(v as HTMLVideoElement).currentTime=t;},seconds);await click('At current time');}else await click('Whole video');
   await page.type('textarea[aria-label="Your video feedback"]',note);await click('Lock feedback');
   await page.waitForFunction(()=>{const t=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your video feedback"]');return t&&!t.disabled&&!t.value;});
  };
  const timeline=JSON.parse(await readFile(path.join(path.dirname(v1Finishing.file),'editorial-timeline.json'),'utf8'));
  const midpoint=(scene:number)=>{const span=timeline.scenes.find((s:{scene:number})=>s.scene===scene);return (span.startFrame+span.endFrame)/2/timeline.fps;};
  await lockNote('Keep this shot moving continuously',midpoint(1));
  await lockNote('Lower the music',null);
  assert.equal(submissions,v1Submissions,'Locking notes executes nothing');
  assert(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Approve this version & download')!.disabled),'Pending notes block approval of the version as it is');
  await click('Apply feedback');await text('Version 2 ·');
  const quoted=await liveView(jobId);assert.equal(quoted.filmCorrection?.status,'quoted');assert.equal(quoted.filmCorrection?.version,2);
  assert.equal(submissions,v1Submissions,'Pricing executes nothing');
  const additional=revisionPriceCents(Math.max(0,supplierCostUsd(quoted.quote!,.01)-supplierCostUsd(approvedQuote,.01))+clayBudgets().revisionAllowanceUsd);
  assert(additional>0&&additional<3000,`A revision is priced on its additional cost only (${additional} cents)`);
  await text(`+$${additional/100} USD`);await text('How we read your notes');
  await page.screenshot({path:path.join(workspace,'revision-quote.png'),fullPage:true});
  // 5. Approving the revision price produces V2 unattended with the carried finishing settings.
  await clickStarting(`Approve $${additional/100} & produce version 2`);await text('Version 2 in production');
  const held=await creditHold(jobId);assert.equal(held?.amountCents,3000+additional,'The hold grows by the revision price only');
  const v2Deadline=Date.now()+300000;
  while((await liveView(jobId)).filmVersion!==2||(await liveView(jobId)).review?.stage!=='finishing-film'){
   if(providerFailure)throw new Error(providerFailure);
   if(Date.now()>v2Deadline){const v=await liveView(jobId);throw new Error(`Unattended V2 did not finish: ${JSON.stringify({phase:v.phase,status:v.status,error:v.error})}`);}
   await new Promise(r=>setTimeout(r,500));
  }
  assert.equal(submissions,v1Submissions+1,'Exactly one new clip for the motion note; images, voice and alignment reused');
  const v2=await liveView(jobId);assert.equal(v2.finishing?.settings.musicLevel,'quiet','The finishing note was applied in the new version');assert.equal(v2.filmComments.length,0,'Both notes are applied');
  await text('Version 2 of your film');
  await page.waitForFunction(()=>{const v=document.querySelector('[aria-label="Current production step"] video');return v&&(v as HTMLVideoElement).readyState>=1&&!(v as HTMLVideoElement).error;});
  // 6. Approve this version: settlement and download, three formats.
  await click('Approve this version & download');await text('Download video');
  assert.equal((await creditHold(jobId))?.state,'spent');assert.equal((await getJob()).billedUsd,String((3000+additional)/100)+'.00');
  await page.screenshot({path:path.join(workspace,'download.png'),fullPage:true});
  assert.equal((await getJob()).savedToLibrary,false);await click('Save to My videos');await text('Saved to My videos');assert.equal((await getJob()).savedToLibrary,true);
  await click('Prepare three downloads · $0');await text('Watch each format before publishing');
  assert.equal((await exportView(await getJob())).state?.files.length,3);assert.equal(submissions,v1Submissions+1);
  const download=await page.$eval('a[download]',a=>(a as HTMLAnchorElement).href);assert(download.includes('/api/media/'));
  const output=(await getJob()).outputPath!;assert((await readFile(output)).length>1000);
  assert(!actions.includes('resume'),'Browser must never schedule the production');assert.equal(actions.filter(a=>a==='review').length,1,'The only human review is the final approval');assert.equal(recoveries,1);assert.equal(externalCalls,0);assert.equal(providerFailure,'');assert.deepEqual(browserErrors,[]);
  await writeFile('storage/qa/clay-single-journey-proof.json',JSON.stringify({status:'passed',date:new Date().toISOString(),interface:'real Next.js pages in headless Chrome',backend:'real production controller, worker, isolated database and wallet (tiers-v2); fixture director/provider responses',oneEstimate:true,firstVersionPriceCents:3000,estimatedMinutes:expectedMinutes,noStoryboardGate:true,noBudgetGate:true,noVisualGate:true,noFinishingGate:true,browserAndServerClosedDuringV1:true,wholeVersionFeedback:true,revisionAdditionalCents:additional,secondVersionUnattended:true,carriedFinishingSettings:true,finalApprovalSettlement:true,threeFormats:true,recoveries,externalCalls,paidCalls:0,submissions,actions},null,2));
  console.log('PASS: Clay single journey in a real browser, zero external calls and zero paid generations.');
 }catch(error){
  const pages=await browser?.pages();const current=pages?.at(-1);
  if(current&&!current.isClosed()){await current.screenshot({path:path.join(workspace,'failure.png'),fullPage:true}).catch(()=>{});await current.evaluate(()=>document.body.innerText).then(t=>writeFile(path.join(workspace,'failure.txt'),t)).catch(()=>{});}
  throw error;
 }finally{
  if(backgroundTimer)clearInterval(backgroundTimer);
  if(worker)await worker;await browser?.close();server?.kill('SIGTERM');
  await writeFile(path.join(workspace,'browser-errors.json'),JSON.stringify(browserErrors)).catch(()=>{});
  await pool.end();await setup.query(`DROP SCHEMA ${isolation} CASCADE`);await setup.end();
  for(const id of jobs)for(const dir of [`storage/concepts/${id}`,`storage/imports/${id}`,`storage/exports/${id}`,`storage/outputs/${id}.mp4`])await rm(dir,{recursive:true,force:true});
  await rm('tsconfig.journey-qa.json',{force:true});
 }
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
