import {describe,expect,it} from 'vitest';
import {parseToolArguments} from '../src/lib/agent/arguments';
describe('parseToolArguments',()=>{
 it('returns ordinary JSON arguments unchanged',()=>{
  expect(parseToolArguments('{"stage":"visual","visualFeedback":"Tighter sync","finishingFeedback":"","explanation":"Plain answer here."}')).toEqual({stage:'visual',visualFeedback:'Tighter sync',finishingFeedback:'',explanation:'Plain answer here.'});
 });
 it('recovers parameters leaked as XML inside one string value, exactly as saved on 2026-10-21',()=>{
  const raw=JSON.stringify({stage:'mixed',visualFeedback:'Preserve all scenes as-is.</visualFeedback>\n<parameter name="finishingFeedback">No finishing complaint.</finishingFeedback>\n<parameter name="explanation">The note lacks any concrete instruction.</parameter>\n'});
  expect(parseToolArguments(raw)).toEqual({stage:'mixed',visualFeedback:'Preserve all scenes as-is.',finishingFeedback:'No finishing complaint.',explanation:'The note lacks any concrete instruction.'});
 });
 it('never overrides a key the model already provided',()=>{
  const raw=JSON.stringify({a:'x</a>\n<parameter name="b">leaked</parameter>',b:'explicit'});
  expect(parseToolArguments(raw)).toEqual({a:'x',b:'explicit'});
 });
 it('leaves a string that merely mentions a tag without leaked parameters',()=>{
  expect(parseToolArguments('{"a":"use </a> carefully"}')).toEqual({a:'use </a> carefully'});
 });
});
