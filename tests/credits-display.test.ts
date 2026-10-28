import {describe,expect,it} from "vitest";
import {PACKS,creditedUsdForCents,toCredits} from "@/lib/credits-display";
import {stripeLive} from "@/lib/stripe-billing";
describe("credited dollars for a recharge",()=>{
 it("pays every pack its advertised credits, bonus included",()=>{for(const p of PACKS)expect(toCredits(creditedUsdForCents(p.usd*100))).toBe(p.credits);});
 it("pays ten credits per dollar for a custom amount",()=>{expect(creditedUsdForCents(4200)).toBe(42);expect(toCredits(creditedUsdForCents(4200))).toBe(420);});
 it("keeps the Studio bonus in dollars",()=>{expect(creditedUsdForCents(30000)).toBe(330);});
});
describe("live key detection",()=>{
 it("accepts standard and restricted live keys, nothing else",()=>{expect(stripeLive("sk_live_x")).toBe(true);expect(stripeLive("rk_live_x")).toBe(true);expect(stripeLive("sk_test_x")).toBe(false);expect(stripeLive("rk_test_x")).toBe(false);expect(stripeLive("")).toBe(false);});
});
