import {describe,expect,it} from "vitest";
import {motionLengthSurchargeUsd,studioEstimateUsd,studioDelayMinutes,STUDIO_ESTIMATE_RANGE_MOTION,STUDIO_ESTIMATE_RANGE} from "@/lib/studio/pricing";
const words=(n:number)=>Array.from({length:n},(_,i)=>`w${i}`).join(" ");
describe("Motion estimate by length (Shimi, 2026-10-28)",()=>{
 it("charges nothing up to 1 min 30",()=>{expect(motionLengthSurchargeUsd(words(171))).toBe(0);});
 it("charges 5 $ beyond 1 min 30 and 10 $ beyond 2 min 30",()=>{expect(motionLengthSurchargeUsd(words(200))).toBe(5);expect(motionLengthSurchargeUsd(words(238))).toBe(5);expect(motionLengthSurchargeUsd(words(300))).toBe(10);expect(motionLengthSurchargeUsd(words(420))).toBe(15);});
 it("adds the surcharge to the Motion draw only",()=>{const r=()=>.5;expect(studioEstimateUsd(r,"motion",words(238))).toBe(STUDIO_ESTIMATE_RANGE_MOTION.min+3+5);expect(studioEstimateUsd(r,"clay",words(600))).toBe(Math.round((STUDIO_ESTIMATE_RANGE.min+STUDIO_ESTIMATE_RANGE.max)/2));});
});
describe("studio delay by length (Shimi, 2026-10-29)",()=>{
 it("announces 1 h 30 up to 1 min 30 and 5 h beyond",()=>{expect(studioDelayMinutes(words(150))).toBe(90);expect(studioDelayMinutes(words(400))).toBe(300);});
});
