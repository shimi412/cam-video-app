/** Offline transport only. Never imported by production routes. */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {MotionFilm} from '../../src/lib/motion/model';
export async function referenceFixture(){
 const source=await readFile('motion/template/build.py','utf8'),timing=JSON.parse(await readFile('motion/template/timing.json','utf8'));
 const explanations=[['Words stack and the question mark opens the next scene.','Frame the allegation as a question.'],['The word lands; its underline expands.','Challenge the allegation.'],['TERRIBLE compresses, then falls.','Make the adjective physically visible.'],['A newspaper fills with coral headlines.','Contrast control with negative coverage.'],['A feed scrolls and a viral counter accelerates.','Show conspiracy claims spreading.'],['A quote is circled, then the camera recedes.','Question the contradiction in the narrative.'],['Thin letters emerge slowly against black.','Pause on the central contradiction.'],['EVERYTHING grows; an arrow turns back.','Make the accusation turn against itself.'],['CONSPIRACY is struck out and replaced by PLOT HOLE.','Replace the conspiracy claim with a logical contradiction.'],['The blamed words disappear and a final question opens the signature.','Ask viewers to examine what they consume.']];
 const film:MotionFilm={source,referenceChoice:'Reuse the validated scene-specific objects, camera transitions and 96 BPM rhythm.',scenes:explanations.map(([movement,meaning],i)=>({id:'s'+String.fromCharCode(65+i),phrase:i+1,movement,meaning})),removedWords:[{selector:'#j2',at:38.8}]};
 return {film,timing,script:timing.phrases.map((p:{text:string})=>p.text).join(' '),voice:path.resolve('motion/reference/plot-hole-v4-voice.wav')};
}
