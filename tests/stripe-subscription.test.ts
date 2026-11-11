import {describe,expect,it} from "vitest";
import {monthlyPlanInvoice,invoiceMonth,MONTHLY_PLAN_PRICE} from "@/lib/stripe-subscription";
describe("CAM monthly plan invoices",()=>{
 it("recognises the plan by subscription metadata, old and new API shapes",()=>{
  expect(monthlyPlanInvoice({subscription_details:{metadata:{plan:"cam-monthly"}}})).toBe(true);
  expect(monthlyPlanInvoice({parent:{subscription_details:{metadata:{plan:"cam-monthly"}}}})).toBe(true);
 });
 it("recognises the plan by its price on a line, old and new API shapes",()=>{
  expect(monthlyPlanInvoice({lines:{data:[{price:{id:MONTHLY_PLAN_PRICE}}]}})).toBe(true);
  expect(monthlyPlanInvoice({lines:{data:[{pricing:{price_details:{price:MONTHLY_PLAN_PRICE}}}]}})).toBe(true);
 });
 it("ignores every other invoice of the account",()=>{
  expect(monthlyPlanInvoice({subscription_details:{metadata:{plan:"formation"}},lines:{data:[{price:{id:"price_other"}}]}})).toBe(false);
  expect(monthlyPlanInvoice({})).toBe(false);
 });
 it("takes the month from the billed period, not from the payment date",()=>{
  expect(invoiceMonth({created:1767225600,lines:{data:[{period:{start:1764547200}}]}})).toBe("2025-12");
  expect(invoiceMonth({created:1767225600})).toBe("2026-01");
 });
});
