import { beforeEach, expect, it, vi } from "vitest";
import type { CamQuote } from "../src/lib/providers/cam-pricing";

const database = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn() }));
vi.mock("@/db", () => ({ pool: database }));
import { customerQuote } from "../src/lib/customer-wallet";

const jobId = "2a5a9091-4ab0-40bd-811e-7ae85a14f244";
function importedStoryboard(): CamQuote {
  return {
    id: "a".repeat(64), plan: "b".repeat(64), scope: "storyboard",
    createdAt: 100, expiresAt: 5000, lines: [],
    caps: { usd: 0, "higgsfield-credit": 0 }, falBillingAvailable: false,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  database.connect.mockRejectedValue(new Error("Database access required"));
  database.query.mockRejectedValue(new Error("Unexpected direct database query"));
});

it("lets a fully reused storyboard proceed without creating credit or querying the wallet", async () => {
  const quote = importedStoryboard();
  const first = await customerQuote(jobId, quote);
  expect(first).toMatchObject({ amountCents: 0, expiresAt: quote.expiresAt });
  expect(first?.id).toMatch(/^[a-f0-9]{64}$/);
  expect(await customerQuote(jobId, quote)).toEqual(first);
  expect(database.connect).not.toHaveBeenCalled();
  expect(database.query).not.toHaveBeenCalled();
});

it("binds a free storyboard quote to its production and supplier quote", async () => {
  const quote = importedStoryboard();
  const first = await customerQuote(jobId, quote);
  const anotherJob = await customerQuote("8f391bb9-8d0b-4b9c-803b-0d921131a694", quote);
  const anotherQuote = await customerQuote(jobId, { ...quote, id: "c".repeat(64) });
  expect(anotherJob?.id).not.toBe(first?.id);
  expect(anotherQuote?.id).not.toBe(first?.id);
  expect(database.connect).not.toHaveBeenCalled();
  expect(database.query).not.toHaveBeenCalled();
});

it.each([
  { label: "a production quote", patch: { scope: "production" as const } },
  { label: "a legacy quote", patch: { scope: undefined } },
  { label: "a dollar charge", patch: { caps: { usd: 1, "higgsfield-credit": 0 } } },
  { label: "a provider credit charge", patch: { caps: { usd: 0, "higgsfield-credit": 1 } } },
])("does not bypass normal customer pricing for $label", async ({ patch }) => {
  await expect(customerQuote(jobId, { ...importedStoryboard(), ...patch })).rejects.toThrow("Database access required");
  expect(database.connect).toHaveBeenCalledOnce();
  expect(database.query).not.toHaveBeenCalled();
});

it("prices a new cumulative production quote with the adaptive policy",async()=>{
 let inserted:unknown[]=[];
 const query=vi.fn(async(sql:string,args?:unknown[])=>{
  if(sql.startsWith('SELECT * FROM customer_quotes'))return {rows:inserted.length?[{id:inserted[0],amount_cents:inserted[3],expires_at:inserted[4]}]:[]};
  if(sql.includes("FROM settings"))return {rows:[{value:{mode:"adaptive-v1",multiplier:2,higgsfieldCreditUsd:.05}}]};
  if(sql.startsWith('INSERT INTO customer_quotes'))inserted=args!;
  return {rows:[]};
 });
 const release=vi.fn();database.connect.mockResolvedValue({query,release});
 const quote={...importedStoryboard(),scope:"production" as const,caps:{usd:6450000,"higgsfield-credit":420700000}};
 expect(await customerQuote(jobId,quote)).toMatchObject({amountCents:3900});
 expect(inserted[3]).toBe(3900);expect(query.mock.calls.some(([sql])=>sql.includes('credit_holds'))).toBe(false);expect(release).toHaveBeenCalledOnce();
});
it("keeps existing approved customer quotes unchanged when the pricing policy changes",async()=>{
 const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT * FROM customer_quotes')?[{id:'c'.repeat(64),amount_cents:5500,expires_at:new Date(5000)}]:[],rowCount:sql.includes('credit_holds')?1:0}));
 database.connect.mockResolvedValue({query,release:vi.fn()});
 expect(await customerQuote(jobId,{...importedStoryboard(),scope:"production"})).toMatchObject({amountCents:5500});
 expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE')||sql.startsWith('INSERT'))).toBe(false);
});
