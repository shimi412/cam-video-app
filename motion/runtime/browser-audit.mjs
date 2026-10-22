// Trusted worker, launched by Seatbelt. The document has passed html-policy.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {default:puppeteer}=await import(pathToFileURL(process.argv[2]).href);
const dir=process.cwd(),build=JSON.parse(await readFile('build-audit.json','utf8'));
const film=JSON.parse(await readFile('film.json','utf8'));
const browser=await puppeteer.launch({executablePath:process.argv[3],headless:true,dumpio:true,pipe:true,userDataDir:path.join(dir,'.browser'),args:['--no-sandbox','--disable-background-networking','--disable-component-update','--no-first-run','--disable-crash-reporter','--disable-gpu']});
try{
 const page=await browser.newPage();await page.setViewport({width:1080,height:1920,deviceScaleFactor:1});
 await page.setRequestInterception(true);
 page.on('request',request=>{const u=request.url();if(u.startsWith(pathToFileURL(dir+'/').href))void request.continue();else void request.abort();});
 await page.evaluateOnNewDocument(()=>{window.__timelines={};});
 await page.goto(pathToFileURL(path.join(dir,'render.html')).href);await page.evaluate(()=>document.fonts.ready);
 if(!await page.evaluate(()=>document.fonts.check('900 100px Arc')&&document.fonts.check('800 46px Mont')))throw Error('Required motion fonts did not load.');
 const violations=[],removed=[],renderSamples=[];await mkdir('evidence',{recursive:true});
 async function seek(t){await page.evaluate(t=>{window.__timelines.main.seek(t,false);for(const el of document.querySelectorAll('.clip')){const start=Number(el.dataset.start),end=start+Number(el.dataset.duration);el.style.visibility=t>=start&&t<end?'visible':'hidden';}},t);}
 // Inspect stable reading states, not deliberately entering/leaving text.
 for(const [i,scene]of film.scenes.entries()){
  const state=build.scenes.find(s=>s.id===scene.id),next=build.scenes.find(s=>s.id===film.scenes[i+1]?.id);
  const t=Math.max(state.start+.7,(next?.start??build.logoAt)-.65);await seek(t);
  const sampleTime=Math.floor(t*30)/30;await seek(sampleTime);
  const sampleFile=`evidence/render-${scene.id}.png`;await page.screenshot({path:sampleFile});renderSamples.push({time:sampleTime,file:sampleFile});
  const out=await page.evaluate(()=>{
   const result=[];
   const walker=document.createTreeWalker(document.getElementById('root'),NodeFilter.SHOW_TEXT);
   for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(!node.textContent.trim()||node.parentElement.closest('script,style'))continue;
    let visible=true;for(let p=node.parentElement;p;p=p.parentElement){const c=getComputedStyle(p);if(Number(c.opacity)<.5||c.visibility==='hidden'||c.display==='none')visible=false;}
    if(!visible)continue;
    const range=document.createRange();range.selectNodeContents(node);const r=range.getBoundingClientRect();
    // Text entirely outside a clipped object is not visible reading content.
    let clipped=false;for(let p=node.parentElement;p&&p.id!=='root';p=p.parentElement){if(getComputedStyle(p).overflow==='hidden'){const b=p.getBoundingClientRect();if(r.bottom<=b.top||r.top>=b.bottom||r.right<=b.left||r.left>=b.right)clipped=true;}}
    if(!clipped&&r.width>0&&r.height>0&&(r.left<119||r.right>941||r.top<261||r.bottom>1481))result.push(`${node.parentElement.closest('[id^="sub"]')?'subtitle ':''}${node.textContent.trim().slice(0,40)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
   }return result;
  });violations.push(...out.map(v=>`${scene.id}: ${v}`));
 }
 for(const item of film.removedWords){
  const read=async(t)=>{await seek(Math.max(0,t));return page.evaluate(s=>{const el=document.querySelector(s);if(!el)return null;let o=1;for(let p=el;p&&p.id!=='root';p=p.parentElement)o*=Number(getComputedStyle(p).opacity);return Math.round(o*100)/100;},item.selector);};
  const opacity=await read(item.at);
  if(opacity!==0){
   // A timeline around the declared time shows whether the word enters later than its fade.
   const timeline=[];for(const offset of [-1.5,-1,-.5,-.25,0,.25,.5,1,1.5]){const o=await read(item.at+offset);timeline.push(`${(item.at+offset).toFixed(2)}s→${o===null?'absent':o}`);}
   removed.push(`${item.selector} (${opacity===null?'element not found':`opacity ${opacity}`} at ${item.at} s; opacity timeline ${timeline.join(', ')})`);
  }
 }
 for(let t=0;t<build.duration;t+=1){await seek(t);await page.evaluate(()=>{const e=document.createElement('div');e.id='qa-safe-mask';e.style.cssText='position:fixed;inset:0;z-index:99999;pointer-events:none;border:solid rgba(232,82,64,.3);border-width:262px 140px 440px 120px';document.body.appendChild(e);});await page.screenshot({path:`evidence/second-${String(t).padStart(3,'0')}.jpg`,type:'jpeg',quality:65});await page.evaluate(()=>document.getElementById('qa-safe-mask').remove());}
 const marks=JSON.parse(await readFile('marks.json','utf8'));for(const [i,tr]of marks.transitions.entries())for(const [j,offset]of [-1,-.6,-.3,0,.3].entries()){await seek(Math.max(0,tr.t+offset));await page.screenshot({path:`evidence/transition-${i}-${j}.jpg`,type:'jpeg',quality:65});}
 // Creative evidence: entry, settled composition, outgoing gesture, next frame.
 // Separate from machine checks: these images must actually be reviewed.
 const creative=[];
 for(const [i,scene]of film.scenes.entries()){
  const row=build.scenes.find(s=>s.id===scene.id),end=row.end??build.scenes[i+1]?.start??build.logoAt;
  // Entry, early settle, middle, outgoing, plus the middle of each registered
  // animation event of the scene (longest first, up to five): a squash, a
  // counter run or an arrow reversal must be visible in the reviewed frames.
  const events=(build.events??[]).filter(e=>e.scene===scene.id&&e.t1>=e.t0).sort((a,b)=>(b.t1-b.t0)-(a.t1-a.t0)).slice(0,5);
  const base=[[row.start,'entry'],[Math.min(row.start+.6,end-.1),'settle'],[Math.max(row.start,(row.start+end)/2),'middle'],[Math.min(build.duration-.1,end+.15),'outgoing']];
  const extra=events.map(e=>[Math.min(end,Math.max(row.start,e.t1>e.t0?(e.t0+e.t1)/2:e.t0+.25)),`mid ${e.label}`]);
  // Plus a regular pulse every half second, so no movement falls between frames; at most ten frames per scene.
  const pulse=[];for(let t=row.start+.5;t<end-.2&&pulse.length<6;t+=.5)pulse.push([t,`${(t-row.start).toFixed(1)}s in`]);
  // The four base frames are always kept, even for a very short scene; extra frames are deduplicated.
  const dedupe=(list)=>list.sort((a,b)=>a[0]-b[0]).filter((x,i,a)=>i===0||x[0]-a[i-1][0]>.12);
  const extras=dedupe([...extra,...pulse]).filter(x=>!base.some(b=>Math.abs(b[0]-x[0])<=.12));
  const times=[...base,...extras.slice(0,6)].sort((a,b)=>a[0]-b[0]);
  for(const [frame,[t,label]]of times.entries()){
   const time=Math.max(0,Math.floor(t*30)/30),file=`evidence/creative-${scene.id}-${frame}.png`;
   await seek(time);await page.screenshot({path:file});creative.push({scene:scene.id,time,file,label});
  }
 }
 await writeFile('creative-samples.json',JSON.stringify(creative));
 await seek(build.duration-.1);const logo=await page.evaluate(()=>{const logo=document.querySelector('#lg17');return !!logo&&Number(getComputedStyle(logo).opacity)>.9&&document.querySelectorAll('img[src="assets/logo-cam-texte.png"]').length===3;});
 await page.screenshot({path:'evidence/ending.png'});
 await writeFile('render-samples.json',JSON.stringify(renderSamples));
 await writeFile('browser-audit.json',JSON.stringify({safeZoneViolations:violations,removedWordViolations:removed,logo},null,2));
}finally{await browser.close();}
