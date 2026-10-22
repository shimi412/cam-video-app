/** Customer quotes are USD, rounded upward to a whole dollar, stored in cents. */
export function roundedCustomerPriceCents(costUsd:number,multiplier:number):number {
 const price=costUsd*multiplier;
 if(!Number.isFinite(price)||costUsd<0||multiplier<1)throw new Error("Invalid customer price.");
 return Math.ceil(Number(price.toPrecision(12)))*100;
}

export type CustomerPricingPolicy = { mode?: "fixed" | "adaptive-v1"; multiplier: number };

/** Shimi's 2026-10-18 curve, on the cumulative supplier budget, never per scene.
 * Continuous and nondecreasing: cheap preparation retains 2x; larger videos
 * absorb a smaller markup. Above $35 cost, $40 cannot preserve a $5 margin.
 * This is gross margin before payment fees, overhead and unbudgeted incidents.
 */
export function customerPriceCents(costUsd: number, policy: CustomerPricingPolicy): number {
 if (policy.mode !== "adaptive-v1") return roundedCustomerPriceCents(costUsd, policy.multiplier);
 if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Invalid customer price.");
 const price = costUsd <= 15 ? costUsd * 2
  : costUsd <= 20 ? costUsd + 15
  : costUsd <= 30 ? 25 + costUsd / 2
  : costUsd <= 35 ? 40 : costUsd + 5;
 return Math.ceil(Number(price.toPrecision(12))) * 100;
}
