import {afterEach,describe,expect,it} from 'vitest';
import {clayBudgets,clayModelFromSetting} from '../src/lib/concept/clay-budgets';
const names=['CAM_CLAY_DIRECTION_CAP_USD','CAM_CLAY_ASSISTANT_CAP_USD','CAM_CLAY_EFFORT','CAM_CLAY_MODEL','CAM_CLAY_V1_ALLOWANCE_USD','CAM_CLAY_REVISION_ALLOWANCE_USD'];
const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
afterEach(()=>{for(const n of names){if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}});
describe('clayBudgets',()=>{
 it('defaults to a $1.50 director turn, a $0.50 assistant turn, medium effort and the single-journey allowances ($2.50 first version, $0.50 revision)',()=>{for(const n of names)delete process.env[n];expect(clayBudgets()).toEqual({directionUsd:1.5,assistantUsd:.5,effort:'medium',firstVersionAllowanceUsd:2.5,revisionAllowanceUsd:.5});});
 it('reads env knobs and refuses a cap the runtime would reject',()=>{process.env.CAM_CLAY_DIRECTION_CAP_USD='3';process.env.CAM_CLAY_EFFORT='low';expect(clayBudgets()).toMatchObject({directionUsd:3,effort:'low'});process.env.CAM_CLAY_DIRECTION_CAP_USD='99';expect(()=>clayBudgets()).toThrow('CAM_CLAY_DIRECTION_CAP_USD');});
 it('resolves the director model from env, then the admin setting, then the default',()=>{delete process.env.CAM_CLAY_MODEL;expect(clayModelFromSetting(undefined,'anthropic/claude-sonnet-5')).toBe('anthropic/claude-sonnet-5');expect(clayModelFromSetting('anthropic/claude-opus-5.5','x')).toBe('anthropic/claude-opus-5.5');process.env.CAM_CLAY_MODEL='anthropic/claude-fable-5.1';expect(clayModelFromSetting('anthropic/claude-opus-5.5','x')).toBe('anthropic/claude-fable-5.1');});
});
