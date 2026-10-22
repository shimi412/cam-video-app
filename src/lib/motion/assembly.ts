import {execFile} from 'node:child_process';
import path from 'node:path';
import {assembleMotionFilm,type MotionFilm,type MotionTiming} from './model';
/** Parsing only, no execution of author code. Runtime/footer always belong to us. */
export async function assembleMotionRuntime(film:MotionFilm,reference:string,timing:MotionTiming):Promise<MotionFilm>{
 const assembled=assembleMotionFilm(film,reference,timing),marker='# ============================================================ A';
 const payload=JSON.stringify({source:film.source,reference,prefix:assembled.source.slice(0,assembled.source.indexOf(marker)),scenes:film.scenes});
 const source=await new Promise<string>((resolve,reject)=>{
  const child=execFile(process.env.CAM_MOTION_PYTHON??path.resolve('.venv-motion-runtime/bin/python'),[path.resolve('motion/runtime/assemble.py')],{timeout:15000,maxBuffer:1024*1024,env:{NODE_ENV:'production',PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1'}},(error,out,err)=>error?reject(Error(`Composition assembly: ${err.slice(-2500)}`)):resolve(out));
  child.stdin?.end(payload);
 });
 return {...film,source:JSON.parse(source).source};
}
