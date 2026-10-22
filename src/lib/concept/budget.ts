import { SubmissionNotSentError } from "../providers/network";
import { z } from "zod";
import { Hash, sha256 } from "./checkpoints";
import { assertTransportMode, type QueueRequest, type TransportMode } from "./provider-transports";

// Integer millionths keep USD and Higgsfield credits separate, without rounding
// down reservations or inventing a conversion rate between the two providers.
const Amount = z.number().int().nonnegative().max(1_000_000_000_000);
const Unit = z.enum(["usd", "higgsfield-credit"]);
const Caps = z.object({ usd: Amount, "higgsfield-credit": Amount }).strict();
export type BudgetCaps = z.infer<typeof Caps>;
const Line = z.object({ operation: Hash, unit: Unit, maximum: Amount }).strict();
export const QuoteSchema = z.object({ plan: Hash, expiresAt: z.number().int().positive(), lines: z.array(Line).min(1), source: z.enum(["provider", "simulation-fixture"]) }).strict();
export type BudgetQuote = z.infer<typeof QuoteSchema>;
export const ApprovalSchema = z.object({ id: z.uuid(), mode: z.enum(["simulation", "live"]), plan: Hash, quote: Hash, caps: Caps, expiresAt: z.number().int().positive() }).strict();
export type BudgetApproval = z.infer<typeof ApprovalSchema>;
const Entry = Line.extend({ state: z.enum(["reserved", "attempted", "settled", "released"]), actual: Amount.optional(), evidence: z.string().min(1).optional() });
export const BudgetBookSchema = z.object({ version: z.literal(1), mode: z.enum(["simulation", "live"]), caps: Caps,
  reservations: z.record(z.string(), z.object({ jobId: z.uuid(), approval: ApprovalSchema, quote: QuoteSchema, entries: z.array(Entry) })) });
export type BudgetBook = z.infer<typeof BudgetBookSchema>;
export type BudgetStore = { mode: TransportMode; transaction: <T>(update: (book: BudgetBook | null) => { book: BudgetBook; result: T }) => Promise<T> };
export const quoteHash = (quote: BudgetQuote) => sha256(JSON.stringify(QuoteSchema.parse(quote)));
const hasOverrun = (book: BudgetBook) => Object.values(book.reservations).some((r) => r.entries.some((e) => e.state === "settled" && e.actual! > e.maximum));
export function budgetUsage(book: BudgetBook): BudgetCaps {
  const total: BudgetCaps = { usd: 0, "higgsfield-credit": 0 };
  for (const reservation of Object.values(book.reservations)) for (const entry of reservation.entries) {
    total[entry.unit] += entry.state === "released" ? 0 : entry.state === "settled" ? entry.actual! : entry.maximum;
    if (!Number.isSafeInteger(total[entry.unit])) throw new Error("Budget total overflow.");
  }
  return total;
}

