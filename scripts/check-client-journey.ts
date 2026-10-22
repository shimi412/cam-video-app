/** Real browser, production controller, wallet and local montage.
 * Only director/provider responses are fixtures. A disposable database schema,
 * no credentials in the UI server, and denied external fetches prevent spending.
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
  await pool.query("INSERT INTO settings(key,value) VALUES('customer_pricing',$1)",[JSON.stringify({multiplier:2,higgsfieldCreditUsd:.01})]);
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
  const {customerQuote}=await import('../src/lib/customer-wallet');
  const {createStoryboardLaunch,verifyStoryboardLaunch,assertStoryboardLaunchQuote,StoryboardLaunchInputSchema}=await import('../src/lib/concept/storyboard-launch');
  const {initializeStoryboardLaunch}=await import('../src/lib/concept/storyboard-launch-service');
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
  const fixtureDirector:import('../src/lib/concept/feedback-director').FeedbackDirector=async (input,owned)=>directFeedback(input,owned,async request=>request.schema.parse({decisions:input.notes.map(note=>{
   if(note.text==='Keep this shot moving continuously')return {id:note.id,stage:'visual',status:'planned',message:'Animate this approved shot without replacing its still.',finishing:null,changes:note.scenes.map(scene=>({scene,edit:{motion:'The guide turns the globe continuously while the camera slowly moves closer.',visualMode:'presenter-text'},imageInstruction:null,characters:[]}))};
   if(note.text==='Remove the title')return {id:note.id,stage:'visual',status:'planned',message:'Remove only the local title.',finishing:null,changes:note.scenes.map(scene=>({scene,edit:{overlay:null},imageInstruction:null,characters:[]}))};
   if(note.text==='Make captions larger')return {id:note.id,stage:'finishing',status:'planned',message:'Next: finishing. Change captions there.',changes:[],finishing:input.phase==='finishing'?{...input.settings,captionSize:'large'}:null};
   if(note.text==='Lower the music')return {id:note.id,stage:'finishing',status:'planned',message:'Next: finishing. Lower the music there.',changes:[],finishing:input.phase==='finishing'?{...input.settings,musicLevel:'quiet'}:null};
   if(note.text==='Add Muslim, Jewish and Christian symbols around the character.')return {id:note.id,stage:'visual',status:'planned',message:'Three faith symbols added',finishing:null,changes:note.scenes.map(scene=>({scene,edit:{graphicLayers:[{kind:'symbol',symbol:'crescent',position:'top-left'},{kind:'symbol',symbol:'star-of-david',position:'top-center'},{kind:'symbol',symbol:'cross',position:'top-right'}]},imageInstruction:null,characters:[]}))};
   if(note.text==='Change the title to "Check the context"')return {id:note.id,stage:'visual',status:'planned',message:'The local graphic change is visible',finishing:null,changes:note.scenes.map(scene=>({scene,edit:{overlay:'Check the context'},imageInstruction:null,characters:[]}))};
   throw Error('Unexpected fixture feedback');
  })}),async()=>null);
  let failConnection=true;const dependencies={providers:async()=>{if(failConnection){failConnection=false;throw Error('Offline fixture connection interruption before any submission');}return {fal,higgsfield,close:async()=>{}};},assets:()=>assets,budgetScope:isolation.replaceAll('_','-')};
  const price:Parameters<typeof updateLiveProduction>[3]=(plan,options)=>priceCamPlan(plan,{fal,higgsfield},Date.now(),options);
  const launchOptions={secret:'offline-browser-fixture-secret-never-used-in-production',readImageUnitPrice:async()=>.15,readCustomerMultiplier:async()=>2};
  const getJob=async()=>{const [job]=await db.select().from(schema.jobs).where(eq(schema.jobs.id,jobId));assert(job);return job;};
  const advance=()=>{if(worker)return;worker=runLiveProduction(jobId,dependencies,{background:true}).then(async()=>{await runQueuedExports();const v=await liveView(jobId);if(v.error&&!v.automaticRecovery)throw new Error(v.error);}).catch(e=>{providerFailure=String(e);console.error('Fixture worker:',providerFailure);}).finally(()=>{worker=undefined;});};
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
    if(url.pathname==='/api/account')return reply({connected:true,pricingReady:true,preview:false,balance:1000,user:{role:'client',name:'QA'}});
    if(url.pathname==='/api/templates')return reply([{slug:recipe.slug,name:recipe.name,status:'active',description:'Clay video',recipe:{family:'concept'}}]);
    if(url.pathname==='/api/examples/cam-clay')return reply({available:false});
    if(url.pathname==='/api/conversations')return reply([]);
    if(url.pathname==='/api/productions/preparation')return reply(await createStoryboardLaunch(StoryboardLaunchInputSchema.parse(input),actor,launchOptions));
    if(url.pathname==='/api/productions'){
     assert.equal(input.script,script);assert.equal(input.mode,'auto');assert.deepEqual(input.overrides,{aspectRatio:'16:9'});const receipt=verifyStoryboardLaunch(input.storyboardLaunchToken,input,actor,launchOptions);
     jobId=input.requestId;jobs.push(jobId);const conversationId=randomUUID();
     await db.insert(schema.conversations).values({id:conversationId,title:'Disposable client journey'});
     await db.insert(schema.jobs).values({id:jobId,conversationId,script,title:input.title,params:{...params,live:true,executionMode:'fal'},status:'estimated'});
     await initializeStoryboardLaunch({jobId,actorId:actor,receipt},{view:liveView,quote:(id,who)=>updateLiveProduction(id,{action:'quote'},who,price),customerQuote,approve:(id,quote,who)=>updateLiveProduction(id,{action:'approve',...quote},who),validate:assertStoryboardLaunchQuote});
     return reply({jobId,simulation:false},202);
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
  const approve=async(label:string)=>{await page.waitForSelector('[aria-label="Current production step"] input[type="checkbox"]');await page.click('[aria-label="Current production step"] input[type="checkbox"]');await click(label);};
  await page.goto(origin,{waitUntil:'networkidle0'});await text('Your video journey');
  const homeText=await page.$eval('body',el=>el.textContent??'');
  assert(!/Have an idea\?|\bManual\b|\bQuality tier\b/i.test(homeText),'Creation must expose only the automatic script flow');
  assert.equal(await page.$$eval('select',els=>els.length),1,'Only format is selected on creation');
  await page.type('input[placeholder="Give your video a short name"]','Offline journey');
  await page.select('select','16:9');await page.type('textarea[placeholder="Paste the narration for your film…"]',script);
  await click('Start my video');await text('Your storyboard');
  await page.waitForSelector('li[data-scene="1"] img');
  await page.$eval('li[data-scene="1"] img',i=>i.scrollIntoView());
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('li[data-scene="1"] img')].every(i=>i.complete&&i.naturalWidth>0&&i.getBoundingClientRect().width>80&&i.getBoundingClientRect().height>45));
  const imagesBefore=submissions;assert([...requests.values()].every(v=>v==='image'));
  await page.type('#feedback-1','Add Muslim, Jewish and Christian symbols around the character.');
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLButtonElement>('li[data-scene="1"] button')].some(b=>b.textContent?.trim()==='Lock feedback'&&!b.disabled));
  await page.evaluate(()=>{[...document.querySelectorAll<HTMLButtonElement>('li[data-scene="1"] button')].find(b=>b.textContent?.trim()==='Lock feedback')!.click();});
  await text('Feedback locked');assert.equal(submissions,imagesBefore);
  await click('Apply all feedback (1)');await text('Change applied. Review the updated scene');
  await page.type('#feedback-global','Change the title to "Check the context"');
  await page.click('[aria-label="Include scene 1"]');
  await page.evaluate(()=>{[...document.querySelectorAll<HTMLButtonElement>('[aria-label="Whole video feedback"] button')].find(b=>b.textContent?.trim()==='Lock feedback')!.click();});await text('Feedback locked');
  await click('Apply all feedback (1)');await text('The local graphic change is visible');
  assert.equal(submissions,imagesBefore,'Local global correction must not generate');
  assert(await page.$eval('li[data-scene="1"]',el=>el.textContent?.includes('Check the context')));
  assert(!await page.$eval('li[data-scene="2"]',el=>el.textContent?.includes('Check the context')));
  await page.screenshot({path:path.join(workspace,'storyboard.png'),fullPage:true});
  await page.click('[aria-label="Approve storyboard"]');
  await click('Approve storyboard & see video price');await text('Your video quote');
  assert.equal(submissions,imagesBefore);await click('Approve budget & create video');
  // Close the whole browser and kill the web listener after budget acceptance.
  for(let i=0;i<100;i++){const v=await liveView(jobId);if(v.quote?.scope==='production'&&v.approved&&!v.renewing)break;await new Promise(r=>setTimeout(r,100));if(i===99)throw new Error('Budget approval not persisted');}
  await browser.close();browser=undefined;
  const stoppedServer=server!;const exited=new Promise<void>(resolve=>stoppedServer.once('exit',()=>resolve()));stoppedServer.kill('SIGTERM');await exited;server=undefined;
  const backgroundDeadline=Date.now()+180000;
  while((await liveView(jobId)).review?.stage!=='draft-film'){
   if(providerFailure)throw new Error(providerFailure);
   if(Date.now()>backgroundDeadline)throw new Error('Background production did not finish without the browser/server');
   await new Promise(r=>setTimeout(r,500));
  }
  const withoutBrowser=submissions;
  await new Promise(r=>setTimeout(r,5000));assert.equal(submissions,withoutBrowser,'The human visual gate survives browser closure');
  await startServer();browser=await startBrowser();page=await attachPage();
  await page.goto(`${origin}/production/${jobId}`,{waitUntil:'networkidle0'});
  await text('Approve visuals & continue');assert.equal((await liveView(jobId)).review?.stage,'draft-film');
  // Exercise two priced motion notes together, including a scene that previously
  // used local motion. All clicks use the actual UI; only provider responses vary.
  const lockNote=async(note:string,seconds:number|null)=>{
   await page.waitForFunction(()=>{const t=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your video feedback"]');return t&&!t.disabled&&!t.value;});
   if(seconds!==null){await page.$eval('[aria-label="Current production step"] video',(v,t)=>{(v as HTMLVideoElement).currentTime=t;},seconds);await click('At current time');}else await click('Whole video');
   await page.type('textarea[aria-label="Your video feedback"]',note);await click('Lock feedback');
   await page.waitForFunction(()=>{const t=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your video feedback"]');return t&&!t.disabled&&!t.value;});
  };
  const liveRoot=path.join('storage/concepts',jobId,'live');
  const originalTimeline=JSON.parse(await readFile(path.join(liveRoot,'draft-montage/editorial-timeline.json'),'utf8'));
  const midpoint=(scene:number)=>{const span=originalTimeline.scenes.find((s:{scene:number})=>s.scene===scene);return (span.startFrame+span.endFrame)/2/originalTimeline.fps;};
  const beforeCorrection=submissions;
  await lockNote('Keep this shot moving continuously',midpoint(1));
  await click('Edit feedback');await page.reload({waitUntil:'networkidle0'});await text('Keep this shot moving continuously');
  assert.equal((await liveView(jobId)).filmComments.length,1,'Reload while editing retains the locked note');
  await click('Edit feedback');await click('Lock feedback');
  await page.waitForFunction(()=>{const t=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your video feedback"]');return t&&!t.disabled&&!t.value;});
  assert.equal((await liveView(jobId)).filmComments.length,1,'Relocking replaces the note atomically');
  await lockNote('Keep this shot moving continuously',midpoint(2));
  assert.equal(submissions,beforeCorrection,'Locking does not execute');
  await click('Apply all changes');await text('Your correction price');
  assert.equal(submissions,beforeCorrection,'Pricing does not execute');
  const quoted=await liveView(jobId);assert.deepEqual(quoted.filmCorrection?.scenes,[1,2]);
  await click('Approve price & apply changes');await text('Approve changes & update film');
  const correctedFeedback=JSON.parse(await readFile(path.join(liveRoot,'storyboard-feedback.json'),'utf8'));
  const {combinedStoryboardEdits}=await import('../src/lib/concept/storyboard-feedback');
  assert.equal(combinedStoryboardEdits(correctedFeedback)[1].overlay,'Check the context');
  assert.equal(correctedFeedback.edits[1].graphicLayers.length,3,'Motion must preserve approved symbols');
  assert.equal(submissions,beforeCorrection,'Motion preserves images and waits for storyboard approval');
  await page.click('[aria-label="Approve storyboard"]');await click('Approve changes & update film');
  await text('Approve visuals & continue');
  assert.equal(submissions,beforeCorrection+2,'Exactly two requested clips are created');
  const afterCorrection=submissions;
  // A second review cycle exercises local changes on top of paid motion edits.
  await lockNote('Remove the title',midpoint(1));await click('Apply all changes');await text('Approve changes & update film');
  await page.click('[aria-label="Approve storyboard"]');await click('Approve changes & update film');await text('Approve visuals & continue');
  assert.equal(submissions,afterCorrection,'Second local correction must reuse all clips');
  const finalFeedback=JSON.parse(await readFile(path.join(liveRoot,'storyboard-feedback.json'),'utf8'));
  assert.equal(finalFeedback.edits[1].overlay,null);assert.equal(finalFeedback.edits[1].graphicLayers.length,3);assert(finalFeedback.edits[1].motion);
  await page.type('textarea[aria-label="Your video feedback"]','Lower the music');await click('Lock feedback');await page.waitForFunction(()=>{const t=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your video feedback"]');return t&&!t.disabled&&!t.value;});await page.type('textarea[aria-label="Your video feedback"]','Make captions larger');await click('Lock feedback');await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Video feedback"] article').length===2);assert.equal((await liveView(jobId)).filmComments.length,2);await click('Apply all changes');await text('Next: finishing');
  await page.reload({waitUntil:'networkidle0'});await text('Next: finishing');
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=1&&!v.error;});
  const visualSubmissions=submissions;
  await approve('Approve visuals & continue');await text('Approve final film & unlock download');
  assert.equal((await getJob()).outputPath,null);assert.equal(submissions,visualSubmissions,'Native visuals reused during finishing');
  const oldMedia=await page.$eval('[aria-label="Current production step"] video',v=>(v as HTMLVideoElement).src);
  await click('Apply all changes');
  await page.waitForFunction(old=>{const v=document.querySelector<HTMLVideoElement>('[aria-label="Current production step"] video');return v&&v.src!==old&&document.querySelector('[aria-label="Finishing settings"] select')&&document.querySelectorAll('[aria-label="Video feedback"] article').length===0;},{timeout:180000},oldMedia);
  const finishingBefore=submissions;
  // An unapplied local change must block final acceptance of the old file.
  await page.select('[aria-label="Finishing settings"] select','off');
  await page.click('[aria-label="Current production step"] input[type="checkbox"]');
  assert(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Approve final film & unlock download')!.disabled));
  const settingsMedia=await page.$eval('[aria-label="Current production step"] video',v=>(v as HTMLVideoElement).src);
  await click('Apply settings & update preview');
  await page.waitForFunction(old=>{const v=document.querySelector<HTMLVideoElement>('[aria-label="Current production step"] video');return v&&v.src!==old&&document.querySelector('[aria-label="Finishing settings"] select');},{timeout:180000},settingsMedia);
  assert.equal(submissions,finishingBefore);await approve('Approve final film & unlock download');await text('Download video');
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=1&&!v.error;});
  await page.screenshot({path:path.join(workspace,'download.png'),fullPage:true});
  assert.equal((await getJob()).savedToLibrary,false);await click('Save to My videos');await text('Saved to My videos');assert.equal((await getJob()).savedToLibrary,true);
  await click('Prepare three downloads · $0');await text('Watch each format before publishing');
  assert.equal((await exportView(await getJob())).state?.files.length,3);assert.equal(submissions,finishingBefore);
  const download=await page.$eval('a[download]',a=>(a as HTMLAnchorElement).href);assert(download.includes('/api/media/'));
  const output=(await getJob()).outputPath!;assert((await readFile(output)).length>1000);
  assert(!actions.includes('resume'),'Browser must never schedule the production');assert.equal(recoveries,1);assert.equal(externalCalls,0);assert.equal(providerFailure,'');assert.deepEqual(browserErrors,[]);
  await writeFile('storage/qa/client-journey-proof.json',JSON.stringify({status:'passed',date:new Date().toISOString(),interface:'real Next.js pages in headless Chrome',backend:'real production controller, isolated database and wallet; fixture director/provider responses',start:true,browserClosedDuringGeneration:true,webServerStoppedAndRestarted:true,noBrowserResumePosts:!actions.includes('resume'),semanticPlanPersists:true,storyboardFeedback:true,budgetAfterStoryboard:true,completeFilmVisualReview:true,realDirectorValidation:true,pricedMotionBatch:true,localScenePromotedToAnimation:true,secondCorrectionCycle:true,approvedEditsPreserved:true,editReloadPreservesLockedNote:true,deferredFeedbackSurvivesReload:true,separateFinishing:true,lockedVideoFeedbackBatch:true,unsavedSettingsBlockApproval:true,localFinishingReusesMedia:true,finalApprovalBeforeDownload:true,explicitSave:true,threeFormats:true,recoveries,externalCalls,paidCalls:0,actions},null,2));
  console.log('PASS: complete browser journey, zero external calls and zero paid generations.');
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
