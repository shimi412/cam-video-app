import {supervise} from "./runtime-supervisor";
const runtime=supervise([
 {name:"CAM web",command:process.execPath,args:["node_modules/next/dist/bin/next","start","--hostname","0.0.0.0","--port",process.env.PORT??"3000"]},
 {name:"CAM production worker",command:process.execPath,args:["--import","tsx","scripts/production-worker.ts"]}
].filter(s=>s.name!=="CAM production worker"||process.env.CAM_LIVE_ENABLED==="1"&&process.env.PROVIDER_MODE==="fal"),{cwd:process.cwd(),env:process.env});
for(const signal of ["SIGTERM","SIGINT","SIGHUP"] as const)process.once(signal,runtime.stop);
runtime.done.then(()=>process.exit(0));
