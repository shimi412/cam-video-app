import {spawn,type ChildProcess} from "node:child_process";
/** The web listener and media worker have separate lifetimes. A crash restarts
 * only that child; durable checkpoints and PostgreSQL locks decide resumption. */
export function supervise(specs:{name:string;command:string;args:string[]}[],options:{cwd:string;env:NodeJS.ProcessEnv;restartMs?:number}){
 const children=new Map<string,ChildProcess>(),timers=new Set<ReturnType<typeof setTimeout>>();
 let stopping=false;
 let finish:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});
 const launch=(spec:typeof specs[number])=>{
  if(stopping)return;
  const child=spawn(spec.command,spec.args,{cwd:options.cwd,env:options.env,stdio:"inherit"});children.set(spec.name,child);
  let ended=false;
  const endedOnce=()=>{
   if(ended)return;ended=true;children.delete(spec.name);
   if(stopping){if(!children.size)finish();return;}
   console.error(`${spec.name} stopped. Restarting from saved work.`);
   const timer=setTimeout(()=>{timers.delete(timer);launch(spec);},options.restartMs??2000);timers.add(timer);
  };
  child.once("exit",endedOnce);child.once("error",endedOnce);
 };
 const stop=()=>{
  if(stopping)return;stopping=true;for(const t of timers)clearTimeout(t);timers.clear();
  for(const child of children.values())child.kill("SIGTERM");
  if(!children.size)finish();
  const force=setTimeout(()=>{for(const child of children.values())child.kill("SIGKILL");},30000);force.unref();
 };
 for(const spec of specs)launch(spec);
 return {children,done,stop};
}
