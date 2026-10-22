const normalized = (text:string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Explicit scene references restrict a shared request; omitted scope is global. */
export function storyboardFeedbackScenes(text:string,available:number[],selected?:number[]):number[]{
 const normalizedText=normalized(text);
 const groups=[...normalizedText.matchAll(/\b(?:scenes?|cases?|plans?|shots?|images?)\s*(\d+(?:\s*(?:,\s*(?:(?:and|et)\s*)?|and|et|&|to|a|through|[-–])\s*\d+)*)/g)];
 const mentioned=groups.flatMap(g=>[...g[1].matchAll(/(\d+)(?:\s*(?:to|a|through|[-–])\s*(\d+))?/g)].flatMap(match=>{
  const first=Number(match[1]),last=Number(match[2]??match[1]);
  if(last<first||last-first>36)throw new Error("Choose a valid scene range.");
  return Array.from({length:last-first+1},(_,i)=>first+i);
 }));
 const scenes=[...new Set(selected??(mentioned.length?mentioned:available))].sort((a,b)=>a-b);
 if(!scenes.length||scenes.some(n=>!available.includes(n)))throw new Error("Select at least one existing storyboard scene.");
 if(selected&&mentioned.some(n=>!selected.includes(n)))throw new Error("Your feedback names a scene outside your selection. Adjust the selection before applying.");
 return scenes;
}
