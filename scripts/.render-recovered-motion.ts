import path from 'node:path';import {renderMotion} from '../src/lib/motion/worker';
renderMotion(path.resolve('storage/qa/motion-repair-2026-10-19')).then(()=>console.log('Recovered complete video rendered and encoded-frame comparisons passed.')).catch(e=>{console.error(e);process.exitCode=1;});
