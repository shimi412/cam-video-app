import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {default:puppeteer}=await import(pathToFileURL(process.argv[2]).href);
const dir=process.cwd(),build=JSON.parse(await readFile('build-audit.json','utf8')),timing=JSON.parse(await readFile('timing.json','utf8')),visible=JSON.parse(await readFile('visibility.json','utf8'));
const browser=await puppeteer.launch({executablePath:process.argv[3],headless:true,pipe:true,userDataDir:path.join(dir,'.browser'),args:['--no-sandbox','--disable-gpu','--disable-crash-reporter','--disable-background-networking','--disable-component-update','--no-first-run']});
try{
 const page=await browser.newPage();await page.setViewport({width:1080,height:1920});await page.setRequestInterception(true);
 page.on('request',r=>{if(r.url().startsWith(pathToFileURL(dir+'/').href)||r.url().startsWith('data:'))void r.continue();else void r.abort();});
 await page.goto(pathToFileURL(path.join(dir,'render.html')).href);await page.evaluate(()=>document.fonts.ready);
 if(!await page.evaluate(()=>document.fonts.check('100px Bangers')))throw Error('Comic font missing.');
 async function seek(t){await page.evaluate(async t=>{window.__timelines.main.seek(t,false);const waiting=[];for(const el of document.querySelectorAll('.clip')){const start=Number(el.dataset.start),end=start+Number(el.dataset.duration);el.style.visibility=t>=start&&t<end?'visible':'hidden';if(el.tagName==='VIDEO'&&t>=start&&t<end){const target=Math.max(0,Math.min((t-start)*Number(el.dataset.playbackRate||1),el.duration-.04));if(Math.abs(el.currentTime-target)>.001){waiting.push(new Promise(resolve=>{el.addEventListener('seeked',resolve,{once:true});}));el.currentTime=target;}}}await Promise.all(waiting);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},t);}
 await mkdir('evidence',{recursive:true});const violations=[],samples=[];
 const times=[...new Set([...visible.map(([,a,b])=>(a+b)/2),...timing.phrases.map(p=>(p.start+p.end)/2)])].sort((a,b)=>a-b);
 for(const [i,time]of times.entries()){
  const t=Math.floor(time*30)/30;await seek(t);
  const bad=await page.evaluate(()=>{const out=[],walker=document.createTreeWalker(document.getElementById('root'),NodeFilter.SHOW_TEXT);for(let n=walker.nextNode();n;n=walker.nextNode()){if(!n.textContent.trim()||n.parentElement.closest('script,style'))continue;let visible=true;for(let p=n.parentElement;p;p=p.parentElement){const c=getComputedStyle(p);if(c.visibility==='hidden'||c.display==='none'||Number(c.opacity)<.95)visible=false;}if(!visible)continue;const r=document.createRange();r.selectNodeContents(n);const b=r.getBoundingClientRect();if(b.width&&b.height&&(b.left<99||b.right>941||b.top<261||b.bottom>1481))out.push(n.textContent.trim());}return out;});violations.push(...bad.map(text=>`${t}: ${text}`));
  if(timing.phrases.some(p=>Math.abs(t-(p.start+p.end)/2)<.04)){const file=`evidence/render-${i}.png`;await page.screenshot({path:file});samples.push({time:t,file});}
 }
 for(let t=0;t<build.duration;t++){await seek(t);await page.screenshot({path:`evidence/second-${String(t).padStart(3,'0')}.jpg`,type:'jpeg',quality:60});}
 await seek(build.duration-.1);const logo=await page.evaluate(()=>!!document.querySelector('#lg17')&&document.querySelectorAll('img[src="assets/logo-cam-texte.png"]').length===3);await page.screenshot({path:'evidence/ending.png'});
 await writeFile('render-samples.json',JSON.stringify(samples));await writeFile('browser-audit.json',JSON.stringify({safeZones:violations,logo}));
}finally{await browser.close();}
