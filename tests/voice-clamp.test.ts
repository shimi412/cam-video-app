import {describe,expect,it} from 'vitest';
import {clampWordTimings} from '../src/lib/motion/voice';
import {validateTiming} from '../src/lib/motion/model';
describe('clampWordTimings',()=>{
 it('clamps a last token that whisper extended past the audio end, as on 2026-10-21 (54.34 s in a 54.08 s recording)',()=>{
  const words=[{word:'Don’t',start:52.1,end:52.4},{word:'be',start:52.4,end:52.6},{word:'fooled.',start:52.6,end:54.34}];
  clampWordTimings(words,54.08);expect(words[2].end).toBe(54.08);
  const timing={duration:54.08,words,phrases:[{phrase:1,text:'Don’t be fooled.',start:52.1,end:54.34}]};timing.phrases[0].end=Math.min(timing.phrases[0].end,54.08);
  expect(()=>validateTiming(timing,'Don’t be fooled.')).not.toThrow();
 });
 it('smooths millisecond overlaps between neighbours but leaves real anomalies to the validator',()=>{
  const words=[{word:'a',start:1,end:1.5},{word:'b',start:1.48,end:1.9},{word:'c',start:1.2,end:2.2}];
  clampWordTimings(words,10);expect(words[1].start).toBe(1.5);expect(words[2].start).toBe(1.2);
  expect(()=>validateTiming({duration:10,words,phrases:[{phrase:1,text:'a b c',start:1,end:2.2}]},'a b c')).toThrow('Invalid word alignment');
  const far=[{word:'x',start:1,end:12}];clampWordTimings(far,10);expect(far[0].end).toBe(12);
 });
});

import {collapseRepeatedTokens} from '../src/lib/motion/voice';
describe('collapseRepeatedTokens',()=>{
 it('merges a word whisper emitted twice into one token spanning both, as on 2026-10-21 ("victim of of propaganda")',()=>{
  const tokens=[{text:' victim',offsets:{from:100,to:300}},{text:' of',offsets:{from:300,to:380}},{text:' of',offsets:{from:380,to:460}},{text:' propaganda.',offsets:{from:460,to:900}}];
  expect(collapseRepeatedTokens(tokens).map(t=>[t.text,t.offsets.from,t.offsets.to])).toEqual([[' victim',100,300],[' of',300,460],[' propaganda.',460,900]]);
 });
});
