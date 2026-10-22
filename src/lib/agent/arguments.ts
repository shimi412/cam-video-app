/** Parse a tool call's JSON arguments and recover parameters that the model
 * leaked as XML inside one string value, for example
 * `"a": "text</a>\n<parameter name=\"b\">more</parameter>"`. Claude sometimes
 * falls back to that wire format on long answers; without recovery the saved
 * answer fails schema validation identically at every paid step. Only missing
 * keys are filled from the leaked block; existing keys always win. */
export function parseToolArguments(raw:string):unknown{
 const parsed:unknown=JSON.parse(raw);
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return parsed;
 const args=parsed as Record<string,unknown>;
 for(const [key,value] of Object.entries(args)){
  if(typeof value!=='string')continue;
  const leak=value.search(new RegExp(`</${escape(key)}>|<parameter name="`));
  if(leak<0)continue;
  const head=value.slice(0,leak).trimEnd(),tail=value.slice(leak);
  const found:Record<string,string>={};
  for(const match of tail.matchAll(/<parameter name="([^"]+)">([\s\S]*?)(?=<\/parameter>|<\/[A-Za-z_][\w]*>|<parameter name="|$)/g))found[match[1]]=match[2].trim();
  if(!Object.keys(found).length)continue;
  args[key]=head;
  for(const [name,text] of Object.entries(found))if(!(name in args))args[name]=text;
 }
 return args;
}
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
