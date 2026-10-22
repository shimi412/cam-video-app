import {z} from 'zod';
import {Film,type MotionFilm} from './model';
import {CompositionAnswer} from './patch';

// Technical delimiters are application-owned, never part of Claude's contract.
export const MotionComposition=z.object({
 duration:z.number().positive().max(180),
 body:z.string().min(100).max(180000),
 subtitles:z.array(z.string().min(1).max(500)).min(1).max(200),
 visualTiming:z.string().min(2).max(10000),
 soundCues:z.string().min(2).max(15000),
 referenceChoice:Film.shape.referenceChoice,
 scenes:Film.shape.scenes,
 removedWords:Film.shape.removedWords,
}).strict();
export const MotionRevision=z.object({patch:CompositionAnswer.shape.patch.unwrap()}).strict();
export const MotionExchange=z.object({composition:MotionComposition.optional(),patch:CompositionAnswer.shape.patch}).strict();
export type MotionExchange=z.infer<typeof MotionExchange>;
// Contract 5 exchanges times as numbers or short expressions over the names the
// composition itself defines (ws(i), we(i), T_A, TB0...). The trusted assembler
// parses expressions as AST data: no strings, no calls beyond ws/we/min/max/round.
// Scene IDs and phrase IDs serve different purposes and cannot be interchanged.
const Seconds=z.number().finite().nonnegative().max(180);
const Expression=z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_ .+\-*/(),]+$/,'A time expression uses only names from the composition, numbers, ws()/we()/min()/max() and arithmetic; never quotes.');
export const TimeValue=z.union([Seconds,Expression]).describe('Seconds as a number, or a short Python expression over names defined in body, e.g. "TB0" or "max(ws(19), TD0 + .05)". Never quoted strings or scene IDs.');
export type TimeValue=z.infer<typeof TimeValue>;
export const pythonTime=(value:TimeValue)=>typeof value==='number'?String(value):value.trim();
export const TimedSoundCues=z.object({
 sober:z.tuple([TimeValue,TimeValue]).describe('Start and end of the single calm passage.'),
 logo_impact:TimeValue.describe('When the brand logo lands at the end.'),
 plot:TimeValue.optional().describe('Held chord accent; defaults to the start of the last narration scene.'),
 q_final:TimeValue.optional().describe('Final dry accent; defaults to one second before the logo lettering.'),
 strike:TimeValue.nullish().describe('Only when a word is struck through in this composition.'),
 counter:TimeValue.nullish().describe('Only when a counter accelerates in this composition.'),
 terrible:TimeValue.nullish().describe('Only when a word crushes itself in this composition.'),
 logo_net:TimeValue.optional().describe('Derived by the application from LOGO_NET; omit.'),
 dur:TimeValue.optional().describe('Owned by the application (DUR); omit.'),
 transitions:z.array(z.object({t:Seconds,d:Seconds,technique:z.string().min(1),de:z.string(),vers:z.string()}).strict()).max(40).optional().describe('Derived by the application from the registered iris/band/pan/recede_black calls; omit.'),
}).strict();
export const TimedComposition=MotionComposition.extend({
 visualTiming:z.array(z.object({phrase:z.number().int().positive(),at:TimeValue}).strict()).min(1).max(30).describe('Exactly one entry per narration phrase: when its first visual lands.'),
 soundCues:TimedSoundCues,
});
export const TimedExchange=z.object({composition:TimedComposition.optional(),patch:CompositionAnswer.shape.patch}).strict();
/** Serialize typed cues as the Python data line the assembler owns. Derived
 * values (transitions, dur, logo_net) are never taken from the model. */
export function pythonSoundCues(c:z.infer<typeof TimedSoundCues>){
 const entries:string[]=[`'sober': [${pythonTime(c.sober[0])}, ${pythonTime(c.sober[1])}]`,`'logo_impact': ${pythonTime(c.logo_impact)}`];
 for(const key of ['plot','q_final','strike','counter','terrible'] as const){const value=c[key];if(value!==undefined&&value!==null)entries.push(`'${key}': ${pythonTime(value)}`);}
 return `{${entries.join(', ')}}`;
}
export function timedExchangeAnswer(value:z.infer<typeof TimedExchange>):CompositionAnswer{
 if(Boolean(value.composition)===Boolean(value.patch))throw Error('Return exactly one composition or patch.');
 if(value.patch)return {patch:value.patch};
 const c=value.composition!;
 const phrases=c.scenes.map(s=>s.phrase),times=c.visualTiming.map(t=>t.phrase);
 if(new Set(times).size!==times.length||times.length!==phrases.length||phrases.some(p=>!times.includes(p)))throw Error(`visualTiming must contain exactly one entry for each narration phrase: ${phrases.join(', ')}.`);
 return {film:compositionFilm({...c,visualTiming:`{${c.visualTiming.map(t=>`${t.phrase}: ${pythonTime(t.at)}`).join(', ')}}`,soundCues:pythonSoundCues(c.soundCues)})};
}
export function compositionFilm(value:z.infer<typeof MotionComposition>):MotionFilm{
 const c=MotionComposition.parse(value);
 // Expressions are subsequently parsed as AST data by the trusted assembler.
 // No generated helper/footer is ever evaluated.
 const source=`DUR = ${c.duration}\n# ============================================================ A\n${c.body.trim()}\n# ------------------------------------------------------------ sous-titres\nSUBS = ${JSON.stringify(c.subtitles.map(text=>[text,1340]))}\nVIS = ${c.visualTiming}\nMARKS = ${c.soundCues}\n`;
 return Film.parse({source,referenceChoice:c.referenceChoice,scenes:c.scenes,removedWords:c.removedWords});
}
export function exchangeAnswer(value:MotionExchange):CompositionAnswer{
 if(Boolean(value.composition)===Boolean(value.patch))throw Error('Return exactly one composition or patch.');
 return value.composition?{film:compositionFilm(value.composition)}:{patch:value.patch!};
}

/** The correction must have a visual intention before executable edits. */
export const RevisionDirection=z.object({
 request:z.string().min(10).max(1000),
 integration:z.string().min(20).max(1500),
 movement:z.string().min(20).max(1500),
 preserve:z.string().min(10).max(1000),
 proofs:z.array(z.object({sceneId:z.string(),visibleResult:z.string().min(10).max(500)}).strict()).min(1).max(30),
}).strict();
export type RevisionDirection=z.infer<typeof RevisionDirection>;
export const CreativeRevision=MotionRevision.extend({direction:RevisionDirection});
