/** Customer quotes are USD, rounded upward to a whole dollar, stored in cents. */
export function roundedCustomerPriceCents(costUsd:number,multiplier:number):number {
 const price=costUsd*multiplier;
 if(!Number.isFinite(price)||costUsd<0||multiplier<1)throw new Error("Invalid customer price.");
 return Math.ceil(Number(price.toPrecision(12)))*100;
}

export type CustomerPricingPolicy = { mode?: "fixed" | "adaptive-v1" | "tiers-v2"; multiplier: number };

/** Shimi's grid of 2026-10-23, the same for Clay, Motion and Attack: a first complete version is
 * priced by tiers of the estimated real cost (up to $20 -> $30, $20 to $30 -> $40, above -> $50 at
 * most), and every client revision is the estimated real cost x2, rounded up to a whole dollar
 * ($1.50 -> $3). Estimates are supplier costs before fees and overhead. */
export function firstVersionPriceCents(costUsd: number): number {
 if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Invalid customer price.");
 return (costUsd <= 20 ? 30 : costUsd <= 30 ? 40 : 50) * 100;
}
export function revisionPriceCents(costUsd: number): number {
 if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Invalid customer price.");
 return Math.ceil(Number((costUsd * 2).toPrecision(12))) * 100;
}

/** Shimi's 2026-10-18 curve, on the cumulative supplier budget, never per scene.
 * Continuous and nondecreasing: cheap preparation retains 2x; larger videos
 * absorb a smaller markup. Above $35 cost, $40 cannot preserve a $5 margin.
 * This is gross margin before payment fees, overhead and unbudgeted incidents.
 */
export function customerPriceCents(costUsd: number, policy: CustomerPricingPolicy): number {
 if (policy.mode === "tiers-v2") return firstVersionPriceCents(costUsd);
 if (policy.mode !== "adaptive-v1") return roundedCustomerPriceCents(costUsd, policy.multiplier);
 if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Invalid customer price.");
 const price = costUsd <= 15 ? costUsd * 2
  : costUsd <= 20 ? costUsd + 15
  : costUsd <= 30 ? 25 + costUsd / 2
  : costUsd <= 35 ? 40 : costUsd + 5;
 return Math.ceil(Number(price.toPrecision(12))) * 100;
}
