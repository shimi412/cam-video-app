import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
export const skillCatalog=[
 {id:'motion-feedback',description:'Interpret Motion feedback, integrate it visually and review actual before/after evidence',file:'agent/skills/motion-feedback/SKILL.md'},
 {id:'cam-recovery',description:'Diagnose interrupted work and select bounded safe recovery',file:'agent/skills/cam-recovery/SKILL.md'},
 {id:'cam-direction',description:'Semantic script breakdown and visual direction',file:'agent/skills/cam-direction/SKILL.md'},
 {id:'cam-feedback',description:'Apply locked feedback, preserve scope and prior decisions',file:'agent/skills/cam-feedback/SKILL.md'},
 {id:'cam-finishing',description:'Sound, editing, subtitles and final review',file:'agent/skills/cam-finishing/SKILL.md'},
 {id:'motion-method',description:'Authoritative method for typographic motion in code',file:'motion/METHOD-fr.md'},
 {id:'comics-method',description:'Validated Attack comic film method, universe before hero',file:'comics/METHOD-fr.md'},
] as const;
export async function readSkill(id:string,root=process.cwd()){
 const skill=skillCatalog.find(s=>s.id===id);if(!skill)throw Error('Unknown CAM skill. Arbitrary paths are not available.');
 const base=await realpath(root),file=await realpath(path.join(base,skill.file));
 if(!file.startsWith(base+path.sep))throw Error('A CAM skill cannot point outside the project.');
 const text=await readFile(file,'utf8');if(text.length>40000)throw Error('CAM skill exceeds its context allowance.');return text;
}
