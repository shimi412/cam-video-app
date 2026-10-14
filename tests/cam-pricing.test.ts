import { expect, it, vi } from "vitest";
import { falCostReceipt, renewCamQuote, type CamQuote } from "../src/lib/providers/cam-pricing";
import type { GenerationOperation } from "../src/lib/concept/generation-plan";

const quote = (price:number):CamQuote => ({ id:"a".repeat(64),plan:"b".repeat(64),createdAt:1,expiresAt:100,
  lines:[{id:"voice",model:"bram",kind:"voice",unit:"higgsfield-credit",quantity:1,unitPrice:price,maximum:price*1e6,description:"Voice"},
    {id:"scene-1",model:"kling",kind:"video",unit:"usd",quantity:15,unitPrice:price,maximum:price*15e6,description:"Animation"}],
  caps:{usd:price*15e6,"higgsfield-credit":price*1e6},falBillingAvailable:false });

it("renews only unattempted prices while preserving previous voice reservations",()=>{
  const previous=quote(1),current={...quote(2),expiresAt:200};
  const revised=renewCamQuote(previous,current,new Set(["voice"]));
  expect(revised.caps).toEqual({usd:30e6,"higgsfield-credit":1e6});
  expect(revised.expiresAt).toBe(200);
  expect(revised.id).not.toBe(current.id);
  expect(previous.caps.usd).toBe(15e6);
});
it("rejects renewal for another plan or a missing previous request",()=>{
  expect(()=>renewCamQuote(quote(1),{...quote(2),plan:"c".repeat(64)},new Set())).toThrow(/different production/);
  expect(()=>renewCamQuote(quote(1),quote(2),new Set(["missing"]))).toThrow(/missing/);
});
const operation={transport:"fal-queue",model:"fal-ai/kling-video/v3/pro/image-to-video"} as GenerationOperation;
it("settles exact matching billing events without reducing fractional costs",async()=>{
  const request=vi.fn().mockResolvedValue({billing_events:[{request_id:"req",endpoint_id:operation.model,cost_total:.14},{request_id:"req",endpoint_id:operation.model,cost_total:.0000011}]});
  expect((await falCostReceipt(operation,"req",request))?.actual).toBe(140002);
});
it("does not settle unrelated or incomplete provider receipts",async()=>{
  await expect(falCostReceipt(operation,"req",async()=>({billing_events:[{request_id:"other",endpoint_id:operation.model,cost_total:1}]}))).rejects.toThrow(/does not match/);
  await expect(falCostReceipt(operation,"req",async()=>({billing_events:[],has_more:true}))).rejects.toThrow(/pagination/);
  expect(await falCostReceipt(operation,"req",async()=>({billing_events:[]}))).toBeNull();
});
