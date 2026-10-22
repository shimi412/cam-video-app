import sheets from "./concept/character-sheets.json";
const names:Record<string,string>={narrator:"The presenter",monster:"The monster",effigy:"The effigy"};
export type VideoCharacters={id:string;title:string;status:string;characters:{id:string;name:string;scenes:number[];sheetUrl:string|null;approved:boolean}[]};
/** Use the saved storyboard, never the global cast or a regenerated suggestion. */
export function videoCharacters(job:{id:string;title:string|null;script:string;status:string;params:unknown}, savedShots?:unknown):VideoCharacters {
 const params=job.params as {preparation?:{shots?:unknown};sceneDirections?:Record<string,{references?:unknown}>}|null;
 const shots=savedShots??params?.preparation?.shots;
 const cast=new Map<string,number[]>();
 if(Array.isArray(shots)) for(const shot of shots){
  if(!shot||typeof shot!=="object"||!Number.isInteger(shot.index)||!Array.isArray(shot.references))continue;
  for(const id of (savedShots===undefined && Array.isArray(params?.sceneDirections?.[shot.index]?.references) ? params!.sceneDirections![shot.index].references as unknown[] : shot.references))if(typeof id==="string"&&names[id])cast.set(id,[...new Set([...(cast.get(id)??[]),shot.index])]);
 }
 return {id:job.id,title:job.title||job.script.split(/\s+/).slice(0,7).join(" ").slice(0,64),status:job.status,characters:[...cast].map(([id,scenes])=>{
  const sheet=sheets.find(s=>s.id===id);
  return {id,name:names[id],scenes,sheetUrl:sheet?.status==="approved"&&sheet.path?sheet.path.replace(/^public/,""):null,approved:sheet?.status==="approved"};
 })};
}