export function createBudget(store: BudgetStore, accountCaps: BudgetCaps) {
  const caps = Caps.parse(accountCaps);
  const transact = <T>(fn: (book: BudgetBook) => T) => {
    assertTransportMode(store.mode);
    return store.transaction((stored) => {
      const book = stored ? BudgetBookSchema.parse(stored) : { version: 1 as const, mode: store.mode, caps, reservations: {} };
      if (book.mode !== store.mode || JSON.stringify(book.caps) !== JSON.stringify(caps)) throw new Error("Budget account configuration changed. Review the existing reservations.");
      return { result: fn(book), book };
    });
  };
  return {
    async reserve(input: { jobId: string; plan: string; operations: { fingerprint: string; transport: string }[]; quote: BudgetQuote; approval: BudgetApproval; now?: number }) {
      const quote = QuoteSchema.parse(input.quote), approval = ApprovalSchema.parse(input.approval), now = input.now ?? Date.now();
      z.uuid().parse(input.jobId);
      if (approval.mode !== store.mode || quote.plan !== input.plan || approval.plan !== input.plan || approval.quote !== quoteHash(quote)) throw new Error("Budget approval does not match this plan and quote.");
      if ((store.mode === "simulation") !== (quote.source === "simulation-fixture")) throw new Error("Simulation quotes cannot authorize real spending.");
      if (new Set(quote.lines.map((line) => line.operation)).size !== input.operations.length || quote.lines.length !== input.operations.length || new Set(input.operations.map((op) => op.fingerprint)).size !== input.operations.length) throw new Error("A complete, unique quote is required.");
      for (const op of input.operations) {
        const line = quote.lines.find((line) => line.operation === op.fingerprint);
        if (!line || line.unit !== (op.transport === "higgsfield-mcp" ? "higgsfield-credit" : "usd")) throw new Error("Missing quote or wrong provider currency.");
      }
      return transact((book) => {
        const old = book.reservations[approval.id];
        if (old) {
          if (old.jobId !== input.jobId || JSON.stringify(old.approval) !== JSON.stringify(approval)) throw new Error("Approval already belongs to another production.");
          return old; // Polling/recovery may continue after quote expiry; no new POST may.
        }
        if (quote.expiresAt <= now || approval.expiresAt <= now) throw new Error("Budget quote or approval expired.");
        if (hasOverrun(book)) throw new Error("A provider cost exceeded its reservation. Further submissions blocked.");
        const totals: BudgetCaps = { usd: 0, "higgsfield-credit": 0 };
        for (const line of quote.lines) totals[line.unit] += line.maximum;
        const used = budgetUsage(book);
        for (const unit of ["usd", "higgsfield-credit"] as const) {
          if (!Number.isSafeInteger(totals[unit]) || totals[unit] > approval.caps[unit] || used[unit] + totals[unit] > book.caps[unit]) throw new Error(`Insufficient ${unit} budget. Nothing submitted.`);
        }
        const reservation = { jobId: input.jobId, approval, quote, entries: quote.lines.map((line) => ({ ...line, state: "reserved" as const })) };
        book.reservations[approval.id] = reservation;
        return reservation;
      });
    },
    async attempt(approvalId: string, operation: string, now = Date.now()) {
      return transact((book) => {
        const r = book.reservations[approvalId], entry = r?.entries.find((entry) => entry.operation === operation);
        if (!entry) throw new Error("No budget reservation for this request.");
        if (entry.state !== "reserved") throw new Error("This request already has an attempt. Reconcile it before any retry.");
        if (r.approval.expiresAt <= now || r.quote.expiresAt <= now) throw new Error("Budget quote or approval expired.");
        if (hasOverrun(book)) throw new Error("A provider cost exceeded its reservation. Further submissions blocked.");
        const used = budgetUsage(book);
        if (used.usd > book.caps.usd || used["higgsfield-credit"] > book.caps["higgsfield-credit"]) throw new Error("Account budget exceeded. Further submissions blocked.");
        entry.state = "attempted"; // Keep the full reservation after an unknown outcome or provider failure.
      });
    },
    async restoreUnsent(approvalId:string, operation:string, proof:SubmissionNotSentError) {
      if(!(proof instanceof SubmissionNotSentError))throw new Error("No proof that submission was not sent.");
      return transact(book=>{
        const entry=book.reservations[approvalId]?.entries.find(e=>e.operation===operation);
        if(!entry||entry.state!=="attempted")throw new Error("No attempted reservation to restore.");
        entry.state="reserved"; // Keep the same maximum reserved; no additional spend authorized.
      });
    },
    async settle(approvalId: string, operation: string, cost: { unit: "usd" | "higgsfield-credit"; actual: number; evidence: string }) {
      Amount.parse(cost.actual); z.string().min(1).parse(cost.evidence);
      return transact((book) => {
        const entry = book.reservations[approvalId]?.entries.find((entry) => entry.operation === operation);
        if (!entry || !["attempted", "settled"].includes(entry.state) || entry.unit !== cost.unit) throw new Error("Cost has no matching submitted reservation.");
        if (entry.state === "settled" && (entry.actual !== cost.actual || entry.evidence !== cost.evidence)) throw new Error("Conflicting provider cost receipt.");
        entry.state = "settled"; entry.actual = cost.actual; entry.evidence = cost.evidence;
        // An overrun is recorded honestly, never clipped to the approved cap.
        return { overrun: cost.actual > entry.maximum, usage: budgetUsage(book) };
      });
    },
    async releaseUnsubmitted(approvalId: string) {
      return transact((book) => {
        const reservation = book.reservations[approvalId];
        if (!reservation) throw new Error("Unknown budget approval.");
        let released = 0;
        for (const entry of reservation.entries) if (entry.state === "reserved") { entry.state = "released"; released++; }
        return released; // Attempted/unknown costs are never released here.
      });
    },
    async snapshot() { return transact((book) => book); },
  };
}

export function budgetedQueue(queue: QueueRequest, budget: ReturnType<typeof createBudget>, approvalId: string, operation: string): QueueRequest {
  return { ...queue, async submit() { await budget.attempt(approvalId, operation); try{return await queue.submit();}catch(error){if(error instanceof SubmissionNotSentError)await budget.restoreUnsent(approvalId,operation,error);throw error;} } };
}
