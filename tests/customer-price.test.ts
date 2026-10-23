import {describe,it,expect} from "vitest";
import {roundedCustomerPriceCents} from "../src/lib/customer-price";
describe("whole-dollar customer quotes",()=>{
 it("sells a $10 cost at $20 with a 2x multiplier",()=>expect(roundedCustomerPriceCents(10,2)).toBe(2000));
 it("rounds upward once on the total",()=>expect(roundedCustomerPriceCents(159.5125,2)).toBe(32000));
 it("does not round down fractional dollars",()=>expect(roundedCustomerPriceCents(10.01,2)).toBe(2100));
 it("avoids floating point phantom dollars",()=>expect(roundedCustomerPriceCents(0.1+0.2,10)).toBe(300));
 it("rejects invalid prices",()=>expect(()=>roundedCustomerPriceCents(NaN,2)).toThrow());
});

import {customerPriceCents} from "../src/lib/customer-price";
describe("adaptive cumulative pricing",()=>{
 const policy={mode:"adaptive-v1" as const,multiplier:2};
 it.each([[0,0],[1.95,400],[10,2000],[15,3000],[20,3500],[25,3800],[27.485,3900],[30,4000],[35,4000],[36,4100],[50,5500]])("prices $%s supplier cost at %s cents",(cost,cents)=>expect(customerPriceCents(cost,policy)).toBe(cents));
 it("never decreases the total or sells at a loss when supplier cost increases",()=>{
  let previous=0;
  for(let cents=0;cents<=15000;cents++){
   const price=customerPriceCents(cents/100,policy);
   expect(price).toBeGreaterThanOrEqual(previous);expect(price).toBeGreaterThanOrEqual(cents);expect(price%100).toBe(0);previous=price;
  }
 });
 it("applies the curve once to the cumulative budget, not once per scene or stage",()=>{
  const preparation=customerPriceCents(1.95,policy),total=customerPriceCents(27.485,policy);
  expect(total).toBe(3900);expect(total-preparation).toBe(3500);
 });
 it.each([NaN,Infinity,-1])("rejects invalid cost %s",cost=>expect(()=>customerPriceCents(cost,policy)).toThrow());
 it("retains explicitly selected legacy fixed pricing",()=>expect(customerPriceCents(27.485,{multiplier:2})).toBe(5500));
});

it("prices a first version by cost tiers and a revision at cost x2 rounded up (Shimi, 2026-10-23)",async()=>{
 const {firstVersionPriceCents,revisionPriceCents,customerPriceCents}=await import("../src/lib/customer-price");
 expect(firstVersionPriceCents(4.2)).toBe(3000);expect(firstVersionPriceCents(20)).toBe(3000);expect(firstVersionPriceCents(20.01)).toBe(4000);expect(firstVersionPriceCents(30)).toBe(4000);expect(firstVersionPriceCents(31)).toBe(5000);expect(firstVersionPriceCents(90)).toBe(5000);
 expect(revisionPriceCents(1.5)).toBe(300);expect(revisionPriceCents(0.15)).toBe(100);expect(revisionPriceCents(0)).toBe(0);expect(revisionPriceCents(2)).toBe(400);
 expect(customerPriceCents(12,{mode:"tiers-v2",multiplier:2})).toBe(3000);
});
