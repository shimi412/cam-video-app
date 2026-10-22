import {afterEach,describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {motionBudgets,AGENT_TURN_MAX_USD} from '../src/lib/motion/budgets';
const names=['CAM_MOTION_WRITING_CAP_USD','CAM_MOTION_REPAIR_CAP_USD','CAM_MOTION_REVIEW_CAP_USD','CAM_MOTION_FEEDBACK_CAP_USD','CAM_MOTION_PRICE_CEILING_USD'];
const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
afterEach(()=>{for(const n of names){if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}});
describe('motionBudgets',()=>{
 it('uses the documented defaults when nothing is configured',()=>{for(const n of names)delete process.env[n];expect(motionBudgets()).toEqual({writingUsd:2,repairUsd:.75,reviewUsd:.35,feedbackUsd:.2,ceilingUsd:30});});
 it('refuses a cap the agent runtime would reject, naming the variable',()=>{process.env.CAM_MOTION_WRITING_CAP_USD=String(AGENT_TURN_MAX_USD+1);expect(()=>motionBudgets()).toThrow('CAM_MOTION_WRITING_CAP_USD');process.env.CAM_MOTION_WRITING_CAP_USD='abc';expect(()=>motionBudgets()).toThrow('CAM_MOTION_WRITING_CAP_USD');});
 it('accepts the Fable 5.1 caps of 2026-10-21',()=>{Object.assign(process.env,{CAM_MOTION_WRITING_CAP_USD:'8',CAM_MOTION_REPAIR_CAP_USD:'5',CAM_MOTION_REVIEW_CAP_USD:'1.5',CAM_MOTION_FEEDBACK_CAP_USD:'0.6',CAM_MOTION_PRICE_CEILING_USD:'30'});expect(motionBudgets()).toEqual({writingUsd:8,repairUsd:5,reviewUsd:1.5,feedbackUsd:.6,ceilingUsd:30});});
 it('validates the committed .env.example and the live .env when present',async()=>{
  for(const file of ['.env.example','.env']){
   const text=await readFile(file,'utf8').catch(()=>'');if(!text)continue;
   for(const n of names)delete process.env[n];
   for(const line of text.split('\n')){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&names.includes(m[1]))process.env[m[1]]=m[2].split('#')[0].trim();}
   expect(()=>motionBudgets(),file).not.toThrow();
  }
 });
});
