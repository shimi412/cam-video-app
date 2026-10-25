import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ job: null as Record<string, unknown> | null, set: vi.fn(), settle: vi.fn(), comic: vi.fn() }));
vi.mock("../src/lib/access", () => ({ withAccess: <T,>(handler: T) => handler, actorFor: async () => ({ id: "actor-1", local: false }) }));
vi.mock("../src/lib/customer-wallet", () => ({ settleCredits: fixture.settle }));
vi.mock("../src/lib/comics/store", () => ({ getComic: fixture.comic }));
vi.mock("../src/db", async () => {
 const schema = await vi.importActual<typeof import("../src/db/schema")>("../src/db/schema");
 return { schema, pool: {}, db: {
  select: () => ({ from: () => ({ where: async () => fixture.job ? [fixture.job] : [] }) }),
  update: () => ({ set: (values: unknown) => { fixture.set(values); return { where: async () => undefined, returning: async () => [] }; } }) } };
});
vi.mock("../src/lib/credits", () => ({ getBalanceUsd: async () => 0 }));
vi.mock("../src/lib/job-lock", () => ({ jobWorkerActive: async () => false }));
vi.mock("../src/lib/job-recovery", () => ({ recoveryAllowed: () => false, recentlyQueued: () => false }));
vi.mock("../src/lib/concept/current-draft", () => ({ currentDraft: async () => ({}) }));
vi.mock("../src/lib/stored-media", () => ({ storedVideoUrl: async () => null }));

const id = "070cfded-dd47-4431-9c32-864e5fab8d14";
const call = async () => { const { DELETE } = await import("../src/app/api/jobs/[id]/route"); return (DELETE as unknown as (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>)(new Request(`http://cam/api/jobs/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) }); };
beforeEach(() => { fixture.job = null; fixture.set.mockReset(); fixture.settle.mockReset(); fixture.comic.mockReset(); });

it("deletes a running video: reserved hold released, soft delete, removed from My videos, stopped for the worker", async () => {
 fixture.job = { id, params: { live: true }, status: "running" };
 const response = await call();
 expect(response.status).toBe(200);
 expect(fixture.settle).toHaveBeenCalledWith(id, false);
 expect(fixture.set).toHaveBeenCalledWith(expect.objectContaining({ savedToLibrary: false, status: "failed", error: "Deleted by the client." }));
 expect(fixture.set.mock.calls[0][0].deletedAt).toBeInstanceOf(Date);
});
it("keeps the final status of an ended video and refuses an unknown or already deleted one", async () => {
 fixture.job = { id, params: { live: true }, status: "succeeded" };
 expect((await call()).status).toBe(200);
 expect(fixture.set.mock.calls[0][0]).not.toHaveProperty("status");
 fixture.job = null;
 expect((await call()).status).toBe(404);
 expect(fixture.settle).toHaveBeenCalledTimes(1);
});
it("checks the client's ownership of an Attack video before deleting it", async () => {
 fixture.job = { id, params: { live: true, filmType: "comics" }, status: "running" };
 fixture.comic.mockRejectedValueOnce(new Error("not yours"));
 expect((await call()).status).toBe(404);
 expect(fixture.settle).not.toHaveBeenCalled();
 fixture.comic.mockResolvedValueOnce({});
 expect((await call()).status).toBe(200);
});
