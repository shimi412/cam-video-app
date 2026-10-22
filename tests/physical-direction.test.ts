import {describe,it,expect} from "vitest";
import {changesState,physicalDirectionIssues} from "../src/lib/concept/physical-direction";
import type {SceneDirection} from "../src/lib/concept/types";
const shot=(motion:string)=>({scene:"The narrator stands at a counter.",motion,stateChange:false,endScene:null,actionSeconds:4,references:["narrator"]} as SceneDirection);
describe("physical movement preflight",()=>{
 it.each(["Narrator unfolds the hands and gestures briefly with an open right palm forward, then returns both hands to a folded resting position.","He unfolds both arms and holds his pose.","She unfolds her hands."])("accepts a hand or arm gesture: %s",motion=>{
  expect(changesState(shot(motion))).toBe(false);
  expect(physicalDirectionIssues(shot(motion))).toEqual([]);
 });
 it.each(["He unfolds the paper.","He unfolds both arms, then unfolds the map.","He unrolls a scroll."])("still requires an endpoint for object changes: %s",motion=>{
  expect(changesState(shot(motion))).toBe(true);
  expect(physicalDirectionIssues(shot(motion)).length).toBeGreaterThan(0);
 });
 it("honors explicit state changes even with hand gestures",()=>expect(changesState({...shot("He unfolds his hands."),stateChange:true})).toBe(true));
});

it("does not mistake existing building models for a construction action",()=>{
 const motion="Narrator sweeps one open hand across the row of building models and flags, pausing with palm open over the whole table, then straightens posture, holding a calm explanatory stance.";
 expect(physicalDirectionIssues(shot(motion))).toEqual([]);
});
it.each(["He builds a model.","He is building models on the table.","He points at the building models, then builds a tower."])("still checks genuine construction: %s",motion=>expect(physicalDirectionIssues(shot(motion))).not.toEqual([]));
