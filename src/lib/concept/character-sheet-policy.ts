export type CharacterReference = {id:string;url:string;sha256:string;characterSheet?:{status:string;sha256:string;approvedAt:string}};
/** Approval applies to these exact bytes, never just a character name or portrait. */
export function characterSheetBlockers(shots:{index:number;references:string[]}[],references:CharacterReference[]) {
 return shots.flatMap(shot=>shot.references.flatMap(id=>{
  const reference=references.find(r=>r.id===id),sheet=reference?.characterSheet;
  return sheet?.status==="approved" && sheet.sha256===reference?.sha256 && /^[a-f0-9]{64}$/.test(sheet.sha256) && Boolean(sheet.approvedAt)
   ? [] : [`Scene ${shot.index}: ${id} requires a human-approved character sheet before generation.`];
 }));
}
