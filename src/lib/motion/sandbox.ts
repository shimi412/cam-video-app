import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath,mkdir} from 'node:fs/promises';
import path from 'node:path';
const exec=promisify(execFile);
/** macOS Seatbelt is the security boundary, not the writer's prompt. Linux
 * deployments must supply an equivalent container worker; never fall back to
 * unrestricted execution. Environment contains no inherited credentials. */
export async function sandbox(directory:string,executable:string,args:string[],options:{read?:string[];network?:boolean;subprocesses?:boolean;timeout?:number;env?:Record<string,string>}={}){
 if(process.platform!=='darwin')throw Error('An isolated motion worker is required on this server.');
 const dir=await realpath(directory),binary=await realpath(executable);
 await mkdir(path.join(dir,'.tmp'),{recursive:true});
 const quoted=(s:string)=>JSON.stringify(s);
 const reads=[dir,'/System','/usr','/bin','/sbin','/Library/Developer/CommandLineTools','/Library/Frameworks','/Applications/Xcode.app/Contents/Developer/Library/Frameworks','/private/var/db','/private/etc','/dev',...(path.dirname(path.dirname(binary))==='/'?[]:[path.dirname(path.dirname(binary))]),...(options.read??[])];
 const policy=`(version 1)(deny default)(allow sysctl-read)(allow ipc-posix-shm*)(allow ipc-posix-sem*)(allow mach-register)(allow system-info)(allow system-sched)(allow iokit-open)(allow mach-lookup)${options.subprocesses?'(allow process*)':`(allow process-exec (literal ${quoted(executable)}) (literal ${quoted(binary)}))`}(allow file-read-metadata)(allow file-read* (literal "/") ${reads.map(p=>`(subpath ${quoted(p)})`).join(' ')})(allow network* (local unix-socket (subpath ${quoted(dir)})))(allow file-write* (subpath ${quoted(dir)}) (literal "/dev/null"))${options.network?'(allow network* (local ip "localhost:*"))':''}`;
 return exec('/usr/bin/sandbox-exec',['-p',policy,executable,...args],{cwd:dir,env:{NODE_ENV:'production',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:dir,TMPDIR:path.join(dir,'.tmp'),PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1',DO_NOT_TRACK:'1',HYPERFRAMES_NO_TELEMETRY:'1',HYPERFRAMES_NO_UPDATE_CHECK:'1',HYPERFRAMES_NO_AUTO_INSTALL:'1',HYPERFRAMES_SKIP_SKILLS:'1',...options.env},timeout:options.timeout??120000,maxBuffer:4*1024*1024});
}
export async function pythonBuild(directory:string){
 const python=path.resolve(process.env.CAM_MOTION_PYTHON??'.venv-motion-runtime/bin/python');
 return sandbox(directory,python,['audit-build.py'],{read:[path.dirname(path.dirname(python))]});
}
