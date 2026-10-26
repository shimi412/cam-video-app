/** Client-facing credits (Shimi, 2026-10-26): the wallet keeps dollars, the client sees credits, ten per dollar,
 * and bigger packs carry bonus credits so that a recharge feels generous. Prices of videos are shown in credits. */
export const CREDITS_PER_USD=10;
export const PACKS=[
 {usd:100,credits:1000,bonus:0,name:"Starter"},
 {usd:300,credits:3300,bonus:10,name:"Studio",popular:true},
 {usd:1000,credits:12000,bonus:20,name:"Agency"},
] as const;
/** Typical prices in credits, for the "what it buys" lines. */
export const TYPICAL={video:375,motion:250,change:30} as const;
export const toCredits=(usd:number)=>Math.round(usd*CREDITS_PER_USD);
export const fmtCredits=(credits:number)=>credits.toLocaleString("en-US");
/** Shimi, 2026-10-26: 1,200 credits offered the first month, then 600 credits included every month with the plan. */
export const WELCOME_CREDITS=1200;
export const MONTHLY_INCLUDED_CREDITS=600;
